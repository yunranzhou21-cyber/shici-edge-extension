export const SCHEMA_VERSION = 1;
export const normalize = text => String(text).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
// Only reviewed aliases: no suffix stripping, and ambiguous saw/left/rose remain separate.
const groups = {
  run: ['runs','running','ran'], walk: ['walks','walked','walking'],
  go: ['goes','going','went','gone'], eat: ['eats','eating','ate','eaten'],
  write: ['writes','writing','wrote','written'], take: ['takes','taking','took','taken'],
  speak: ['speaks','speaking','spoke','spoken'], give: ['gives','giving','gave','given'],
  learn: ['learns','learning','learned','learnt'], study: ['studies','studying','studied'],
  understand: ['understands','understanding','understood'],
  work: ['works','worked','working'], play: ['plays','played','playing'],
  use: ['uses','used','using'], make: ['makes','making','made'],
  do: ['does','doing','did','done'], have: ['has','having','had'],
  child: ['children'], tooth: ['teeth'], foot: ['feet'], mouse: ['mice']
};
const aliases = new Map(Object.entries(groups).flatMap(([base, forms]) => forms.map(f => [f, base])));
export const canonicalize = text => aliases.get(normalize(text)) || normalize(text);
export function queryText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请先选中英文单词或短语');
  const text = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (text.length > 200 || !/[a-z]/i.test(text) || /[\u0000-\u001f]/.test(text)) throw new Error('请选择 200 字符以内的英文单词或短语');
  return text;
}
export function translationDirection(value='en-zh') {
  if(!['en-zh','zh-en'].includes(value))throw new Error('翻译方向无效');
  return value;
}
export function translationText(value,direction='en-zh') {
  if(translationDirection(direction)==='en-zh')return queryText(value);
  if(typeof value!=='string'||!value.trim())throw new Error('请输入要翻译的中文');
  const text=value.normalize('NFKC').trim().replace(/\s+/g,' ');
  if(text.length>200||!/[\p{Script=Han}]/u.test(text)||/[\u0000-\u001f]/.test(text))throw new Error('请输入 200 字符以内的中文，可包含英文术语');
  return text;
}
export function limited(value, max = 1000) { return typeof value === 'string' ? value.slice(0,max) : ''; }
export function safeUrl(value) {
  try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export const emptyState = () => ({ vocabulary: [], history: [] });
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export function favorite(state, input, append = false) {
  const originalText = queryText(input.originalText);
  const meaning = limited(input.meaning, 4000).trim();
  if (!meaning) throw new Error('请先填写中文释义');
  const canonicalForm = canonicalize(originalText);
  let entry = state.vocabulary.find(e => e.canonicalForm === canonicalForm);
  if (entry && !append) return entry;
  const date = now();
  const occurrence = { id: uid(), originalText, meaning, context: limited(input.context), source: cleanSource(input.source), createdAt: date };
  if (!entry) {
    entry = { id: uid(), language: 'en', canonicalForm, forms: [originalText], preferredMeaning: meaning, occurrences: [occurrence], createdAt: date, updatedAt: date };
    state.vocabulary.unshift(entry);
  } else {
    entry.forms = [...new Set([...entry.forms, originalText])];
    entry.occurrences.push(occurrence);
    entry.updatedAt = date;
  }
  return entry;
}
export function cleanSource(source) {
  if (!source || typeof source !== 'object') return { type: 'manual' };
  const result = { type: ['web','youtube','pdf','ppt','manual'].includes(source.type) ? source.type : 'manual' };
  if (safeUrl(source.url)) result.url = safeUrl(source.url);
  if (source.title) result.title = limited(source.title, 300);
  if (Number.isFinite(source.timestampSeconds) && source.timestampSeconds >= 0) result.timestampSeconds = Math.floor(source.timestampSeconds);
  if (Number.isInteger(source.pageNumber) && source.pageNumber > 0) result.pageNumber = source.pageNumber;
  if (typeof source.documentId==='string' && /^[a-f0-9]{64}$/.test(source.documentId)) result.documentId=source.documentId;
  return result;
}
export function searchEntries(entries, search) {
  const term = normalize(search);
  return entries.filter(e => normalize([e.originalText, e.canonicalForm, e.meaning, e.preferredMeaning, ...(e.forms || []), ...(e.occurrences || []).flatMap(o => [o.originalText,o.meaning,o.context,o.source?.title])].filter(Boolean).join(' ')).includes(term));
}
const requiredText = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const validDate = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
export function validateBackup(data) {
  const fail = () => { throw new Error('备份格式无效，原有数据未修改'); };
  if (!data || data.schemaVersion !== SCHEMA_VERSION || !validDate(data.exportedAt) || !Array.isArray(data.vocabulary) || !Array.isArray(data.history)) fail();
  const check = (v,max) => { if (!requiredText(v,max)) fail(); return v; };
  const date = v => { if (!validDate(v)) fail(); return v; };
  const source = v => {
    if (v === undefined) return undefined;
    if (!v || typeof v !== 'object' || !['web','youtube','pdf','ppt','manual'].includes(v.type) || (v.url && !safeUrl(v.url))) fail();
    return cleanSource(v);
  };
  const occurrence = o => ({ id:check(o?.id,100), originalText:queryText(o.originalText), meaning:check(o.meaning), context:limited(o.context), source:source(o.source), createdAt:date(o.createdAt) });
  const vocabulary = data.vocabulary.map(e => {
    if (!e || e.language !== 'en' || !Array.isArray(e.forms) || !e.forms.length || !Array.isArray(e.occurrences) || !e.occurrences.length) fail();
    const canonicalForm = check(e.canonicalForm,200);
    if (canonicalize(canonicalForm) !== canonicalForm || e.forms.some(f => canonicalize(queryText(f)) !== canonicalForm)) fail();
    const occurrences = e.occurrences.map(occurrence);
    if (new Set(occurrences.map(o=>o.id)).size !== occurrences.length) fail();
    if (occurrences.some(o => canonicalize(o.originalText) !== canonicalForm)) fail();
    return { id:check(e.id,100), language:'en', canonicalForm, forms:e.forms.map(queryText), preferredMeaning:check(e.preferredMeaning), occurrences, createdAt:date(e.createdAt), updatedAt:date(e.updatedAt) };
  });
  const history = data.history.map(h => {
    if (!h || !['success','not_found','error'].includes(h.status)) fail();
    const direction=translationDirection(h.direction),originalText=translationText(h.originalText,direction);
    return { id:check(h.id,100), originalText, canonicalForm:canonicalize(originalText), meaning:limited(h.meaning,4000), context:limited(h.context), source:source(h.source), status:h.status, createdAt:date(h.createdAt),...(direction==='zh-en'?{direction}:{}) };
  });
  for (const list of [vocabulary,history]) if (new Set(list.map(x=>x.id)).size !== list.length) fail();
  if (new Set(vocabulary.map(e=>e.canonicalForm)).size !== vocabulary.length) fail();
  return { vocabulary, history };
}
export function mergeBackup(state, imported) {
  for (const incoming of imported.vocabulary) {
    const entry = state.vocabulary.find(e=>e.canonicalForm === incoming.canonicalForm);
    if (!entry) { state.vocabulary.push({...incoming, id: state.vocabulary.some(e=>e.id===incoming.id) ? uid() : incoming.id}); continue; }
    entry.forms = [...new Set([...entry.forms,...incoming.forms])];
    const known = new Set(entry.occurrences.map(o=>o.id));
    entry.occurrences.push(...incoming.occurrences.filter(o=>!known.has(o.id)));
    entry.updatedAt = entry.updatedAt > incoming.updatedAt ? entry.updatedAt : incoming.updatedAt;
    // Existing edited preferred meaning is deliberately preserved.
  }
  const known = new Set(state.history.map(h=>h.id));
  state.history.push(...imported.history.filter(h=>!known.has(h.id)));
  return state;
}
export function makeBackup(state) {
  // Reconstruct allowed fields, excluding settings, credentials and unknown input fields.
  return { schemaVersion:SCHEMA_VERSION, exportedAt:now(), ...validateBackup({schemaVersion:SCHEMA_VERSION,exportedAt:now(),vocabulary:state.vocabulary,history:state.history}) };
}
