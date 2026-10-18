import { normalize, canonicalize } from './core.js';
const shards = new Map();
export function briefMeaning(text) {
  return text.split('\n').filter(Boolean).slice(0,2).map(line=>line.length>75?line.slice(0,74)+'…':line).join('\n');
}
async function entry(word) {
  if (!/^[a-z]/.test(word)) return null;
  const key = /^[a-z]/.test(word) ? word[0] : '_';
  if (!shards.has(key)) shards.set(key, fetch(chrome.runtime.getURL(`data/${key}.json`)).then(r => { if (!r.ok) throw new Error('本地词典文件缺失'); return r.json(); }).catch(e=>{shards.delete(key);throw e;}));
  const data = await shards.get(key);
  const value = Object.hasOwn(data, word) ? data[word] : null;
  return value ? { meaning:briefMeaning(value[0]), phonetic:value[1] } : null;
}
export async function lookupLocal(text) {
  const canonicalForm = canonicalize(text);
  // Prefer lemma for reliable aliases; an unrelated standalone definition must not replace it.
  const value = await entry(canonicalForm) || (canonicalForm !== normalize(text) ? await entry(normalize(text)) : null);
  return { canonicalForm, ...(value || {}), status:value ? 'success' : 'not_found' };
}
