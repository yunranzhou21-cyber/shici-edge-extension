import { safeUrl, translationText } from './lib/core.js';
import { attachAutocomplete, renderReverseResult } from './lib/manual.js';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
let data,offset=0,revision=0,queryTimer;
let lookupRevision=0,lookupItem=null,lookupBusy=false,savingFavorite=false;
const send=async message=>{const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error||'扩展连接失败，请刷新网页');return r.data;};
function feedback(text,error=false){$('feedback').textContent=text;$('feedback').hidden=!text;$('feedback').classList.toggle('error',error);}
function close(){window.parent.postMessage({type:'SHICI_WIDGET_CLOSE'},'*');}
function act(id,callback){$(id).onclick=async()=>{const b=$(id);b.disabled=true;try{await callback();}catch(e){feedback(e.message,true);}finally{b.disabled=false;}};}
function showView(view){for(const name of ['lookup','favorites','settings']){const selected=name===view;$(name+'-view').hidden=!selected;$(name+'-tab').classList.toggle('selected',selected);$(name+'-tab').setAttribute('aria-selected',String(selected));}feedback('');}
function lookupMessage(text,error=false){$('lookup-message').textContent=text;$('lookup-message').classList.toggle('error-text',error);}
function favoriteControls(){const saved=lookupItem?.saved;$('lookup-status').textContent=saved?'已收藏':'未收藏';$('lookup-favorite').textContent=saved?'追加本次原句 / 释义':'收藏';$('lookup-favorite').disabled=lookupBusy||savingFavorite||!lookupItem||!$('lookup-meaning').value.trim();$('lookup-saved').hidden=!saved;$('lookup-existing').replaceChildren(...(saved?[renderEntry(saved)]:[]));}
function invalidateLookup(){if(savingFavorite)return;++lookupRevision;lookupBusy=false;lookupItem=null;$('lookup-submit').disabled=false;$('lookup-result').hidden=true;$('lookup-reverse').hidden=true;$('lookup-reverse').replaceChildren();lookupMessage($('lookup-direction').value==='zh-en'?'中文译英使用微软联网翻译，需先在设置中启用。':'本地词典优先，查询后可编辑释义并手动收藏。');}
async function lookup(online=false){
  if(lookupBusy||savingFavorite)return;
  const direction=$('lookup-direction').value,reverse=direction==='zh-en';
  let text;try{text=translationText($('lookup-text').value,direction);}catch(e){lookupMessage(e.message,true);return;}
  const current=++lookupRevision,context=reverse?'':$('lookup-context').value;
  lookupBusy=true;lookupItem=null;$('lookup-submit').disabled=true;$('lookup-result').hidden=true;$('lookup-reverse').hidden=true;$('lookup-reverse').replaceChildren();lookupMessage(online||reverse?'正在向微软查询…':'正在查词…');
  if(!reverse)send({type:'FAVORITE_STATUS',text}).then(saved=>{if(current===lookupRevision&&lookupBusy)lookupMessage((online?'正在向微软查询…':'正在查词…')+(saved?' · 已收藏':' · 未收藏'));}).catch(()=>{});
  try{
    const result=await send({type:'LOOKUP',text,context,source:{type:'manual'},online,direction});
    if(current!==lookupRevision)return;
    if(reverse){$('lookup-reverse').hidden=false;renderReverseResult($('lookup-reverse'),result,{send,onSaved:()=>load(),openSettings:()=>send({type:'OPEN_MICROSOFT_SETTINGS'})});lookupMessage(result.status==='success'?'翻译完成，按需收藏英文译文。':result.error||result.warning,result.status!=='success');return;}
    lookupItem=result;$('lookup-word').textContent=result.originalText;
    $('lookup-meta').textContent=[result.canonicalForm!==result.originalText?'基本词形：'+result.canonicalForm:'',result.phonetic,result.provider==='microsoft'?'微软翻译'+(result.cached?' · 缓存':''):result.meaning?'本地词典':''].filter(Boolean).join(' · ');
    $('lookup-meaning').value=result.meaning||'';$('lookup-ai').hidden=true;$('lookup-ai').textContent='';$('lookup-saved').open=false;
    $('lookup-configure').hidden=!result.needsMicrosoftSettings;
    $('lookup-result').hidden=false;lookupMessage(result.error||result.warning||(result.meaning?'可编辑释义后收藏；查询本身只加入历史。':'本地词典未找到。可手动填写释义后收藏，或使用微软联网查词。'),!!(result.error||result.warning));
  }catch(e){if(current===lookupRevision)lookupMessage(e.message,true);}
  finally{if(current===lookupRevision){lookupBusy=false;$('lookup-submit').disabled=false;favoriteControls();}}
}
async function saveLookupFavorite(){
  if(!lookupItem||lookupBusy||savingFavorite)return;
  const current=lookupRevision,item=lookupItem;
  savingFavorite=true;$('lookup-direction').disabled=true;$('lookup-text').disabled=true;$('lookup-context').disabled=true;$('lookup-meaning').disabled=true;favoriteControls();
  try{
    const saved=await send({type:'FAVORITE',item:{...item,meaning:$('lookup-meaning').value,context:$('lookup-context').value,source:{type:'manual'}},append:!!item.saved});
    if(current!==lookupRevision)return;
    item.saved=saved;favoriteControls();lookupMessage('已保存到收藏。'+(saved.occurrences.length>1?'原有首选释义保持不变。':''));await load();
  }catch(e){if(current===lookupRevision)lookupMessage(e.message,true);}
  finally{savingFavorite=false;$('lookup-direction').disabled=false;$('lookup-text').disabled=false;$('lookup-context').disabled=false;$('lookup-meaning').disabled=false;favoriteControls();}
}
function renderSettings(){if(!data)return;$('shortcut').textContent=data.shortcut||'未绑定';$('count').textContent=data.total;$('size').value=data.preferences.size;$('opacity').value=Math.round(data.preferences.opacity*100);$('opacity-value').textContent=$('opacity').value+'%';$('ai-enabled').checked=data.aiEnabled;$('ai-status').textContent=data.aiConfigured?'只有主动点击“解释原句”才会调用；打开开关不会发送请求。':'尚未配置 API，开启时会引导至完整设置。';}
function renderEntry(entry){
  const card=el('article',null,'favorite');card.append(el('div',entry.canonicalForm,'word'),el('p',entry.preferredMeaning,'meaning'),el('p',entry.forms.join(' · '),'forms'));
  const detail=el('details');detail.append(el('summary',`${entry.occurrences.length} 条语境`));
  for(const o of entry.occurrences){const context=el('p',`${o.originalText} · ${o.meaning}\n${o.context||'未记录原句'}`,'context');detail.append(context);const url=safeUrl(o.source?.url);if(o.source?.type==='pdf'){const b=el('button',`${o.source.title||'PDF'}${o.source.pageNumber?' · 第 '+o.source.pageNumber+' 页':''} ↗`);b.onclick=()=>send({type:'OPEN_SOURCE',source:o.source}).catch(e=>feedback(e.message,true));detail.append(b);}else if(url){const a=el('a',o.source.title||'查看来源');const u=new URL(url);if(o.source.type==='youtube'&&Number.isFinite(o.source.timestampSeconds))u.searchParams.set('t',Math.floor(o.source.timestampSeconds)+'s');a.href=u.href;a.target='_blank';a.rel='noreferrer';detail.append(a);}}
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
act('close',close);act('lookup-tab',async()=>{showView('lookup');const item=lookupItem;if(item){const saved=await send({type:'FAVORITE_STATUS',text:item.originalText});if(item===lookupItem){item.saved=saved;favoriteControls();}}});act('favorites-tab',async()=>{showView('favorites');await load();});act('settings-tab',async()=>{showView('settings');await load();});
// Typing never queries. Editing the word invalidates any older asynchronous result.
$('lookup-text').oninput=invalidateLookup;
const autocomplete=attachAutocomplete($('lookup-text'),$('lookup-suggestions'),{send,enabled:()=>$('lookup-direction').value==='en-zh'});
$('lookup-direction').onchange=()=>{autocomplete.close();invalidateLookup();const reverse=$('lookup-direction').value==='zh-en';$('lookup-input-label').textContent=reverse?'要翻译的中文':'英文单词或短语';$('lookup-text').placeholder=reverse?'输入中文，按 Enter 翻译':'输入英文，按 Enter 查词';$('lookup-submit').textContent=reverse?'翻译':'查词';$('lookup-form').querySelector('.optional-context').hidden=reverse;};
$('lookup-meaning').oninput=favoriteControls;
$('lookup-form').onsubmit=e=>{e.preventDefault();lookup();};
$('lookup-favorite').onclick=saveLookupFavorite;
act('lookup-online',()=>lookup(true));
act('lookup-configure',()=>send({type:'OPEN_MICROSOFT_SETTINGS'}));
act('lookup-reader',()=>send({type:'OPEN_READER'}));
act('lookup-explain',async()=>{
  if(!lookupItem||lookupBusy||savingFavorite)return;
  const current=lookupRevision,item=lookupItem,context=$('lookup-context').value;
  const result=await send({type:'EXPLAIN',text:item.originalText,context});
  if(current!==lookupRevision||context!==$('lookup-context').value)return;
  if(result.needsSettings){lookupMessage('请先在完整设置中配置并启用 AI。本次没有模型调用。');await send({type:'OPEN_SETTINGS'});}
  else{$('lookup-ai').textContent=result.text;$('lookup-ai').hidden=false;}
});
act('more',()=>load(true));act('open-book',()=>send({type:'OPEN_VOCABULARY'}));act('open-settings',()=>send({type:'OPEN_SETTINGS'}));act('shortcuts',()=>send({type:'OPEN_SHORTCUTS'}));
act('open-microsoft',()=>send({type:'OPEN_MICROSOFT_SETTINGS'}));
act('open-reader',()=>send({type:'OPEN_READER'}));
act('reset-position',()=>save({x:1,y:0.8}));
act('hide-widget',async()=>{await save({visible:false});});
$('search').oninput=()=>{clearTimeout(queryTimer);queryTimer=setTimeout(()=>load().catch(e=>feedback(e.message,true)),120);};
$('size').onchange=()=>save({size:Number($('size').value)}).catch(e=>feedback(e.message,true));
$('opacity').oninput=()=>{$('opacity-value').textContent=$('opacity').value+'%';};
$('opacity').onchange=()=>save({opacity:Number($('opacity').value)/100}).catch(e=>feedback(e.message,true));
$('ai-enabled').onchange=async()=>{try{const result=await send({type:'SET_AI_ENABLED',enabled:$('ai-enabled').checked});if(result.needsSettings){$('ai-enabled').checked=false;feedback('请先在完整设置中配置 API。本次没有模型调用。');await send({type:'OPEN_SETTINGS'});}else{data.aiEnabled=result.enabled;feedback('已保存，尚未调用 AI。');}}catch(e){renderSettings();feedback(e.message,true);}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing)close();});
window.addEventListener('focus',()=>load().catch(e=>feedback(e.message,true)));
chrome.storage.onChanged.addListener(changes=>{if(changes.ai||changes.uiPreferences)load().catch(e=>feedback(e.message,true));});
load().catch(e=>feedback(e.message,true));
