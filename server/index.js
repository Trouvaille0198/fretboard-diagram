// 账号服务（零依赖）：node:http + JSON 文件存储 + scrypt 密码哈希 + 随机 token 会话
// 数据目录 server/data/：users.json（用户+会话）、charts/<user>.json（曲目）
// 游客不经过这里（纯浏览器 localStorage），只有注册/登录用户走本服务。
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, "data");
const USERS_FILE = path.join(DATA, "users.json");
const CHARTS_DIR = path.join(DATA, "charts");
const TOKEN_TTL = 30 * 24 * 3600 * 1000; // 30 天

fs.mkdirSync(CHARTS_DIR, { recursive: true });

// ---- 存取（原子写：tmp + rename）----
const readJson = (file, fallback) => {
	try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};
const writeJson = (file, obj) => {
	const tmp = file + ".tmp";
	fs.writeFileSync(tmp, JSON.stringify(obj));
	fs.renameSync(tmp, file);
};
const users = () => readJson(USERS_FILE, { list: {} }); // { list: { name: { salt, hash, sessions: [{token, exp}] } } }
const saveUsers = (u) => writeJson(USERS_FILE, u);
const chartsFile = (name) => path.join(CHARTS_DIR, encodeURIComponent(name) + ".json");
const readCharts = (name) => readJson(chartsFile(name), []);
const writeCharts = (name, list) => writeJson(chartsFile(name), list);

// ---- 密码 ----
const hashPass = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString("hex");
const validName = (s) => typeof s === "string" && /^[a-zA-Z0-9_]{3,20}$/.test(s);
const validPass = (s) => typeof s === "string" && s.length >= 4 && s.length <= 64;

// ---- 会话 ----
const issueToken = (u, name) => {
	const token = crypto.randomBytes(32).toString("hex");
	u.list[name].sessions = (u.list[name].sessions || []).filter(s => s.exp > Date.now());
	u.list[name].sessions.push({ token, exp: Date.now() + TOKEN_TTL });
	saveUsers(u);
	return token;
};
const authUser = (req, url) => {
	const token = url.searchParams.get("token") || req.headers["x-auth-token"] || "";
	if (!token) return null;
	const u = users();
	for (const [name, info] of Object.entries(u.list)) {
		if ((info.sessions || []).some(s => s.token === token && s.exp > Date.now())) return { name, u };
	}
	return null;
};

// ---- 响应 ----
const json = (res, code, obj) => {
	res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
	res.end(JSON.stringify(obj));
};
const readBody = (req) => new Promise((ok) => {
	let buf = "";
	req.on("data", (c) => { buf += c; if (buf.length > 8 * 1024 * 1024) req.destroy(); });
	req.on("end", () => { try { ok(JSON.parse(buf || "{}")); } catch { ok({}); } });
});

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, "http://x");
	const p = url.pathname;
	if (req.method === "OPTIONS") return json(res, 204, {});

	// ---- 认证 ----
	if (p === "/api/auth/register" && req.method === "POST") {
		const { user, pass } = await readBody(req);
		if (!validName(user)) return json(res, 400, { error: "bad_name" });
		if (!validPass(pass)) return json(res, 400, { error: "bad_pass" });
		const u = users();
		if (u.list[user]) return json(res, 409, { error: "exists" });
		const salt = crypto.randomBytes(16).toString("hex");
		u.list[user] = { salt, hash: hashPass(pass, salt), sessions: [], createdAt: Date.now() };
		const token = issueToken(u, user);
		return json(res, 200, { token, user });
	}
	if (p === "/api/auth/login" && req.method === "POST") {
		const { user, pass } = await readBody(req);
		const u = users();
		const info = u.list[user];
		if (!info || hashPass(pass, info.salt) !== info.hash) return json(res, 401, { error: "bad_auth" });
		const token = issueToken(u, user);
		return json(res, 200, { token, user });
	}
	if (p === "/api/auth/logout" && req.method === "POST") {
		const a = authUser(req, url);
		if (!a) return json(res, 401, { error: "no_auth" });
		const token = url.searchParams.get("token") || req.headers["x-auth-token"];
		const info = a.u.list[a.name];
		info.sessions = (info.sessions || []).filter(s => s.token !== token);
		saveUsers(a.u);
		return json(res, 200, { ok: true });
	}
	if (p === "/api/auth/me" && req.method === "GET") {
		const a = authUser(req, url);
		return a ? json(res, 200, { user: a.name }) : json(res, 401, { error: "no_auth" });
	}

	// ---- 曲目（登录用户） ----
	if (p.startsWith("/api/charts")) {
		const a = authUser(req, url);
		if (!a) return json(res, 401, { error: "no_auth" });
		const list = readCharts(a.name);

		if (p === "/api/charts" && req.method === "GET") return json(res, 200, { charts: list });

		if (p === "/api/charts/merge" && req.method === "POST") {
			// 登录时把本地(游客期)曲目并入云端：同 id 以 updatedAt 新者胜，云端没有的直接进
			const body = await readBody(req);
			const incoming = Array.isArray(body) ? body : (body.charts || []);
			let merged = list.slice();
			for (const c of incoming) {
				if (!c || !c.id || !Array.isArray(c.measures)) continue;
				const i = merged.findIndex(x => x.id === c.id);
				if (i === -1) merged.push(c);
				else if ((c.updatedAt || 0) > (merged[i].updatedAt || 0)) merged[i] = c;
			}
			writeCharts(a.name, merged);
			return json(res, 200, { charts: merged });
		}

		const m = /^\/api\/charts\/([^/]+)$/.exec(p);
		if (m && req.method === "PUT") {
			const chart = await readBody(req);
			if (!chart || !chart.id || !Array.isArray(chart.measures)) return json(res, 400, { error: "bad_chart" });
			const stamped = { ...chart, updatedAt: Date.now() };
			const i = list.findIndex(x => x.id === chart.id);
			if (i === -1) list.unshift(stamped); else list[i] = stamped;
			writeCharts(a.name, list);
			return json(res, 200, { chart: stamped });
		}
		if (m && req.method === "DELETE") {
			writeCharts(a.name, list.filter(x => x.id !== decodeURIComponent(m[1])));
			return json(res, 200, { ok: true });
		}
	}
	json(res, 404, { error: "not_found" });
});

server.listen(PORT, "127.0.0.1", () => console.log(`[auth-server] http://127.0.0.1:${PORT}`));
