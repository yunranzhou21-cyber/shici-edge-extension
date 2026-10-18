import { canonicalize, queryText, limited, favorite, cleanSource, uid, now, validateBackup, mergeBackup, makeBackup, searchEntries } from './lib/core.js';
import { preferences, preferencePatch } from './lib/preferences.js';
import { readState, mutateState } from './lib/storage.js';
import { lookupLocal } from './lib/dictionary.js';
import { validateSettings, hostPattern, callProvider } from './lib/providers.js';

chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
const managerUrl = chrome.runtime.getURL('manager.html');
const widgetUrl = chrome.runtime.getURL('widget.html');
const cache = new Map();
async function openManager(hash='') { await chrome.tabs.create({url:managerUrl + hash}); }
chrome.action.onClicked.addListener(()=>openManager());
chrome.commands.onCommand.addListener(async command => {
  if (command !== 'lookup-selection') return;
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    await chrome.tabs.sendMessage(tab.id,{type:'TRIGGER_LOOKUP'});
  } catch { await openManager('#unsupported'); }
});
const privileged = new Set(['STATE','EXPORT','IMPORT','DELETE_ENTRY','EDIT_ENTRY','DELETE_HISTORY','CLEAR_HISTORY','GET_SETTINGS','SAVE_SETTINGS','DELETE_KEY','TEST_CONNECTION']);
const widgetOnly = new Set(['WIDGET_DATA','SET_UI_PREFERENCES','SET_AI_ENABLED']);
async function broadcastPreferences(value) {
  const tabs=await chrome.tabs.query({});
  await Promise.allSettled(tabs.filter(t=>t.id).map(t=>chrome.tabs.sendMessage(t.id,{type:'UI_PREFERENCES_CHANGED',preferences:value})));
}
function sourceFor(message,sender) {
  if (!sender.tab) return cleanSource(message.source);
  const url = sender.tab.url || sender.url;
  let type = 'web';
  try { if (/(^|\.)youtube\.com$/.test(new URL(url).hostname)) type='youtube'; } catch {}
  return cleanSource({type,url,title:sender.tab.title,timestampSeconds:type==='youtube'?message.source?.timestampSeconds:undefined});
}
async function settingsAndKey() { return chrome.storage.local.get(['ai','apiKey']); }
async function handle(message,sender) {
  const trusted = sender.url?.split('#')[0] === managerUrl && !sender.tab?.url?.startsWith('http');
  const widget = sender.url?.split('#')[0] === widgetUrl;
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== 'string' || (privileged.has(message.type) && !trusted)) throw new Error('请求来源不受支持');
  if(widgetOnly.has(message.type) && !trusted && !widget)throw new Error('请求来源不受支持');
  switch (message.type) {
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
      const originalText = queryText(message.text);
      const canonicalForm = canonicalize(originalText);
      const context = limited(message.context);
      const source = sourceFor(message,sender);
      const state = await readState();
      const saved = state.vocabulary.find(e=>e.canonicalForm===canonicalForm) || null;
      let result;
      try { result = await lookupLocal(originalText); }
      catch { result = {canonicalForm,status:'error',error:'读取本地词典失败，请检查扩展文件是否完整'}; }
      const history = {id:uid(),originalText,canonicalForm,meaning:result.meaning||'',context,source,status:result.status,createdAt:now()};
      await mutateState(s=>s.history.unshift(history));
      return {...history,phonetic:result.phonetic,saved,error:result.error};
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
    default: throw new Error('不支持的操作');
  }
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  handle(message,sender).then(data=>reply({ok:true,data})).catch(error=>reply({ok:false,error:error.message || '操作失败'}));
  return true;
});
