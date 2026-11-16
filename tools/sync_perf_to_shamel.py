# مزامنة «نظام الأداء» → «الشامل»: طلبات الشهر الحالي لكل حساب (كيتا وهنجر)
# الاستخدام: python3 -I sync_perf_to_shamel.py perf.html shamel.html out.html
# بيحدّث perf.byIq (الطلبات، أيام الشغل، الساعات، المستوى، الكيلومترات، المحفظة) و perf.lastDate بس،
# ومش بيلمس أي حاجة تانية في الشامل (القاعدة، السلف والمديونيات، التأمين...).
import sys, json, re, datetime

perf_html, shamel_html, out_path = sys.argv[1:4]

def load_perf(p):
    s = open(p, encoding='utf8').read()
    m = re.search(r'<script id="data" type="application/json">(.*?)</script>', s, re.S)
    if not m: sys.exit('ERROR: مش لاقي بيانات نظام الأداء')
    return json.loads(m.group(1))

def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def accounts(month):
    K, H = {}, {}
    for r in month.get('k', []):
        K[r[0]] = dict(p='k', id=r[0], iq=r[1], name=r[2], orders=num(r[3]), level=r[6], city=r[8], sup=r[9], days=[], ghost=False)
    for r in month.get('h', []):
        H[r[0]] = dict(p='h', id=r[0], iq=r[1], name=r[3], orders=num(r[4]), city=r[5], level=r[8], dist=num(r[9]), wallet=num(r[10]), sup=r[11], days=[], ghost=False)
    names = month.get('names', {}) or {}
    def ghost(M, p, i):
        if i not in M: M[i] = dict(p=p, id=i, iq='', name=names.get(p + i, ''), orders=None, level='', city='', sup='', days=[], ghost=True)
        return M[i]
    hacc = (month.get('hacc') or {}).get('rows', [])
    for r in hacc:
        x = ghost(H, 'h', r[0])
        if x['ghost']:
            x.update(ghost=False, iq=r[1] or r[2], name=r[4] or x['name'], orders=num(r[5]), city=r[6], sup=r[9])
        if not x.get('iq'): x['iq'] = r[1] or r[2]
    for r in (month.get('hq') or {}).get('rows', []):
        if r[0] in H and len(r) > 7 and r[7]: H[r[0]]['level'] = r[7]
    for r in month.get('kd', []):
        x = ghost(K, 'k', r[1])
        x['days'].append(dict(d=r[0], o=r[2] or 0, hr=num(r[4]), tot=num(r[9]) if len(r) > 9 else None, klv=r[10] if len(r) > 10 else None))
        if x['ghost'] and len(r) > 11 and r[11]:
            x['iq'] = x['iq'] or r[11]; x['city'] = x['city'] or (r[12] if len(r) > 12 else '') or ''; x['sup'] = x['sup'] or (r[13] if len(r) > 13 else '') or ''
    for r in month.get('hd', []):
        x = ghost(H, 'h', r[1])
        x['days'].append(dict(d=r[0], o=r[3] or 0, hr=num(r[4]), km=num(r[9]) if len(r) > 9 else None, wal=num(r[10]) if len(r) > 10 else None, tot=num(r[13]) if len(r) > 13 else None, tkm=num(r[14]) if len(r) > 14 else None))
    out = []
    for x in list(K.values()) + list(H.values()):
        ds = sorted(x['days'], key=lambda d: d['d'])
        dsum = sum(d['o'] for d in ds)
        if x['orders'] is None: x['orders'] = dsum
        lt = [d for d in ds if d.get('tot') is not None]
        if lt and lt[-1]['tot'] > (x['orders'] or 0): x['orders'] = lt[-1]['tot']
        lk = [d for d in ds if d.get('klv')]
        if lk: x['level'] = lk[-1]['klv']
        lw = [d for d in ds if d.get('wal') is not None]
        if lw: x['wallet'] = lw[-1]['wal']
        km = x.get('dist')
        if km is None:
            tk = [d for d in ds if d.get('tkm') is not None]
            if tk: km = tk[-1]['tkm']
        x['km'] = km
        x['dayList'] = [d['d'] for d in ds if d['o'] > 0]
        x['hours'] = round(sum(d['hr'] or 0 for d in ds))
        if x.get('iq'): out.append(x)
    return out

P = load_perf(perf_html)
months = sorted(k for k, m in P.get('months', {}).items() if m.get('kd') or m.get('hd') or m.get('k') or m.get('h'))
if not months: sys.exit('ERROR: نظام الأداء فاضي')
ym = months[-1]; M = P['months'][ym]
y, mo = map(int, ym.split('-'))
last = max([r[0] for r in M.get('kd', [])] + [r[0] for r in M.get('hd', [])] + [0])
accs = accounts(M)

s = open(shamel_html, encoding='utf8').read()
m = re.search(r'window\.__EMBED_JSON__=("(?:[^"\\]|\\.)*");', s)
if not m: sys.exit('ERROR: مش لاقي بيانات الشامل')
D = json.loads(json.loads(m.group(1)))
perf = D.get('perf') or {}
mym = y * 12 + mo - 1
if perf.get('monthYm') and perf['monthYm'] > mym:
    print('UNCHANGED (الشامل على شهر أحدث من نظام الأداء)'); sys.exit(0)
newMonth = perf.get('monthYm') != mym
by = {} if newMonth else perf.get('byIq', {})
CO = {'k': 'كيتا', 'h': 'هنجر'}
upd = add = 0
for x in accs:
    lst = by.setdefault(x['iq'], [])
    e = next((a for a in lst if str(a.get('id')) == str(x['id'])), None)
    rec = dict(company=CO[x['p']], orders=x['orders'], level=x['level'] or '', id=x['id'], name=x['name'], city=x['city'] or '', supervisor=x['sup'] or '',
               days=len(x['dayList']), dayList=x['dayList'], km=x['km'] if x['p'] == 'h' else None, hours=x['hours'], wallet=x.get('wallet') if x['p'] == 'h' else None)
    if e is None:
        lst.append(rec); add += 1
    else:
        before = json.dumps(e, sort_keys=True, ensure_ascii=False)
        for k in ('orders', 'level', 'days', 'dayList', 'hours', 'km', 'wallet'):
            if rec[k] is not None and rec[k] != '': e[k] = rec[k]
        for k in ('city', 'supervisor', 'name'):
            if not e.get(k) and rec[k]: e[k] = rec[k]
        if json.dumps(e, sort_keys=True, ensure_ascii=False) != before: upd += 1
oldLast = (perf.get('lastDate') or {}).get('__d', '')
newLast = datetime.date(y, mo, last).isoformat() + 'T00:00:00.000Z' if last else oldLast
if not newMonth and upd == 0 and add == 0 and newLast <= oldLast:
    print('UNCHANGED'); sys.exit(0)
perf['byIq'] = by; perf['monthYm'] = mym
if newLast > oldLast or newMonth: perf['lastDate'] = {'__d': newLast}
perf['count'] = sum(len(v) for v in by.values())
if newMonth:
    for k in ('debt', 'held', 'sched'): perf[k] = {}
D['perf'] = perf
D.setdefault('info', {})['perfSyncAt'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
inner = json.dumps(D, ensure_ascii=False, separators=(',', ':'))
js = json.dumps(inner, ensure_ascii=False).replace('</', '<\\/').replace('<!--', '<\\!--')
s2 = s[:m.start(1)] + js + s[m.end(1):]
open(out_path, 'w', encoding='utf8').write(s2)
print(f'SYNCED month={ym} lastDay={last} updated={upd} added={add} accounts={perf["count"]}')
