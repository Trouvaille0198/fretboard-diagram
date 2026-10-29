// 回收站：删除的曲目/动图先存这里，10 天后自动永久清除，期间可还原。
// 本地（游客态）存 localStorage；登录用户以云端 trash 表为准（本地也留一份兜底）。
// 云端被删时（SSE 广播 deleted）同样把数据捞回来进本地回收站——否则另一端删了就没法还原。
import { authUser } from "./authModel.js";

const TRASH_KEY = "fretboard-trash";
export const TRASH_TTL = 10 * 24 * 3600 * 1000; // 10 天
export const TRASH_TTL_DAYS = 10;

// 回收站条目：{ tbl:'charts'|'clips', id, item, at, name }
// tbl 区分曲目/动图；item 是被删对象的完整数据（还原时直接写回）
function readAll() {
	try {
		const raw = localStorage.getItem(TRASH_KEY);
		const list = raw ? JSON.parse(raw) : [];
		return Array.isArray(list) ? list.filter(e => e && e.tbl && e.id) : [];
	} catch (error) {
		console.error("读取回收站失败:", error);
		return [];
	}
}

function writeAll(list) {
	try {
		localStorage.setItem(TRASH_KEY, JSON.stringify(list));
	} catch (error) {
		console.error("写入回收站失败:", error);
	}
}

// 过期清理：超过 10 天的条目永久移除（每次读写都顺手清一遍）
function purgeExpired(list) {
	const now = Date.now();
	const kept = list.filter(e => now - (e.at || 0) < TRASH_TTL);
	if (kept.length !== list.length) writeAll(kept);
	return kept;
}

// 放进回收站（同 tbl+id 覆盖旧条目）
export function trashPut(tbl, item) {
	if (!item || !item.id) return null;
	const list = readAll();
	const entry = { tbl, id: item.id, item, at: Date.now(), name: item.name || "" };
	const next = [entry, ...list.filter(e => !(e.tbl === tbl && e.id === item.id))];
	writeAll(next);
	return entry;
}

// 回收站列表（新→旧），已过滤过期条目
export function trashList() {
	return purgeExpired(readAll()).sort((a, b) => (b.at || 0) - (a.at || 0));
}

// 取出某条目（不删除）
export function trashGet(tbl, id) {
	return trashList().find(e => e.tbl === tbl && e.id === id) || null;
}

// 移出回收站（还原成功后调用）
export function trashRemove(tbl, id) {
	const list = readAll();
	const next = list.filter(e => !(e.tbl === tbl && e.id === id));
	writeAll(next);
}

// 清空回收站（全部永久删除）
export function trashClear() {
	writeAll([]);
}

// 剩余天数（用于 UI 提示"X 天后永久删除"）
export function trashDaysLeft(entry) {
	const left = TRASH_TTL - (Date.now() - (entry.at || 0));
	return Math.max(0, Math.ceil(left / (24 * 3600 * 1000)));
}

// ===== 云端回收站（登录用户）=====
// 服务端 trash 表是权威副本：删除时自动进表，10 天后服务端自动清。
// 这里只提供拉取/还原/彻底删除的接口；本地这份用于"另一端删了也能还原"的兜底。
async function api(path, options = {}) {
	const au = authUser();
	const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
	if (au && au.token) headers["x-auth-token"] = au.token;
	const res = await fetch("/api" + path, { ...options, headers });
	if (!res.ok) throw new Error("回收站请求失败：" + res.status);
	return res.json();
}

// 拉取云端回收站（并与本地合并——本地有的云端没有时保留）
export async function trashPullCloud() {
	const au = authUser();
	if (!au) return trashList();
	const data = await api("/trash");
	const cloud = (data.items || []).map(it => ({
		tbl: it.tbl, id: it.id, item: it.item, at: it.at, name: it.item?.name || "",
	}));
	const local = readAll();
	const seen = new Set();
	const merged = [];
	for (const e of [...cloud, ...local]) {
		const key = e.tbl + "|" + e.id;
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(e);
	}
	writeAll(merged);
	return purgeExpired(merged).sort((a, b) => (b.at || 0) - (a.at || 0));
}

// 从云端还原（服务端写回主表并清墓碑）
export async function trashRestoreCloud(tbl, id) {
	await api("/trash/restore", { method: "POST", body: JSON.stringify({ tbl, id }) });
	trashRemove(tbl, id);
}

// 从云端彻底删除
export async function trashPurgeCloud(tbl, id) {
	await api(`/trash/${encodeURIComponent(tbl)}/${encodeURIComponent(id)}`, { method: "DELETE" });
	trashRemove(tbl, id);
}
