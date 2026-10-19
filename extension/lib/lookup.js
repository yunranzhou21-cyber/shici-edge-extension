import { canonicalize } from './core.js';
export async function resolveLookup(text,{local,translate,enabled=false,configured=false,online=false}) {
  let result;
  try{result=await local(text);}
  catch{result={canonicalForm:canonicalize(text),status:'error',error:'读取本地词典失败，请检查扩展文件是否完整'};}
  result={...result,provider:'local'};
  if(!online&&(result.status==='success'||!enabled))return result;
  if(!enabled||!configured)return {...result,needsMicrosoftSettings:true,warning:'微软联网查词尚未启用或配置，请前往设置。本次没有发起联网请求。'};
  try{
    const translated=await translate(text);
    return {canonicalForm:result.canonicalForm,meaning:translated.meaning,phonetic:result.phonetic,status:'success',provider:'microsoft',cached:!!translated.cached};
  }catch(error){
    if(result.status==='success')return {...result,warning:'微软联网失败，已保留本地释义。'+error.message};
    return {...result,status:'error',provider:'microsoft',error:error.message};
  }
}
