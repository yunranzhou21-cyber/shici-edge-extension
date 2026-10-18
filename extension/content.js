(() => {
  if (globalThis.__shiciInstalled) return;
  globalThis.__shiciInstalled = true;
  let host, root, active, previousFocus, generation=0;
  const send = async message => {
    const result=await chrome.runtime.sendMessage(message);
    if(!result?.ok)throw new Error(result?.error||'扩展连接已断开，请刷新页面');
    return result.data;
  };
  function el(tag,text,cls) {const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;}
  function close() {generation++;host?.remove();host=null;root=null;previousFocus?.focus?.({preventScroll:true});}
  function sensitive(node) {
    const element=node?.nodeType===1?node:node?.parentElement;
    return !!element?.closest('input,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[data-sensitive],[autocomplete="one-time-code"]');
  }
  function shell(rect) {
    host?.remove();previousFocus=document.activeElement;
    host=el('div');host.id='shici-lookup-host';
    host.style.cssText='all:initial;position:fixed;z-index:2147483647;';
    root=host.attachShadow({mode:'open'});
    const style=el('style');style.textContent=`
      :host{color-scheme:light}*{box-sizing:border-box}section{width:min(370px,calc(100vw - 24px));max-height: min(620px,calc(100vh - 24px));overflow:auto;background:#fff;color:#21352f;border:1px solid #d6e2dc;border-radius:16px;box-shadow:0 12px 48px #12362933;padding:20px;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif}header{display:flex;align-items:center;justify-content:space-between}h2{font:600 23px/1.3 system-ui;margin:12px 0;overflow-wrap:anywhere}p{margin:10px 0;white-space:pre-wrap;overflow-wrap:anywhere}small{color:#65796d}button{font:inherit;border:1px solid #d5dfda;background:#f7f9f6;color:#254c3e;border-radius:8px;padding:7px 11px;cursor:pointer}button:hover{background:#e9f1e9}button:focus-visible,textarea:focus-visible{outline:2px solid #287755;outline-offset:2px}button:disabled{opacity:.55;cursor:wait}.primary{background:#28674f;color:white;border-color:#28674f}.row{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}textarea{width:100%;min-height:72px;resize:vertical;border:1px solid #ccd9d0;border-radius:8px;padding:9px;font:inherit;color:#21352f;background:#fff}.error{color:#a23d30}.status{color:#2b7352}details{margin:10px 0}summary{cursor:pointer}label{display:block;margin-top:10px}a{color:#276d51}`;
    root.append(style);
    const card=el('section');card.setAttribute('role','dialog');card.setAttribute('aria-label','拾词查词');
    const header=el('header');header.append(el('small','拾词 · 主动查词'));
    const dismiss=el('button','×');dismiss.setAttribute('aria-label','关闭查词卡片');dismiss.onclick=close;header.append(dismiss);card.append(header);root.append(card);document.documentElement.append(host);
    const left=Math.max(12,Math.min(rect?.left||window.innerWidth-400,window.innerWidth-382));
    const top=Math.max(12,Math.min((rect?.bottom||20)+8,window.innerHeight-330));
    host.style.left=left+'px';host.style.top=top+'px';
    // Clamp again after content grows using the actual rendered size.
    new ResizeObserver(()=>{if(host?.isConnected){const box=host.getBoundingClientRect();host.style.top=Math.max(12,Math.min(parseFloat(host.style.top),innerHeight-box.height-12))+'px';}}).observe(card);
    dismiss.focus({preventScroll:true});return card;
  }
  function button(text,callback,parent,primary=false) {
    const node=el('button',text,primary?'primary':'');
    node.onclick=async()=>{node.disabled=true;try{await callback();}catch(e){const p=el('p',e.message,'error');parent.append(p);}finally{node.disabled=false;}};
    parent.append(node);return node;
  }
  function savedDetails(card,saved) {
    const details=el('details');details.append(el('summary',`查看已有记录（${saved.occurrences.length} 条）`));
    details.append(el('p',saved.preferredMeaning));
    for(const occurrence of saved.occurrences){details.append(el('p',`${occurrence.originalText} · ${occurrence.meaning}\n${occurrence.context||'未记录原句'}`));}
    card.append(details);
  }
  function renderResult(card,result) {
    active=result;
    card.append(el('h2',result.originalText));
    if(result.phonetic)card.append(el('small',`/${result.phonetic}/ · ${result.canonicalForm}`));
    const status=el('p',result.saved?'已收藏':'未收藏','status');card.append(status);
    const message=result.status==='success'?'本地词典 · 一般释义':result.error||'本地词典未命中。可填写中文释义后收藏，或在设置启用 AI 后主动解释。';
    card.append(el('small',message));
    const label=el('label','中文释义（收藏前可修改）');const meaning=el('textarea');meaning.value=result.meaning||'';meaning.maxLength=4000;label.append(meaning);card.append(label);
    const contextLabel=el('label','局部原句（可补充）');const context=el('textarea');context.value=result.context||'';context.maxLength=1000;contextLabel.append(context);card.append(contextLabel);
    const actions=el('div',null,'row');card.append(actions);
    const save=button(result.saved?'追加本次原句 / 释义':'收藏',async()=>{
      const saved=await send({type:'FAVORITE',item:{...result,meaning:meaning.value,context:context.value},append:!!active.saved});
      active.saved=saved;status.textContent='已收藏';save.textContent='追加本次原句 / 释义';save.disabled=false;
      card.querySelector('details')?.remove();savedDetails(card,saved);
    },actions,true);
    if(result.saved)savedDetails(card,result.saved);
    const output=el('p');output.setAttribute('aria-live','polite');card.append(output);
    button('解释原句',async()=>{
      output.textContent='解释中…';
      const explanation=await send({type:'EXPLAIN',text:result.originalText,context:context.value});
      if(explanation.needsSettings){output.textContent='AI 默认关闭或尚未配置，已打开设置；本次未调用模型。';await send({type:'OPEN_SETTINGS'});}
      else output.textContent=(explanation.cached?'缓存结果 · ':'')+explanation.text;
    },actions);
    card.append(el('small',result.source?.type==='youtube'?'视频已暂停，请手动继续播放。':'本机记录 · 不自动收藏'));
  }
  async function trigger() {
    const selection=window.getSelection();
    const blocked=sensitive(document.activeElement)||sensitive(selection?.anchorNode)||sensitive(selection?.focusNode);
    const text=blocked?'':selection?.toString().trim();
    const rect=selection?.rangeCount?selection.getRangeAt(0).getBoundingClientRect():null;
    // Read a bounded neighboring text node/block only at the explicit command.
    const anchor=selection?.anchorNode;
    const container=anchor?.nodeType===1?anchor:anchor?.parentElement;
    const block=container?.closest('p,li,blockquote,figcaption,h1,h2,h3') || container;
    let raw='';
    if(!blocked&&text&&block&&!['BODY','HTML'].includes(block.tagName)){
      const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,{acceptNode(node){
        return sensitive(node)||node.parentElement?.closest('script,style,noscript,template')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;
      }});
      while(walker.nextNode())raw+=walker.currentNode.textContent;
    }
    const index=raw.indexOf(text||'');
    const context=index>=0?raw.slice(Math.max(0,index-240),index+Math.min(text.length,200)+240).trim():'';
    const card=shell(rect);const current=++generation;
    if(!text){card.append(el('p',blocked?'此输入区域不取词。请在普通网页正文选中英文，或到单词本手动输入。':'请先选中英文单词或短语'));return;}
    if(text.length>200){card.append(el('p','请选择 200 字符以内的英文单词或短语'));return;}
    let timestampSeconds;
    if(/(^|\.)youtube\.com$/.test(location.hostname)) {
      const video=document.querySelector('video');if(video){timestampSeconds=video.currentTime;video.pause();}
    }
    const loading=el('p','查询中…');card.append(loading);
    const badge=el('p','正在检查收藏…');card.append(badge);
    send({type:'FAVORITE_STATUS',text}).then(saved=>{if(current===generation)badge.textContent=saved?'已收藏':'未收藏';}).catch(()=>{});
    try {
      const result=await send({type:'LOOKUP',text,context,source:{timestampSeconds}});
      if(current!==generation)return;
      loading.remove();badge.remove();renderResult(card,result);
    }catch(error){if(current===generation){loading.textContent=error.message;badge.remove();}}
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&host){event.preventDefault();close();}},true);
  chrome.runtime.onMessage.addListener(message=>{if(message.type==='TRIGGER_LOOKUP')trigger();});
})();
