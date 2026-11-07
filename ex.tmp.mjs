import { chromium } from 'playwright';
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await ctx.addInitScript(()=>{localStorage.setItem('uzuhama_onboarding_version','999');localStorage.setItem('uzuhama_tutorial_done_v1','1')});
const p=await ctx.newPage(); await p.goto('http://localhost:4173/'); await p.waitForTimeout(5000);
await p.locator('nav[aria-label="하단 네비게이션"] button', {hasText:'기록'}).first().click(); await p.waitForTimeout(2000);
console.log(await p.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.offsetParent).slice(0,80).map(b=>(b.getAttribute('aria-label')||b.innerText).replace(/\s+/g,' ').slice(0,30)).join(' | ')));
await b.close();
