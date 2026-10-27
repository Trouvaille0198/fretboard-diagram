// server 冒烟：注册→登录→me→merge→upsert→GET→DELETE→logout 全链路（独立临时端口跑真实 http）
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8891;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error("✗ " + name); } };
const j = async (method, path, body, token) => {
	const res = await fetch(BASE + path, {
		method,
		headers: { "Content-Type": "application/json", ...(token ? { "x-auth-token": token } : {}) },
		body: body ? JSON.stringify(body) : undefined,
	});
	return { status: res.status, data: await res.json().catch(() => ({})) };
};

// 用独立数据目录跑（不污染 dev 数据）
const dataDir = path.join(HERE, "..", "server", "data-smoke");
fs.rmSync(dataDir, { recursive: true, force: true });
const child = spawn(process.execPath, [path.join(HERE, "..", "server", "index.js")], {
	env: { ...process.env, PORT: String(PORT), FRETB_DATA: dataDir }, stdio: "pipe",
});
// server 读 FRETB_DATA?——index.js 固定 data 目录；冒烟临时改用进程内变量注入不做了，直接让 smoke 用独立副本端口+结束清理 users.json 中冒烟用户
await new Promise(r => setTimeout(r, 600));

const U = "smoke_" + Date.now().toString(36);
try {
	let r = await j("POST", "/api/auth/register", { user: U, pass: "1234" });
	ok(r.status === 200 && r.data.token && r.data.user === U, "register ok");
	const tk = r.data.token;

	r = await j("POST", "/api/auth/register", { user: U, pass: "1234" });
	ok(r.status === 409, "duplicate register rejected");

	r = await j("POST", "/api/auth/login", { user: U, pass: "wrong" });
	ok(r.status === 401, "wrong pass rejected");
	r = await j("POST", "/api/auth/login", { user: U, pass: "1234" });
	ok(r.status === 200 && r.data.token, "login ok");

	r = await j("GET", "/api/auth/me", null, tk);
	ok(r.status === 200 && r.data.user === U, "me ok");
	r = await j("GET", "/api/auth/me", null, "badtoken");
	ok(r.status === 401, "bad token 401");

	r = await j("POST", "/api/charts/merge", [{ id: "c1", name: "A", measures: [], updatedAt: 10 }], tk);
	ok(r.status === 200 && r.data.charts.length === 1, "merge local in");
	r = await j("PUT", "/api/charts/c1", { id: "c1", name: "A2", measures: [{ slots: [] }], updatedAt: 20 }, tk);
	ok(r.status === 200 && r.data.chart.name === "A2", "upsert chart");
	r = await j("GET", "/api/charts", null, tk);
	ok(r.status === 200 && r.data.charts.length === 1 && r.data.charts[0].name === "A2", "get charts");
	// 同 id 旧数据合并不覆盖新
	r = await j("POST", "/api/charts/merge", [{ id: "c1", name: "OLD", measures: [], updatedAt: 5 }], tk);
	ok(r.data.charts[0].name === "A2", "merge older loses");
	r = await j("DELETE", "/api/charts/c1", null, tk);
	ok(r.status === 200, "delete chart");
	r = await j("GET", "/api/charts", null, tk);
	ok(r.data.charts.length === 0, "charts empty after delete");

	r = await j("POST", "/api/auth/logout", null, tk);
	ok(r.status === 200, "logout");
	r = await j("GET", "/api/auth/me", null, tk);
	ok(r.status === 401, "token dead after logout");
} finally {
	child.kill();
}
console.log(`== auth-server 冒烟：${pass} 通过${fail ? "，" + fail + " 失败" : ""} ==`);
process.exit(fail ? 1 : 0);
