// Capture the real extension in a disposable profile. No data reaches the user's browser.
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Luccass/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),profile=await fs.mkdtemp(path.join(root,'artifacts','edge-test-profile-theme-')),extension=path.join(root,'extension');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reading preview</title><style>body{font:18px/1.8 Georgia;padding:24px;background:#f5f4ef;color:#344e46}h1{font-size:28px}</style><h1>A moment to understand</h1><p>Small discoveries make every page worth reading.</p>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let context;
const review={reviewedAt:new Date().toISOString(),surfaces:[]};
try{
  context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true,viewport:{width:1440,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const manager=await context.newPage();await manager.goto(`chrome-extension://${id}/manager.html`);
  const send=message=>manager.evaluate(async m=>{const r=await chrome.runtime.sendMessage(m);if(!r.ok)throw new Error(r.error);return r.data;},message);
  const capture=async(page,name)=>{
    await page.evaluate(()=>document.fonts.ready);
    await new Promise(resolve=>setTimeout(resolve,200));
    await page.screenshot({path:path.join(root,'artifacts',name+'.png')});
    review.surfaces.push(await page.evaluate(name=>({name,width:innerWidth,documentWidth:document.documentElement.scrollWidth,scheme:getComputedStyle(document.documentElement).colorScheme,images:[...document.images].map(i=>({src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0}))}),name));
  };
  await manager.locator('.empty').waitFor();await capture(manager,'theme-empty');
  for(const text of ['serendipity','resilient','run']){
    const item=await send({type:'LOOKUP',text,source:{type:'manual'}});
    if(item.meaning)await send({type:'FAVORITE',item});
  }
  await manager.reload();await manager.locator('.record').first().waitFor();await capture(manager,'theme-manager');
  await manager.locator('.record').first().getByRole('button',{name:'编辑',exact:true}).click();await manager.locator('#editor').waitFor();await capture(manager,'theme-editor');await manager.locator('#editor button[value=cancel]').click();
  await manager.locator('[data-tab=settings]').click();await capture(manager,'theme-settings');
  await manager.setViewportSize({width:390,height:844});await manager.locator('[data-tab=vocabulary]').click();await capture(manager,'theme-manager-narrow');
  await manager.locator('[data-tab=settings]').click();await capture(manager,'theme-settings-narrow');
  const page=await context.newPage();await page.setViewportSize({width:390,height:844});await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#shici-widget-host button img').waitFor();
  review.launcher=await page.locator('#shici-widget-host button img').evaluate(i=>({loaded:i.complete&&i.naturalWidth>0,draggable:i.draggable}));
  await page.locator('#shici-widget-host button').click();const widget=page.frameLocator('#shici-widget-host iframe');
  await widget.locator('#lookup-text').fill('serendipity');await widget.locator('#lookup-text').press('Enter');await widget.locator('#lookup-word').getByText('serendipity',{exact:true}).waitFor();
  await capture(page,'theme-widget-narrow');
  review.widget=await widget.locator('body').evaluate(n=>({viewportWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,images:[...n.querySelectorAll('img')].map(i=>({loaded:i.complete&&i.naturalWidth>0}))}));
  review.palette=await manager.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['--bg','--text','--muted','--quiet','--input','--cyan','--mint'].map(k=>[k,s.getPropertyValue(k).trim()]));});
  console.log(JSON.stringify(review,null,2));
}finally{
  await context?.close();server.close();
  await fs.writeFile(path.join(root,'artifacts','theme-review.json'),JSON.stringify(review,null,2));
}
