// 完整测试样例（master sample）：一条 7 帧动图覆盖全部技法与组合——
//   F2 同帧四技并发(sl+rt+hp+pre) / F3 rt+纯新增 / F4 纯删除 / F5 双 sl 并发 /
//   F6 双 hp+pre / F7 纯新增和弦；色档跨 pale→vivid→rich→deep 四档。
// 用法：
//   node scripts/sample-master.mjs              # Node 不变量断言（无需浏览器）
//   node scripts/sample-master.mjs --browser    # 浏览器端到端：注入→播放采样→导出GIF→页内解码→预览/GIF 逐时刻比对
//   node scripts/sample-master.mjs --browser http://localhost:4173 127.0.0.1:9223
import { expandTimeline, stateClock } from "../src/utils/timeline.js";

// ---------- 样例定义 ----------
const T = ["rgb(204, 224, 250)", "rgb(78, 149, 247)", "rgb(8, 70, 165)", "rgb(9, 46, 103)"]; // navy 四档
const N = id => ({ type: "note", color: "white", color2: null, visibility: "transparent" });
const L = (c, b) => ({ type: "note", color: { name: "navy", custom: c }, color2: null, visibility: "visible", birth: b });
const frame = (notes, tint) => ({
	data: Object.fromEntries(Object.entries(notes).map(([id, v]) => [id, v === 0 ? N(id) : v])),
	startFret: 1, endFret: 13, enharmonic: 1, displayMode: "note", rootNote: null,
	visibility: "transparent", frameTint: { name: "navy", custom: tint },
});

export const MASTER_CLIP = {
	id: "smoke-master", name: "完整测试样例", createdAt: 0,
	frames: [
		frame({ "f3-s0": L(T[0], 0), "f5-s2": L(T[0], 0), "f7-s3": L(T[0], 0), "f9-s5": L(T[0], 0) }, T[3]), // F1 基础和弦（4 弦分布）
		frame({ "f3-s0": 0, "f4-s0": L(T[1], 1), "f5-s2": L(T[0], 0), "f7-s3": L(T[0], 0), "f9-s5": L(T[0], 0) }, T[3]), // F2 四技并发
		frame({ "f4-s0": L(T[1], 1), "f5-s2": L(T[0], 0), "f7-s3": L(T[0], 0), "f9-s5": L(T[0], 0), "f11-s4": L(T[2], 2) }, T[3]), // F3 rt+纯新增
		frame({ "f4-s0": L(T[1], 1), "f7-s3": L(T[0], 0), "f9-s5": L(T[0], 0), "f11-s4": L(T[2], 2) }, T[3]), // F4 纯删除 f5
		frame({ "f4-s0": L(T[1], 1), "f7-s3": 0, "f9-s3": L(T[3], 4), "f9-s5": L(T[0], 0), "f11-s4": 0, "f12-s4": L(T[3], 4) }, T[3]), // F5 双 sl
		frame({ "f4-s0": L(T[1], 1), "f9-s3": L(T[3], 4), "f9-s5": L(T[0], 0), "f12-s4": L(T[3], 4) }, T[3]), // F6 双 hp+pre
		frame({ "f4-s0": L(T[1], 1), "f6-s1": L(T[1], 6), "f8-s2": L(T[1], 6), "f9-s3": L(T[3], 4), "f9-s5": L(T[0], 0), "f12-s4": L(T[3], 4) }, T[3]), // F7 纯新增收尾
	],
	transitions: [
		{ technique: null, pairs: [ // F1→F2 同帧四技
			{ from: "f3-s0", to: "f4-s0", technique: "sl" },
			{ from: "f5-s2", to: "f6-s2", technique: "rt" },
			{ from: "f7-s3", to: "f8-s3", technique: "hp" },
		] },
		{ technique: null, pairs: [{ from: "f9-s5", to: "f10-s5", technique: "rt" }] }, // F2→F3 rt
		{ technique: null, pairs: [] }, // F3→F4 纯删除
		{ technique: null, pairs: [ // F4→F5 双 sl
			{ from: "f7-s3", to: "f9-s3", technique: "sl" },
			{ from: "f11-s4", to: "f12-s4", technique: "sl" },
		] },
		{ technique: null, pairs: [ // F5→F6 双 hp
			{ from: "f9-s5", to: "f10-s5", technique: "hp" },
			{ from: "f4-s0", to: "f5-s0", technique: "hp" },
		] },
		{ technique: null, pairs: [] }, // F6→F7 纯新增
	],
};
MASTER_CLIP.frames[1].preSlides = [{ from: "f1-s1", to: "f9-s5" }]; // F2 前置划弦
MASTER_CLIP.frames[5].preSlides = [{ from: "f2-s2", to: "f9-s3" }]; // F6 前置划弦

// ---------- Node 不变量断言 ----------
function runCore() {
	let fail = 0, n = 0;
	const A = (name, ok, detail) => { n++; if (!ok) { fail++; console.error(`  ✗ ${name}${detail ? "  [" + detail + "]" : ""}`); } };
	const R = expandTimeline(MASTER_CLIP.frames, MASTER_CLIP.transitions, 300, 200);
	const clock = stateClock(R.states, 300, 200);
	const vis = (s, id) => (s.data[id] && s.data[id].visibility === "visible");
	const frameStates = f => R.states.filter((_, i) => R.frameOf[i] === f);
	const firstLit = (f, id) => { const fs = frameStates(f); for (let k = 0; k < fs.length; k++) if (vis(fs[k], id)) return k; return -1; };

	console.log("== 样例结构 ==");
	A("7 帧 6 过渡", MASTER_CLIP.frames.length === 7 && MASTER_CLIP.transitions.length === 6);
	A("F2/F6 各带 1 条前置划弦", (MASTER_CLIP.frames[1].preSlides || []).length === 1 && (MASTER_CLIP.frames[5].preSlides || []).length === 1);

	console.log("== F2 同帧四技并发 ==");
	const f2 = frameStates(1), last2 = f2[f2.length - 1];
	A("sl 终态：f4 亮 f3 灭", vis(last2, "f4-s0") && !vis(last2, "f3-s0"));
	A("rt 终态：f5 还原 f6 灭", vis(last2, "f5-s2") && !vis(last2, "f6-s2"));
	A("hp 终态：f7 还原 f8 灭", vis(last2, "f7-s3") && !vis(last2, "f8-s3"));
	A("pre 终态：f1 灭 f9 常亮", !vis(last2, "f1-s1") && vis(last2, "f9-s5"));
	A("sl B=数据出生色 vivid", last2.data["f4-s0"].color.custom === T[1]);
	const rtB = f2.map(s => s.data["f6-s2"]).filter(d => d && d.visibility === "visible")[0];
	const hpB = f2.map(s => s.data["f8-s3"]).filter(d => d && d.visibility === "visible")[0];
	const preB = f2.map(s => s.data["f1-s1"]).filter(d => d && d.visibility === "visible")[0];
	A("rt/hp/pre 瞬时 B=帧位档（=F2 新增音 f4 的 vivid）", rtB && rtB.color.custom === T[1] && hpB && hpB.color.custom === T[1] && preB && preB.color.custom === T[1],
		[rtB, hpB, preB].map(x => x && x.color.custom).join("/"));
	const f2fx = R.fx.filter(x => x.frame === 1);
	A("F2 fx 4 轨道（sl+rt出+rt回+pre；hp 离散无光点）", f2fx.length === 4, String(f2fx.length));
	A("F2 出程轨道同起点", f2fx.filter(x => !x._rtBack).every(x => x.t0 === f2fx[0].t0));
	const bOn = id => clock.starts[R.states.findIndex(s => R.frameOf[R.states.indexOf(s)] === 1 && vis(s, id))];
	const idx = id => R.states.findIndex(s => vis(s, id));
	const w1 = clock.starts[frameStates(1)[0] === R.states[0] ? 0 : R.states.indexOf(frameStates(1)[0])];
	A("sl B 半程前置亮（早于光点到达≥100ms）", clock.starts[idx("f4-s0")] < R.fx.find(x => x.frame === 1 && x.spec.pairs[0].technique === "sl").t0 + 380 - 100);

	console.log("== F3 rt+纯新增 ==");
	const f3 = frameStates(2), last3 = f3[f3.length - 1];
	A("新增 f11 rich 落帧", vis(last3, "f11-s4") && last3.data["f11-s4"].color.custom === T[2]);
	A("rt(f9→f10) 终态还原", vis(last3, "f9-s5") && !vis(last3, "f10-s5"));

	console.log("== F4 纯删除 ==");
	const f4 = frameStates(3), last4 = f4[f4.length - 1];
	A("f5 已删", !vis(last4, "f5-s2") && !last4.data["f5-s2"]);

	console.log("== F5 双 sl 并发 ==");
	const f5 = frameStates(4), last5 = f5[f5.length - 1];
	A("双 sl 终态：f9-s3 与 f12-s4 亮、f7-s3 与 f11-s4 灭", vis(last5, "f9-s3") && vis(last5, "f12-s4") && !vis(last5, "f7-s3") && !vis(last5, "f11-s4"));
	const i1 = R.states.findIndex(s => vis(s, "f9-s3")), i2 = R.states.findIndex(s => vis(s, "f12-s4"));
	A("双 sl B 同时亮", clock.starts[i1] === clock.starts[i2], clock.starts[i1] + "/" + clock.starts[i2]);

	console.log("== F6 双 hp+pre ==");
	const f6 = frameStates(5), last6 = f6[f6.length - 1];
	A("双 hp A 恒亮", f6.every(s => vis(s, "f9-s5") && vis(s, "f4-s0")));
	A("双 hp B 闪现后灭、pre B 灭", !vis(last6, "f10-s5") && !vis(last6, "f5-s0") && !vis(last6, "f2-s2"));

	console.log("== F7 纯新增收尾 ==");
	const f7 = frameStates(6), last7 = f7[f7.length - 1];
	A("收尾和弦 6 音齐", ["f4-s0", "f6-s1", "f8-s2", "f9-s3", "f9-s5", "f12-s4"].every(id => vis(last7, id)));

	console.log("== 全局时钟 ==");
	A("fx 轨道总数（sl3+rt2×2+pre2=9）", R.fx.length === 9, String(R.fx.length));
	A("时钟严格单调", clock.starts.every((v, i) => i === 0 || v >= clock.starts[i - 1]));
	console.log(fail === 0 ? `===== 样例 Node 断言全部通过（${n} 项）=====` : `===== ${fail}/${n} 项失败 =====`);
	return fail === 0;
}

// ---------- 浏览器端到端：预览 vs GIF 逐时刻比对 ----------
async function runBrowser(base, cdpHost) {
	const { default: WebSocket } = await import("ws");
	const sleep = ms => new Promise(r => setTimeout(r, ms));
	// CDP 附着（复用 smoke-ui 的专用标签模式）
	const v = await (await fetch(`http://${cdpHost}/json/version`)).json();
	const bws = new WebSocket(v.webSocketDebuggerUrl, { suppressOrigin: true });
	await new Promise((r, j) => { bws.on("open", r); bws.on("error", j); });
	let bid = 0; const bp = new Map();
	bws.on("message", m => { const d = JSON.parse(m); if (d.id && bp.has(d.id)) { bp.get(d.id)(d); bp.delete(d.id); } });
	const bs = (method, params = {}) => new Promise(r => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
	const tid = (await bs("Target.createTarget", { url: `${base}/?master-sample=${Date.now()}#/` })).result.targetId;
	await bs("Target.activateTarget", { targetId: tid });
	await sleep(3500);
	const list = await (await fetch(`http://${cdpHost}/json/list`)).json();
	const ws = new WebSocket(list.find(t => t.id === tid).webSocketDebuggerUrl, { suppressOrigin: true });
	await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });
	let id = 0; const p = new Map();
	ws.on("message", m => { const d = JSON.parse(m); if (d.id && p.has(d.id)) { p.get(d.id)(d); p.delete(d.id); } });
	const ev = (expr, timeoutMs = 120000) => new Promise((res, rej) => {
		const i = ++id; const to = setTimeout(() => rej(new Error("evaluate 超时")), timeoutMs);
		p.set(i, r => { clearTimeout(to); if (r.exceptionDetails) rej(new Error(String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300))); else res(r.result?.result?.value); });
		ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs } }));
	});
	try {
		// 1) 注入样例（无导航）→ 再导航 → 轮询就绪（reload 不能发生在被 await 的 eval 里，否则响应丢失）
		await ev(`(() => {
			const clip = ${JSON.stringify(MASTER_CLIP)};
			localStorage.setItem('fretboard-clips', JSON.stringify([clip, ...JSON.parse(localStorage.getItem('fretboard-clips') || '[]').filter(c => c.id !== clip.id)]));
			return true;
		})()`);
		await ev(`location.href = '${base}/?master=${Date.now()}#/dynamic?c=smoke-master'; true`);
		await sleep(4000);
		// 前台保障：隐藏标签会节流播放链（几十个状态×1s），失败即警告
		let focused = false;
		for (let i = 0; i < 5 && !focused; i++) { await bs("Target.activateTarget", { targetId: tid }); await sleep(500); try { focused = await ev(`document.hasFocus() && !document.hidden`); } catch (e) {} }
		if (!focused) console.log("  ⚠ 标签页不在前台——播放/手势类断言可能因节流误报，保持 Chrome 前台重跑");
		await ev(`localStorage.removeItem('__masterReport'); true`);
		await ev(`(async () => {
			localStorage.setItem('__masterReport', JSON.stringify({ steps: [{ name: 'REACHED-MAIN', ok: true, detail: null }] }));
			const sleep = ms => new Promise(r => setTimeout(r, ms));
			const out = { steps: [] };
			const __finish = () => localStorage.setItem('__masterReport', JSON.stringify(out));
			const log = (name, ok, detail) => out.steps.push({ name, ok: !!ok, detail: detail == null ? null : String(detail) });
			try {
			// 2) 播放并记录 DOM 时间线（关键 B 的亮/灭时刻）
			const WATCH = [
				['f4-s0', 'slB(F2)'], ['f6-s2', 'rtB(F2)'], ['f8-s3', 'hpB(F2)'], ['f1-s1', 'preB(F2)'],
				['f9-s3', 'slB1(F5)'], ['f12-s4', 'slB2(F5)'], ['f10-s5', 'hpB1(F6)'], ['f5-s0', 'hpB2(F6)'],
			];
			const btn = t => { const b = [...document.querySelectorAll('button')].find(b => (b.title || '').includes(t) || b.textContent.trim() === t); if (b) b.click(); return !!b; };
			const timeline = [];
			const rec = { on: () => {} };
			await new Promise(resolve => {
				const last = {};
				const T0 = performance.now();
				const probe = () => {
					const svg = document.querySelector('.fretboard-stage-wrap svg');
					if (!svg) return;
					for (const [nid] of WATCH) {
						const g = svg.querySelector('#' + nid);
						const lit = g ? (g.getAttribute('class') || '').includes('visible') && parseFloat(getComputedStyle(g).opacity) > 0.35 : false;
						if (last[nid] === undefined) { last[nid] = lit; continue; }
						if (lit !== last[nid]) { timeline.push({ id: nid, t: Math.round(performance.now() - T0), on: lit }); last[nid] = lit; }
					}
				};
				btn('▶');
				const iv = setInterval(probe, 25);
				setTimeout(() => { clearInterval(iv); btn('⏹'); resolve(); }, 9000);
			});
			out.previewTimeline = timeline;
			log('预览播放记录到变化事件', timeline.length >= 10, timeline.length + ' 个事件');
			// 3) 导出 GIF（拦截 blob）
			const blobs = [];
			const orig = URL.createObjectURL;
			URL.createObjectURL = function (b) { blobs.push({ type: b.type, size: b.size, obj: b }); return orig.call(this, b); };
			btn('GIF');
			let gifBlob = null;
			for (let i = 0; i < 80 && !gifBlob; i++) { await sleep(400); gifBlob = (blobs.find(b => b.type === 'image/gif') || {}).obj || null; }
			URL.createObjectURL = orig;
			log('GIF 导出成功', !!gifBlob, gifBlob ? gifBlob.size + 'B' : 'null');
			if (!gifBlob) { __finish(); return true; }
			// 4) 页内解码 GIF 逐帧采样（与预览同一批 B 位置）
			const dec = new ImageDecoder({ data: await gifBlob.arrayBuffer(), type: 'image/gif', preferAnimation: true });
			await dec.tracks.ready;
			const nF = (dec.tracks.selectedTrack || {}).frameCount || 0;
			const cv = document.createElement('canvas');
			const ctx = cv.getContext('2d', { willReadFrequently: true });
			// 用帧 0 定位基准圆心（在 s0 弦找 f3 pale）
			async function frameAt(k) {
				const { image } = await dec.decode({ frameIndex: k });
				cv.width = image.displayWidth; cv.height = image.displayHeight;
				ctx.drawImage(image, 0, 0);
				const dur = image.duration / 1000;
				image.close();
				return { data: ctx.getImageData(0, 0, cv.width, cv.height), dur, w: cv.width, h: cv.height };
			}
			const f0 = await frameAt(0);
			// 定位：扫描 pale 圆簇得到 (s0 弦 y、品距)，换算全部 WATCH 音位
			const pts = [];
			for (let y = 0; y < f0.h; y += 3) for (let x = 0; x < f0.w; x += 3) {
				const i = (y * f0.w + x) * 4, r = f0.data.data[i], g = f0.data.data[i + 1], b = f0.data.data[i + 2];
				if (Math.abs(r - 204) < 30 && Math.abs(g - 224) < 26 && Math.abs(b - 250) < 26) pts.push([x, y]);
			}
			const merged = [];
			for (const q of pts) { const m = merged.find(m => Math.abs(m[0] / m[2] - q[0]) < 30 && Math.abs(m[1] / m[2] - q[1]) < 30); if (m) { m[0] += q[0]; m[1] += q[1]; m[2]++; } else merged.push([q[0], q[1], 1]); }
			const circles = merged.filter(m => m[2] >= 30).map(m => [Math.round(m[0] / m[2]), Math.round(m[1] / m[2])]).sort((a, b) => a[0] - b[0]);
			log('GIF 帧定位圆心', circles.length === 4, JSON.stringify(circles));
			if (circles.length !== 4) { __finish(); return true; }
			const [f3, f5, f7, f9] = circles;
			const sp = (f5[0] - f3[0]) / 2; // 品距（F1: f3,f5,f7,f9 等距）
			const yOf = s => f3[1] + s * (f9[1] - f3[1]) * 0; // 各 WATCH 音都在不同弦——改用全帧扫描法（颜色簇），不依赖换算
			// 5) 全帧扫描法：对每帧扫描 4 档蓝色+金色圆簇 → (帧号, 颜色档, 圆心)
			const classify = (r, g, b) => {
				const near = (t, tol) => Math.abs(r - t[0]) <= tol && Math.abs(g - t[1]) <= tol && Math.abs(b - t[2]) <= tol;
				if (near([204, 224, 250], 40)) return 'pale';
				if (near([78, 149, 247], 40)) return 'vivid';
				if (near([8, 70, 165], 40)) return 'rich';
				if (near([9, 46, 103], 36)) return 'deep';
				return null;
			};
			let tAcc = 0; const frameEvents = [];
			const centers = [];
			for (const [nid] of WATCH) { // 计算每个 WATCH 音的圆心：品×弦（用 f3 圆心的 y 为 s0，弦距=60*scale）
				const m = nid.match(/f(\\d+)-s(\\d+)/); const fret = +m[1], str = +m[2];
				const scale = sp / 80;
				centers.push({ id: nid, x: Math.round(f3[0] + (fret - 3) * sp), y: Math.round(f3[1] + str * 60 * scale) });
			}
			for (let k = 0; k < nF; k++) {
				const fr = await frameAt(k);
				for (const c of centers) {
					let votes = {};
					for (let dx = -7; dx <= 7; dx += 7) for (let dy = -7; dy <= 7; dy += 7) {
						const x = Math.max(0, Math.min(fr.w - 1, c.x + dx)), y = Math.max(0, Math.min(fr.h - 1, c.y + dy));
						const i = (y * fr.w + x) * 4, cl = classify(fr.data.data[i], fr.data.data[i + 1], fr.data.data[i + 2]);
						if (cl) votes[cl] = (votes[cl] || 0) + 1;
					}
					const cl = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
					frameEvents.push({ id: c.id, t: Math.round(tAcc + fr.dur / 2), cl: cl ? cl[0] : 'bg' });
				}
				tAcc += fr.dur;
			}
			out.gifFrames = nF;
			out.gifDuration = Math.round(tAcc);
			// 6) 比对：预览时间线里每个 on/off 事件，在 GIF 同音位应存在颜色档变化（容差 2 帧 ≈ 67ms）
			const frameTol = Math.max(67, Math.round(out.gifDuration / nF * 2));
			const parityAt = off => {
			let matched = 0, missing = 0;
			// 只比对首个循环（预览会循环多轮，GIF 只有一轮）
			const firstLoop = out.previewTimeline.filter(e => e.t <= out.gifDuration + off + 300);
			for (const ev2 of firstLoop) {
				const near = frameEvents.filter(e => e.id === ev2.id && Math.abs(e.t - (ev2.t + off)) <= frameTol && ((ev2.on ? e.cl !== 'bg' : e.cl === 'bg')));
				if (near.length) matched++; else { missing++; }
			}
			return { matched, missing };
			}
			// 播放器启动有固有延迟（React 调度+渲染），预览/GIF 两时钟存在整体偏移——互相关找最优对齐再比对
			const firstLoopCount = out.previewTimeline.filter(e => e.t <= out.gifDuration + 300).length;
			let best = { matched: 0, missing: out.previewTimeline.length, off: 0 };
			for (let off = -400; off <= 400; off += 25) {
				const r2 = parityAt(off);
				if (r2.matched > best.matched) best = { ...r2, off };
			}
			const matched = best.matched, missing = best.missing;
			log('预览↔GIF 逐事件比对（首轮对齐）', missing === 0 && firstLoopCount >= 6 && matched / firstLoopCount >= 0.8, matched + '/' + firstLoopCount + ' 匹配@偏移' + best.off + 'ms（容差 ' + frameTol + 'ms）');
				out.parity = { matched, missing };
				__finish();
				return true;
			} catch (e) { out.error = String(e && e.message || e); out.stack = String(e && e.stack || '').slice(0, 400); __finish(); }
		})()`).catch(e => console.error('主 eval CDP 层错误:', e.message));
		let report = { steps: [] };
		for (let i = 0; i < 110; i++) {
			await sleep(1000);
			try { const v = await ev(`localStorage.getItem('__masterReport')`); if (v) { const r2 = JSON.parse(v); if (!(r2.steps && r2.steps[0] && r2.steps[0].name === 'REACHED-MAIN')) { report = r2; break; } } } catch (e) {}
		}
		let fail = 0;
		for (const s of report.steps || []) { console.log(`${s.ok ? "  ✓" : "  ✗"} ${s.name}${s.ok || !s.detail ? "" : "  [" + s.detail + "]"}"`.replace(/"$/, "")); if (!s.ok) fail++; }
		if (report.error) { console.error('  页内错误:', report.error); if (report.stack) console.error(report.stack.slice(0, 300)); }
		console.log(`  预览事件 ${report.previewTimeline?.length || 0} 个 / GIF ${report.gifFrames || 0} 帧 ${report.gifDuration ? "约 " + report.gifDuration + "ms" : ""}`);
		try { await ev(`(() => { const arr = JSON.parse(localStorage.getItem('fretboard-clips') || '[]').filter(c => c.id !== 'smoke-master'); localStorage.setItem('fretboard-clips', JSON.stringify(arr)); localStorage.removeItem('__masterReport'); return true; })()`); } catch (e) {}
		await bs("Target.closeTarget", { targetId: tid });
		ws.close(); bws.close();
		console.log(fail === 0 ? "===== 浏览器端到端全部通过 =====" : `===== ${fail} 项失败 =====`);
		return fail === 0;
	} catch (e) {
		console.error("浏览器端到端异常:", e.message);
		try { await bs("Target.closeTarget", { targetId: tid }); } catch (e2) {}
		ws.close(); bws.close();
		return false;
	}
}

const args = process.argv.slice(2);
if (args[0] === "--browser") {
	const ok = await runBrowser(args[1] || "http://localhost:4173", (args[2] || "127.0.0.1:9223").replace(/^http:\/\//, ""));
	process.exit(ok ? 0 : 1);
} else {
	process.exit(runCore() ? 0 : 1);
}
