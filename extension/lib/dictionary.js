import { normalize, canonicalize } from './core.js';
const shards = new Map();
async function shard(key) {
  if(!shards.has(key))shards.set(key,fetch(chrome.runtime.getURL(`data/${key}.json`)).then(r=>{if(!r.ok)throw new Error('本地词典文件缺失');return r.json();}).catch(e=>{shards.delete(key);throw e;}));
  return shards.get(key);
}
export function briefMeaning(text) {
  return text.split('\n').filter(Boolean).slice(0,2).map(line=>line.length>75?line.slice(0,74)+'…':line).join('\n');
}
async function entry(word) {
  if (!/^[a-z]/.test(word)) return null;
  const key = /^[a-z]/.test(word) ? word[0] : '_';
  const data = await shard(key);
  const value = Object.hasOwn(data, word) ? data[word] : null;
  return value ? { meaning:briefMeaning(value[0]), phonetic:value[1] } : null;
}
export async function suggestLocal(prefix) {
  if(typeof prefix!=='string')return [];
  const term=normalize(prefix);
  if(!/^[a-z][a-z '-]{0,79}$/.test(term))return [];
  const data=await shard(term[0]);
  return Object.keys(data).filter(word=>word.startsWith(term)).sort((a,b)=>a.length-b.length||a.localeCompare(b)).slice(0,8).map(word=>({word,meaning:briefMeaning(data[word][0])}));
}
export async function lookupLocal(text) {
  const canonicalForm = canonicalize(text);
  // Prefer lemma for reliable aliases; an unrelated standalone definition must not replace it.
  const value = await entry(canonicalForm) || (canonicalForm !== normalize(text) ? await entry(normalize(text)) : null);
  return { canonicalForm, ...(value || {}), status:value ? 'success' : 'not_found' };
}
