import { queryText } from './core.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};

export function attachAutocomplete(input,list,{send,enabled=()=>true}) {
  let timer,version=0,items=[],selected=-1,composing=false;
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');
  list.setAttribute('role','listbox');list.setAttribute('aria-label','单词补全建议');
  function close(){clearTimeout(timer);version++;items=[];selected=-1;list.replaceChildren();list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  function choose(index){const item=items[index];if(!item)return;input.value=item.word;close();input.dispatchEvent(new Event('input',{bubbles:true}));close();input.focus();}
  function highlight(index){selected=index;[...list.children].forEach((option,i)=>option.setAttribute('aria-selected',String(i===selected)));input.setAttribute('aria-activedescendant',list.children[selected].id);list.children[selected].scrollIntoView({block:'nearest'});}
  function update(){
    close();if(composing||!enabled())return;
    const text=input.value;if(!/^[a-z][a-z '-]{0,79}$/i.test(text.trim()))return;
    const current=version;
    timer=setTimeout(async()=>{try{
      const result=await send({type:'SUGGEST',text});
      if(current!==version||input.value!==text||!enabled()||document.activeElement!==input||composing)return;
      items=result;if(!items.length)return;
      list.replaceChildren(...items.map((item,index)=>{const option=node('li');option.id=list.id+'-'+index;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.append(node('strong',item.word),node('small',item.meaning));option.onpointerdown=e=>e.preventDefault();option.onclick=()=>choose(index);return option;}));
      list.hidden=false;input.setAttribute('aria-expanded','true');
    }catch{if(current===version)close();}},100);
  }
  input.addEventListener('input',update);input.addEventListener('focus',update);input.addEventListener('blur',close);
  input.addEventListener('compositionstart',()=>{composing=true;close();});input.addEventListener('compositionend',()=>{composing=false;update();});
  input.addEventListener('keydown',event=>{
    if(composing||event.isComposing||list.hidden)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();highlight(selected<0?(event.key==='ArrowDown'?0:items.length-1):(selected+(event.key==='ArrowDown'?1:items.length-1))%items.length);}
    else if(event.key==='Enter'&&selected>=0){event.preventDefault();choose(selected);}
    else if(event.key==='Tab'&&selected>=0)choose(selected);
    else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
  });
  input.form?.addEventListener('submit',close);
  return {close};
}

// A reverse translation is saved as an English entry with its Chinese original as meaning.
export function renderReverseResult(area,result,{send,onSaved=async()=>{},openSettings}) {
  area.replaceChildren();
  area.append(node('h2',result.originalText,'word'),node('p','中文 → 英文'+(result.status==='success'?' · 微软翻译'+(result.cached?' · 缓存':''):''),'hint'));
  if(result.warning||result.error)area.append(node('p',result.error||result.warning,'lookup-warning'));
  const label=node('label','英文译文（可修改）'),english=node('textarea');english.value=result.meaning||'';english.maxLength=4000;english.rows=3;english.setAttribute('aria-label','本次英文译文');label.append(english);area.append(label);
  area.append(node('p','收藏时，以英文译文为词条，中文原文为释义。英文词条最多 200 字符。','hint'));
  const status=node('p',null,'hint'),old=node('details'),oldContent=node('div');old.append(node('summary','查看已有英文记录'),oldContent);old.hidden=true;area.append(status,old);
  const save=node('button','收藏英文译文','primary wide'),output=node('p',null,'hint');output.setAttribute('role','status');area.append(save,output);
  let version=0,busy=false;
  function showSaved(saved){status.textContent=saved?'英文词条已收藏；可追加本次中文释义':'英文词条未收藏';save.textContent=saved?'追加本次中文释义':'收藏英文译文';old.hidden=!saved;oldContent.replaceChildren();if(saved)oldContent.append(node('p',saved.canonicalForm,'word'),node('p',saved.preferredMeaning,'meaning'));}
  async function check(){
    const current=++version;save.disabled=true;old.hidden=true;
    let text;try{text=queryText(english.value);}catch{status.textContent='请填写 200 字符以内的英文词语或短句后收藏。';return;}
    try{const saved=await send({type:'FAVORITE_STATUS',text});if(current!==version||!english.isConnected)return;showSaved(saved);save.disabled=busy;}catch(e){if(current===version)status.textContent=e.message;}
  }
  english.oninput=()=>{output.textContent='';check();};
  save.onclick=async()=>{
    if(busy)return;
    busy=true;save.disabled=true;english.disabled=true;
    try{
      const originalText=queryText(english.value),existing=await send({type:'FAVORITE_STATUS',text:originalText});
      const saved=await send({type:'FAVORITE',item:{originalText,meaning:result.originalText,context:result.context,source:result.source},append:!!existing});
      showSaved(saved);output.textContent='已收藏英文译文'+(existing?'，保留原有首选释义。':'。');await onSaved(saved);
    }catch(e){output.textContent=e.message;}
    finally{busy=false;english.disabled=false;check();}
  };
  if(result.needsMicrosoftSettings){const setup=node('button','打开微软联网设置 ↗','wide');setup.onclick=async()=>{try{await openSettings();}catch(e){output.textContent=e.message;}};area.append(setup);}
  check();
}
