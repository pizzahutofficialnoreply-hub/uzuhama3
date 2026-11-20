import json,re,urllib.request
d=json.load(urllib.request.urlopen('https://uzuhama.vercel.app/api/health?snapshot=logs'))
logs={}
for m in d['months']:
  for k,l in (m.get('items') or {}).items(): logs[l.get('id',k)]=l
hist=json.load(urllib.request.urlopen('https://uzuhama.vercel.app/data/historical_logs.json'))
H=hist if isinstance(hist,list) else list(hist.values()) if isinstance(hist,dict) and 'logs' not in hist else hist['logs']
# merge: firestore overrides by id; patches merge
base={}
for l in (H if isinstance(H,list) else []):
  base[l['id']]=l
for k,l in logs.items():
  if l.get('_patch') and k in base: base[k]={**base[k],**l}
  else: base[k]=l
L=[l for l in base.values() if l and not l.get('isAbsence')]
yid=lambda u:(re.search(r'(?:youtu\.be/|v=|/live/|/shorts/)([\w-]{11})',str(u or '')) or [None,None])[1]
def urls(l,k): return [yid(v.get('url') if isinstance(v,dict) else v) for v in (l.get(k) or [])]
comps={c['docId']:c['comp'] for c in d['comps']}
print('logs',len(L),'comps',len(comps))
pairs=json.load(open('.github/peek/pairs.json'))
for p in pairs:
  lv=[l for l in L if p['live'] in urls(l,'vods')]
  vd=[l for l in L if p['video'] and p['video'] in urls(l,'edited')]
  incomp=[cid for cid,c in comps.items() if p['video'] and p['video'] in str(c.get('url',''))]
  st='OK' if lv and vd and any(x['id']==y['id'] for x in lv for y in vd) else 'CHECK'
  if not p['video']: st='LIVEONLY' if lv else 'NOLIVE'
  print(st, p['date'], 'live@',[x['date'] for x in lv], 'video@',[x['date'] for x in vd], 'comp',incomp, p['title'][:25])
print('---- shorts comp')
order=['YfYf8FhRRU4','W7izi8-v0bs','mKeIckxmLcI','FFfp773TR3M','CwYRZGk67i8','GhZD46UHPjw']
dates=[]
for o in order:
  ls=[l for l in L if o in urls(l,'vods')]
  print(o, [(x['date'], x.get('game') or [g.get('name') for g in x.get('games',[])][:2]) for x in ls])
  dates.append(ls[0]['date'] if ls else None)
print('want order', dates)
for cid,c in comps.items():
  ds=[b.get('date') for b in c.get('broadcasts',[])]
  if len(set(ds)&set(x for x in dates if x))>=3: print('COMP',cid,c.get('kind'),c.get('title'),c.get('url'),ds)
for l in L:
  for k in ('shorts','edited'):
    for v in l.get(k) or []:
      if isinstance(v,dict) and v.get('allBroadcastDates') and len(set(v['allBroadcastDates'])&set(x for x in dates if x))>=3: print('LINK',l['date'],k,v.get('title'),v.get('url'),v.get('allBroadcastDates'))
# 2026-10-11 shorts
for l in L:
  for v in l.get('shorts') or []:
    t=(v.get('title') if isinstance(v,dict) else '') or ''
    if '엉덩이' in t: print('SHORT',l['date'],t,v.get('url'),v.get('allBroadcastDates'))
print('==== IDS')
order_ids=[]
for o in order:
  ls=[l for l in L if o in urls(l,'vods')]
  order_ids.append(ls[0]['id'] if ls else None)
holders=[l['id'] for l in L if 'c-ToCiLeHas' in urls(l,'edited')+urls(l,'shorts')]
print('ORDERIDS', json.dumps(order_ids)); print('HOLDERS', json.dumps(holders))
for l in L:
  if l.get('date')=='2024-09-19': print('PIZZA', l['id'], json.dumps(l.get('vods')), json.dumps([e.get('url') for e in l.get('edited',[])]))
for p in pairs:
  ls=[l for l in L if p['live'] in urls(l,'vods')]
  if len(ls)>1: print('DUP', p['date'], [x['id'] for x in ls])
