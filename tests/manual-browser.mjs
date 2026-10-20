import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Luccass/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),profile=await fs.mkdtemp(path.join(root,'artifacts','edge-test-profile-manual-')),extension=path.join(profile,'fixture-extension');
await fs.cp(path.join(root,'extension'),extension,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8'));manifest.host_permissions=['http://127.0.0.1/*'];await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
const checks=[],requests=[],pass=text=>{checks.push(text);console.log('PASS '+text);};
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/ms/translate')){let body='';req.on('data',part=>body+=part);req.on('end',()=>{
    const parsed=JSON.parse(body),url=new URL(req.url,'http://localhost'),to=url.searchParams.get('to'),text=parsed[0].Text;
    requests.push({from:url.searchParams.get('from'),to,body:parsed,key:req.headers['ocp-apim-subscription-key']});
    const answer=()=>{res.setHeader('Content-Type','application/json');if(text==='错误限流'){res.statusCode=429;res.end('{}');return;}const translation=to==='en'?({'苹果':'apple','跑步':'running','API 接口':'API interface','慢慢地':'slowly'}[text]||'translated text'):'接口';res.end(JSON.stringify([{translations:[{to,text:translation}]}]));};
    if(text==='慢慢地')setTimeout(answer,900);else answer();
  });return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>Reading fixture</title><h1>Read and discover</h1><p>Learning starts with a word.</p>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let context;
async function until(check,predicate){for(let i=0;i<100;i++){const value=await check();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,40));}throw new Error('State did not settle');}
try{
  context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true,viewport:{width:1280,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const manager=await context.newPage(),errors=[];manager.on('pageerror',e=>errors.push(e.message));await manager.goto(`chrome-extension://${id}/manager.html`);
  const send=message=>manager.evaluate(async m=>{const r=await chrome.runtime.sendMessage(m);if(!r.ok)throw new Error(r.error);return r.data;},message);
  await manager.locator('#manual-toggle').click();const input=manager.locator('#lookup-word'),list=manager.locator('#manual-suggestions');
  await input.fill('appl');await list.getByText('apple',{exact:true}).waitFor();
  assert.equal(requests.length,0);assert.equal((await send({type:'STATE'})).history.length,0);
  await manager.screenshot({path:path.join(root,'artifacts','manual-completion.png')});
  await list.getByText('apple',{exact:true}).click();assert.equal(await input.inputValue(),'apple');assert.equal(await list.isHidden(),true);assert.equal((await send({type:'STATE'})).history.length,0);
  pass('Manager completion shows real local words and definitions; clicking fills without translating or recording history');

  await input.fill('appl');await list.getByText('apple',{exact:true}).waitFor();const lastWord=await list.locator('li strong').last().textContent();
  await input.press('ArrowUp');await input.press('Tab');assert.equal(await input.inputValue(),lastWord);
  await input.fill('appl');await list.getByText('apple',{exact:true}).waitFor();await input.press('ArrowDown');await input.press('Enter');assert.equal(await input.inputValue(),'apple');assert.equal((await send({type:'STATE'})).history.length,0);
  await input.press('Enter');await manager.locator('#lookup-result h2').getByText('apple',{exact:true}).waitFor();assert.equal((await send({type:'STATE'})).history.length,1);
  pass('Arrow keys and Tab accept suggestions; Enter accepts an active suggestion and a second Enter explicitly queries');

  await input.dispatchEvent('compositionstart');await input.fill('appl');assert.equal(await list.isHidden(),true);await input.dispatchEvent('compositionend');await list.getByText('apple',{exact:true}).waitFor();
  await input.press('Escape');assert.equal(await list.isHidden(),true);assert.equal(requests.length,0);
  pass('IME composition suppresses suggestions until completion and Escape dismisses the list');

  await manager.locator('#manual-direction').selectOption('zh-en');await input.fill('苹果');await manager.locator('#manual-submit').click();
  await manager.locator('#lookup-result').getByRole('button',{name:'打开微软联网设置 ↗'}).waitFor();assert.equal(requests.length,0);
  assert.equal(await manager.locator('#lookup-result').getByRole('button',{name:'收藏英文译文'}).isDisabled(),true);
  pass('Chinese translation with no Microsoft setup gives an honest settings path and makes no request');

  await send({type:'SAVE_MICROSOFT_SETTINGS',settings:{enabled:true,endpoint:`http://127.0.0.1:${server.address().port}/ms`,region:'eastasia'},key:'private-manual-test-key'});
  await manager.locator('#manual-submit').click();const english=manager.getByRole('textbox',{name:'本次英文译文'});await until(()=>english.inputValue(),v=>v==='apple');
  assert.deepEqual(requests[0],{from:'zh-Hans',to:'en',body:[{Text:'苹果'}],key:'private-manual-test-key'});assert.equal((await send({type:'STATE'})).vocabulary.length,0);
  await manager.screenshot({path:path.join(root,'artifacts','manual-chinese-english.png')});
  await english.fill('apple fruit');await manager.locator('#lookup-result').getByRole('button',{name:'收藏英文译文'}).click();
  let state=await until(()=>send({type:'STATE'}),s=>s.vocabulary.length===1);assert.equal(state.vocabulary[0].canonicalForm,'apple fruit');assert.equal(state.vocabulary[0].preferredMeaning,'苹果');
  pass('Chinese to English sends only Chinese input; the editable English translation saves as an English entry with its Chinese meaning');

  const count=requests.length;await manager.locator('#manual-submit').click();await until(()=>english.inputValue(),v=>v==='apple');assert.equal(requests.length,count);
  await send({type:'LOOKUP',text:'API 接口',online:true});const reverse=await send({type:'LOOKUP',text:'API 接口',direction:'zh-en'});assert.equal(reverse.meaning,'API interface');assert.equal(requests.at(-2).from,'en');assert.equal(requests.at(-1).from,'zh-Hans');
  pass('Translation cache reuses repeated Chinese requests while keeping opposite language directions separate');

  const backup=await send({type:'EXPORT'});assert.ok(backup.history.some(h=>h.direction==='zh-en'&&h.originalText==='苹果'&&h.meaning==='apple'));assert.ok(!JSON.stringify(backup).includes('private-manual-test-key'));
  const before=(await send({type:'STATE'})).history.length;await send({type:'IMPORT',backup});assert.equal((await send({type:'STATE'})).history.length,before);
  await manager.locator('[data-tab=history]').click();await manager.locator('#search').fill('苹果');await manager.locator('#record-list .record').first().getByRole('button',{name:'查看译文 / 收藏'}).click();await english.waitFor();assert.equal(await manager.locator('#manual-direction').inputValue(),'zh-en');
  pass('Chinese history is searchable and reopens as Chinese translation; export/import preserves directions and excludes keys');

  await manager.locator('[data-tab=vocabulary]').click();await send({type:'FAVORITE',item:{originalText:'run',meaning:'我原来的跑步释义'}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#shici-widget-host button').click();
  const widget=page.frameLocator('#shici-widget-host iframe'),word=widget.locator('#lookup-text');
  await word.fill('appl');await widget.locator('#lookup-suggestions').getByText('apple',{exact:true}).waitFor();await word.press('ArrowDown');await word.press('Enter');assert.equal(await word.inputValue(),'apple');
  await word.fill('appl');await widget.locator('#lookup-suggestions').getByText('apple',{exact:true}).waitFor();await word.dispatchEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,isComposing:true});assert.equal(await page.locator('#shici-widget-host iframe').count(),1);await word.dispatchEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});assert.equal(await page.locator('#shici-widget-host iframe').count(),1);assert.equal(await widget.locator('#lookup-suggestions').isHidden(),true);
  pass('Floating widget has the same completion controls; Escape dismisses suggestions before closing the panel');

  await widget.locator('#lookup-direction').selectOption('zh-en');await word.fill('跑步');await word.press('Enter');const widgetEnglish=widget.getByRole('textbox',{name:'本次英文译文'});await until(()=>widgetEnglish.inputValue(),v=>v==='running');
  await widget.locator('#lookup-reverse').getByRole('button',{name:'追加本次中文释义'}).click();state=await until(()=>send({type:'STATE'}),s=>s.vocabulary.find(e=>e.canonicalForm==='run')?.occurrences.length===2);
  assert.equal(state.vocabulary.find(e=>e.canonicalForm==='run').preferredMeaning,'我原来的跑步释义');assert.equal(state.vocabulary.find(e=>e.canonicalForm==='run').occurrences[1].meaning,'跑步');
  await widget.locator('body').evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(root,'artifacts','widget-chinese-english.png')});
  pass('Widget Chinese translation recognizes an existing English word form and appends the Chinese meaning without overwriting it');

  await word.fill('慢慢地');await word.press('Enter');await until(async()=>requests.some(r=>r.body[0].Text==='慢慢地'),Boolean);
  await widget.locator('#lookup-direction').selectOption('en-zh');await word.fill('run');await word.press('Enter');await widget.locator('#lookup-word').getByText('run',{exact:true}).waitFor();await until(()=>send({type:'STATE'}),s=>s.history.some(h=>h.meaning==='slowly'));
  assert.equal(await widget.locator('#lookup-word').textContent(),'run');assert.equal(await widget.locator('#lookup-reverse').isHidden(),true);
  pass('Changing direction and word ignores a slower previous Chinese translation');

  await widget.locator('#lookup-direction').selectOption('zh-en');await word.fill('错误限流');await word.press('Enter');await widget.locator('#lookup-reverse').getByText(/HTTP 429/).waitFor();assert.equal(await widgetEnglish.inputValue(),'');
  await widget.locator('#lookup-direction').selectOption('en-zh');await word.fill('run');await word.press('Enter');await widget.locator('#lookup-word').getByText('run',{exact:true}).waitFor();assert.match(await widget.locator('#lookup-meaning').inputValue(),/跑/);assert.deepEqual(errors,[]);
  pass('Real Microsoft HTTP errors remain visible and do not break subsequent offline English lookup');
}finally{
  await context?.close();server.close();
  await fs.writeFile(path.join(root,'artifacts','manual-results.json'),JSON.stringify({testedAt:new Date().toISOString(),browser:'Microsoft Edge headless',checks},null,2));
}
