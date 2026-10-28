// 账号服务：固定账号（暂不开放注册）+ SQLite 单文件存储（server/data.db，整个文件拷走即完成转移）
// 表：users(name, salt, hash) / sessions(token, name, exp) / charts(name, id, data, updated_at)
// 游客不经过这里（纯浏览器 localStorage），只有登录用户走本服务。
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const PORT = Number(process.env.PORT || 8787);
const DB_FILE = process.env.FRETB_DB || path.join(path.dirname(fileURLToPath(import.meta.url)), "data.db");
// 固定账号（暂不开放注册）：用户名 / 密码写死在服务端，首次启动自动入库
const FIXED_USER = process.env.FRETB_USER || "CoengFan";
const FIXED_PASS = process.env.FRETB_PASS || "********";
const TOKEN_TTL = 30 * 24 * 3600 * 1000; // 30 天

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, name TEXT NOT NULL, exp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS charts (name TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (name, id));
`);

const hashPass = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString("hex");
// 固定账号 seed：不存在则建（改密码 = 删 users 行 + 重启；也可用环境变量 FRETB_USER/FRETB_PASS 覆盖）
if (!db.prepare("SELECT 1 FROM users WHERE name = ?").get(FIXED_USER)) {
	const salt = crypto.randomBytes(16).toString("hex");
	db.prepare("INSERT INTO users (name, salt, hash, created_at) VALUES (?, ?, ?, ?)")
		.run(FIXED_USER, salt, hashPass(FIXED_PASS, salt), Date.now());
}

const issueToken = (name) => {
	db.prepare("DELETE FROM sessions WHERE exp < ?").run(Date.now());
	const token = crypto.randomBytes(32).toString("hex");
	db.prepare("INSERT INTO sessions (token, name, exp) VALUES (?, ?, ?)").run(token, name, Date.now() + TOKEN_TTL);
	return token;
};
const authUser = (req, url) => {
	const token = url.searchParams.get("token") || req.headers["x-auth-token"] || "";
	if (!token) return null;
	const row = db.prepare("SELECT name FROM sessions WHERE token = ? AND exp > ?").get(token, Date.now());
	return row ? row.name : null;
};

const json = (res, code, obj) => {
	res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
	res.end(JSON.stringify(obj));
};
const readBody = (req) => new Promise((ok) => {
	let buf = "";
	req.on("data", (c) => { buf += c; if (buf.length > 8 * 1024 * 1024) req.destroy(); });
	req.on("end", () => { try { ok(JSON.parse(buf || "{}")); } catch { ok({}); } });
});
const chartsOf = (name) => db.prepare("SELECT data FROM charts WHERE name = ? ORDER BY updated_at DESC")
	.all(name).map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, "http://x");
	const p = url.pathname;
	if (req.method === "OPTIONS") return json(res, 204, {});

	if (p === "/api/auth/login" && req.method === "POST") {
		const { user, pass } = await readBody(req);
		const info = db.prepare("SELECT name, salt, hash FROM users WHERE name = ?").get(String(user || ""));
		if (!info || hashPass(String(pass || ""), info.salt) !== info.hash) return json(res, 401, { error: "bad_auth" });
		return json(res, 200, { token: issueToken(info.name), user: info.name });
	}
	if (p === "/api/auth/register" && req.method === "POST") {
		return json(res, 403, { error: "register_disabled" }); // 暂不开放注册：账号固定在服务端
	}
	if (p === "/api/auth/logout" && req.method === "POST") {
		const token = url.searchParams.get("token") || req.headers["x-auth-token"] || "";
		db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
		return json(res, 200, { ok: true });
	}
	if (p === "/api/auth/me" && req.method === "GET") {
		const name = authUser(req, url);
		return name ? json(res, 200, { user: name }) : json(res, 401, { error: "no_auth" });
	}

	if (p.startsWith("/api/charts")) {
		const name = authUser(req, url);
		if (!name) return json(res, 401, { error: "no_auth" });

		if (p === "/api/charts" && req.method === "GET") return json(res, 200, { charts: chartsOf(name) });

		if (p === "/api/charts/merge" && req.method === "POST") {
			// 登录时把本地(游客期)曲目并入云端：同 id 以 updatedAt 新者胜，云端没有的直接进
			const body = await readBody(req);
			const incoming = Array.isArray(body) ? body : (body.charts || []);
			const upsert = db.prepare(`
				INSERT INTO charts (name, id, data, updated_at) VALUES (@name, @id, @data, @updated_at)
				ON CONFLICT (name, id) DO UPDATE SET data = @data, updated_at = @updated_at
				WHERE @updated_at > charts.updated_at
			`);
			const tx = db.transaction((list) => {
				for (const c of list) {
					if (!c || !c.id || !Array.isArray(c.measures)) continue;
					upsert.run({ name, id: c.id, data: JSON.stringify(c), updated_at: c.updatedAt || 0 });
				}
			});
			tx(incoming);
			return json(res, 200, { charts: chartsOf(name) });
		}

		const m = /^\/api\/charts\/([^/]+)$/.exec(p);
		if (m && req.method === "PUT") {
			const chart = await readBody(req);
			if (!chart || !chart.id || !Array.isArray(chart.measures)) return json(res, 400, { error: "bad_chart" });
			const stamped = { ...chart, updatedAt: Date.now() };
			db.prepare(`
				INSERT INTO charts (name, id, data, updated_at) VALUES (?, ?, ?, ?)
				ON CONFLICT (name, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
			`).run(name, chart.id, JSON.stringify(stamped), stamped.updatedAt);
			return json(res, 200, { chart: stamped });
		}
		if (m && req.method === "DELETE") {
			db.prepare("DELETE FROM charts WHERE name = ? AND id = ?").run(name, decodeURIComponent(m[1]));
			return json(res, 200, { ok: true });
		}
	}
	json(res, 404, { error: "not_found" });
});

server.listen(PORT, "127.0.0.1", () => console.log(`[auth-server] http://127.0.0.1:${PORT} db=${DB_FILE}`));
