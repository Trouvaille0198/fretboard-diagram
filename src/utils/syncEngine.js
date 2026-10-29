// 同步引擎：本地优先 + 云端镜像（对齐市面成熟做法）
//
// 设计要点：
//   · 内容判脏：内容哈希一致 = 同一个版本，不落盘、不下发、不升版本号
//     （根治"只是打开了一首歌也被当成改动"——旧实现每次进编辑页都写盘 + PUT）
//   · 离线队列（outbox）：改动先进本地队列再异步下发，失败按指数退避重试，
//     断网/服务重启都不丢改动（旧实现是发一次失败就丢）
//   · 版本号用服务端分配的单调 rev，客户端只带 baseRev（"我改的是哪一版"），
//     不再拿客户端时钟跟服务端时钟比大小（两台设备时钟不一致是常态）
//   · 冲突不丢数据：云端版本为准，同时把本地被拒的版本另存为副本并提示
//   · 增量拉取：只拉 rev 更大的行（?since=），不每次全量重拉
//
// 状态事件：fretboard:sync-status → { state, pending, error, lastSyncAt }
//   state: idle（已同步）| syncing（同步中）| offline（离线待同步）| error（失败可重试）

import { authUser } from "./authModel.js";
import { clientId } from "./clientId.js";

const OUTBOX_KEY = "fretboard-outbox";
const CURSOR_KEY = "fretboard-sync-cursor";
const CLIENT_ID_KEY = "fretboard-client-id";

// 剔除易变字段：版本号与时间戳不参与"内容是否变了"的判断
const VOLATILE = new Set(["updatedAt", "rev", "baseRev"]);

// ---------- 内容哈希 ----------

// 稳定序列化：键排序，值按类型处理（对象递归，数组保序）
export function stableStringify(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
	const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
	return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}

// 内容哈希（FNV-1a 32 位，够用且无需 crypto.subtle 的异步）
export function contentHash(item) {
	if (!item || typeof item !== "object") return "0";
	const s = stableStringify(cleanForHash(item));
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
	}
	return h.toString(16) + ":" + s.length;
}

export function cleanForHash(item) {
	const out = {};
	for (const k of Object.keys(item || {})) if (!VOLATILE.has(k)) out[k] = item[k];
	return out;
}

// 内容是否真的变了（哈希比对，忽略版本号/时间戳）
export function sameContent(a, b) {
	if (!a || !b) return false;
	return contentHash(a) === contentHash(b);
}

// 存储里的版本是否比内存里的新（且内容确实不同——内容一样没什么可采纳的）。
// 只要有一边带 rev 就以 rev 为准：版本号相等 = 同一版，不采纳。
// （旧实现在这里退回 updatedAt 比较，而 updatedAt 是各设备自己的时钟、跨设备不可比——
//  曾导致"内存里的新编辑被同版本的云端内容覆盖"，改动凭空消失。）
export function remoteIsNewer(stored, memory) {
	if (!stored) return false;
	if (sameContent(stored, memory)) return false;
	const sr = stored.rev != null ? Number(stored.rev) : null;
	const mr = memory && memory.rev != null ? Number(memory.rev) : null;
	if (sr != null || mr != null) return (sr || 0) > (mr || 0);
	return (stored.updatedAt || 0) > ((memory && memory.updatedAt) || 0);
}

// ---------- 客户端标识（用于跳过"自己写的"广播）----------

export { clientId };

// ---------- 离线队列 ----------

const loadOutbox = () => {
	try {
		const raw = localStorage.getItem(OUTBOX_KEY);
		const list = raw ? JSON.parse(raw) : [];
		return Array.isArray(list) ? list : [];
	} catch (e) { return []; }
};
const saveOutbox = (list) => {
	try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch (e) { /* 配额满：忽略 */ }
};

export function outboxPending(table) {
	return loadOutbox().filter(e => !table || e.table === table);
}

// 版本号账本（都只增不减）：
//   ackedRev —— 本标签页自己上一次 PUT 被服务端确认的 rev（内容链里确实包含这一版）
//   seenRev  —— 见过的最高 rev（自己的确认 + 拉到的远端版本，取 max）
// queuePush 算 baseRev 的规则（诚实性是底线，baseRev 必须如实回答"内容基于哪一版"）：
//   基线 = item.rev（调用方内存里的版本，多数时候就是真实基线）；
//   仅当"自己的确认账(ackedRev)更高、且没见过比它更新的远端版本(seenRev ≤ ackedRev)"时才领到 ackedRev
//   —— 这是同页连续编辑场景：内存 rev 因 ack 尚未回流而过期，但内容链确实包含自己刚确认的那版。
//   若远端曾推进到比自己确认更高的版本（seenRev > ackedRev），说明别的设备改过而本内容没基于它，
//   此时绝不虚报，让服务端按真实基线判 409 → 冲突副本（真分歧就该这么处理）。
// 账本存 localStorage（fretboard-sync-revs）：同浏览器的多个标签页共享同一个离线队列，
// B 标签代发拿到 ack 时 A 标签的内存无从知晓——账本落盘后 A 也能看到（storage 事件还会推给各标签）。
// 条目：{ "table|id": { a: 自己确认过的 rev, s: 见过的最高 rev } }
const LEDGER_KEY = "fretboard-sync-revs";
const loadLedger = () => { try { return JSON.parse(localStorage.getItem(LEDGER_KEY) || "{}") || {}; } catch (e) { return {}; } };
const saveLedger = (l) => { try { localStorage.setItem(LEDGER_KEY, JSON.stringify(l)); } catch (e) { /* 配额满：内存语义退化也能工作 */ } };
function ledgerBump(k, field, rev) {
	const n = Number(rev) || 0;
	if (!n) return;
	const l = loadLedger();
	const e = l[k] || (l[k] = {});
	if (n > (e[field] || 0)) { e[field] = n; saveLedger(l); }
}
const ledgerGet = (k) => { const e = loadLedger()[k] || {}; return { acked: e.a || 0, seen: e.s || 0 }; };

// 入队一次下发（同一 id 只保留最新一条）
export function queuePush(table, item) {
	if (!authUser()) return;      // 游客：纯本地，不入队
	const list = loadOutbox();
	const i = list.findIndex(e => e.table === table && e.id === item.id);
	const k = `${table}|${item.id}`;
	let baseRev = Number(item.rev) || 0;
	const { acked: own, seen } = ledgerGet(k);
	if (own > baseRev && seen <= own) baseRev = own;
	const entry = {
		table, id: item.id, item, op: "put",
		baseRev,
		hash: contentHash(item),
		tries: 0, nextAt: 0, at: Date.now()
	};
	if (i >= 0) {
		// 已在队列里：内容换成最新的；baseRev 按上面规则重算（同一内容链，基线不变或前进）
		list[i] = { ...list[i], ...entry, tries: 0, nextAt: 0 };
	} else {
		list.push(entry);
	}
	saveOutbox(list);
	emitStatus();
	scheduleFlush(120);
}

// 入队一次删除（离线时删除也不丢；同一 id 上待发的写入作废）
export function queueDelete(table, id) {
	if (!authUser()) return;
	const list = loadOutbox().filter(e => !(e.table === table && e.id === id));
	list.push({ table, id, op: "delete", tries: 0, nextAt: 0, at: Date.now() });
	saveOutbox(list);
	emitStatus();
	scheduleFlush(120);
}


// ---------- 同步状态 ----------

let statusState = { state: "idle", pending: 0, error: null, lastSyncAt: 0 };
const statusListeners = new Set();

export function onSyncStatus(fn) {
	statusListeners.add(fn);
	try { fn(statusState); } catch (e) { /* 订阅方自己兜 */ }
	return () => statusListeners.delete(fn);
}

function emitStatus(patch) {
	statusState = { ...statusState, ...patch, pending: loadOutbox().length };
	statusListeners.forEach(fn => { try { fn(statusState); } catch (e) { /* 订阅方兜 */ } });
	window.dispatchEvent(new CustomEvent("fretboard:sync-status", { detail: statusState }));
}

// ---------- 下发（带退避重试）----------

let flushing = false;
let flushTimer = null;

function scheduleFlush(delay) {
	if (flushTimer) clearTimeout(flushTimer);
	flushTimer = setTimeout(() => { flushTimer = null; flushOutbox(); }, delay);
}

const backoff = (tries) => Math.min(60000, 1000 * Math.pow(2, Math.min(tries, 6))) + Math.floor(Math.random() * 400);

// 直接打服务端（不走 api.js —— 那是旧协议，端点已不存在）
async function putItem(table, id, body) {
	const token = authUser()?.token;
	const res = await fetch(`/api/${table}/${encodeURIComponent(id)}`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			"x-auth-token": token || "",
			"x-client-id": clientId()
		},
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const err = new Error(data.error || ("http_" + res.status));
		err.status = res.status;
		err.data = data;
		throw err;
	}
	return data;
}

async function deleteItem(table, id) {
	const token = authUser()?.token;
	const res = await fetch(`/api/${table}/${encodeURIComponent(id)}`, {
		method: "DELETE",
		headers: { "x-auth-token": token || "", "x-client-id": clientId() }
	});
	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		const err = new Error(data.error || ("http_" + res.status));
		err.status = res.status;
		err.data = data;
		throw err;
	}
	return true;
}

// 冲突处理：云端版本为准，本地被拒的版本另存副本（两边都不丢）
const conflictHandlers = new Map(); // table → fn(entry, serverItem)
export function setConflictHandler(table, fn) { conflictHandlers.set(table, fn); }

function handleConflict(entry, err) {
	const list = loadOutbox().filter(e => !(e.table === entry.table && e.id === entry.id));
	saveOutbox(list);
	emitStatus({ state: "error", error: "conflict" });
	const h = conflictHandlers.get(entry.table);
	if (h) {
		try { h(entry, err.data && err.data.item ? err.data.item : null); } catch (e) { /* 处理方自己兜 */ }
	}
}

// 服务端确认后把新版本号（rev）落回本地——否则下一次下发会带着过期的 baseRev，自己跟自己冲突
const appliers = new Map(); // table → fn(serverItem)
export function setApplier(table, fn) { appliers.set(table, fn); }

export async function flushOutbox() {
	if (flushing || !authUser()) return;
	const list = loadOutbox();
	if (!list.length) { emitStatus({ state: "idle" }); return; }
	flushing = true;
	emitStatus({ state: "syncing" });
	try {
		for (const entry of list) {
			if (entry.nextAt && entry.nextAt > Date.now()) continue;
			try {
				let saved = null;
				if (entry.op === "delete") {
					await deleteItem(entry.table, entry.id);
				} else {
					const body = { ...entry.item, baseRev: entry.baseRev };
					const res = await putItem(entry.table, entry.id, body);
					saved = res && res.item;
				}
				if (saved) {
					// 记两本账：自己确认过的版本（内容链包含它）+ 见过的最高版本
					const k0 = `${entry.table}|${entry.id}`;
					ledgerBump(k0, "a", saved.rev);
					ledgerBump(k0, "s", saved.rev);
					const a = appliers.get(entry.table);
					if (a) { try { a(saved); } catch (e) { /* 落地失败不影响清队列 */ } }
					window.dispatchEvent(new CustomEvent("fretboard:cloud-ack", { detail: { table: entry.table, id: entry.id, item: saved } }));
				}
				// 清掉刚发出去的这条。判定"是不是同一条"用入队时间戳（entry.at）：
				// 下发期间若来了更新的编辑（queuePush 原位替换，at 会变），保留它并把 baseRev
				// 重基到刚确认的版本；否则（at 相同 = 原样未动）删除。
				// 注意必须基于同一份快照判断——先读再存，不能 filter 后再 loadOutbox()
				// （那会读回未保存的旧条目，把它原样塞回队列，永远清不干净）。
				const cur = loadOutbox();
				const rest = cur.filter(e => !(e.table === entry.table && e.id === entry.id && e.at === entry.at));
				const rebased = saved && saved.rev != null
					? rest.map(e => ((e.table === entry.table && e.id === entry.id && e.at !== entry.at)
						? { ...e, baseRev: saved.rev } : e))
					: rest;
				saveOutbox(rebased);
				emitStatus({ state: "idle", error: null, lastSyncAt: Date.now() });
			} catch (err) {
				if (err.status === 409) { handleConflict(entry, err); continue; }
				if (err.status === 401) {
					// 会话失效：留在队列里，等重新登录再发（并让界面回到游客态，用户看得见）
					try { const { onAuthExpired } = await import("./authModel.js"); onAuthExpired && onAuthExpired(); } catch (e) { /* 忽略 */ }
					emitStatus({ state: "error", error: "unauthorized" });
					break;
				}
				// 网络/服务异常：退避重试，不丢改动
				const tries = (entry.tries || 0) + 1;
				const next = { ...entry, tries, nextAt: Date.now() + backoff(tries) };
				saveOutbox(loadOutbox().map(e => (e.table === entry.table && e.id === entry.id ? next : e)));
				emitStatus({ state: "offline", error: String(err.message || err) });
				scheduleFlush(Math.max(500, next.nextAt - Date.now()));
				break; // 服务不可达时不必继续打后面的
			}
		}
	} finally {
		flushing = false;
	}
	const left = loadOutbox();
	emitStatus(left.length
		? { state: left.some(e => e.tries > 0) ? "offline" : statusState.state }
		: { state: "idle", error: null, lastSyncAt: statusState.lastSyncAt || Date.now() });
}

// ---------- 增量拉取 ----------

function cursorKey(user) { return `${CURSOR_KEY}:${user}`; }

export function getCursor(table) {
	const user = authUser()?.user || "guest";
	try {
		const raw = localStorage.getItem(cursorKey(user));
		const c = raw ? JSON.parse(raw) : {};
		return Number(c[table] || 0);
	} catch (e) { return 0; }
}

export function setCursor(table, rev) {
	const user = authUser()?.user || "guest";
	try {
		const raw = localStorage.getItem(cursorKey(user));
		const c = raw ? JSON.parse(raw) : {};
		if (rev > (Number(c[table]) || 0)) {
			c[table] = rev;
			localStorage.setItem(cursorKey(user), JSON.stringify(c));
		}
	} catch (e) { /* 忽略 */ }
}

// 拉取增量：只回 rev 更大的行 + 墓碑
export async function pullSince(table) {
	if (!authUser()) return null;
	const since = getCursor(table);
	const token = authUser().token;
	const res = await fetch(`/api/${table}?since=${since}`, {
		headers: { "x-auth-token": token || "", "x-client-id": clientId() }
	});
	if (!res.ok) throw new Error("http_" + res.status);
	const data = await res.json().catch(() => ({}));
	if (data.rev != null) setCursor(table, data.rev);
	// 拉到的远端版本只进"见过的最高版本"账（不进自己的确认账）——
	// 本内容若没基于它，queuePush 就不能虚报这个基线，让真分歧走 409
	(data.items || []).forEach(i => ledgerBump(`${table}|${i.id}`, "s", i.rev));
	return data;
}

// 登录/登出切换时清掉游标（不同账号的数据不同）
export function resetCursors() {
	const user = authUser()?.user || "guest";
	try { localStorage.removeItem(cursorKey(user)); } catch (e) { /* 忽略 */ }
}

// 网络恢复 / 页面回到前台 → 立刻重试队列
if (typeof window !== "undefined") {
	window.addEventListener("online", () => { flushOutbox(); pullAll(); });
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") { flushOutbox(); pullAll(); }
	});
	// 启动冲刷：队列是持久化的，上次会话/上一个标签页没发出去的改动不能烂在本地。
	// （以前只在"有新的改动入队"时才冲刷，于是关页面前攒下的那条会一直躺着不动）
	setTimeout(() => {
		if (loadOutbox().length) { flushOutbox(); pullAll(); }
	}, 1200);
}

// 增量拉取：各表自己注册落地逻辑（模型层知道本地存储长什么样）
const pullers = new Map(); // table → fn(data)
export function setPuller(table, fn) { pullers.set(table, fn); }

export async function pullAll() {
	if (!authUser()) return null;
	const out = {};
	for (const [table, fn] of pullers) {
		try {
			const data = await pullSince(table);
			if (data) { fn(data); out[table] = data; }
		} catch (e) { /* 服务不可达：保持本地，下次再拉 */ }
	}
	return out;
}
