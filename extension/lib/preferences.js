export const DEFAULT_PREFERENCES = Object.freeze({ visible:true, size:48, opacity:0.9, x:1, y:0.8 });
export function preferences(input = {}) {
  const clamp = (value,min,max,fallback) => typeof value==='number' && Number.isFinite(value) ? Math.max(min,Math.min(max,value)) : fallback;
  return {
    visible:typeof input?.visible==='boolean'?input.visible:DEFAULT_PREFERENCES.visible,
    size:[40,48,56].includes(input?.size)?input.size:DEFAULT_PREFERENCES.size,
    opacity:clamp(input?.opacity,0.4,1,DEFAULT_PREFERENCES.opacity),
    x:clamp(input?.x,0,1,DEFAULT_PREFERENCES.x),
    y:clamp(input?.y,0,1,DEFAULT_PREFERENCES.y)
  };
}
export function preferencePatch(patch) {
  if (!patch || typeof patch!=='object' || Array.isArray(patch)) throw new Error('浮框设置格式无效');
  const allowed=Object.keys(DEFAULT_PREFERENCES);
  if(Object.keys(patch).some(key=>!allowed.includes(key)))throw new Error('不支持的浮框设置');
  for(const [key,value] of Object.entries(patch)){
    if(key==='visible' ? typeof value!=='boolean' : typeof value!=='number'||!Number.isFinite(value))throw new Error('浮框设置格式无效');
  }
  return patch;
}
