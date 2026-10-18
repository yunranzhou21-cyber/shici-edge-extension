import { emptyState } from './core.js';
let database;
function open() {
  return database ||= new Promise((resolve,reject) => {
    const request = indexedDB.open('shici-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开本地数据库'));
  });
}
export async function readState() {
  const db = await open();
  return new Promise((resolve,reject) => {
    const request = db.transaction('state').objectStore('state').get('records');
    request.onsuccess = () => resolve(request.result || emptyState());
    request.onerror = () => reject(new Error('读取本地数据失败'));
  });
}
// Mutations run inside one read/write transaction, including complete import validation beforehand.
export async function mutateState(change) {
  const db = await open();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction('state','readwrite');
    const store = transaction.objectStore('state');
    const request = store.get('records');
    let result, failure;
    request.onsuccess = () => {
      try { const state = request.result || emptyState(); result = change(state); store.put(state,'records'); }
      catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(failure || new Error('保存失败，可能是本地空间不足'));
  });
}
