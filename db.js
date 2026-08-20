const DB_NAME = 'pageshot';
const DB_VERSION = 1;
const STORE = 'captures';
export const LATEST_KEY = 'latest';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

/**
 * @param {{ blob: Blob, meta: Record<string, unknown> }} record
 */
export async function putLatestCapture(record) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.objectStore(STORE).put({
        id: LATEST_KEY,
        blob: record.blob,
        meta: record.meta,
        createdAt: Date.now(),
      });
    });
  } finally {
    db.close();
  }
}

export async function getLatestCapture() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(LATEST_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
    });
  } finally {
    db.close();
  }
}
