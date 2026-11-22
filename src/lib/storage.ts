import type { Profile, Run } from '../core/types';
const DB = 'commiledger-local-v1';
async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('runs', { keyPath: 'id' });
      request.result.createObjectStore('profiles', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (s: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(store, mode);
    const request = work(tx.objectStore(store));
    tx.oncomplete = () => {
      database.close();
      resolve(request.result);
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      database.close();
      reject(tx.error || new Error('Storage transaction aborted'));
    };
  });
}
export const storage = {
  runs: () => transaction<Run[]>('runs', 'readonly', (s) => s.getAll()),
  saveRun: (r: Run) => transaction('runs', 'readwrite', (s) => s.put(r)),
  deleteRun: (id: string) => transaction('runs', 'readwrite', (s) => s.delete(id)),
  profiles: () => transaction<Profile[]>('profiles', 'readonly', (s) => s.getAll()),
  saveProfile: (p: Profile) => transaction('profiles', 'readwrite', (s) => s.put(p)),
  deleteProfile: (id: string) => transaction('profiles', 'readwrite', (s) => s.delete(id)),
  clear: async () => {
    await transaction('runs', 'readwrite', (s) => s.clear());
    await transaction('profiles', 'readwrite', (s) => s.clear());
  },
};
