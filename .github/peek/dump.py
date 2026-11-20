import json,re,urllib.request,gzip,base64
d=json.load(urllib.request.urlopen('https://uzuhama.vercel.app/api/health?snapshot=logs'))
hist=json.load(urllib.request.urlopen('https://uzuhama.vercel.app/data/historical_logs.json'))
H=hist if isinstance(hist,list) else hist.get('logs',[])
base={l['id']:l for l in H if isinstance(l,dict) and 'id' in l}
for m in d['months']:
  for k,l in (m.get('items') or {}).items():
    if l.get('_patch') and k in base: base[k]={**base[k],**l}
    else: base[k]=l
out=[]
for l in base.values():
  if not l or not l.get('date'): continue
  f=lambda k:[{'u':(v.get('url') if isinstance(v,dict) else v) or '','t':(v.get('title') if isinstance(v,dict) else '') or '','c':bool(isinstance(v,dict) and (v.get('isCompilation') or v.get('multiId') or v.get('allBroadcastDates')))} for v in (l.get(k) or [])]
  out.append({'id':l['id'],'date':l['date'],'time':l.get('time'),'abs':bool(l.get('isAbsence')),'game':l.get('game') or '','games':[g.get('name') for g in (l.get('games') or []) if isinstance(g,dict)],'vods':f('vods'),'edited':f('edited'),'shorts':len(l.get('shorts') or []),'memo':(l.get('memo') or '')[:80]})
s=base64.b64encode(gzip.compress(json.dumps(out,ensure_ascii=False).encode())).decode()
print('B64LEN',len(s))
for i in range(0,len(s),20000): print('B64:'+s[i:i+20000])
