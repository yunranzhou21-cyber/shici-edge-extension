import * as pdfjs from './vendor/pdfjs/build/pdf.mjs';
import {checkPdfBytes,MAX_PDF_BYTES} from './lib/documents.js';
import {safeUrl} from './lib/core.js';
const $=id=>document.getElementById(id);
pdfjs.GlobalWorkerOptions.workerSrc=chrome.runtime.getURL('vendor/pdfjs/build/pdf.worker.mjs');
const params=new URLSearchParams(location.search),expectedId=params.get('documentId');
let pdf,loadingTask,renderTask,textLayer,passwordCallback,currentPage=1,revision=0,source,loadRevision=0;
const send=async message=>{const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error||'扩展连接失败');return r.data;};
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function closeLookup(){document.dispatchEvent(new Event('SHICI_DOCUMENT_CHANGED'));window.getSelection()?.removeAllRanges();}
async function showPage(number){
  if(!pdf)return;
  const requested=Math.max(1,Math.min(pdf.numPages,Math.floor(number)||1)),generation=++revision;
  closeLookup();renderTask?.cancel();textLayer?.cancel();
  try{
    const page=await pdf.getPage(requested);if(generation!==revision)return;
    const previous=renderTask;if(previous)await previous.promise.catch(()=>{});if(generation!==revision)return;
    currentPage=requested;const scale=Number($('zoom').value),viewport=page.getViewport({scale});
    const shell=$('page-shell'),canvas=$('canvas'),layer=$('text-layer');
    shell.hidden=false;$('empty').hidden=true;shell.dataset.pageNumber=requested;shell.style.width=viewport.width+'px';shell.style.height=viewport.height+'px';shell.style.setProperty('--total-scale-factor',viewport.scale);shell.style.setProperty('--scale-factor',scale);shell.style.setProperty('--user-unit',page.userUnit||1);
    const outputScale=Math.min(devicePixelRatio||1,2);canvas.width=Math.ceil(viewport.width*outputScale);canvas.height=Math.ceil(viewport.height*outputScale);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';layer.replaceChildren();
    renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:outputScale===1?null:[outputScale,0,0,outputScale,0,0]});
    await renderTask.promise;if(generation!==revision)return;
    const text=await page.getTextContent();if(generation!==revision)return;
    textLayer=new pdfjs.TextLayer({textContentSource:text,container:layer,viewport});await textLayer.render();if(generation!==revision)return;
    globalThis.__shiciDocumentSource={...source,pageNumber:requested};
    $('page-number').value=requested;$('page-count').textContent=pdf.numPages;$('page-number').max=pdf.numPages;$('prev').disabled=requested===1;$('next').disabled=requested===pdf.numPages;
    status(text.items.some(item=>item.str?.trim())?`第 ${requested} 页已就绪。选中英文后按快捷键或点击“查询选中文字”；只有主动查词才会翻译。`:`第 ${requested} 页没有可选文字，可能是扫描件或图片。本版不含 OCR，可手动输入查词。`);
  }catch(error){if(generation===revision&&error.name!=='RenderingCancelledException'&&error.name!=='AbortException')status('页面渲染失败：'+error.message,true);}
}
async function openBytes(bytes,title,url){
  checkPdfBytes(bytes);const generation=++loadRevision;
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(expectedId&&hash!==expectedId)throw new Error('所选文件与收藏来源不一致，请选择原来的 PDF 文件');
  closeLookup();revision++;renderTask?.cancel();textLayer?.cancel();await loadingTask?.destroy();pdf=null;
  $('toolbar').hidden=true;$('page-shell').hidden=true;status('正在本机解析 PDF…');
  source={type:'pdf',title,url:safeUrl(url)||undefined,documentId:hash};
  loadingTask=pdfjs.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,cMapUrl:chrome.runtime.getURL('vendor/pdfjs/cmaps/'),cMapPacked:true,standardFontDataUrl:chrome.runtime.getURL('vendor/pdfjs/standard_fonts/'),wasmUrl:chrome.runtime.getURL('vendor/pdfjs/wasm/')});
  loadingTask.onPassword=(callback,reason)=>{passwordCallback=callback;$('password').value='';$('password-hint').textContent=reason===pdfjs.PasswordResponses.INCORRECT_PASSWORD?'密码不正确，请重试。密码只在本机用于本次解密。':'密码只在本机用于本次解密，不保存、不发送。';if(!$('password-dialog').open)$('password-dialog').showModal();$('password').focus();};
  try{const document=await loadingTask.promise;if(generation!==loadRevision){await document.destroy();return;}pdf=document;$('title').textContent=title;window.document.title='拾词 · '+title;$('toolbar').hidden=false;await showPage(Number(params.get('page'))||1);}
  catch(error){if(generation!==loadRevision)return;if(error.name==='InvalidPDFException')throw new Error('PDF 已损坏或格式不受支持，请换一个文件');throw error;}
}
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>MAX_PDF_BYTES)throw new Error('本版支持 50 MB 以内的 PDF，请拆分后打开');await openBytes(new Uint8Array(await file.arrayBuffer()),file.name);}catch(error){status(error.message,true);}finally{$('file').value='';}};
async function openUrl(value,ask=false){
  const url=safeUrl(value);if(!url)throw new Error('请填写有效的 HTTP/HTTPS PDF 链接；本地文件请点击“选择本地 PDF”');
  const origin=new URL(url).origin+'/*';
  const allowed=ask?await chrome.permissions.request({origins:[origin]}):await chrome.permissions.contains({origins:[origin]});
  if(!allowed)throw new Error(ask?'未授予此 PDF 站点的读取权限。也可下载后选择本地文件。':'请点击“打开在线 PDF”授予该站点读取权限，或选择本地 PDF。');
  status('正在从所选地址读取 PDF…');let response;
  try{response=await fetch(url,{credentials:'include',redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw new Error('在线 PDF 读取失败，可能有网络、登录或重定向限制。请下载后选择本地 PDF。');}
  if(!response.ok)throw new Error(`在线 PDF 返回 HTTP ${response.status}，请下载后选择本地文件`);
  if(Number(response.headers.get('content-length'))>MAX_PDF_BYTES)throw new Error('在线 PDF 超过 50 MB，请拆分后打开');
  const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.byteLength;if(size>MAX_PDF_BYTES){await reader.cancel();throw new Error('在线 PDF 超过 50 MB，请拆分后打开');}chunks.push(chunk);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const name=params.get('title')||decodeURIComponent(new URL(url).pathname.split('/').pop()||'在线 PDF');await openBytes(bytes,name,url);
}
$('url-form').onsubmit=async event=>{event.preventDefault();try{await openUrl($('url').value,true);}catch(error){status(error.message,true);}};
$('prev').onclick=()=>showPage(currentPage-1);$('next').onclick=()=>showPage(currentPage+1);$('page-number').onchange=()=>showPage(Number($('page-number').value));$('zoom').onchange=()=>showPage(currentPage);
$('lookup').onpointerdown=event=>event.preventDefault();$('lookup').onclick=()=>document.dispatchEvent(new Event('SHICI_LOOKUP_SELECTION'));
$('book').onclick=()=>send({type:'OPEN_VOCABULARY'}).catch(error=>status(error.message,true));
$('password-form').onsubmit=event=>{event.preventDefault();const password=$('password').value;$('password').value='';$('password-dialog').close();passwordCallback?.(password);};
$('cancel-password').onclick=async()=>{$('password').value='';$('password-dialog').close();loadRevision++;await loadingTask?.destroy();status('已取消打开加密 PDF。');};
$('password-dialog').addEventListener('cancel',event=>{event.preventDefault();$('cancel-password').click();});
chrome.commands.getAll().then(commands=>{$('shortcut').textContent=commands.find(c=>c.name==='lookup-selection')?.shortcut||'请在设置中绑定快捷键';});
if(expectedId)status(`请重新选择原文件“${params.get('title')||'收藏来源 PDF'}”，将校验文件并定位到第 ${Number(params.get('page'))||1} 页。文件内容没有写入收藏备份。`);
if(params.get('url')){$('url').value=params.get('url');openUrl(params.get('url')).catch(error=>status(error.message,true));}
