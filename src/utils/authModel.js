// 账号体系（前端）：token 本地保存 + API 封装 + 登录态订阅。
// 游客 = 不登录（数据纯 localStorage，与历史行为一致）；登录用户 = 曲目同步到账号服务。
import { clientId } from "./clientId.js";
const AUTH_KEY = "fretboard-auth"; // { token, user }

const listeners = new Set();
let current = null;
try { current = JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch (e) { current = null; }

export function authUser() { return current && current.token ? current : null; }

export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach(fn => { try { fn(authUser()); } catch (e) { /* 订阅方自己兜 */ } });

async function api(method, path, body) {
	const token = authUser()?.token;
	const res = await fetch("/api" + path, {
		method,
		headers: { "Content-Type": "application/json", ...(token ? { "x-auth-token": token } : {}) },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw Object.assign(new Error(data.error || res.status), { status: res.status, code: data.error });
	return data;
}

// 注册暂不开放（固定账号）：保留占位避免旧调用点报错
export async function register() {
	throw Object.assign(new Error("register_disabled"), { code: "register_disabled" });
}

export async function login(user, pass) {
	const d = await api("POST", "/auth/login", { user, pass });
	current = { token: d.token, user: d.user };
	localStorage.setItem(AUTH_KEY, JSON.stringify(current));
	emit();
	return d;
}

export async function logout() {
	try { await api("POST", "/auth/logout"); } catch (e) { /* 服务端会话过期也无妨 */ }
	current = null;
	localStorage.removeItem(AUTH_KEY);
	emit();
}

// ===== 登录时的数据交接（谱子 charts + 动图堆 clips）=====
// 合并：本地(游客期)数据并入云端。force=true —— 用户显式点了"并入本机数据"，
// 本机版本覆盖云端同名条目（游客期的本地编辑绝不静默丢弃）；服务端按 rev 分配新版本号。
export async function mergeLocalToCloud(localCharts, localClips) {
	const [c, l] = await Promise.all([
		api("POST", "/charts/merge", { items: localCharts || [], force: true }),
		api("POST", "/clips/merge", { items: localClips || [], force: true }),
	]);
	return { charts: c.items || [], clips: l.items || [], rev: c.rev || 0 };
}
// 只拉云端（不合并）：用于"不合并本机数据"时以账号为准覆盖本地
export async function pullCloud() {
	const [c, l] = await Promise.all([api("GET", "/charts"), api("GET", "/clips")]);
	return { charts: c.items || [], clips: l.items || [] };
}

// 曲目增删改的云端镜像（登录时才走）。失败绝不静默：顶栏亮红点提示"云同步失败"，
// 否则服务端重启/换库/token 失效时用户以为在云端，实际全部丢——历史上因此出过数据事故
let cloudFailTimer = null;
const flagCloudFail = () => {
	window.dispatchEvent(new CustomEvent("fretboard:cloud-error"));
	if (cloudFailTimer) clearTimeout(cloudFailTimer);
	cloudFailTimer = setTimeout(() => window.dispatchEvent(new CustomEvent("fretboard:cloud-ok")), 8000);
};
// ===== 实时同步（SSE）：云端任何写入广播到所有登录端，订阅方拉取合并 =====
// 广播载荷带写入方的 clientId：各端据此精确跳过"自己写的"，
// 不再像旧实现那样靠 2.5 秒时间窗去猜（时间窗会连带吞掉并发的他人改动）。
let lastSelfWrite = 0; // 老服务端没有载荷时的兜底
export function markCloudWrite() { lastSelfWrite = Date.now(); }
export function subscribeCloud(onChange, onDeleted) {
	const au = authUser();
	if (!au || typeof EventSource === "undefined") return () => {};
	const es = new EventSource("/api/events?token=" + encodeURIComponent(au.token));
	es.addEventListener("changed", (ev) => {
		let payload = null;
		try { payload = JSON.parse(ev.data || "{}"); } catch (e) { /* 老服务端：空载荷 */ }
		if (payload && payload.clientId) {
			if (payload.clientId === clientId()) return; // 自己写的：不回环
		} else if (Date.now() - lastSelfWrite < 2500) {
			return; // 老服务端：退回时间窗
		}
		try { onChange(payload); } catch (e) { /* 订阅方兜 */ }
	});
	es.addEventListener("deleted", (ev) => {
		let payload = null;
		try { payload = JSON.parse(ev.data || "{}"); } catch (e) { /* 老载荷 */ }
		if (payload && payload.clientId && payload.clientId === clientId()) return;
		if (!payload && Date.now() - lastSelfWrite < 2500) return;
		try { onDeleted && onDeleted(payload || {}); } catch (e) { /* 订阅方兜 */ }
	});
	return () => { try { es.close(); } catch (e) { /* 已关 */ } };
}

// 旧的逐条 PUT/DELETE 镜像接口已下线：下发统一走 syncEngine 的离线队列
// （内容判脏 + 失败退避重试 + 版本号冲突处理），这里不再保留第二条同步通路——
// 当年动图堆"批量同步一直失败"就是两条通路并存、其中一条指向已不存在的端点造成的。

// 会话失效：退回游客态让用户看得见（用户名从顶栏消失），本地数据不动
export function onAuthExpired() { logoutQuiet(); }

// 会话失效静默退出（用户名从顶栏消失=可感知），本地数据不动
function logoutQuiet() {
	current = null;
	localStorage.removeItem(AUTH_KEY);
	emit();
}
