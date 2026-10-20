import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {translationText,translationDirection,makeBackup,validateBackup,emptyState} from '../extension/lib/core.js';
import {suggestLocal} from '../extension/lib/dictionary.js';
import {microsoftSettings,microsoftRequest,translateMicrosoft} from '../extension/lib/microsoft.js';

test('Chinese translation validation accepts mixed terms while keeping English lookup rules',()=>{
  assert.equal(translationText('  查询 API  接口  ','zh-en'),'查询 API 接口');
  assert.equal(translationText('running'),'running');
  for(const text of ['',null,'English only','字'.repeat(201),'中\0文'])assert.throws(()=>translationText(text,'zh-en'));
  assert.throws(()=>translationText('中文'));assert.throws(()=>translationDirection('arbitrary'));
});
test('Reverse Microsoft request and parser use zh-Hans to en without sending context or credentials in URLs',async()=>{
  const settings=microsoftSettings(),req=microsoftRequest(settings,'KEY','苹果','zh-en'),url=new URL(req.url);
  assert.equal(url.searchParams.get('from'),'zh-Hans');assert.equal(url.searchParams.get('to'),'en');assert.deepEqual(req.body,[{Text:'苹果'}]);assert.ok(!req.url.includes('KEY'));
  const value=await translateMicrosoft(settings,'PRIVATE','苹果',async()=>({ok:true,json:async()=>[{translations:[{to:'en',text:'apple PRIVATE'}]}]}),'zh-en');assert.equal(value,'apple [密钥已隐藏]');
  await assert.rejects(translateMicrosoft(settings,'KEY','苹果',async()=>({ok:true,json:async()=>[{translations:[{to:'zh-Hans',text:'苹果'}]}]}),'zh-en'),/英文译文/);
});
test('Chinese history survives backup and import alongside old English records; invalid directions fail',()=>{
  const state=emptyState(),date=new Date().toISOString();
  state.history.push({id:'reverse',originalText:'苹果',canonicalForm:'苹果',meaning:'apple',direction:'zh-en',status:'success',createdAt:date},{id:'old',originalText:'run',canonicalForm:'run',meaning:'跑',status:'success',createdAt:date});
  const backup=makeBackup(state),restored=validateBackup(backup);
  assert.equal(restored.history[0].direction,'zh-en');assert.equal(restored.history[0].originalText,'苹果');assert.equal(restored.history[0].meaning,'apple');assert.equal(Object.hasOwn(restored.history[1],'direction'),false);
  backup.history[0].direction='unsupported';assert.throws(()=>validateBackup(backup));
});
test('Word completion uses real local prefixes, returns bounded definitions and caches a single shard',async()=>{
  const originalFetch=globalThis.fetch,originalChrome=globalThis.chrome,calls=[];
  globalThis.chrome={runtime:{getURL:file=>file}};
  globalThis.fetch=async file=>{calls.push(file);return {ok:true,json:async()=>JSON.parse(await fs.readFile(new URL('../extension/'+file,import.meta.url),'utf8'))};};
  try{
    const result=await suggestLocal('APPL');assert.ok(result.some(item=>item.word==='apple'));assert.ok(result.some(item=>item.word==='apply'));assert.ok(result.every(item=>item.word.startsWith('appl')&&item.meaning.length<=151));assert.ok(result.length<=8);
    await suggestLocal('apple');assert.deepEqual(calls,['data/a.json']);
    for(const input of ['中文','<script>','a'.repeat(81),null,''])assert.deepEqual(await suggestLocal(input),[]);
    assert.equal(calls.length,1);
  }finally{globalThis.fetch=originalFetch;globalThis.chrome=originalChrome;}
});
