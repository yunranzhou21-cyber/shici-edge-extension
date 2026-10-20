import { safeUrl, cleanSource } from './core.js';
export function isPdfUrl(value){try{return /\.pdf$/i.test(decodeURIComponent(new URL(value).pathname));}catch{return false;}}
export function chooseSelectionFrame(results){
  const frames=results.filter(r=>r?.result);
  const focused=frames.find(r=>r.result.focused);
  if(focused)return focused.frameId;
  return frames.find(r=>r.result.selected)?.frameId??0;
}
export function readerUrl(base,source={}){
  const value=cleanSource(source),url=new URL(base);
  if(safeUrl(value.url))url.searchParams.set('url',value.url);
  if(value.documentId)url.searchParams.set('documentId',value.documentId);
  if(value.title)url.searchParams.set('title',value.title);
  if(value.pageNumber)url.searchParams.set('page',value.pageNumber);
  return url.href;
}
export const MAX_PDF_BYTES=50*1024*1024;
export function checkPdfBytes(bytes){
  if(!(bytes instanceof Uint8Array)||!bytes.byteLength)throw new Error('文件为空');
  if(bytes.byteLength>MAX_PDF_BYTES)throw new Error('本版支持 50 MB 以内的 PDF，请拆分文件后再打开');
  const header=new TextDecoder().decode(bytes.subarray(0,1024));
  if(!header.includes('%PDF-'))throw new Error('文件不是有效 PDF；在线链接可能返回了登录页，请下载 PDF 后选择本地文件');
}
