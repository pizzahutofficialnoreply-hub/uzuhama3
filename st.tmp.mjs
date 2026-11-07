import { chromium } from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1400,height:900}});
await p.goto('http://localhost:4173/selftest?auto=1');
await p.waitForFunction(()=>window.__selftest?.done, null, {timeout:400000});
const r=await p.evaluate(()=>window.__selftest);
r.results.forEach(x=>console.log(x.ok?(x.warn?'⚠':'✓'):'✗', x.group, x.name, x.err||'', x.ms));
await p.screenshot({path:'/tmp/claude-0/-home-claude/a27561ce-6e10-5184-8ab4-318829fef238/scratchpad/st.png'});
await b.close();
