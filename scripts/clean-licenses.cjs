// 오픈소스 라이선스 목록 정리: 빌드한 컴퓨터의 경로는 빼고, 이 사이트 자체는 목록에서 뺌
const fs = require('fs');
const p = require('path').join(__dirname, '..', 'src', 'licenses.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const out = {};
for (const [k, v] of Object.entries(d)) {
  if (/^(uzuhama|react-example)/.test(k)) continue;
  const { path, licenseFile, ...rest } = v;
  out[k] = rest;
}
fs.writeFileSync(p, JSON.stringify(out, null, 2));
console.log(`licenses: ${Object.keys(out).length}`);
