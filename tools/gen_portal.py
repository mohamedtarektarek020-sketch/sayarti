# يبني بيانات بوابة السواقين (مشفّرة) من حالة الداش بورد
import json,re,sys,os,base64,hashlib,datetime
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
src=sys.argv[1]; out=sys.argv[2]
OUTDIR=os.path.dirname(os.path.abspath(out))
# فهرس الملفات المتشفرة (سري — بيتحفظ في الداش بورد مش في الريبو): assetId -> {f,key,mime,ext,pv}
IDX_PATH=os.environ.get('PORTAL_INDEX','portal-index.json')
INDEX=json.load(open(IDX_PATH)) if os.path.exists(IDX_PATH) else {}
SRC=os.environ.get('PORTAL_SRC','blobs')   # فولدر فيه الملفات الأصلية الجديدة باسم <assetId>.<ext>
FILEMAP=json.load(open(os.environ['PORTAL_FILEMAP'])) if os.environ.get('PORTAL_FILEMAP') else {}
MISSING=set(); NEWIDX=0
SCR=os.environ.get('PORTAL_SCR','.')
st=json.load(open(src))
today=datetime.date.fromisoformat(sys.argv[3]) if len(sys.argv)>3 else datetime.date.today()
AR='[ء-ي]'
def normp(p): return re.sub(r'\s','',re.sub('[أإآ]','ا',str(p or '')))
def pkey(p):
  n=normp(p).replace('ى','ي').replace('ة','ه')
  return ''.join(re.findall(r'\d',n))+''.join(sorted(re.findall(AR,n)))
hidden={normp(p) for p in st.get('hiddenPlates',[])}
SALT=b'fleet-drivers-portal-v1'
def derive(k): return hashlib.pbkdf2_hmac('sha256',k.encode(),SALT,120000,32)
def docid(k): return hashlib.sha256(('id:'+k).encode()).hexdigest()[:24]
LAB={'fahs':'الفحص الدوري','form':'الاستمارة','ins':'التأمين','auth':'التفويض','card':'كارت التشغيل'}
def eff(v,manual):
  k=normp(v['plate']); ov={} if manual else st['overrides'].get(k,{})
  m=dict(v); m.update(ov.get('fields') or {})
  d={}
  for f,x in (v.get('dates') or {}).items(): d[f]=(x or {}).get('iso')
  for f,x in (ov.get('dates') or {}).items(): d[f]=x
  m['_d']=d; m['_drivers']=(ov.get('drivers') if ov.get('drivers') else v.get('drivers')) or []
  return m
def mime_of(b):
  if b[:4]==b'%PDF': return 'application/pdf','pdf'
  if b[:3]==b'\xff\xd8\xff': return 'image/jpeg','jpg'
  if b[:8]==b'\x89PNG\r\n\x1a\n': return 'image/png','png'
  return 'application/octet-stream','bin'
used_files=set()
def _src_bytes(aid):
  if aid in FILEMAP and os.path.exists(os.path.join(SCR,FILEMAP[aid])): return open(os.path.join(SCR,FILEMAP[aid]),'rb').read()
  if os.path.isdir(SRC):
    for fn in os.listdir(SRC):
      if fn.split('.')[0]==aid: return open(os.path.join(SRC,fn),'rb').read()
  return None
def _enc_bytes(b):
  mt,ext=mime_of(b)
  fid=hashlib.sha256(b'id:'+b).hexdigest()[:24]; key=hashlib.sha256(b'key:'+b).digest(); iv=hashlib.sha256(b'iv:'+b).digest()[:12]
  os.makedirs(os.path.join(OUTDIR,'f'),exist_ok=True)
  fp=os.path.join(OUTDIR,'f',fid+'.bin')
  if not os.path.exists(fp): open(fp,'wb').write(iv+AESGCM(key).encrypt(iv,b,None))
  r={'f':'f/'+fid+'.bin','key':base64.b64encode(key).decode(),'mime':mt,'ext':ext}
  if mt=='application/pdf':
    import subprocess,tempfile
    with tempfile.TemporaryDirectory() as td:
      open(td+'/a.pdf','wb').write(b)
      subprocess.run(['pdftoppm','-jpeg','-jpegopt','quality=82','-r','130','-f','1','-l','1',td+'/a.pdf',td+'/p'],check=True)
      jp=[x for x in os.listdir(td) if x.endswith('.jpg')]
      if jp:
        jb=open(td+'/'+jp[0],'rb').read()
        pid=hashlib.sha256(b'id:'+jb).hexdigest()[:24]; pk=hashlib.sha256(b'key:'+jb).digest(); piv=hashlib.sha256(b'iv:'+jb).digest()[:12]
        pp=os.path.join(OUTDIR,'f',pid+'.bin')
        if not os.path.exists(pp): open(pp,'wb').write(piv+AESGCM(pk).encrypt(piv,jb,None))
        r['pv']={'f':'f/'+pid+'.bin','key':base64.b64encode(pk).decode(),'mime':'image/jpeg'}
  return r
def _mark(r):
  used_files.add(r['f'][2:])
  if r.get('pv'): used_files.add(r['pv']['f'][2:])
  return dict(r, pv=dict(r['pv'])) if r.get('pv') else dict(r)
def enc_file(val):
  global NEWIDX
  if not val: return None
  m_=re.search(r'/_blob/([0-9a-f]{32})',val)
  if m_:
    aid=m_.group(1); e=INDEX.get(aid)
    if e and os.path.exists(os.path.join(OUTDIR,e['f'])) and (not e.get('pv') or os.path.exists(os.path.join(OUTDIR,e['pv']['f']))): return _mark(e)
    b=_src_bytes(aid)
    if b is None: MISSING.add(aid); return None
    INDEX[aid]=_enc_bytes(b); NEWIDX+=1; return _mark(INDEX[aid])
  elif val.startswith('data:'):
    return _mark(_enc_bytes(base64.b64decode(val.split(',',1)[1])))
  return None
rent=[]
for i,r in enumerate(st['rentals']):
  rid='rt_%d'%i
  if rid in st['hiddenRentalIds']: continue
  x=dict(r); x.update(st['rentalOverrides'].get(rid,{})); rent.append(x)
rent+=[r for r in st['manualRentals'] if r.get('id') not in st['hiddenRentalIds']]
pet={}
for p in st.get('petromin',[]): pet.setdefault(normp(p['plate']),[]).append(p)
iqok=lambda s: bool(re.fullmatch(r'[12]\d{9}',str(s or '').strip()))
CONTRACTS=[]
docs={}; count=0; pairs=0; groups={}
vehs=[(v,False) for v in st['vehicles']]+[(v,True) for v in st.get('manualVehicles',[])]
seen=set()
for v,man in vehs:
  k=normp(v['plate'])
  if k in hidden or k in seen or 'دراج' in str(v.get('regType','')): continue
  seen.add(k); m=eff(v,man)
  # صاحب السيارة الحالي بس (نفس منطق الداش بورد): آخر سائق مستلم أو آخر إيجار، ولو مفيش يبقى المستخدم
  holders=set(); best=None
  src=None
  for d0 in m['_drivers']:
    if not best or (d0.get('receiveDate') or '')>=(best[0] or ''): best=(d0.get('receiveDate') or '', d0.get('iqama'), d0.get('name')); src=('d',d0)
  rr=sorted([r for r in rent if normp(r.get('plate'))==k],key=lambda r:r.get('receiveDate') or '',reverse=True)
  if rr and rr[0].get('user') and (not best or (rr[0].get('receiveDate') or '')>(best[0] or '')):
    best=(rr[0].get('receiveDate') or '', rr[0].get('iqama'), rr[0].get('user')); src=('r',rr[0])
  if best and best[0]>today.isoformat(): best=best  # استلام مستقبلي نادر — نسيبه
  if best:
    if iqok(best[1]): holders.add(str(best[1]).strip())
    elif not re.match(r'^\s*(الشركة|الشركه|المؤسسة|المؤسسه)',str(best[2] or '')) and iqok(m.get('userIqama')):
      holders.add(str(m.get('userIqama')).strip())  # زي الداش بورد: لو السائق من غير إقامة ناخد إقامة المستخدم
  else:
    for q in (m.get('userIqama'),m.get('delegIqama')):
      if iqok(q): holders.add(str(q).strip())
  if not holders: continue
  dates=[]
  for f in ['fahs','form','ins','auth','card']:
    iso=m['_d'].get(f)
    if iso and re.match(r'\d{4}-\d\d-\d\d$',str(iso)):
      dates.append({'k':f,'l':LAB[f],'d':iso,'left':(datetime.date.fromisoformat(iso)-today).days})
    else: dates.append({'k':f,'l':LAB[f],'d':None,'left':None})
  P=pet.get(k,[]); oil=None
  if P:
    last=max(int(p.get('odometer') or 0) for p in P)
    eng=[p for p in P if p['serviceType'] in('engine','engine_filter')]; gb=[p for p in P if p['serviceType']=='gearbox']
    le=max(eng,key=lambda p:int(p.get('odometer') or 0)) if eng else None
    lg=max(gb,key=lambda p:int(p.get('odometer') or 0)) if gb else None
    oil={'lastOdo':last,
         'eng':({'date':le['date'],'odo':int(le['odometer'] or 0),'next':int(le['odometer'] or 0)+10000,'left':int(le['odometer'] or 0)+10000-last} if le else None),
         'gb':({'date':lg['date'],'odo':int(lg['odometer'] or 0),'next':int(lg['odometer'] or 0)+50000,'left':int(lg['odometer'] or 0)+50000-last} if lg else None)}
  files=[]
  fr=enc_file(m.get('registrationImage'))
  if fr: fr.update({'k':'form','t':'الاستمارة'}); files.append(fr)
  cd=m['_d'].get('card'); locked=bool(cd and re.match(r'\d{4}-\d\d-\d\d$',str(cd)) and (datetime.date.fromisoformat(cd)-today).days<=1)
  fc=None if locked else enc_file(m.get('operationCardImage'))
  if fc: fc.update({'k':'card','t':'كارت التشغيل'}); files.append(fc)
  # نوع التعاقد (بيظهر تحت السيارة في التطبيق)
  own=str(m.get('ownership') or '')
  if 'المندوب' in own: contract='ملك المندوب'
  elif src and ((src[0]=='d' and src[1].get('contractType')=='ownership') or (src[0]=='r' and 'تمليك' in str(src[1].get('rentalType') or ''))): contract='إيجار مع وعد بالتملك'
  elif src and src[0]=='r' and 'داخلي' in str(src[1].get('rentalType') or ''): contract='إيجار داخلي'
  else: contract='إيجار'
  CONTRACTS.append((v['plate'],m.get('serial',v.get('serial','')),contract,str(best[2] if best else '')))
  car={'contract':contract,'plate':v['plate'],'model':m.get('model',''),'year':m.get('year',''),'color':m.get('color',''),'dates':dates,'oil':oil,'files':files,'asOf':today.isoformat()}
  count+=1; nfiles=globals().setdefault('nfiles',[0,0]); nfiles[0]+=1 if fr else 0; nfiles[1]+=1 if fc else 0
  for iq in holders:
    kk=''.join(re.findall(r'\d',normp(v['plate'])))+'|'+iq
    groups.setdefault(kk,[]).append(car)
FP=hashlib.sha256()
for kk,cars in sorted(groups.items()):
    payload=json.dumps({'v':2,'cars':cars,'asOf':today.isoformat()},ensure_ascii=False).encode()
    FP.update(kk.encode()+payload)
    key=derive(kk); iv=os.urandom(12)
    docs[docid(kk)]=base64.b64encode(iv+AESGCM(key).encrypt(iv,payload,None)).decode()
    pairs+=1
# امسح الملفات القديمة اللي مبقتش مستخدمة
if os.path.isdir(os.path.join(OUTDIR,'f')) and not MISSING:
  for fn in os.listdir(os.path.join(OUTDIR,'f')):
    if fn not in used_files: os.remove(os.path.join(OUTDIR,'f',fn))
fp=FP.hexdigest()[:16]
try: old=json.load(open(out)).get('h')
except Exception: old=None
if old==fp and not os.environ.get('PORTAL_FORCE'):
  print('UNCHANGED — مفيش تغيير في بيانات المناديب')
else:
  json.dump({'v':2,'asOf':today.isoformat(),'n':count,'h':fp,'d':docs},open(out,'w'),separators=(',',':'))
  print('UPDATED', fp)
if MISSING:
  open(os.environ.get('PORTAL_MISSING','missing.txt'),'w').write('\n'.join(sorted(MISSING)))
  print('MISSING', len(MISSING), 'assets — نزّلهم في فولدر', SRC, 'وشغّل تاني')
else:
  try: os.remove(os.environ.get('PORTAL_MISSING','missing.txt'))
  except FileNotFoundError: pass
INDEX={k:v for k,v in INDEX.items()}
json.dump(INDEX,open(IDX_PATH,'w'),separators=(',',':'))
print('index',len(INDEX),'new',NEWIDX)
import collections; print('contracts',dict(collections.Counter(x[2] for x in CONTRACTS)))
if os.environ.get('PORTAL_CONTRACTS'): json.dump(CONTRACTS,open(os.environ['PORTAL_CONTRACTS'],'w'),ensure_ascii=False)
print('cars',count,'logins',pairs,'reg/card files',globals().get('nfiles'),'multi',sum(1 for c in groups.values() if len(c)>1))
