// 账号体系（前端）：token 本地保存 + API 封装 + 登录态订阅。
// 游客 = 不登录（数据纯 localStorage，与历史行为一致）；登录用户 = 曲目同步到账号服务。
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

export async function register(user, pass) {
	const d = await api("POST", "/auth/register", { user, pass });
	current = { token: d.token, user: d.user };
	localStorage.setItem(AUTH_KEY, JSON.stringify(current));
	emit();
	return d;
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

// 登录后同步：本地(游客期)曲目并入云端（updatedAt 新者胜），回写本地并返回合并结果
export async function syncChartsFromServer(localCharts) {
	const d = await api("POST", "/charts/merge", localCharts);
	return d.charts || [];
}

// 曲目增删改的云端镜像（登录时才走；失败静默——本地照常保存，下次编辑再试）
export function cloudSaveChart(song) {
	if (!authUser()) return;
	api("PUT", "/charts/" + encodeURIComponent(song.id), song).catch(() => { /* 静默重试靠下次编辑 */ });
}
export function cloudDeleteChart(id) {
	if (!authUser()) return;
	api("DELETE", "/charts/" + encodeURIComponent(id)).catch(() => {});
}
