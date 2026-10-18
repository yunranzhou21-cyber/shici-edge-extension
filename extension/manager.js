import { searchEntries, canonicalize, safeUrl } from './lib/core.js';
import { PROVIDERS, hostPattern, validateSettings } from './lib/providers.js';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
async function send(message){const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error||'扩展连接失败');return r.data;}
let state={vocabulary:[],history:[]}, tab='vocabulary', lookup;
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);$('notice').hidden=!text;}
function action(parent,label,callback,cls){const b=el('button',label,cls);b.onclick=async()=>{b.disabled=true;try{await callback();}catch(e){notice(e.message,true);}finally{b.disabled=false;}};parent.append(b);return b;}
async function confirmAction(message){$('confirm-message').textContent=message;const d=$('confirm');d.showModal();return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='confirm'),{once:true}));}
async function editMeaning(title,value){$('editor-title').textContent=title;$('editor-meaning').value=value;const d=$('editor');d.showModal();return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='save'?$('editor-meaning').value:null),{once:true}));}
function sourceNode(source){
  const area=el('div',null,'meta');
  const url=safeUrl(source?.url);
  if(url){const link=el('a',source.title||new URL(url).hostname);const u=new URL(url);if(source.type==='youtube'&&source.timestampSeconds!==undefined)u.searchParams.set('t',Math.floor(source.timestampSeconds)+'s');link.href=u.href;link.target='_blank';link.rel='noreferrer';area.append(link);if(source.timestampSeconds!==undefined)area.append(document.createTextNode(` · ${Math.floor(source.timestampSeconds)} 秒`));}
  else area.textContent='未记录来源';
  return area;
}
async function refresh(){state=await send({type:'STATE'});$('vocabulary-count').textContent=state.vocabulary.length;$('history-count').textContent=state.history.length;renderRecords();}
function renderRecords(){
  const list=$('record-list');list.replaceChildren();
  const entries=searchEntries(tab==='history'?state.history:state.vocabulary,$('search').value).sort((a,b)=>(b.updatedAt||b.createdAt).localeCompare(a.updatedAt||a.createdAt));
  if(!entries.length){const empty=el('div',null,'empty');empty.append(el('strong',$('search').value?'没有找到匹配记录':tab==='history'?'还没有查询历史':'把遇见的词，留在这里'));empty.append(el('p',$('search').value?'试试原词、基本词形或中文释义。':'在网页选中英文，按快捷键查词；也可以点击右上角手动查词。'));list.append(empty);return;}
  // Render in batches to keep large imported books responsive; all records remain searchable.
  let shown=0;
  function more(){list.querySelector('.load-more')?.remove();const batch=entries.slice(shown,shown+100);shown+=batch.length;
    for(const item of batch){
      const isHistory=tab==='history',saved=state.vocabulary.find(e=>e.canonicalForm===(item.canonicalForm||canonicalize(item.originalText)));
      const card=el('article',null,'record'),head=el('div',null,'record-head'),titles=el('div');
      const word=el('h2',isHistory?item.originalText:item.canonicalForm,'word');
      if(isHistory&&saved)word.append(el('span','已收藏','tag'));
      titles.append(word);if(!isHistory)titles.append(el('p',item.forms.join(' · '),'muted'));
      head.append(titles);const actions=el('div',null,'record-actions');head.append(actions);card.append(head);
      card.append(el('p',(isHistory?item.meaning:item.preferredMeaning)||(item.status==='error'?'词典读取失败':'词典未命中'),'meaning'));
      if(isHistory){
        if(item.context)card.append(el('p',item.context,'context'));card.append(sourceNode(item.source));
        action(actions,saved?'追加语境':'收藏',async()=>{const meaning=await editMeaning(saved?'追加本次释义与语境':'收藏前编辑释义',item.meaning||'');if(meaning===null)return;await send({type:'FAVORITE',item:{...item,meaning},append:!!saved});await refresh();});
        action(actions,'删除',async()=>{if(await confirmAction('删除这条查询历史？收藏不受影响。')){await send({type:'DELETE_HISTORY',id:item.id});await refresh();}},'danger');
      }else{
        const details=el('details');details.append(el('summary',`${item.occurrences.length} 条语境记录`));
        for(const occurrence of item.occurrences){const row=el('div',null,'occurrence');row.append(el('p',`${occurrence.originalText} · ${occurrence.meaning}`));if(occurrence.context)row.append(el('p',occurrence.context,'context'));row.append(sourceNode(occurrence.source));details.append(row);}card.append(details);
        action(actions,'编辑',async()=>{const meaning=await editMeaning('编辑首选释义（保留原语境）',item.preferredMeaning);if(meaning===null)return;await send({type:'EDIT_ENTRY',id:item.id,meaning});await refresh();});
        action(actions,'删除',async()=>{if(await confirmAction(`删除收藏“${item.canonicalForm}”及其语境？历史不受影响。`)){await send({type:'DELETE_ENTRY',id:item.id});await refresh();}},'danger');
      }
      card.append(el('p',new Date(item.updatedAt||item.createdAt).toLocaleString('zh-CN'),'meta'));list.append(card);
    }
    if(shown<entries.length)action(list,`继续显示（${shown} / ${entries.length}）`,more,'load-more');
  }more();
}
function showTab(value){tab=['vocabulary','history','settings'].includes(value)?value:'vocabulary';document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));$('page-title').textContent={vocabulary:'收藏',history:'查询历史',settings:'设置'}[tab];$('page-subtitle').textContent={vocabulary:'留下值得再看一次的词与语境。',history:'查询是一段经过，收藏由你决定。',settings:'让工具适合你的阅读方式。'}[tab];$('settings-view').hidden=tab!=='settings';$('records-view').hidden=tab==='settings';$('clear-history').hidden=tab!=='history';renderRecords();}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{location.hash=b.dataset.tab;});
function readHash(){if(location.hash==='#unsupported'){showTab('vocabulary');$('manual').hidden=false;notice('当前页面无法读取选区（如内置 PDF、浏览器内部页或受限阅读器）。请在这里手动输入英文。');}else showTab(location.hash.slice(1));}
window.addEventListener('hashchange',readHash);
$('search').oninput=renderRecords;
$('manual-toggle').onclick=()=>{$('manual').hidden=!$('manual').hidden;if(!$('manual').hidden)$('lookup-word').focus();};
$('lookup-form').onsubmit=async event=>{
  event.preventDefault();const b=event.submitter;b.disabled=true;$('lookup-result').textContent='查询中…';
  try{lookup=await send({type:'LOOKUP',text:$('lookup-word').value,context:$('lookup-context').value,source:{type:'manual'}});renderLookup();await refresh();}catch(e){$('lookup-result').textContent=e.message;}finally{b.disabled=false;}
};
function renderLookup(){
  const area=$('lookup-result');area.replaceChildren();area.append(el('h2',lookup.originalText));
  const status=el('p',lookup.saved?'已收藏':'未收藏');area.append(status);
  area.append(el('p',lookup.status==='success'?'本地词典 · 一般释义':lookup.error||'本地词典未命中，可手动填写释义收藏。','muted'));
  const meaning=el('textarea');meaning.value=lookup.meaning||'';meaning.maxLength=4000;meaning.setAttribute('aria-label','本次中文释义');area.append(meaning);
  const actions=el('div',null,'inline');area.append(actions);
  const save=action(actions,lookup.saved?'追加本次原句 / 释义':'收藏',async()=>{lookup.saved=await send({type:'FAVORITE',item:{...lookup,meaning:meaning.value,context:$('lookup-context').value},append:!!lookup.saved});status.textContent='已收藏';save.textContent='追加本次原句 / 释义';await refresh();},'primary');
  if(lookup.saved){const old=el('details');old.append(el('summary','查看已有记录'));old.append(el('p',lookup.saved.preferredMeaning));for(const o of lookup.saved.occurrences)old.append(el('p',`${o.originalText} · ${o.meaning}\n${o.context||''}`));area.append(old);}
  const output=el('p');output.setAttribute('role','status');area.append(output);
  action(actions,'解释原句',async()=>{output.textContent='解释中…';try{const result=await send({type:'EXPLAIN',text:lookup.originalText,context:$('lookup-context').value});if(result.needsSettings){output.textContent='尚未配置或启用 AI，本次未调用模型。';location.hash='settings';$('ai-form').scrollIntoView({behavior:'smooth'});}else output.textContent=(result.cached?'缓存结果 · ':'')+result.text;}catch(e){output.textContent=e.message;}});
}
$('clear-history').onclick=async()=>{try{if(await confirmAction('清空全部查询历史？收藏和原语境记录会保留。')){await send({type:'CLEAR_HISTORY'});await refresh();}}catch(e){notice(e.message,true);}};
$('shortcuts').onclick=()=>send({type:'OPEN_SHORTCUTS'}).catch(e=>notice(e.message,true));
async function loadWidgetSettings(){const value=await send({type:'GET_UI_PREFERENCES'});$('widget-visible').checked=value.visible;$('widget-size').value=value.size;const opacity=$('widget-opacity');const custom=opacity.querySelector('[data-custom]');custom?.remove();if(![...opacity.options].some(o=>Number(o.value)===value.opacity)){const option=el('option',Math.round(value.opacity*100)+'%');option.value=value.opacity;option.dataset.custom='true';opacity.append(option);}opacity.value=value.opacity;}
$('widget-form').onsubmit=async event=>{event.preventDefault();try{await send({type:'SET_UI_PREFERENCES',patch:{visible:$('widget-visible').checked,size:Number($('widget-size').value),opacity:Number($('widget-opacity').value)}});$('widget-feedback').textContent='已保存，已打开的网页也会更新。';}catch(e){$('widget-feedback').textContent=e.message;}};
$('widget-reset-position').onclick=async()=>{try{await send({type:'SET_UI_PREFERENCES',patch:{x:1,y:0.8}});$('widget-feedback').textContent='图标已重置到右侧。';}catch(e){$('widget-feedback').textContent=e.message;}};
$('provider').onchange=()=>{$('base-url').value=PROVIDERS[$('provider').value].baseUrl;$('model').value='';$('api-key').value='';};
async function loadSettings(){const data=await send({type:'GET_SETTINGS'});const ai=data.ai||{provider:'gemini',baseUrl:PROVIDERS.gemini.baseUrl,model:'',enabled:false};$('provider').value=ai.provider;$('base-url').value=ai.baseUrl;$('model').value=ai.model;$('ai-enabled').checked=ai.enabled;$('key-status').textContent=data.hasKey?'（已保存，不回填）':'（未保存）';}
$('ai-form').onsubmit=async event=>{
  event.preventDefault();const feedback=$('ai-feedback');
  try{
    const settings=validateSettings({enabled:$('ai-enabled').checked,provider:$('provider').value,baseUrl:$('base-url').value,model:$('model').value});
    // Called directly from a user gesture, before any other awaited operation.
    const allowed=await chrome.permissions.request({origins:[hostPattern(settings.baseUrl)]});
    if(!allowed)throw new Error('未授予 API 站点访问权限，配置未保存');
    await send({type:'SAVE_SETTINGS',settings,key:$('api-key').value});$('api-key').value='';feedback.textContent='已保存。尚未测试连接，保存本身不会调用 API。';await loadSettings();
  }catch(e){feedback.textContent=e.message;}
};
$('test-connection').onclick=async()=>{
  if(!await confirmAction('将使用已保存配置发送一次真实连接测试，可能消耗服务商额度。继续？'))return;
  const b=$('test-connection');b.disabled=true;$('ai-feedback').textContent='正在请求服务…';
  try{const r=await send({type:'TEST_CONNECTION'});$('ai-feedback').textContent=r.needsSettings?'请先保存配置和密钥。':`服务返回可用文本，连接成功：\n${r.text}`;}catch(e){$('ai-feedback').textContent=e.message;}finally{b.disabled=false;}
};
$('delete-key').onclick=async()=>{try{await send({type:'DELETE_KEY'});$('api-key').value='';await loadSettings();$('ai-feedback').textContent='密钥已删除。';}catch(e){notice(e.message,true);}};
$('export').onclick=async()=>{try{const backup=await send({type:'EXPORT'});const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download=`拾词备份-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);notice('已生成备份文件，不包含 API Key。');}catch(e){notice(e.message,true);}};
$('import').onchange=async()=>{const file=$('import').files[0];if(!file)return;try{const backup=JSON.parse(await file.text());const r=await send({type:'IMPORT',backup});await refresh();notice(`导入完成：处理 ${r.vocabulary} 条收藏、${r.history} 条历史；重复记录已合并。`);}catch(e){notice(`导入失败：${e.message}。原有数据未修改。`,true);}finally{$('import').value='';}};
chrome.storage.onChanged.addListener(changes=>{if(changes.ai||changes.apiKey)loadSettings().catch(()=>{});if(changes.uiPreferences)loadWidgetSettings().catch(()=>{});});
async function refreshShortcut(){const commands=await chrome.commands.getAll();const shortcut=commands.find(c=>c.name==='lookup-selection')?.shortcut;$('shortcut').textContent=shortcut||'未绑定：请设置快捷键';return shortcut;}
window.addEventListener('focus',()=>Promise.all([refresh(),refreshShortcut(),loadWidgetSettings()]).catch(e=>notice(e.message,true)));
try{
  await Promise.all([refresh(),loadSettings(),loadWidgetSettings()]);
  const metadata=await fetch('data/metadata.json').then(r=>r.json());$('dictionary-info').textContent=`ECDICT 常用词子集 · ${metadata.entries.toLocaleString('zh-CN')} 词条 · 完全离线，无调用费。`;
  const shortcut=await refreshShortcut();
  if(!shortcut)notice('查词快捷键未绑定或发生冲突，请到设置修改。');
  readHash();
}catch(e){notice(e.message,true);}
