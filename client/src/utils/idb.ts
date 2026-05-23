// ─────────────────────────────────────────────────────────────────────────────
//  idb.ts — 轻量 IndexedDB 封装
//
//  替代 localStorage 存储大体积数据（生成历史含 base64 图片、白板节点等），
//  避免 5-10MB localStorage 配额限制。
//
//  API:
//    idbGet<T>(storeName, key) → Promise<T | undefined>
//    idbSet(storeName, key, value) → Promise<void>
//    idbDelete(storeName, key) → Promise<void>
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'liang007_studio'
const DB_VERSION = 1
const STORE_NAMES = ['blobs', 'history', 'canvas'] as const
export type StoreName = (typeof STORE_NAMES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name)
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

export async function idbGet<T = unknown>(
  storeName: StoreName,
  key: string,
): Promise<T | undefined> {
  try {
    const db = await openDB()
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const req = tx.objectStore(storeName).get(key)
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return undefined
  }
}

export async function idbSet(storeName: StoreName, key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB()
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const req = tx.objectStore(storeName).put(value, key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    // IndexedDB 不可用时静默失败
  }
}

export async function idbDelete(storeName: StoreName, key: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const req = tx.objectStore(storeName).delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    // 静默失败
  }
}
