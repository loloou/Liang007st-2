const DB_NAME = "liang007_studio";
const DB_VERSION = 1;
const STORE_IMAGES = "images";
const STORE_WORKFLOWS = "workflows";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_WORKFLOWS)) {
        db.createObjectStore(STORE_WORKFLOWS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export interface ImageRecord {
  id: string;
  url: string;
  thumbnail?: string;
  prompt?: string;
  model?: string;
  width?: number;
  height?: number;
  createdAt: number;
}

export interface WorkflowRecord {
  id: string;
  name: string;
  data: string;
  createdAt: number;
}

export async function putImage(record: ImageRecord): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_IMAGES, "readwrite");
  tx.objectStore(STORE_IMAGES).put(record);
  await txDone(tx);
  db.close();
}

export async function getImage(id: string): Promise<ImageRecord | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORE_IMAGES, "readonly");
  const req = tx.objectStore(STORE_IMAGES).get(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => { resolve(req.result); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function getAllImages(): Promise<ImageRecord[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_IMAGES, "readonly");
  const req = tx.objectStore(STORE_IMAGES).getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => { resolve(req.result ?? []); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function deleteImage(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_IMAGES, "readwrite");
  tx.objectStore(STORE_IMAGES).delete(id);
  await txDone(tx);
  db.close();
}

export async function clearOldImages(keepRecent = 200): Promise<number> {
  const all = await getAllImages();
  if (all.length <= keepRecent) return 0;
  const sorted = all.sort((a, b) => b.createdAt - a.createdAt);
  const toDelete = sorted.slice(keepRecent);
  const db = await openDB();
  const tx = db.transaction(STORE_IMAGES, "readwrite");
  const store = tx.objectStore(STORE_IMAGES);
  toDelete.forEach((r) => store.delete(r.id));
  await txDone(tx);
  db.close();
  return toDelete.length;
}

export async function putWorkflow(record: WorkflowRecord): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_WORKFLOWS, "readwrite");
  tx.objectStore(STORE_WORKFLOWS).put(record);
  await txDone(tx);
  db.close();
}

export async function getWorkflow(id: string): Promise<WorkflowRecord | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORE_WORKFLOWS, "readonly");
  const req = tx.objectStore(STORE_WORKFLOWS).get(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => { resolve(req.result); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function getAllWorkflows(): Promise<WorkflowRecord[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_WORKFLOWS, "readonly");
  const req = tx.objectStore(STORE_WORKFLOWS).getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => { resolve(req.result ?? []); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function deleteWorkflow(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_WORKFLOWS, "readwrite");
  tx.objectStore(STORE_WORKFLOWS).delete(id);
  await txDone(tx);
  db.close();
}
