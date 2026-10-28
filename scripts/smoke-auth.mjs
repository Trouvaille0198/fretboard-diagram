// server 冒烟（SQLite 版）：固定账号 seed→登录→me→merge→upsert→GET→DELETE→logout→注册禁用，全链路真实 http + 独立临时 db
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8891;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(HERE, "..", "server", "data-smoke.db");
fs.rmSync(DB, { force: true });
fs.rmSync(DB + "-wal", { force: true });
fs.rmSync(DB + "-shm", { force: true });

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

const child = spawn(process.execPath, [path.join(HERE, "..", "server", "index.js")], {
	env: { ...process.env, PORT: String(PORT), FRETB_DB: DB }, stdio: "pipe",
});
await new Promise(r => setTimeout(r, 700));

try {
	// 注册已禁用（固定账号制）
	let r = await j("POST", "/api/auth/register", { user: "x", pass: "y" });
	ok(r.status === 403 && r.data.error === "register_disabled", "register disabled");

	// 固定账号：错密码拒绝、对密码登录
	r = await j("POST", "/api/auth/login", { user: "CoengFan", pass: "wrong" });
	ok(r.status === 401, "wrong pass rejected");
	r = await j("POST", "/api/auth/login", { user: "CoengFan", pass: "********" });
	ok(r.status === 200 && r.data.token && r.data.user === "CoengFan", "fixed account login");
	const tk = r.data.token;

	r = await j("GET", "/api/auth/me", null, tk);
	ok(r.status === 200 && r.data.user === "CoengFan", "me ok");
	r = await j("GET", "/api/auth/me", null, "badtoken");
	ok(r.status === 401, "bad token 401");

	r = await j("POST", "/api/charts/merge", [{ id: "c1", name: "A", measures: [], updatedAt: 10 }], tk);
	ok(r.status === 200 && r.data.charts.length === 1, "merge local in");
	r = await j("PUT", "/api/charts/c1", { id: "c1", name: "A2", measures: [{ slots: [] }] }, tk);
	ok(r.status === 200 && r.data.chart.name === "A2", "upsert chart");
	r = await j("GET", "/api/charts", null, tk);
	ok(r.status === 200 && r.data.charts.length === 1 && r.data.charts[0].name === "A2", "get charts");
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
fs.rmSync(DB, { force: true }); fs.rmSync(DB + "-wal", { force: true }); fs.rmSync(DB + "-shm", { force: true });
console.log(`== auth-server 冒烟：${pass} 通过${fail ? "，" + fail + " 失败" : ""} ==`);
process.exit(fail ? 1 : 0);
