import { translationText, translationDirection } from './core.js';
export const MICROSOFT_DEFAULT_ENDPOINT='https://api.cognitive.microsofttranslator.com';
export function microsoftSettings(input={}) {
  input=input||{};
  let url;
  try{url=new URL(input.endpoint||MICROSOFT_DEFAULT_ENDPOINT);}catch{throw new Error('微软 API 地址无效');}
  const local=url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);
  if((url.protocol!=='https:'&&!local)||url.username||url.password||url.search||url.hash)throw new Error('微软 API 地址需为 HTTPS，不得包含密钥、查询参数或用户名');
  let path=url.pathname.replace(/\/+$/,'').replace(/\/translate$/,'');
  if(!path&&/\.cognitiveservices\.azure\.(com|cn)$/.test(url.hostname))path='/translator/text/v3.0';
  const endpoint=url.origin+path;
  const region=typeof input.region==='string'?input.region.trim().toLowerCase():'';
  if(!/^[a-z0-9-]{0,80}$/.test(region))throw new Error('微软区域应填写 Azure 资源区域代码，例如 eastasia；全局资源可留空');
  return {enabled:!!input.enabled,endpoint,region:region==='global'?'':region};
}
export function microsoftRequest(settings,key,text,direction='en-zh') {
  const reverse=translationDirection(direction)==='zh-en',value=translationText(text,direction);
  const url=new URL(settings.endpoint+'/translate');
  url.searchParams.set('api-version','3.0');url.searchParams.set('from',reverse?'zh-Hans':'en');url.searchParams.set('to',reverse?'en':'zh-Hans');url.searchParams.set('textType','plain');
  const headers={'Content-Type':'application/json; charset=UTF-8','Ocp-Apim-Subscription-Key':key};
  if(settings.region)headers['Ocp-Apim-Subscription-Region']=settings.region;
  return {url:url.href,headers,body:[{Text:value}]};
}
export async function translateMicrosoft(settings,key,text,fetcher=fetch,direction='en-zh') {
  if(typeof key!=='string'||!key.trim())throw new Error('微软 API Key 尚未配置，请前往设置');
  const request=microsoftRequest(settings,key,text,direction);let response;
  try{response=await fetcher(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(request.body),redirect:'error',signal:AbortSignal.timeout(15000)});}
  catch{throw new Error('微软服务无法连接或请求超时，请检查网络、地址和站点权限');}
  if(!response.ok){
    const hints={400:'请检查 API 地址和请求配置',401:'请检查 Key 和资源区域是否匹配',403:'请检查订阅权限或额度',429:'请求过快或额度受限，请稍后重试'};
    throw new Error(`微软 API 返回 HTTP ${response.status}：${hints[response.status]||'服务暂不可用，请稍后重试'}`);
  }
  let data;try{data=await response.json();}catch{throw new Error('微软 API 返回了无法解析的数据');}
  const translations=data?.[0]?.translations;
  const reverse=direction==='zh-en';
  const translation=Array.isArray(translations)?translations.find(t=>t?.to?.toLowerCase()===(reverse?'en':'zh-hans'))?.text:undefined;
  if(typeof translation!=='string'||!translation.trim())throw new Error('微软 API 未返回有效的'+(reverse?'英文':'简体中文')+'译文');
  return translation.trim().replaceAll(key,'[密钥已隐藏]').slice(0,4000);
}
