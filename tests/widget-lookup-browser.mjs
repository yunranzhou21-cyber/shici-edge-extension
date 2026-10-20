import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Luccass/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),profile=await fs.mkdtemp(path.join(root,'artifacts','edge-test-profile-widget-')),extension=path.join(profile,'fixture-extension');
await fs.cp(path.join(root,'extension'),extension,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8'));
manifest.host_permissions=['http://127.0.0.1/*'];
await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
const checks=[],requests=[];
const pass=text=>{checks.push(text);console.log('PASS '+text);};
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/ms/translate')){
    let body='';req.on('data',part=>body+=part);req.on('end',()=>{
      const input=JSON.parse(body);requests.push(input);
      setTimeout(()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify([{translations:[{to:'zh-Hans',text:'微软：跑'}]}]));},700);
    });return;
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><title>Reading with Shici</title><style>body{font:18px Georgia;padding:80px;color:#465d50;background:#f5f4ef}article{max-width:610px}p{line-height:1.8}</style><article><h1>A moment to understand</h1><p>Small discoveries make every page worth reading. Look up a word and keep its meaning close.</p></article>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let context;
async function until(check,predicate){for(let i=0;i<80;i++){const value=await check();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('State did not settle');}
try{
  context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true,viewport:{width:1280,height:920},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
  const manager=await context.newPage();await manager.goto(`chrome-extension://${id}/manager.html`);
  const send=message=>manager.evaluate(async m=>{const r=await chrome.runtime.sendMessage(m);if(!r.ok)throw new Error(r.error);return r.data;},message);
  await send({type:'SET_UI_PREFERENCES',patch:{x:0.95,y:0.75}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#shici-widget-host button').click();
  const widget=page.frameLocator('#shici-widget-host iframe'),input=widget.locator('#lookup-text'),meaning=widget.locator('#lookup-meaning');
  await input.waitFor();await input.fill('run');
  assert.equal(await widget.locator('#lookup-tab').getAttribute('aria-selected'),'true');
  assert.equal((await send({type:'STATE'})).history.length,0);assert.equal(requests.length,0);
  pass('Expanded widget defaults to manual lookup; typing and opening never query or save');

  await input.fill('中文');await input.press('Enter');await widget.locator('#lookup-message').filter({hasText:'200'}).waitFor();
  assert.equal((await send({type:'STATE'})).history.length,0);
  pass('Invalid input is rejected without creating history');

  await input.fill('run');await input.press('Enter');await widget.locator('#lookup-word').getByText('run',{exact:true}).waitFor();
  assert.match(await meaning.inputValue(),/跑/);assert.equal(await widget.locator('#lookup-status').textContent(),'未收藏');
  assert.equal((await send({type:'STATE'})).vocabulary.length,0);
  await meaning.fill('跑；我的浮窗释义');
  await page.screenshot({path:path.join(root,'artifacts','widget-lookup.png')});
  await widget.locator('#lookup-favorite').evaluate(b=>{b.click();b.click();});
  await until(()=>send({type:'STATE'}),s=>s.vocabulary.length===1);
  await widget.locator('#lookup-message').filter({hasText:'已保存到收藏'}).waitFor();
  const saved=(await send({type:'STATE'})).vocabulary[0];assert.equal(saved.preferredMeaning,'跑；我的浮窗释义');assert.equal(saved.occurrences.length,1);assert.deepEqual(saved.occurrences[0].source,{type:'manual'});
  assert.equal(await widget.locator('#count').textContent(),'1');
  pass('Enter queries offline; edited meaning saves once, as a manual record, only on explicit favorite');

  await input.fill('running');await widget.locator('#lookup-submit').click();
  await widget.locator('#lookup-word').getByText('running',{exact:true}).waitFor();
  assert.equal(await widget.locator('#lookup-status').textContent(),'已收藏');assert.notEqual(await meaning.inputValue(),saved.preferredMeaning);
  await widget.locator('#lookup-saved summary').first().click();await widget.locator('#lookup-existing .meaning').getByText(saved.preferredMeaning,{exact:true}).waitFor();
  await widget.locator('#lookup-context').evaluate(n=>{n.value='I am running a shop.';});await meaning.fill('经营商店');await widget.locator('#lookup-favorite').click();
  const appended=await until(()=>send({type:'STATE'}),s=>s.vocabulary[0].occurrences.length===2);
  assert.equal(appended.vocabulary.length,1);assert.equal(appended.vocabulary[0].preferredMeaning,saved.preferredMeaning);
  assert.equal(appended.vocabulary[0].occurrences[1].meaning,'经营商店');assert.equal(appended.vocabulary[0].occurrences[1].context,'I am running a shop.');
  pass('Known word forms show existing records and append new meanings without replacing the preferred meaning');

  await widget.locator('#favorites-tab').click();await widget.locator('#search').fill('经营商店');await widget.locator('#favorites .word').getByText('run',{exact:true}).waitFor();
  await widget.locator('#lookup-tab').click();assert.equal(await meaning.inputValue(),'经营商店');
  await widget.locator('#settings-tab').click();await widget.locator('#lookup-tab').click();assert.equal(await meaning.inputValue(),'经营商店');
  pass('Saved words are searchable in the favorites tab; switching tabs preserves the lookup draft');

  await input.fill('shiciwidgetunknownwordxyz');await input.press('Enter');await widget.locator('#lookup-word').getByText('shiciwidgetunknownwordxyz',{exact:true}).waitFor();
  assert.equal(await meaning.inputValue(),'');assert.equal(await widget.locator('#lookup-favorite').isDisabled(),true);
  await meaning.fill('手动补充的释义');await widget.locator('#lookup-favorite').click();await until(()=>send({type:'STATE'}),s=>s.vocabulary.length===2);
  pass('Dictionary misses allow manual meaning and favorite, with an empty-meaning guard');

  await input.fill('run');await input.press('Enter');await widget.locator('#lookup-word').getByText('run',{exact:true}).waitFor();
  await widget.locator('#lookup-online').click();await widget.locator('#lookup-configure').waitFor();assert.equal(requests.length,0);
  assert.match(await meaning.inputValue(),/跑/);assert.equal(await widget.locator('#lookup-status').textContent(),'已收藏');
  pass('Unconfigured Microsoft lookup guides to settings while keeping the local meaning and favorite status');

  await send({type:'SAVE_MICROSOFT_SETTINGS',settings:{enabled:true,endpoint:`http://127.0.0.1:${server.address().port}/ms`,region:''},key:'widget-test-key'});
  await widget.locator('#lookup-online').click();await until(async()=>requests.length,n=>n===1);
  await widget.locator('#lookup-message').filter({hasText:'已收藏'}).waitFor();
  await input.fill('apple');assert.equal(await widget.locator('#lookup-result').isHidden(),true);
  await input.press('Enter');await widget.locator('#lookup-word').getByText('apple',{exact:true}).waitFor();
  await until(()=>send({type:'STATE'}),s=>s.history.some(h=>h.meaning==='微软：跑'));
  assert.equal(await widget.locator('#lookup-word').textContent(),'apple');assert.equal(await widget.locator('#lookup-status').textContent(),'未收藏');
  assert.deepEqual(requests,[[{Text:'run'}]]);
  pass('Favorite status arrives during online lookup; delayed responses cannot replace a newly entered word');

  await input.fill('run');await input.press('Enter');await widget.locator('#lookup-word').getByText('run',{exact:true}).waitFor();
  await widget.locator('#lookup-online').click();await widget.locator('#lookup-meta').filter({hasText:'微软翻译'}).waitFor();
  assert.equal(await meaning.inputValue(),'微软：跑');assert.equal(requests.length,1);
  assert.equal((await send({type:'STATE'})).vocabulary.find(e=>e.canonicalForm==='run').preferredMeaning,saved.preferredMeaning);
  pass('Explicit Microsoft lookup renders the translation, reuses cache, and never overwrites favorites');

  const isolated=await page.locator('#shici-widget-host iframe').evaluate(n=>{try{return n.contentWindow.document.body.innerText;}catch(e){return e.name;}});
  assert.equal(isolated,'SecurityError');assert.deepEqual(errors,[]);
  await widget.locator('body').dispatchEvent('keydown',{key:'Escape',bubbles:true});await page.locator('#shici-widget-host iframe').waitFor({state:'detached'});
  await page.reload();await page.locator('#shici-widget-host button').click();await widget.locator('#favorites-tab').click();
  await widget.locator('#search').fill('我的浮窗释义');await widget.locator('#favorites .word').getByText('run',{exact:true}).waitFor();
  pass('Favorites survive closing and page reload; the host page cannot read the panel and Escape still closes it');
}finally{
  await context?.close();server.close();
  await fs.writeFile(path.join(root,'artifacts','widget-lookup-results.json'),JSON.stringify({testedAt:new Date().toISOString(),browser:'Microsoft Edge headless',checks},null,2));
}
