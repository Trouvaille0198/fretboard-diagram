// 记忆式保存：File System Access API——首次选一次目录，之后导出直接写入该目录（不再弹路径框）。
// 句柄存 IndexedDB 跨会话保留；无该 API（Firefox 等）或用户取消时回落 <a download>。
const DB_NAME = "fretboard-fs";
const STORE = "handles";

function idb() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function loadHandle() {
	try {
		const db = await idb();
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readonly");
			const req = tx.objectStore(STORE).get("dir");
			req.onsuccess = () => resolve(req.result || null);
			req.onerror = () => reject(req.error);
		});
	} catch (e) { return null; }
}

async function saveHandle(h) {
	try {
		const db = await idb();
		await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			tx.objectStore(STORE).put(h, "dir");
			tx.oncomplete = resolve;
			tx.onerror = () => reject(tx.error);
		});
	} catch (e) { /* 忽略 */ }
}

export function rememberedDirSupported() {
	return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

// 取可用目录句柄：缓存的先验权限（读写在用户手势内可静默通过），不行则弹一次选择器
async function getDir(ask) {
	if (!rememberedDirSupported()) return null;
	const cached = await loadHandle();
	if (cached) {
		try {
			const perm = await cached.queryPermission({ mode: "readwrite" });
			if (perm === "granted") return cached;
			if (!ask) {
				const req = await cached.requestPermission({ mode: "readwrite" }); // 在点击手势内可弹一次授权（非路径框）
				if (req === "granted") return cached;
			}
		} catch (e) { /* 句柄失效，重新选 */ }
	}
	if (!ask) return null;
	try {
		const dir = await window.showDirectoryPicker({ mode: "readwrite", startIn: "downloads" });
		await saveHandle(dir);
		return dir;
	} catch (e) { return null; } // 用户取消
}

// 直接写文件到记忆目录；成功返回文件名，失败返回 null（调用方回落 <a download>）
export async function saveToRememberedDir(filename, blob, { pickIfNone = true } = {}) {
	try {
		const dir = await getDir(!pickIfNone ? false : true);
		if (!dir) return null;
		const fh = await dir.getFileHandle(filename, { create: true });
		const w = await fh.createWritable();
		await w.write(blob);
		await w.close();
		return dir.name;
	} catch (e) { return null; }
}
