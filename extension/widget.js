import { safeUrl } from './lib/core.js';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
let data,offset=0,revision=0,queryTimer;
const send=async message=>{const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error||'扩展连接失败，请刷新网页');return r.data;};
function feedback(text,error=false){$('feedback').textContent=text;$('feedback').hidden=!text;$('feedback').classList.toggle('error',error);}
function close(){window.parent.postMessage({type:'SHICI_WIDGET_CLOSE'},'*');}
function act(id,callback){$(id).onclick=async()=>{const b=$(id);b.disabled=true;try{await callback();}catch(e){feedback(e.message,true);}finally{b.disabled=false;}};}
function showSettings(value){$('favorites-view').hidden=value;$('settings-view').hidden=!value;for(const [id,selected] of [['favorites-tab',!value],['settings-tab',value]]){$(id).classList.toggle('selected',selected);$(id).setAttribute('aria-selected',String(selected));}}
function renderSettings(){if(!data)return;$('shortcut').textContent=data.shortcut||'未绑定';$('count').textContent=data.total;$('size').value=data.preferences.size;$('opacity').value=Math.round(data.preferences.opacity*100);$('opacity-value').textContent=$('opacity').value+'%';$('ai-enabled').checked=data.aiEnabled;$('ai-status').textContent=data.aiConfigured?'只有主动点击“解释原句”才会调用；打开开关不会发送请求。':'尚未配置 API，开启时会引导至完整设置。';}
function renderEntry(entry){
  const card=el('article',null,'favorite');card.append(el('div',entry.canonicalForm,'word'),el('p',entry.preferredMeaning,'meaning'),el('p',entry.forms.join(' · '),'forms'));
  const detail=el('details');detail.append(el('summary',`${entry.occurrences.length} 条语境`));
  for(const o of entry.occurrences){const context=el('p',`${o.originalText} · ${o.meaning}\n${o.context||'未记录原句'}`,'context');detail.append(context);const url=safeUrl(o.source?.url);if(url){const a=el('a',o.source.title||'查看来源');const u=new URL(url);if(o.source.type==='youtube'&&Number.isFinite(o.source.timestampSeconds))u.searchParams.set('t',Math.floor(o.source.timestampSeconds)+'s');a.href=u.href;a.target='_blank';a.rel='noreferrer';detail.append(a);}}
  card.append(detail);return card;
}
async function load(more=false){
  const current=++revision;
  const result=await send({type:'WIDGET_DATA',query:$('search').value,offset:more?offset:0});
  if(current!==revision)return;
  data=result;renderSettings();if(!more){offset=0;$('favorites').replaceChildren();}
  result.entries.forEach(e=>$('favorites').append(renderEntry(e)));offset+=result.entries.length;
  if(!result.matched)$('favorites').append(el('p',result.total?'没有匹配的收藏':'还没有收藏。选中英文并按快捷键，查词后可手动收藏。','empty'));
  $('more').hidden=offset>=result.matched;
}
async function save(patch){data.preferences=await send({type:'SET_UI_PREFERENCES',patch});renderSettings();feedback('已保存');}
act('close',close);act('favorites-tab',async()=>{showSettings(false);await load();});act('settings-tab',async()=>{showSettings(true);await load();});
act('more',()=>load(true));act('open-book',()=>send({type:'OPEN_VOCABULARY'}));act('open-settings',()=>send({type:'OPEN_SETTINGS'}));act('shortcuts',()=>send({type:'OPEN_SHORTCUTS'}));
act('reset-position',()=>save({x:1,y:0.8}));
act('hide-widget',async()=>{await save({visible:false});});
$('search').oninput=()=>{clearTimeout(queryTimer);queryTimer=setTimeout(()=>load().catch(e=>feedback(e.message,true)),120);};
$('size').onchange=()=>save({size:Number($('size').value)}).catch(e=>feedback(e.message,true));
$('opacity').oninput=()=>{$('opacity-value').textContent=$('opacity').value+'%';};
$('opacity').onchange=()=>save({opacity:Number($('opacity').value)/100}).catch(e=>feedback(e.message,true));
$('ai-enabled').onchange=async()=>{try{const result=await send({type:'SET_AI_ENABLED',enabled:$('ai-enabled').checked});if(result.needsSettings){$('ai-enabled').checked=false;feedback('请先在完整设置中配置 API。本次没有模型调用。');await send({type:'OPEN_SETTINGS'});}else{data.aiEnabled=result.enabled;feedback('已保存，尚未调用 AI。');}}catch(e){renderSettings();feedback(e.message,true);}};
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
window.addEventListener('focus',()=>load().catch(e=>feedback(e.message,true)));
chrome.storage.onChanged.addListener(changes=>{if(changes.ai||changes.uiPreferences)load().catch(e=>feedback(e.message,true));});
load().catch(e=>feedback(e.message,true));
