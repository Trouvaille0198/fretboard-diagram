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
const j = async (method, path, body, token, clientId) => {
	const res = await fetch(BASE + path, {
		method,
		headers: { "Content-Type": "application/json", ...(token ? { "x-auth-token": token } : {}), ...(clientId ? { "x-client-id": clientId } : {}) },
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
	ok(r.status === 200 && r.data.items.length === 1, "merge local in");
	r = await j("PUT", "/api/charts/c1", { id: "c1", name: "A2", measures: [{ slots: [] }], updatedAt: Date.now() }, tk);
	ok(r.status === 200 && r.data.item.name === "A2", "upsert chart");
	r = await j("GET", "/api/charts", null, tk);
	ok(r.status === 200 && r.data.items.length === 1 && r.data.items[0].name === "A2", "get charts");
	r = await j("POST", "/api/charts/merge", [{ id: "c1", name: "OLD", measures: [], updatedAt: 5 }], tk);
	ok(r.data.items[0].name === "A2", "merge older loses");
	r = await j("DELETE", "/api/charts/c1", null, tk);
	ok(r.status === 200, "delete chart");
	r = await j("GET", "/api/charts", null, tk);
	ok(r.data.items.length === 0, "charts empty after delete");

	// clips（动图堆）同套语义
	r = await j("PUT", "/api/clips/cx1", { id: "cx1", name: "动图1", frames: [], updatedAt: Date.now() }, tk);
	ok(r.status === 200 && r.data.item.id === "cx1", "upsert clip");
	r = await j("GET", "/api/clips", null, tk);
	ok(r.status === 200 && r.data.items.length === 1 && r.data.items[0].name === "动图1", "get clips");
	r = await j("POST", "/api/clips/merge", [{ id: "cx2", name: "动图2", frames: [], updatedAt: 5 }], tk);
	ok(r.data.items.length === 2, "merge clip in");
	r = await j("DELETE", "/api/clips/cx1", null, tk);
	ok(r.status === 200, "delete clip");

	// 老客户端（不带 baseRev）：按到达顺序接受，不再拿两套时钟比大小判"陈旧覆盖"
	// （旧判据会把每一次正常保存都误判拒收——真实发生过静默丢同步）
	r = await j("PUT", "/api/charts/cx-old", { id: "cx-old", name: "v1", updatedAt: 1000 }, tk);
	ok(r.status === 200, "occ: first insert ok");
	r = await j("PUT", "/api/charts/cx-old", { id: "cx-old", name: "v2", updatedAt: 500 }, tk);
	ok(r.status === 200 && r.data.item.name === "v2", "occ: 旧客户端写入不再被时钟误判拒收");

	// ===== 同步协议 v2：rev / hash / baseRev / since =====
	// rev 单调递增且由服务端分配（客户端时钟不参与）
	r = await j("PUT", "/api/charts/rev1", { id: "rev1", name: "v1", measures: [] }, tk);
	ok(r.status === 200 && r.data.item.rev > 0 && Number.isInteger(r.data.item.rev), "rev: 服务端分配版本号");
	const rev1 = r.data.item.rev;
	r = await j("PUT", "/api/charts/rev1", { id: "rev1", name: "v2", measures: [] }, tk);
	ok(r.data.item.rev > rev1, "rev: 递增");
	const rev2 = r.data.item.rev;

	// 内容哈希 no-op：内容没变 → 不升 rev、不改库
	r = await j("PUT", "/api/charts/rev1", { id: "rev1", name: "v2", measures: [] }, tk);
	ok(r.status === 200 && r.data.noop === true && r.data.item.rev === rev2, "noop: 同样内容不升版本");

	// 客户端时钟不参与判定：updatedAt 很旧但内容变了，照样接受（不再被误判陈旧覆盖）
	r = await j("PUT", "/api/charts/rev1", { id: "rev1", name: "v3", measures: [], updatedAt: 1 }, tk);
	ok(r.status === 200 && r.data.item.name === "v3", "时钟无关: 旧 updatedAt 不再被拒");

	// baseRev 乐观并发：基于旧版本改 → 409 + 回传云端当前版本
	r = await j("PUT", "/api/charts/rev1", { id: "rev1", name: "冲突", measures: [], baseRev: rev1 }, tk);
	ok(r.status === 409 && r.data.error === "conflict" && r.data.item && r.data.item.rev === r.data.rev, "并发: baseRev 落后 → 409 冲突");
	const rev3 = (await j("GET", "/api/charts", null, tk)).data.items.find(c => c.id === "rev1").rev;

	// 基于最新版本改 → 接受
	r = await j("PUT", "/api/charts/rev1", { id: "rev1", name: "v4", measures: [], baseRev: rev3 }, tk);
	ok(r.status === 200 && r.data.item.rev > rev3, "并发: baseRev 最新 → 接受");

	// 增量拉取：?since= 只回 rev 更大的行
	const since = rev2;
	r = await j("GET", `/api/charts?since=${since}`, null, tk);
	ok(r.status === 200 && Array.isArray(r.data.items) && r.data.items.every(c => c.rev > since), "增量拉取: 只回 rev 更大的行");
	ok(r.data.items.some(c => c.id === "rev1"), "增量拉取: 含变更过的条目");

	// 墓碑：删除后增量拉取带 deleted
	r = await j("DELETE", "/api/charts/rev1", null, tk);
	const delRev = r.data.rev;
	r = await j("GET", `/api/charts?since=${since}`, null, tk);
	ok(r.data.deleted.some(d => d.id === "rev1" && d.rev === delRev), "增量拉取: 带删除墓碑");

	// 客户端标识：广播载荷带 clientId（各端据此跳过自己写的）
	r = await j("PUT", "/api/charts/cid1", { id: "cid1", name: "x", measures: [] }, tk, "client-A");
	ok(r.status === 200, "clientId: PUT 正常");

	// merge force：显式并入本机数据时本机版本覆盖云端
	r = await j("POST", "/api/charts/merge", { items: [{ id: "mrg1", name: "云端版", measures: [] }] }, tk);
	r = await j("POST", "/api/charts/merge", { items: [{ id: "mrg1", name: "本机版", measures: [] }], force: true }, tk);
	ok(r.data.items.some(c => c.id === "mrg1" && c.name === "本机版"), "merge force: 本机版本覆盖云端");
	// merge 非 force：云端版本更新时保留云端（游客数据 rev=0 不得覆盖已同步版本）
	const mrgRev = r.data.items.find(c => c.id === "mrg1").rev;
	r = await j("POST", "/api/charts/merge", { items: [{ id: "mrg1", name: "旧版", measures: [], rev: 0 }] }, tk);
	ok(r.data.items.some(c => c.id === "mrg1" && c.name === "本机版" && c.rev === mrgRev), "merge 默认: 云端更新则保留云端");

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
