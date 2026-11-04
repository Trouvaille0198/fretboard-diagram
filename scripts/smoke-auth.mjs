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

	// 分享链接：登录建短链 → 公开读（无 token）→ 同谱再分享复用同 id 且刷新内容 → 建需登录 → 撤销后 404
	r = await j("POST", "/api/share", { chartId: "c-share", data: "fretboard-chart:AAA" }, tk);
	ok(r.status === 200 && typeof r.data.id === "string" && r.data.id.length >= 6, "share create (authed)");
	const sid = r.data.id;
	r = await j("GET", `/api/share/${sid}`);
	ok(r.status === 200 && r.data.data === "fretboard-chart:AAA", "share public read (no token)");
	r = await j("POST", "/api/share", { chartId: "c-share", data: "fretboard-chart:BBB" }, tk);
	ok(r.status === 200 && r.data.id === sid, "share again reuses same id");
	r = await j("GET", `/api/share/${sid}`);
	ok(r.status === 200 && r.data.data === "fretboard-chart:BBB", "share snapshot refreshed");
	r = await j("POST", "/api/share", { chartId: "x", data: "y" });
	ok(r.status === 401, "share create needs auth");
	r = await j("GET", "/api/share/does-not-exist");
	ok(r.status === 404, "unknown share 404");
	r = await j("DELETE", `/api/share/${sid}`, null, tk);
	ok(r.status === 200 && r.data.removed === 1, "share revoke by owner");
	r = await j("GET", `/api/share/${sid}`);
	ok(r.status === 404, "revoked share 404");

	// ===== 实时分享：live=1 短链跟随作者 charts 表活谱子；切模式同 id；删谱回退最后直播版本；SSE 推送 =====
	const { packChart, unpackChartBundle } = await import("../src/utils/chartPack.js");
	const { createSong } = await import("../src/utils/chordChartModel.js");
	const liveSong = createSong("直播谱");
	r = await j("PUT", `/api/charts/${liveSong.id}`, liveSong, tk);
	ok(r.status === 200, "live: 谱子先入 charts 表");
	r = await j("POST", "/api/share", { chartId: liveSong.id, data: "fretboard-chart:SNAP0", live: 1 }, tk);
	ok(r.status === 200 && typeof r.data.id === "string", "live: 建实时分享");
	const lid = r.data.id;
	r = await j("GET", `/api/share/${lid}`);
	// 实时读取：返回的不是分享时的快照 SNAP0，而是活谱子现场打包（能解开且歌名对上）
	ok(r.status === 200 && r.data.live === 1 && Number.isFinite(r.data.rev) && r.data.rev > 0, "live: GET 带 live/rev");
	const got1 = (() => { try { return unpackChartBundle(r.data.data).song; } catch (e) { return null; } })();
	ok(got1 && got1.name === "直播谱", "live: 内容来自活谱子而非快照");
	// 作者保存 → 链接内容跟随
	const v2 = { ...liveSong, name: "直播谱v2", measures: [...(liveSong.measures || [])] };
	r = await j("PUT", `/api/charts/${liveSong.id}`, v2, tk);
	ok(r.status === 200, "live: 作者保存 v2");
	r = await j("GET", `/api/share/${lid}`);
	const got2 = (() => { try { return unpackChartBundle(r.data.data).song; } catch (e) { return null; } })();
	ok(got2 && got2.name === "直播谱v2", "live: 链接内容跟随保存");
	// 切回快照：同 id，内容回到 POST 的快照数据
	r = await j("POST", "/api/share", { chartId: liveSong.id, data: "fretboard-chart:SNAP1", live: 0 }, tk);
	ok(r.status === 200 && r.data.id === lid, "live: 切模式复用同 id");
	r = await j("GET", `/api/share/${lid}`);
	ok(r.status === 200 && r.data.data === "fretboard-chart:SNAP1" && r.data.live !== 1, "live: 关闭后回快照");
	// 再开实时（马上要用的 SSE 订阅建立在 live 分享上）
	r = await j("POST", "/api/share", { chartId: liveSong.id, data: "fretboard-chart:SNAP1", live: 1 }, tk);
	ok(r.data.id === lid, "live: 重开实时同 id");
	// 不带 live 的再分享：保持现有模式（重开分享弹窗刷新链接，不会把实时链接悄悄切回快照）
	r = await j("POST", "/api/share", { chartId: liveSong.id, data: "fretboard-chart:SNAP2" }, tk);
	ok(r.data.id === lid && r.data.live === 1, "live: 不传 live 保持现有模式");
	// SSE：查看端订阅 → 作者保存 → 收到 changed
	const sseOnce = async (path, trigger, timeoutMs = 2500) => {
		const ctrl = new AbortController();
		const res = await fetch(BASE + path, { signal: ctrl.signal });
		if (res.status !== 200) { ctrl.abort(); return { status: res.status, event: null }; }
		const reader = res.body.getReader();
		const dec = new TextDecoder();
		let buf = "";
		const got = new Promise((resolve) => {
			const pump = async () => {
				try {
					const { value, done } = await reader.read();
					if (done) return resolve(null);
					buf += dec.decode(value, { stream: true });
					if (buf.includes("event: changed")) return resolve("changed");
					pump();
				} catch (e) { resolve(null); }
			};
			pump();
		});
		await new Promise(r2 => setTimeout(r2, 50)); // 给服务端一拍登记连接
		await trigger();
		const ev = await Promise.race([got, new Promise(r2 => setTimeout(() => r2(null), timeoutMs))]);
		ctrl.abort();
		return { status: res.status, event: ev };
	};
	const v3 = { ...v2, name: "直播谱v3" };
	const sse = await sseOnce(`/api/share/${lid}/events`, () => j("PUT", `/api/charts/${liveSong.id}`, v3, tk));
	ok(sse.status === 200 && sse.event === "changed", "live SSE: 作者保存推送到查看端");
	r = await j("GET", `/api/share/${lid}`);
	const got3 = (() => { try { return unpackChartBundle(r.data.data).song; } catch (e) { return null; } })();
	ok(got3 && got3.name === "直播谱v3", "live: SSE 后内容为 v3（并 write-through 落回快照列）");
	// 作者删谱：链接不死，回退到最后直播过的版本（write-through 的 v3，而非分享时的 SNAP1）
	r = await j("DELETE", `/api/charts/${liveSong.id}`, null, tk);
	ok(r.status === 200, "live: 作者删谱");
	r = await j("GET", `/api/share/${lid}`);
	const got4 = (() => { try { return unpackChartBundle(r.data.data).song; } catch (e) { return null; } })();
	ok(r.status === 200 && got4 && got4.name === "直播谱v3" && r.data.live !== 1, "live: 删谱后回退最后直播版本");
	// SSE 端点：未知分享 404
	const nf = await fetch(BASE + "/api/share/nope/events");
	ok(nf.status === 404, "live SSE: 未知分享 404");
	try { await nf.body.cancel(); } catch (e) { /* 已断 */ }
	r = await j("DELETE", `/api/share/${lid}`, null, tk);
	ok(r.status === 200 && r.data.removed === 1, "live: 撤销实时分享");

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
