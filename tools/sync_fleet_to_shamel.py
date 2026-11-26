# مزامنة «لوحة متابعة الأسطول» → «الشامل»: كارت السيارة في ملف كل مندوب (base.fleet)
# الاستخدام: python3 -I sync_fleet_to_shamel.py state.json shamel.html out.html [YYYY-MM-DD]
#   state.json = حالة الداش بورد (لزق قطع state/{slot}0..n-1 زي gen_portal.py)
# بيستبدل base.fleet بس، ومش بيلمس أي حاجة تانية في الشامل.
# السيارة بتظهر عند: المستخدم المسجّل (userIqama) + السائق الحالي (آخر مستلم من السائقين أو الإيجارات) لو مختلف.
import sys, json, re, datetime

state_p, shamel_html, out_path = sys.argv[1:4]
today = datetime.date.fromisoformat(sys.argv[4]) if len(sys.argv) > 4 else datetime.date.today()
st = json.load(open(state_p, encoding='utf8'))
if not st.get('vehicles'): sys.exit('ERROR: حالة الداش بورد فاضية')

def normp(p): return re.sub(r'\s', '', re.sub('[أإآ]', 'ا', str(p or '')))
iqok = lambda s: bool(re.fullmatch(r'[12]\d{9}', str(s or '').strip()))
D_ = lambda iso: {'__d': iso + 'T00:00:00.000Z'} if iso and re.match(r'^\d{4}-\d\d-\d\d$', str(iso)) else None
hidden = {normp(p) for p in st.get('hiddenPlates', [])}
archived = {normp(a.get('plate')): a for a in (st.get('archivedVehicles') or []) if a.get('plate')}
rent = (st.get('rentals') or []) + (st.get('manualRentals') or [])
hid_r = set(map(str, st.get('hiddenRentalIds') or []))
rent = [r for r in rent if str(r.get('id', '')) not in hid_r]
CLOSED = re.compile(r'(مغلق|منتهي|منتهية|منجز|تم تحويل|تم التحويل)')
claims = {}
for c in (st.get('claims') or []) + (st.get('manualClaims') or []):
    if c.get('archived'): continue
    txt = ' '.join(str(c.get(k) or '') for k in ('status', 'claimNote', 'note'))
    if CLOSED.search(txt): continue
    if c.get('claimNumber'): claims.setdefault(normp(c.get('plate')), []).append(str(c['claimNumber']).strip())

def eff(v, manual):
    k = normp(v['plate']); ov = {} if manual else (st.get('overrides') or {}).get(k, {})
    m = dict(v); m.update(ov.get('fields') or {})
    d = {}
    for f, x in (v.get('dates') or {}).items(): d[f] = (x or {}).get('iso') if isinstance(x, dict) else x
    for f, x in (ov.get('dates') or {}).items(): d[f] = x
    m['_d'] = d; m['_drivers'] = (ov.get('drivers') if ov.get('drivers') else v.get('drivers')) or []
    return m

byIq = {}; seen = set(); count = assigned = 0
vehs = [(v, False) for v in st['vehicles']] + [(v, True) for v in st.get('manualVehicles', [])]
for v, man in vehs:
    k = normp(v.get('plate'))
    if not k or k in hidden or k in seen: continue
    seen.add(k); m = eff(v, man); count += 1
    # السائق الحالي: آخر مستلم (سائقين السيارة أو الإيجارات)
    best = None
    for d0 in m['_drivers']:
        if not best or (d0.get('receiveDate') or '') >= (best[0] or ''): best = (d0.get('receiveDate') or '', d0.get('iqama'), d0.get('name'))
    rr = sorted([r for r in rent if normp(r.get('plate')) == k], key=lambda r: r.get('receiveDate') or '', reverse=True)
    if rr and (rr[0].get('user') or rr[0].get('iqama')) and (not best or (rr[0].get('receiveDate') or '') > (best[0] or '')):
        best = (rr[0].get('receiveDate') or '', rr[0].get('iqama'), rr[0].get('user'))
    iqs = []
    if iqok(m.get('userIqama')): iqs.append(str(m['userIqama']).strip())
    if best and iqok(best[1]) and str(best[1]).strip() not in iqs: iqs.append(str(best[1]).strip())
    car = {'plate': v['plate'], 'serial': str(m.get('serial') or ''), 'model': str(m.get('model') or ''), 'reg': str(m.get('regType') or ''),
           'year': str(m.get('year') or ''), 'own': str(m.get('ownership') or ''), 'user': str(m.get('userName') or ''), 'holder': str(m.get('company') or '')}
    for f, key in (('fahs', 'insp'), ('form', 'form'), ('auth', 'auth'), ('ins', 'cins'), ('card', 'card')):
        dv = D_(m['_d'].get(f))
        if dv: car[key] = dv
    if best and best[2] and str(best[2]).strip() != car['user']: car['driver'] = str(best[2]).strip()
    note = str(m.get('notes') or '').strip()
    nl = sorted((st.get('notesLog') or {}).get('veh_' + k) or [], key=lambda x: x.get('at') or '', reverse=True)
    nl = [str(x.get('text') or '').strip() for x in nl if str(x.get('text') or '').strip()][:3]
    if nl: note = ' — '.join(([note] if note else []) + nl)
    if k in archived: car['dropped'] = True; note = (note + ' — ' if note else '') + str(archived[k].get('reason') or 'مؤرشفة')
    if note and note != '0': car['note'] = note
    if k in claims: car['claim'] = '، '.join(claims[k])
    if m.get('workCity'): car['city'] = str(m['workCity'])
    if not iqs: continue
    assigned += 1
    for q in iqs: byIq.setdefault(q, []).append(dict(car, iq=q))

fleet = {'byIq': byIq, 'count': count, 'assigned': assigned, 'unassigned': count - assigned, 'source': 'لوحة متابعة الأسطول'}

s = open(shamel_html, encoding='utf8').read()
mm = re.search(r'window\.__EMBED_JSON__=("(?:[^"\\]|\\.)*");', s)
if not mm: sys.exit('ERROR: مش لاقي بيانات الشامل')
D = json.loads(json.loads(mm.group(1)))
old = (D.get('base') or {}).get('fleet') or {}
cmp = lambda f: json.dumps({k: f.get(k) for k in ('byIq', 'count', 'assigned')}, sort_keys=True, ensure_ascii=False)
if cmp(old) == cmp(fleet):
    print(f'UNCHANGED cars={count} assigned={assigned}'); sys.exit(0)
fleet['syncedAt'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00')
D['base']['fleet'] = fleet
inner = json.dumps(D, ensure_ascii=False, separators=(',', ':'))
js = json.dumps(inner, ensure_ascii=False).replace('</', '<\\/').replace('<!--', '<\\!--')
open(out_path, 'w', encoding='utf8').write(s[:mm.start(1)] + js + s[mm.end(1):])
oldN = sum(len(x) for x in (old.get('byIq') or {}).values()); newN = sum(len(x) for x in byIq.values())
print(f'SYNCED cars={count} assigned={assigned} drivers={len(byIq)} links {oldN}->{newN}')
