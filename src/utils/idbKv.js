// IndexedDB kv 极简封装：一个 store，key → 任意结构化值。
// 为什么要有它：localStorage ~5MB 上限是大数据（谱子库/动图池/回收站）的天花板；
// 这几类迁进 IDB（配额通常几百 MB 起步）。同步小件（outbox/rev 台账/token/偏好）仍留 localStorage。
// 环境没有 indexedDB（极老浏览器/部分隐私模式）时 hasIDB()=false，各模型自动退回 localStorage 老路径。
const DB_NAME = "fretboard-idb";
const STORE = "kv";
let dbPromise = null;

export function hasIDB() {
	return typeof indexedDB !== "undefined";
}

function openDB() {
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, 1);
			req.onupgradeneeded = () => {
				if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}
	return dbPromise;
}

const tx = async (mode, fn) => {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const t = db.transaction(STORE, mode);
		let out;
		try { out = fn(t.objectStore(STORE)); } catch (e) { reject(e); return; }
		t.oncomplete = () => resolve(out && typeof out.result !== "undefined" && "result" in out ? out.result : out);
		t.onerror = () => reject(t.error);
		t.onabort = () => reject(t.error || new Error("indexedDB transaction aborted"));
	});
};

export const idbGet = (key) => tx("readonly", (s) => s.get(key));
export const idbSet = (key, val) => tx("readwrite", (s) => s.put(val, key));
export const idbDel = (key) => tx("readwrite", (s) => s.delete(key));
