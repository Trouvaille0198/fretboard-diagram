// localStorage 大键的 IndexedDB 化通用层：内存缓存（同步语义）+ 启动灌入 + 防抖落盘 + 旧键一次性迁移。
// 为什么这么绕：全工程几十处 loadCharts()/loadClips()/trashList() 都是同步读，IDB 是异步 API——
// 缓存让所有同步调用零改动；App 启动先等灌入完成再渲染路由（hydrateBigStores），页面初始化永远读到灌满的缓存。
// 无 IDB 环境：退回 localStorage 老路径（主键失败清备份重试一次，v187 语义）。
import { idbGet, idbSet, hasIDB } from "./idbKv.js";

const cache = new Map();          // key → 值（灌入后与写入同步更新，是同步读的唯一权威）
const timers = new Map();         // key → 防抖 timer
const legacyPending = new Map();  // key → 待清除的旧 localStorage 键名（迁移首次落盘成功后删）
const stores = [];                // 注册表：hydrateBigStores 逐个灌入
const FLUSH_DELAY = 250;

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ } };

async function flushNow(key) {
	const val = cache.get(key);
	if (val === undefined) return;
	if (!hasIDB()) {
		// 无 IDB：退回 localStorage。备份尽力而为，主键失败清备份重试一次——v187 语义
		try {
			const prev = lsGet(key);
			if (prev) { try { localStorage.setItem(key + "-bak-1", prev); } catch (e) { /* 备份装不下：容忍 */ } }
			try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {
				for (let i = 1; i <= 3; i++) lsDel(key + "-bak-" + i);
				localStorage.setItem(key, JSON.stringify(val));
			}
		} catch (e) { console.error("localStorage 写入失败:", key, e); }
		return;
	}
	try {
		// IDB 空间充裕：保持 3 份滚动备份（旧主值逐位下移）
		const prev = await idbGet(key);
		if (prev != null) {
			for (let i = 2; i >= 1; i--) {
				const b = await idbGet(key + "-bak-" + i);
				if (b != null) await idbSet(key + "-bak-" + (i + 1), b);
			}
			await idbSet(key + "-bak-1", prev);
		}
		await idbSet(key, val);
		// 迁移收尾：IDB 首次写成功后清掉旧 localStorage 键（腾出配额——迁移的主要收益）
		if (legacyPending.has(key)) { legacyPending.get(key).forEach(lsDel); legacyPending.delete(key); }
	} catch (e) {
		console.error("IndexedDB 写入失败:", key, e);
		try { window.dispatchEvent(new CustomEvent("fretboard:storage-full")); } catch (e2) { /* 忽略 */ }
	}
}

function scheduleFlush(key, delay = FLUSH_DELAY) {
	if (timers.has(key)) return;
	timers.set(key, setTimeout(() => { timers.delete(key); flushNow(key); }, delay));
}

// 卸载/切后台强制刷盘：防抖窗口内的最后改动不能等下一次触发
if (typeof window !== "undefined" && typeof document !== "undefined") {
	const flushAll = () => { for (const key of [...timers.keys()]) { clearTimeout(timers.get(key)); timers.delete(key); flushNow(key); } };
	window.addEventListener("pagehide", flushAll);
	document.addEventListener("visibilitychange", () => { if (document.hidden) flushAll(); });
}

export function createBigStore(key, { legacyKeys } = {}) {
	const store = {
		key,
		// 同步读：缓存权威；灌入前的窗口（App 门保证不会发生；node 冒烟/异常兜底）退回调用方的 LS 老读法
		getSync(lsRead) {
			if (cache.has(key)) return cache.get(key);
			return lsRead ? lsRead() : undefined;
		},
		setSync(value) {
			cache.set(key, value);
			scheduleFlush(key);
		},
		async hydrate(lsRead) {
			if (cache.has(key)) return; // 已有写入（早于灌入的极端竞态）：内存为准
			let v = null;
			if (hasIDB()) { try { v = await idbGet(key); } catch (e) { v = null; } }
			const apply = (val) => { if (!cache.has(key)) cache.set(key, val); };
			if (v != null) { apply(v); return; }
			// IDB 为空：看旧 localStorage 键——一次性迁移进 IDB，成功后清旧键
			const legacy = lsRead ? lsRead() : undefined;
			if (legacy != null) {
				apply(legacy);
				legacyPending.set(key, legacyKeys ? legacyKeys(key) : [key]);
				if (hasIDB()) scheduleFlush(key, 0);
				return;
			}
			apply([]);
		},
	};
	stores.push(store);
	return store;
}

// App 启动门：全部大键灌入完成（单键失败也继续，退 LS 兜底渲染）
export function hydrateBigStores() {
	return Promise.all(stores.map(s => s.hydrate().catch(e => console.error("灌入失败:", s.key, e))));
}
