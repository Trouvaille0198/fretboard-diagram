// 账号服务：固定账号（暂不开放注册）+ SQLite 单文件存储（server/data.db，整个文件拷走即完成转移）
// 表：users(name, salt, hash) / sessions(token, name, exp) / charts(name,id,data,updated_at,rev,hash) / clips(同)
//      tombstones(name, tbl, id, at, rev) / counters(name, tbl, rev)
// charts=和弦谱曲目；clips=动图堆。游客不经过这里（纯浏览器 localStorage），只有登录用户走本服务。
//
// 同步协议（对齐市面成熟做法）：
//   · rev —— 服务端分配的单调递增版本号（每用户每表一条计数线）。客户端改哪一版就带 baseRev，
//            服务端据此判"是不是基于旧版本改的"，比客户端时钟可靠（两台设备时钟不一致是常态）。
//   · hash —— 内容哈希（剔除 updatedAt/rev 等易变字段）。内容没变就不写库、不升 rev、不广播（幂等 no-op）。
//   · ?since=rev —— 增量拉取：只回 rev 更大的行 + 墓碑，客户端不必每次全量重拉。
//   · x-client-id —— 客户端标识：SSE 广播带回来，客户端据此跳过"自己写的"（不再靠时间窗猜）。
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
CREATE TABLE IF NOT EXISTS clips  (name TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (name, id));
CREATE TABLE IF NOT EXISTS tombstones (name TEXT NOT NULL, tbl TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (name, tbl, id));
CREATE TABLE IF NOT EXISTS counters (name TEXT NOT NULL, tbl TEXT NOT NULL, rev INTEGER NOT NULL, PRIMARY KEY (name, tbl));
-- 回收站：删除的曲目/动图先落这里，10 天后自动永久清除（可在此期间还原）
CREATE TABLE IF NOT EXISTS trash (name TEXT NOT NULL, tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (name, tbl, id));
`);

// 迁移：加 rev / hash 列（旧库自动补，data 不动）——SQLite 没有 ADD COLUMN IF NOT EXISTS，手工判断
const hasCol = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
for (const t of ["charts", "clips"]) {
	if (!hasCol(t, "rev")) db.exec(`ALTER TABLE ${t} ADD COLUMN rev INTEGER NOT NULL DEFAULT 0`);
	if (!hasCol(t, "hash")) db.exec(`ALTER TABLE ${t} ADD COLUMN hash TEXT NOT NULL DEFAULT ''`);
}
if (!hasCol("tombstones", "rev")) db.exec("ALTER TABLE tombstones ADD COLUMN rev INTEGER NOT NULL DEFAULT 0");

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
const authName = (req, url) => {
	const token = url.searchParams.get("token") || req.headers["x-auth-token"] || "";
	if (!token) return null;
	const row = db.prepare("SELECT name FROM sessions WHERE token = ? AND exp > ?").get(token, Date.now());
	return row ? row.name : null;
};

const json = (res, code, obj) => {
	res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
	res.end(JSON.stringify(obj));
};

// ===== 版本号（rev）与内容哈希 =====
// rev：服务端分配的单调递增整数，每用户每表一条计数线。只增不减，跨设备可比，
//      客户端改哪一版就带 baseRev 回来，服务端据此判断"是不是基于旧版本改的"。
//      比 updatedAt（客户端时钟）可靠得多——两台设备时钟不一致是常态。
const nextRevStmt = db.prepare(`
	INSERT INTO counters (name, tbl, rev) VALUES (@name, @tbl, 1)
	ON CONFLICT (name, tbl) DO UPDATE SET rev = rev + 1
	RETURNING rev
`);
const curRevStmt = db.prepare("SELECT rev FROM counters WHERE name = ? AND tbl = ?");
const nextRev = (name, tbl) => nextRevStmt.get({ name, tbl }).rev;
const currentRev = (name, tbl) => (curRevStmt.get(name, tbl) || { rev: 0 }).rev;

// 内容哈希：剔除易变字段（updatedAt/rev/baseRev）后取 SHA1。
// 内容一样 = 同一个版本，不该写库、不该升 rev、不该广播（幂等 no-op，也顺手掐掉回环 PUT 的写放大）。
const VOLATILE = new Set(["updatedAt", "rev", "baseRev"]);
const hashItem = (item) => {
	const clean = {};
	for (const k of Object.keys(item)) if (!VOLATILE.has(k)) clean[k] = item[k];
	return crypto.createHash("sha1").update(JSON.stringify(clean)).digest("hex");
};
const readBody = (req) => new Promise((ok) => {
	let buf = "";
	req.on("data", (c) => { buf += c; if (buf.length > 8 * 1024 * 1024) req.destroy(); });
	req.on("end", () => { try { ok(JSON.parse(buf || "{}")); } catch { ok({}); } });
});

// ===== 集合（charts/clips 同一套语义：列表 / merge / 单条 upsert / 单条删除）=====
const rowsOf = (table, name) => db.prepare(`SELECT data FROM ${table} WHERE name = ? ORDER BY updated_at DESC`)
	.all(name).map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);

const handleCollection = async (table, req, res, url, p, name) => {
	const clientId = req.headers["x-client-id"] || null;
	if (p === `/api/${table}` && req.method === "GET") {
		const since = Number(url.searchParams.get("since") || 0);
		if (since > 0) {
			// 增量拉取：只回 rev 更大的行（外加墓碑），客户端不必每次全量重拉
			const items = db.prepare(`SELECT data FROM ${table} WHERE name = ? AND rev > ? ORDER BY rev ASC`)
				.all(name, since).map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);
			const deleted = db.prepare("SELECT id, rev FROM tombstones WHERE name = ? AND tbl = ? AND rev > ?")
				.all(name, table, since).map(r => ({ id: r.id, rev: r.rev }));
			json(res, 200, { items, deleted, rev: currentRev(name, table) });
			return true;
		}
		json(res, 200, { items: rowsOf(table, name), rev: currentRev(name, table) });
		return true;
	}
	if (p === `/api/${table}/merge` && req.method === "POST") {
		// 登录时把本地(游客期)数据并入云端。
		// force=false（默认）：同 id 以 rev 新者胜，云端版本更新且本机没有更新的版本 → 保留云端
		// force=true（用户显式点"并入本机数据"）：本机版本覆盖云端——游客期的本地编辑绝不静默丢弃
		const body = await readBody(req);
		const incoming = Array.isArray(body) ? body : (body.items || []);
		const force = !Array.isArray(body) && !!body.force;
		const upsert = db.prepare(`
			INSERT INTO ${table} (name, id, data, updated_at, rev, hash) VALUES (@name, @id, @data, @updated_at, @rev, @hash)
			ON CONFLICT (name, id) DO UPDATE SET data = @data, updated_at = @updated_at, rev = @rev, hash = @hash
		`);
		const tx = db.transaction((list) => {
			for (const c of list) {
				if (!c || !c.id) continue;
				if (tombstoned(name, table, c.id, c.updatedAt)) continue; // 已删：旧数据不得复活
				const hash = hashItem(c);
				const stored = db.prepare(`SELECT rev FROM ${table} WHERE name = ? AND id = ?`).get(name, c.id);
				if (!force && stored && stored.rev > (Number(c.rev) || 0)) continue; // 云端更新：保留云端
				const rev = nextRev(name, table);
				const stamped = { ...c, updatedAt: Date.now(), rev };
				upsert.run({ name, id: c.id, data: JSON.stringify(stamped), updated_at: stamped.updatedAt, rev, hash });
			}
		});
		tx(incoming);
		json(res, 200, { items: rowsOf(table, name), rev: currentRev(name, table) });
		return true;
	}
	const m = new RegExp(`^/api/${table}/([^/]+)$`).exec(p);
	if (m && req.method === "PUT") {
		const item = await readBody(req);
		if (!item || !item.id) { json(res, 400, { error: "bad_item" }); return true; }
		// 必需字段守门：缺失补默认（脏数据进库会让所有端渲染崩溃）
		if (table === "charts" && !item.key) item.key = { root: 0, minor: false };
		if (table === "charts") { item.timeSig = item.timeSig || 4; item.bpm = item.bpm || 72; }
		const hash = hashItem(item);
		const stored = db.prepare(`SELECT data, updated_at, rev, hash FROM ${table} WHERE name = ? AND id = ?`).get(name, item.id);
		if (stored) {
			// ① 幂等 no-op：内容一模一样 → 不写库、不升 rev、不广播（"只是打开了一下"这类空写就此消失）
			if (stored.hash && stored.hash === hash) {
				json(res, 200, { item: JSON.parse(stored.data), noop: true, rev: stored.rev });
				return true;
			}
			// ② 乐观并发：客户端带 baseRev（它改的那一版）。baseRev 落后 = 别人先改了 → 拒收并回传云端当前版本
			const baseRev = item.baseRev;
			if (baseRev != null && Number(baseRev) < stored.rev) {
				json(res, 409, { error: "conflict", item: JSON.parse(stored.data), rev: stored.rev });
				return true;
			}
			// ③ 老客户端没带 baseRev：按到达顺序接受（后写胜）。
			//    旧实现拿"客户端时钟的 updatedAt"跟"服务端时钟的 updated_at"比大小——两套时钟不可比，
			//    客户端时钟慢一点就会把每一次正常保存都判成陈旧覆盖而静默拒收（真实发生过）。
			//    内容相同的回环写由上面的哈希 no-op 挡住，不会造成写放大。
		}
		if (tombstoned(name, table, item.id, item.updatedAt)) { json(res, 200, { item: { ...item }, resurrectBlocked: true }); return true; }
		const rev = nextRev(name, table);
		const stamped = { ...item, updatedAt: Date.now(), rev };
		delete stamped.baseRev;
		const body = JSON.stringify(stamped);
		db.prepare(`
			INSERT INTO ${table} (name, id, data, updated_at, rev, hash) VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT (name, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, rev = excluded.rev, hash = excluded.hash
		`).run(name, item.id, body, stamped.updatedAt, rev, hash);
		if (shouldBroadcast(table, item.id, body)) broadcast("changed", { table, id: item.id, rev, clientId }); // 带 rev 与来源：客户端据此跳过自己的写
		json(res, 200, { item: stamped, rev });
		return true;
	}
	if (m && req.method === "DELETE") {
		const id = decodeURIComponent(m[1]);
		const rev = nextRev(name, table);
		// 删除＝先进回收站（10 天后可还原），不是立即丢弃——误删的救命绳
		const row = db.prepare(`SELECT data FROM ${table} WHERE name = ? AND id = ?`).get(name, id);
		if (row) {
			db.prepare("INSERT OR REPLACE INTO trash (name, tbl, id, data, at) VALUES (?,?,?,?,?)")
				.run(name, table, id, row.data, Date.now());
		}
		db.prepare(`DELETE FROM ${table} WHERE name = ? AND id = ?`).run(name, id);
		db.prepare("INSERT OR REPLACE INTO tombstones (name, tbl, id, at, rev) VALUES (?, ?, ?, ?, ?)").run(name, table, id, Date.now(), rev);
		broadcast("deleted", { table, id, rev, clientId });
		json(res, 200, { ok: true, rev, trashed: !!row });
		return true;
	}
	return false;
};

// ===== 实时同步（SSE）：登录客户端订阅，任何曲目/动图写入后广播，各端拉取合并 =====
const sseClients = new Set();
const broadcast = (type, payload = {}) => {
	for (const c of sseClients) {
		try { c.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`); } catch (e) { sseClients.delete(c); }
	}
};
// 写入去重：同 id 内容哈希没变就不广播（防旧客户端的保存回环被放大；多端幂等）
const lastWriteSig = new Map(); // `${table}|${id}` → 内容哈希
const shouldBroadcast = (table, id, hash) => {
	const key = `${table}|${id}`;
	if (lastWriteSig.get(key) === hash) return false;
	lastWriteSig.set(key, hash);
	return true;
};

// 删除墓碑：此后 merge/PUT 想写回同 id，必须比删除时刻新（防"本地旧数据经 merge 复活已删曲"）
const tombstoned = (name, tbl, id, updatedAt) => {
	const t = db.prepare("SELECT at FROM tombstones WHERE name = ? AND tbl = ? AND id = ?").get(name, tbl, id);
	return !!t && (updatedAt || 0) <= t.at;
};


// ===== 回收站：删除的曲目/动图先落 trash，10 天后自动永久清除，期间可还原 =====
// 列表 GET /api/trash | 还原 POST /api/trash/restore {tbl,id} | 彻底删除 DELETE /api/trash/:tbl/:id
const TRASH_TTL = 10 * 24 * 3600 * 1000; // 10 天
const purgeExpiredTrash = () => {
	const n = db.prepare("DELETE FROM trash WHERE at < ?").run(Date.now() - TRASH_TTL).changes;
	return n;
};
const handleTrash = async (req, res, url, p, name) => {
	if (!p.startsWith("/api/trash")) return false;
	purgeExpiredTrash(); // 每次访问回收站顺手清过期条目
	if (p === "/api/trash" && req.method === "GET") {
		const items = db.prepare("SELECT tbl, id, data, at FROM trash WHERE name = ? ORDER BY at DESC")
			.all(name)
			.map(r => {
				let payload = null;
				try { payload = JSON.parse(r.data); } catch { /* 坏数据跳过 */ }
				return { tbl: r.tbl, id: r.id, at: r.at, item: payload };
			})
			.filter(r => r.item);
		json(res, 200, { items, ttl: TRASH_TTL });
		return true;
	}
	if (p === "/api/trash/restore" && req.method === "POST") {
		const body = await readBody(req);
		const tbl = String(body.tbl || "");
		const id = String(body.id || "");
		if (!["charts", "clips"].includes(tbl) || !id) { json(res, 400, { error: "bad_request" }); return true; }
		const row = db.prepare("SELECT data FROM trash WHERE name = ? AND tbl = ? AND id = ?").get(name, tbl, id);
		if (!row) { json(res, 404, { error: "not_found" }); return true; }
		// 还原 = 写回主表 + 清掉墓碑（墓碑会拦旧数据复活）+ 移出回收站
		let item;
		try { item = JSON.parse(row.data); } catch { json(res, 500, { error: "bad_data" }); return true; }
		const rev = nextRev(name, tbl);
		const stamped = { ...item, updatedAt: Date.now(), rev };
		db.prepare(`INSERT OR REPLACE INTO ${tbl} (name, id, data, updated_at, rev, hash) VALUES (?,?,?,?,?,?)`)
			.run(name, id, JSON.stringify(stamped), stamped.updatedAt, rev, hashItem(stamped));
		db.prepare("DELETE FROM tombstones WHERE name = ? AND tbl = ? AND id = ?").run(name, tbl, id);
		db.prepare("DELETE FROM trash WHERE name = ? AND tbl = ? AND id = ?").run(name, tbl, id);
		broadcast("changed");
		json(res, 200, { ok: true, item: stamped });
		return true;
	}
	const m2 = /^\/api\/trash\/([^/]+)\/([^/]+)$/.exec(p);
	if (m2 && req.method === "DELETE") {
		const tbl = decodeURIComponent(m2[1]);
		const id = decodeURIComponent(m2[2]);
		db.prepare("DELETE FROM trash WHERE name = ? AND tbl = ? AND id = ?").run(name, tbl, id);
		json(res, 200, { ok: true });
		return true;
	}
	return false;
};

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, "http://x");
	const p = url.pathname;
	if (process.env.FRETB_LOG) console.log("[req]", req.method, p, String(req.headers["x-auth-token"] || "").slice(0, 8));
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
		const name = authName(req, url);
		return name ? json(res, 200, { user: name }) : json(res, 401, { error: "no_auth" });
	}

	const name = authName(req, url);
	if (!name) return json(res, 401, { error: "no_auth" });

	if (p === "/api/events" && req.method === "GET") {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-store",
			"Access-Control-Allow-Origin": "*",
			Connection: "keep-alive",
		});
		res.write("retry: 3000\n\n");
		sseClients.add(res);
		req.on("close", () => sseClients.delete(res));
		return;
	}

	for (const table of ["charts", "clips"]) {
		if (await handleCollection(table, req, res, url, p, name)) return; // 广播在 PUT/DELETE 内部（带内容去重）
	}
	if (await handleTrash(req, res, url, p, name)) return;
	json(res, 404, { error: "not_found" });
});

server.listen(PORT, "127.0.0.1", () => console.log(`[auth-server] http://127.0.0.1:${PORT} db=${DB_FILE}`));

// 回收站定时清理：过期 10 天的条目永久清除（访问回收站时也会顺手清一次，这里兜底无人访问的情况）
setInterval(purgeExpiredTrash, 6 * 3600 * 1000).unref?.();
