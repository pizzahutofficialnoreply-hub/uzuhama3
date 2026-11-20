import urllib.request,gzip,base64
raw=urllib.request.urlopen('https://uzuhama.vercel.app/api/health?snapshot=logs').read()
s=base64.b64encode(gzip.compress(raw)).decode()
for i in range(0,len(s),20000): print('B64:'+s[i:i+20000])
