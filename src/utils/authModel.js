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

// 登录后同步：本地(游客期)曲目并入云端（updatedAt 新者胜），回写本地并返回合并结果
export async function syncChartsFromServer(localCharts) {
	const d = await api("POST", "/charts/merge", localCharts);
	return d.charts || [];
}

// 曲目增删改的云端镜像（登录时才走）。失败绝不静默：顶栏亮红点提示"云同步失败"，
// 否则服务端重启/换库/token 失效时用户以为在云端，实际全部丢——历史上因此出过数据事故
let cloudFailTimer = null;
const flagCloudFail = () => {
	window.dispatchEvent(new CustomEvent("fretboard:cloud-error"));
	if (cloudFailTimer) clearTimeout(cloudFailTimer);
	cloudFailTimer = setTimeout(() => window.dispatchEvent(new CustomEvent("fretboard:cloud-ok")), 8000);
};
export function cloudSaveChart(song) {
	if (!authUser()) return;
	api("PUT", "/charts/" + encodeURIComponent(song.id), song).catch(e => {
		if (e.status === 401) logoutQuiet(); // 会话失效：退回游客态让用户可见，而不是假装登录着
		flagCloudFail();
	});
}
export function cloudDeleteChart(id) {
	if (!authUser()) return;
	api("DELETE", "/charts/" + encodeURIComponent(id)).catch(e => {
		if (e.status === 401) logoutQuiet();
		flagCloudFail();
	});
}
// 会话失效静默退出（用户名从顶栏消失=可感知），本地数据不动
function logoutQuiet() {
	current = null;
	localStorage.removeItem(AUTH_KEY);
	emit();
}
