(() => {
  if (globalThis.__shiciInstalled) return;
  globalThis.__shiciInstalled = true;
  let host, root, active, previousFocus, generation=0;
  let widgetHost, widgetRoot, bubble, frame, uiPreferences, dragging;
  const send = async message => {
    const result=await chrome.runtime.sendMessage(message);
    if(!result?.ok)throw new Error(result?.error||'扩展连接已断开，请刷新页面');
    return result.data;
  };
  function el(tag,text,cls) {const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;}
  function placeWidget() {
    if(!widgetHost||!uiPreferences)return;
    const size=uiPreferences.size, maxX=Math.max(0,innerWidth-size-24), maxY=Math.max(0,innerHeight-size-24);
    const left=12+uiPreferences.x*maxX, top=12+uiPreferences.y*maxY;
    widgetHost.style.setProperty('left',left+'px','important');widgetHost.style.setProperty('top',top+'px','important');
    bubble.style.width=bubble.style.height=size+'px';bubble.style.opacity=uiPreferences.opacity;
    if(frame){
      const width=Math.min(380,Math.max(0,innerWidth-24));let height=Math.min(560,Math.max(0,innerHeight-24));
      const above=Math.max(0,top-24),below=Math.max(0,innerHeight-top-size-24);
      let panelLeft=Math.max(12,Math.min(left+size-width,innerWidth-width-12)),panelTop;
      if(below>=height)panelTop=top+size+12;
      else if(above>=height)panelTop=top-height-12;
      else if(left>=width+24){panelLeft=left-width-12;panelTop=Math.max(12,Math.min(top,innerHeight-height-12));}
      else if(innerWidth-left-size>=width+24){panelLeft=left+size+12;panelTop=Math.max(12,Math.min(top,innerHeight-height-12));}
      else {height=Math.min(height,Math.max(above,below));panelTop=above>below?top-height-12:top+size+12;}
      frame.style.width=width+'px';frame.style.height=height+'px';
      frame.style.left=panelLeft+'px';frame.style.top=panelTop+'px';
    }
  }
  function collapseWidget(restoreFocus=false) {
    frame?.remove();frame=null;bubble?.setAttribute('aria-expanded','false');
    if(restoreFocus)bubble?.focus({preventScroll:true});
  }
  function expandWidget() {
    if(frame){collapseWidget();return;}
    if(host)close();
    frame=el('iframe');frame.title='拾词查词、收藏与设置';frame.src=chrome.runtime.getURL('widget.html');frame.referrerPolicy='no-referrer';
    widgetRoot.append(frame);bubble.setAttribute('aria-expanded','true');placeWidget();
  }
  function applyPreferences(value) {
    uiPreferences=value;
    if(window.top!==window)return;
    if(!value.visible){collapseWidget();widgetHost?.remove();widgetHost=null;return;}
    if(!widgetHost){
      widgetHost=el('div');widgetHost.id='shici-widget-host';
      widgetHost.style.cssText='all:initial!important;position:fixed!important;z-index:2147483646!important;display:block!important;';
      widgetRoot=widgetHost.attachShadow({mode:'open'});
      const style=el('style');style.textContent=`:host{color-scheme:dark}button{box-sizing:border-box;border:1px solid #7edfe99c;border-radius:50%;background:#131d38;cursor:grab;touch-action:none;user-select:none;box-shadow:0 5px 22px #08112666,0 0 15px #5eddd52e,0 0 6px #f16abc30;display:grid;place-items:center;padding:0;overflow:hidden}button:hover{filter:brightness(1.15)}button:active{cursor:grabbing}button:focus-visible{outline:3px solid #65e3ed;outline-offset:3px}.launcher-image{width:100%;height:100%;object-fit:cover;transform:scale(1.4);pointer-events:none;border-radius:inherit}iframe{position:fixed;border:1px solid #547394;border-radius:20px;background:#14203a;box-shadow:0 18px 60px #050b1d80,0 0 28px #4acfc31a;color-scheme:dark}`;
      bubble=el('button');bubble.type='button';bubble.title='拾词：点击展开，拖动调整位置';bubble.setAttribute('aria-label','展开拾词查词、收藏与设置');bubble.setAttribute('aria-expanded','false');
      const logo=el('img',null,'launcher-image');logo.src=chrome.runtime.getURL('assets/icon-128.png');logo.alt='';logo.draggable=false;bubble.append(logo);
      let suppressClick=false;
      bubble.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;
        const rect=widgetHost.getBoundingClientRect();dragging={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,moved:false};suppressClick=false;
        bubble.setPointerCapture(event.pointerId);event.preventDefault();
      });
      bubble.addEventListener('pointermove',event=>{
        if(!dragging||event.pointerId!==dragging.id)return;
        const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;
        if(!dragging.moved&&Math.hypot(dx,dy)<5)return;
        dragging.moved=true;suppressClick=true;collapseWidget();
        const size=uiPreferences.size,maxX=Math.max(0,innerWidth-size-24),maxY=Math.max(0,innerHeight-size-24);
        uiPreferences={...uiPreferences,x:maxX?Math.max(0,Math.min(1,(dragging.left+dx-12)/maxX)):0,y:maxY?Math.max(0,Math.min(1,(dragging.top+dy-12)/maxY)):0};
        placeWidget();
      });
      function endDrag(event){
        if(!dragging||event.pointerId!==dragging.id)return;
        const moved=dragging.moved;dragging=null;
        if(bubble.hasPointerCapture(event.pointerId))bubble.releasePointerCapture(event.pointerId);
        if(moved)send({type:'SAVE_WIDGET_POSITION',x:uiPreferences.x,y:uiPreferences.y}).catch(()=>{});
      }
      bubble.addEventListener('pointerup',endDrag);bubble.addEventListener('pointercancel',endDrag);
      bubble.onclick=()=>{if(suppressClick){suppressClick=false;return;}expandWidget();};
      widgetRoot.append(style,bubble);document.documentElement.append(widgetHost);
    }
    placeWidget();
  }
  // The panel is an extension-origin iframe: host pages cannot read its favorites or settings DOM.
  window.addEventListener('message',event=>{
    if(frame&&event.source===frame.contentWindow&&event.origin===chrome.runtime.getURL('').replace(/\/$/,'')&&event.data?.type==='SHICI_WIDGET_CLOSE')collapseWidget(true);
  });
  document.addEventListener('pointerdown',event=>{if(frame&&!event.composedPath().includes(widgetHost))collapseWidget();},true);
  window.addEventListener('resize',placeWidget);
  function close() {generation++;host?.remove();host=null;root=null;previousFocus?.focus?.({preventScroll:true});}
  function sensitive(node) {
    const element=node?.nodeType===1?node:node?.parentElement;
    if(element?.closest('input,textarea,[role="textbox"],[data-sensitive],[autocomplete="one-time-code"]'))return true;
    return !!element?.closest('[contenteditable]:not([contenteditable="false"])')&&!element.closest('[role="document"],[role="doc-page"]');
  }
  globalThis.__shiciProbeSelection=()=>{const selection=window.getSelection();const blocked=sensitive(document.activeElement)||sensitive(selection?.anchorNode)||sensitive(selection?.focusNode);return {selected:!blocked&&!!selection?.toString().trim(),focused:document.hasFocus()&&!['IFRAME','FRAME'].includes(document.activeElement?.tagName),blocked};};
  function shell(rect) {
    host?.remove();previousFocus=document.activeElement;
    host=el('div');host.id='shici-lookup-host';
    host.style.cssText='all:initial;position:fixed;z-index:2147483647;';
    root=host.attachShadow({mode:'open'});
    const style=el('style');style.textContent=`
      :host{color-scheme:dark}*{box-sizing:border-box}section{width:min(370px,calc(100vw - 24px));max-height:min(620px,calc(100vh - 24px));overflow:auto;background:radial-gradient(ellipse at 100% 0,#284f6459,transparent 65%),linear-gradient(155deg,#1b2644,#121c35);color:#eff4ff;border:1px solid #547394;border-radius:18px;box-shadow:0 18px 55px #050b1d80;padding:20px;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif}header{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid #425679}.card-brand{display:flex;gap:9px;align-items:center}.card-brand img{width:32px;height:32px;border-radius:9px}h2{font:600 23px/1.3 system-ui;margin:12px 0;overflow-wrap:anywhere}p{margin:10px 0;white-space:pre-wrap;overflow-wrap:anywhere}small{color:#b0bfd7}button{font:inherit;border:1px solid #405579;background:#203150;color:#eff4ff;border-radius:9px;padding:7px 11px;cursor:pointer}button:hover{background:#2c4165}button:focus-visible,textarea:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid #65e3ed;outline-offset:2px}button:disabled{opacity:.55;cursor:wait}.primary{background:linear-gradient(110deg,#b2efb6,#64e1e7 58%,#91b7ff);color:#0e263b;border-color:transparent;font-weight:650}.primary:hover{background:linear-gradient(110deg,#c8facb,#89f0f2 58%,#b0ccff)}.row{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}textarea{width:100%;min-height:72px;resize:vertical;border:1px solid #405579;border-radius:9px;padding:9px;font:inherit;color:#eff4ff;background:#111d36}.error{color:#ffb7aa}.status{color:#b0efba}details{margin:10px 0}summary{cursor:pointer;color:#b0efba}label{display:block;margin-top:10px;color:#cfdbed}a{color:#65e3ed}::selection{background:#65e3ed45}`;
    root.append(style);
    const card=el('section');card.setAttribute('role','dialog');card.setAttribute('aria-label','拾词查词');
    const header=el('header'),brand=el('div',null,'card-brand'),logo=el('img');logo.src=chrome.runtime.getURL('assets/icon-128.png');logo.alt='';logo.draggable=false;brand.append(logo,el('small','拾词 · 主动查词'));header.append(brand);
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
    const message=result.status==='success'?(result.provider==='microsoft'?`微软翻译 · 英文 → 简体中文${result.cached?'（缓存）':''}`:'本地词典 · 一般释义'):result.error||'本地词典未命中。可填写释义收藏、配置微软联网查词，或主动请求 AI。';
    card.append(el('small',message));
    if(result.source?.type==='pdf'){const metadata=el('small',`${result.source.title||'PDF'}${result.source.pageNumber?' · 第 '+result.source.pageNumber+' 页':''}`);metadata.style.display='block';card.append(metadata);}
    if(result.warning)card.append(el('p',result.warning,'error'));
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
    button('微软联网查词',async()=>{output.textContent='正在请求微软翻译…';const next=await send({type:'LOOKUP',text:result.originalText,context:context.value,source:result.source,online:true});if(!card.isConnected)return;if(next.needsMicrosoftSettings){output.textContent=next.warning;await send({type:'OPEN_MICROSOFT_SETTINGS'});return;}const header=card.querySelector('header');card.replaceChildren(header);renderResult(card,{...next,videoPaused:result.videoPaused});},actions);
    button('解释原句',async()=>{
      output.textContent='解释中…';
      const explanation=await send({type:'EXPLAIN',text:result.originalText,context:context.value});
      if(explanation.needsSettings){output.textContent='AI 默认关闭或尚未配置，已打开设置；本次未调用模型。';await send({type:'OPEN_SETTINGS'});}
      else output.textContent=(explanation.cached?'缓存结果 · ':'')+explanation.text;
    },actions);
    card.append(el('small',result.videoPaused?'视频已暂停，请手动继续播放。':'本机记录 · 不自动收藏'));
  }
  async function trigger() {
    collapseWidget();
    const selection=window.getSelection();
    const blocked=sensitive(document.activeElement)||sensitive(selection?.anchorNode)||sensitive(selection?.focusNode);
    const text=blocked?'':selection?.toString().trim();
    const rect=selection?.rangeCount?selection.getRangeAt(0).getBoundingClientRect():null;
    // Read a bounded neighboring text node/block only at the explicit command.
    const anchor=selection?.anchorNode;
    const container=anchor?.nodeType===1?anchor:anchor?.parentElement;
    const textLayer=container?.closest('.textLayer');
    const block=textLayer?(container.closest('span')||textLayer):(container?.closest('p,li,blockquote,figcaption,h1,h2,h3,[role="doc-page"]')||container);
    let raw='';
    if(!blocked&&text&&block&&!['BODY','HTML'].includes(block.tagName)){
      const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,{acceptNode(node){
        return sensitive(node)||node.parentElement?.closest('script,style,noscript,template')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;
      }});
      while(walker.nextNode())raw+=walker.currentNode.textContent;
    }
    const index=raw.indexOf(text||'');
    const context=index>=0?raw.slice(Math.max(0,index-240),index+Math.min(text.length,200)+240).trim():'';
    const ownReader=location.href.split(/[?#]/)[0]===chrome.runtime.getURL('reader.html');
    const pdfPage=container?.closest('.page[data-page-number]');
    const source=ownReader?{...globalThis.__shiciDocumentSource}:pdfPage&&container?.closest('.textLayer')?{type:'pdf',pageNumber:Number(pdfPage.dataset.pageNumber),title:document.title}:{type:'web',title:document.title};
    const card=shell(rect);const current=++generation;
    if(!text){card.append(el('p',blocked?'此输入区域不取词。请在普通网页正文选中英文，或到单词本手动输入。':'请先选中英文单词或短语'));return;}
    if(text.length>200){card.append(el('p','请选择 200 字符以内的英文单词或短语'));return;}
    let timestampSeconds,videoPaused=false;
    if(/(^|\.)youtube\.com$/.test(location.hostname)) {
      const video=document.querySelector('video');if(video){timestampSeconds=video.currentTime;video.pause();videoPaused=video.paused;}
    }
    const loading=el('p','查询中…');card.append(loading);
    const badge=el('p','正在检查收藏…');card.append(badge);
    send({type:'FAVORITE_STATUS',text}).then(saved=>{if(current===generation)badge.textContent=saved?'已收藏':'未收藏';}).catch(()=>{});
    try {
      const result=await send({type:'LOOKUP',text,context,source:{...source,timestampSeconds}});
      if(current!==generation)return;
      loading.remove();badge.remove();renderResult(card,{...result,videoPaused});
    }catch(error){if(current===generation){loading.textContent=error.message;badge.remove();}}
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(host){event.preventDefault();close();}if(frame)collapseWidget(true);}},true);
  document.addEventListener('SHICI_LOOKUP_SELECTION',()=>trigger());
  document.addEventListener('SHICI_DOCUMENT_CHANGED',()=>{if(host)close();});
  chrome.runtime.onMessage.addListener(message=>{if(message.type==='TRIGGER_LOOKUP')trigger();if(message.type==='UI_PREFERENCES_CHANGED')applyPreferences(message.preferences);});
  send({type:'GET_UI_PREFERENCES'}).then(applyPreferences).catch(()=>{});
})();
