import { canonicalize, queryText, translationText, translationDirection, limited, favorite, cleanSource, uid, now, validateBackup, mergeBackup, makeBackup, searchEntries } from './lib/core.js';
import { preferences, preferencePatch } from './lib/preferences.js';
import { readState, mutateState } from './lib/storage.js';
import { lookupLocal, suggestLocal } from './lib/dictionary.js';
import { validateSettings, hostPattern, callProvider } from './lib/providers.js';
import { microsoftSettings, translateMicrosoft } from './lib/microsoft.js';
import { resolveLookup } from './lib/lookup.js';
import { isPdfUrl, chooseSelectionFrame, readerUrl } from './lib/documents.js';

chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
const managerUrl = chrome.runtime.getURL('manager.html');
const widgetUrl = chrome.runtime.getURL('widget.html');
const readerBase=chrome.runtime.getURL('reader.html');
const cache = new Map();
const microsoftCache = new Map();
async function openManager(hash='') { await chrome.tabs.create({url:managerUrl + hash}); }
chrome.action.onClicked.addListener(async tab=>{if(tab?.url)await chrome.storage.session.set({lastDocumentUrl:tab.url,lastDocumentTitle:tab.title||''});await openManager();});
export async function triggerLookup(tab){
  if(!tab?.id)return;
  if(tab.url?.split(/[?#]/)[0]===readerBase){await chrome.tabs.sendMessage(tab.id,{type:'TRIGGER_LOOKUP'},{frameId:0});return;}
  try{
    await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['content.js']});
    const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>globalThis.__shiciProbeSelection?.()||null});
    if(!frames.some(f=>f.result?.selected)&&isPdfUrl(tab.url)){await openReader({type:'pdf',url:tab.url,title:tab.title});return;}
    await chrome.tabs.sendMessage(tab.id,{type:'TRIGGER_LOOKUP'},{frameId:chooseSelectionFrame(frames)});
  }catch{if(isPdfUrl(tab.url))await openReader({type:'pdf',url:tab.url,title:tab.title});else await openManager('#unsupported');}
}
async function openReader(source={}){await chrome.tabs.create({url:readerUrl(readerBase,source)});}
chrome.commands.onCommand.addListener(async command => {
  if (command !== 'lookup-selection') return;
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  await triggerLookup(tab);
});
chrome.runtime.onInstalled.addListener(()=>{
  chrome.contextMenus.removeAll(()=>{chrome.contextMenus.create({id:'shici-document-selection',title:'用拾词翻译并收藏所选英文',contexts:['selection']});chrome.contextMenus.create({id:'shici-open-pdf',title:'在拾词阅读器打开此 PDF',contexts:['link'],targetUrlPatterns:['*://*/*.pdf*','file:///*.pdf*']});});
});
export async function handleContextSelection(info,tab){
  if(info.menuItemId==='shici-open-pdf'){await openReader({type:'pdf',url:safeDocumentUrl(info.linkUrl),title:'PDF 文档'});return;}
  if(info.menuItemId!=='shici-document-selection')return;
  if(info.editable){await openManager('#unsupported');return;}
  try{
    const text=queryText(info.selectionText),url=info.frameUrl||info.pageUrl||tab?.url;
    const id=uid();const source=cleanSource({type:isPdfUrl(url)?'pdf':'web',url,title:tab?.title,pageNumber:Number(new URL(url).hash.match(/page=(\d+)/)?.[1])||undefined});
    await chrome.storage.session.set({['capture-'+id]:{text,source,createdAt:Date.now()}});await openManager('#capture-'+id);
  }catch{await openManager('#unsupported');}
}
function safeDocumentUrl(value){try{return ['http:','https:'].includes(new URL(value).protocol)?value:undefined;}catch{return undefined;}}
chrome.contextMenus.onClicked.addListener(handleContextSelection);
const privileged = new Set(['STATE','EXPORT','IMPORT','DELETE_ENTRY','EDIT_ENTRY','DELETE_HISTORY','CLEAR_HISTORY','GET_SETTINGS','SAVE_SETTINGS','DELETE_KEY','TEST_CONNECTION','GET_MICROSOFT_SETTINGS','SAVE_MICROSOFT_SETTINGS','DELETE_MICROSOFT_KEY','TEST_MICROSOFT']);
const widgetOnly = new Set(['WIDGET_DATA','SET_UI_PREFERENCES','SET_AI_ENABLED','SUGGEST']);
async function broadcastPreferences(value) {
  const tabs=await chrome.tabs.query({});
  await Promise.allSettled(tabs.filter(t=>t.id).map(t=>chrome.tabs.sendMessage(t.id,{type:'UI_PREFERENCES_CHANGED',preferences:value})));
}
function sourceFor(message,sender) {
  if([readerBase,managerUrl,widgetUrl].includes(sender.url?.split(/[?#]/)[0]))return cleanSource(message.source);
  if (!sender.tab) return cleanSource(message.source);
  const url = safeDocumentUrl(sender.url)||sender.tab.url;
  let type = 'web';
  try { if (/(^|\.)youtube\.com$/.test(new URL(url).hostname)) type='youtube'; } catch {}
  if(type==='web'&&message.source?.type==='pdf')type='pdf';
  return cleanSource({type,url,title:message.source?.title||sender.tab.title,pageNumber:type==='pdf'?message.source?.pageNumber:undefined,timestampSeconds:type==='youtube'?message.source?.timestampSeconds:undefined});
}
async function settingsAndKey() { return chrome.storage.local.get(['ai','apiKey']); }
async function microsoftLookup(settings,key,text,test=false,direction='en-zh'){
  if(!await chrome.permissions.contains({origins:[hostPattern(settings.endpoint)]}))throw new Error('微软 API 站点权限已撤销，请重新保存微软配置');
  const cacheKey=JSON.stringify([text,settings.endpoint,settings.region,'v3',direction]);
  if(!test&&microsoftCache.has(cacheKey))return {meaning:microsoftCache.get(cacheKey),cached:true};
  const meaning=await translateMicrosoft(settings,key,text,fetch,direction);
  if(!test){if(microsoftCache.size>=200)microsoftCache.delete(microsoftCache.keys().next().value);microsoftCache.set(cacheKey,meaning);}
  return {meaning,cached:false};
}
async function handle(message,sender) {
  const trusted = sender.url?.split('#')[0] === managerUrl && !sender.tab?.url?.startsWith('http');
  const widget = sender.url?.split('#')[0] === widgetUrl;
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== 'string' || (privileged.has(message.type) && !trusted)) throw new Error('请求来源不受支持');
  if(widgetOnly.has(message.type) && !trusted && !widget)throw new Error('请求来源不受支持');
  switch (message.type) {
    case 'SUGGEST': return suggestLocal(message.text);
    case 'OPEN_READER': {
      const {lastDocumentUrl,lastDocumentTitle}=await chrome.storage.session.get(['lastDocumentUrl','lastDocumentTitle']);
      const url=safeDocumentUrl(sender.tab?.url)||lastDocumentUrl;
      await openReader(isPdfUrl(url)?{type:'pdf',url:safeDocumentUrl(url),title:sender.tab?.title||lastDocumentTitle}:{});return true;
    }
    case 'OPEN_SOURCE': {
      if(!trusted&&!widget&&sender.url?.split(/[?#]/)[0]!==readerBase)throw new Error('请求来源不受支持');
      const source=cleanSource(message.source);if(source.type!=='pdf')throw new Error('此来源不是 PDF');await openReader(source);return true;
    }
    case 'GET_CAPTURE': {
      if(!trusted||typeof message.id!=='string'||!/^[\w-]{1,100}$/.test(message.id))throw new Error('请求来源不受支持');
      const key='capture-'+message.id,stored=(await chrome.storage.session.get(key))[key];await chrome.storage.session.remove(key);
      if(!stored||Date.now()-stored.createdAt>10*60*1000)throw new Error('选词记录已过期，请重新选择');return stored;
    }
    case 'GET_UI_PREFERENCES': return preferences((await chrome.storage.local.get('uiPreferences')).uiPreferences);
    case 'SAVE_WIDGET_POSITION': {
      if(!Number.isFinite(message.x)||!Number.isFinite(message.y))throw new Error('位置无效');
      const {uiPreferences}=await chrome.storage.local.get('uiPreferences');
      const value=preferences({...uiPreferences,x:message.x,y:message.y});
      await chrome.storage.local.set({uiPreferences:value});return value;
    }
    case 'SET_UI_PREFERENCES': {
      const patch=preferencePatch(message.patch);
      const {uiPreferences}=await chrome.storage.local.get('uiPreferences');
      const value=preferences({...uiPreferences,...patch});
      await chrome.storage.local.set({uiPreferences:value});
      await broadcastPreferences(value);return value;
    }
    case 'WIDGET_DATA': {
      const [{ai,apiKey,uiPreferences},commands,state]=await Promise.all([chrome.storage.local.get(['ai','apiKey','uiPreferences']),chrome.commands.getAll(),readState()]);
      const entries=searchEntries(state.vocabulary,limited(message.query,200)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
      const offset=Number.isInteger(message.offset)&&message.offset>=0?message.offset:0;
      return {preferences:preferences(uiPreferences),shortcut:commands.find(c=>c.name==='lookup-selection')?.shortcut||'',aiEnabled:!!(ai?.enabled&&apiKey),aiConfigured:!!(ai&&apiKey),total:state.vocabulary.length,matched:entries.length,entries:entries.slice(offset,offset+30)};
    }
    case 'SET_AI_ENABLED': {
      if(typeof message.enabled!=='boolean')throw new Error('设置格式无效');
      const {ai,apiKey}=await settingsAndKey();
      if(!ai)return message.enabled?{needsSettings:true}:{enabled:false};
      if(message.enabled&&!apiKey)return {needsSettings:true};
      await chrome.storage.local.set({ai:{...ai,enabled:message.enabled}});cache.clear();return {enabled:message.enabled};
    }
    case 'OPEN_SHORTCUTS': await chrome.tabs.create({url:'edge://extensions/shortcuts'});return true;
    case 'OPEN_VOCABULARY': await openManager('#vocabulary');return true;
    case 'STATE': return readState();
    case 'LOOKUP': {
      const direction=translationDirection(message.direction),reverse=direction==='zh-en';
      if(reverse&&!trusted&&!widget)throw new Error('请在手动查词中使用中文译英');
      const originalText = translationText(message.text,direction);
      const canonicalForm = canonicalize(originalText);
      const context = limited(message.context);
      const source = sourceFor(message,sender);
      const state = await readState();
      let saved = reverse?null:state.vocabulary.find(e=>e.canonicalForm===canonicalForm) || null;
      const {microsoft,microsoftKey}=await chrome.storage.local.get(['microsoft','microsoftKey']);
      const result=await resolveLookup(originalText,{local:reverse?async()=>({status:'not_found',canonicalForm}):lookupLocal,enabled:!!microsoft?.enabled,configured:!!microsoftKey,online:reverse||message.online===true,translate:text=>microsoftLookup(microsoftSettings(microsoft),microsoftKey,text,false,direction)});
      if(reverse&&result.meaning){try{saved=state.vocabulary.find(e=>e.canonicalForm===canonicalize(queryText(result.meaning)))||null;}catch{}}
      const history = {id:uid(),originalText,canonicalForm,meaning:result.meaning||'',context,source,status:result.status,createdAt:now(),...(reverse?{direction}:{})};
      await mutateState(s=>s.history.unshift(history));
      return {...history,phonetic:result.phonetic,saved,error:result.error,provider:result.provider,warning:result.warning,cached:result.cached,needsMicrosoftSettings:result.needsMicrosoftSettings};
    }
    case 'GET_MICROSOFT_SETTINGS': {const {microsoft,microsoftKey}=await chrome.storage.local.get(['microsoft','microsoftKey']);return {settings:microsoftSettings(microsoft),hasKey:!!microsoftKey};}
    case 'SAVE_MICROSOFT_SETTINGS': {
      const settings=microsoftSettings(message.settings);
      if(!await chrome.permissions.contains({origins:[hostPattern(settings.endpoint)]}))throw new Error('尚未授予微软 API 站点访问权限');
      const old=await chrome.storage.local.get(['microsoft','microsoftKey']);const update={microsoft:settings};
      if(typeof message.key==='string'&&message.key.trim()){
        if(message.key.length>2000||/[\r\n]/.test(message.key))throw new Error('微软密钥格式无效');
        update.microsoftKey=message.key.trim();
      }else if(old.microsoftKey&&new URL(old.microsoft.endpoint).origin!==new URL(settings.endpoint).origin)throw new Error('更换微软 API 域名时请重新填写对应 Key');
      if(settings.enabled&&!update.microsoftKey&&!old.microsoftKey)throw new Error('启用联网查词前请填写微软 API Key');
      await chrome.storage.local.set(update);microsoftCache.clear();return true;
    }
    case 'DELETE_MICROSOFT_KEY': {
      await chrome.storage.local.remove('microsoftKey');
      const {microsoft}=await chrome.storage.local.get('microsoft');if(microsoft)await chrome.storage.local.set({microsoft:{...microsoft,enabled:false}});
      microsoftCache.clear();return true;
    }
    case 'TEST_MICROSOFT': {
      const {microsoft,microsoftKey}=await chrome.storage.local.get(['microsoft','microsoftKey']);
      if(!microsoftKey)throw new Error('请先保存微软 API Key');
      return microsoftLookup(microsoftSettings(microsoft),microsoftKey,'hello',true);
    }
    case 'FAVORITE_STATUS': {
      const canonicalForm = canonicalize(queryText(message.text));
      return (await readState()).vocabulary.find(e=>e.canonicalForm===canonicalForm) || null;
    }
    case 'FAVORITE': return mutateState(s=>favorite(s,{...message.item,source:sourceFor(message.item||{},sender)},!!message.append));
    case 'DELETE_ENTRY': return mutateState(s=>{s.vocabulary=s.vocabulary.filter(e=>e.id!==message.id);});
    case 'EDIT_ENTRY': return mutateState(s=>{
      const entry=s.vocabulary.find(e=>e.id===message.id);
      const meaning=limited(message.meaning,4000).trim();
      if (!entry || !meaning) throw new Error('词条不存在或释义为空');
      entry.preferredMeaning=meaning;entry.updatedAt=now();return entry;
    });
    case 'DELETE_HISTORY': return mutateState(s=>{s.history=s.history.filter(h=>h.id!==message.id);});
    case 'CLEAR_HISTORY': return mutateState(s=>{s.history=[];});
    case 'EXPORT': return makeBackup(await readState());
    case 'IMPORT': {
      const imported=validateBackup(message.backup);
      await mutateState(s=>mergeBackup(s,imported));
      return {vocabulary:imported.vocabulary.length,history:imported.history.length};
    }
    case 'GET_SETTINGS': { const {ai,apiKey}=await settingsAndKey();return {ai:ai||null,hasKey:!!apiKey}; }
    case 'SAVE_SETTINGS': {
      const ai=validateSettings(message.settings);
      if (!await chrome.permissions.contains({origins:[hostPattern(ai.baseUrl)]})) throw new Error('尚未授予此 API 地址的访问权限');
      const update={ai};
      if (typeof message.key === 'string' && message.key.trim()) {
        if (message.key.length>2000 || /[\r\n]/.test(message.key)) throw new Error('密钥格式无效');
        update.apiKey=message.key.trim();
      } else {
        const old=await settingsAndKey();
        if (old.apiKey && (old.ai?.provider!==ai.provider || new URL(old.ai.baseUrl).origin!==new URL(ai.baseUrl).origin)) throw new Error('更换服务商或 API 域名时请重新填写对应密钥');
      }
      await chrome.storage.local.set(update);cache.clear();return true;
    }
    case 'DELETE_KEY': await chrome.storage.local.remove('apiKey');cache.clear();return true;
    case 'TEST_CONNECTION':
    case 'EXPLAIN': {
      const {ai,apiKey}=await settingsAndKey();
      if (!ai || !apiKey || (message.type==='EXPLAIN' && !ai.enabled)) return {needsSettings:true};
      const settings=validateSettings(ai);
      if (!await chrome.permissions.contains({origins:[hostPattern(settings.baseUrl)]})) throw new Error('此服务的站点权限已撤销，请重新保存设置');
      const test=message.type==='TEST_CONNECTION';
      const word=test?'':queryText(message.text), context=limited(message.context);
      const key=JSON.stringify([word,context,settings.provider,settings.baseUrl,settings.model,'v1']);
      if (!test && cache.has(key)) return {text:cache.get(key),cached:true};
      const text=await callProvider(settings,apiKey,word,context,test);
      if (!test) {if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,text);}
      return {text};
    }
    case 'OPEN_SETTINGS': await openManager('#settings');return true;
    case 'OPEN_MICROSOFT_SETTINGS': await openManager('#microsoft');return true;
    default: throw new Error('不支持的操作');
  }
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  handle(message,sender).then(data=>reply({ok:true,data})).catch(error=>reply({ok:false,error:error.message || '操作失败'}));
  return true;
});
