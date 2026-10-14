// 浏览器端到端冒烟：CDP 驱动真实 UI（node scripts/smoke-ui.mjs [基础URL] [CDP端口]）
// 前置：① vite build && vite preview（默认 4173）② 调试 Chrome 带 --remote-debugging-port=9223 且窗口前台
// 覆盖：路由 / 普通编辑 / 动态编辑（帧管理+四技手势）/ 播放器 / 动图堆 / 导出 / Ctrl+C 守卫
// 测试自建 clip 一律 smoke- 前缀，结束自动清理，不动用户数据。
import WebSocket from "ws";

const BASE = process.argv[2] || "http://localhost:4173";
const CDP = process.argv[3] || "127.0.0.1:9223";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0, n = 0;
const A = (name, ok, detail) => { n++; console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok || !detail ? "" : "  [" + detail + "]"}`); if (!ok) fail++; };

async function cdp() {
	// 专用冒烟标签：新建 → 用完即关，不碰用户已开的标签
	const v = await (await fetch(`http://${CDP}/json/version`)).json();
	const bws = new WebSocket(v.webSocketDebuggerUrl, { suppressOrigin: true });
	await new Promise((r, j) => { bws.on("open", r); bws.on("error", j); });
	let bid = 0;
	const bpend = new Map();
	bws.on("message", m => { const d = JSON.parse(m); if (d.id && bpend.has(d.id)) { bpend.get(d.id)(d); bpend.delete(d.id); } });
	const bsend = (method, params = {}) => new Promise(r => { const i = ++bid; bpend.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
	const created = await bsend("Target.createTarget", { url: `${BASE}/?smoke=${Date.now()}#/` });
	const targetId = created.result.targetId;
	await bsend("Target.activateTarget", { targetId });
	const list = await (await fetch(`http://${CDP}/json/list`)).json();
	const { webSocketDebuggerUrl } = list.find(t => t.id === targetId);
	const ws = new WebSocket(webSocketDebuggerUrl, { suppressOrigin: true });
	await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });
	let id = 0;
	const pending = new Map();
	ws.on("message", m => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
	const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
	const raw = async (expr, timeoutMs = 120000) => send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs });
	// 上下文销毁（页面加载/跳转竞态）会返回 error 且无 result——静默重试而不是吞成 undefined
	const ev = async (expr) => {
		for (let i = 0; i < 6; i++) {
			const r = await raw(expr);
			if (r.exceptionDetails) throw new Error("页面异常: " + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400));
			if (r.result?.result) return r.result.result.value;
			await sleep(400);
		}
		throw new Error("evaluate 反复失败（上下文销毁）: " + expr.slice(0, 80));
	};
	const rawT = (expr) => send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, timeout: 120000 });
	const activate = () => bsend("Target.activateTarget", { targetId });
	const close = async () => { try { ws.close(); await bsend("Target.closeTarget", { targetId }); } catch (e) { /* 忽略 */ } bws.close(); };
	return { ws, ev, rawT, close, activate };
}

const c = await cdp();
console.log(`目标: ${BASE}（隐藏标签会节流定时器，手势用例需要窗口前台）`);

// 等应用加载完成（svg 出现）
let booted = false;
for (let i = 0; i < 40 && !booted; i++) { await sleep(300); try { booted = await c.ev(`!!document.querySelector('svg')`); } catch (e) { /* 重试 */ } }
if (!booted) { console.error("应用未加载完成（40×300ms 内无 svg）——检查 preview 服务与 URL"); await c.close(); process.exit(1); }
console.log("应用已加载");
await sleep(1200); // 等事件处理器/会话稳定（过早 eval 会撞上加载期 context 更替）
// 前台保障：隐藏标签节流会让页内等待全部×4 以上，套件超时像挂死
for (let i = 0; i < 5 && !(await c.ev("document.hasFocus() && !document.hidden").catch(() => false)); i++) {
	await c.activate();
	await sleep(700);
}
const fgOK = await c.ev("document.hasFocus() && !document.hidden").catch(() => false);
console.log(fgOK ? "标签前台 ✓" : "⚠ 标签在后台（节流可能拖垮套件）——保持 Chrome 窗口前台重跑");

// ---------- 页内自治用例（单 eval 单 context：免疫 CDP 跨步竞态） ----------
const suiteSrc = `(async () => {
	const out = [];
	const A = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail === undefined ? null : String(detail) });
	const sleep = ms => new Promise(r => setTimeout(r, ms));
	const key = (k, o) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: /^[a-z]$/i.test(k) ? 'Key' + k.toUpperCase() : k, bubbles: true, cancelable: true, ...(o || {}) }));
	const btn = t => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t || (b.title || '').includes(t)); if (b) b.click(); return !!b; };
	const badge = () => document.querySelector('.dyn-badge')?.textContent || '';
	const noteLit = id => { const g = document.querySelector('.fretboard-stage-wrap svg #' + id); return g ? (g.getAttribute('class') || '').includes('visible') : false; };
	const clickNote = id => { const g = document.querySelector('.fretboard-stage-wrap svg #' + id); if (!g) return false; const r = g.querySelector('circle')?.getBoundingClientRect(); if (!r) return false; g.dispatchEvent(new MouseEvent('click', { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true })); return true; };
	const blobs = [];
	const origUrl = URL.createObjectURL;
	URL.createObjectURL = function (b) { blobs.push({ type: b.type, size: b.size }); return origUrl.call(this, b); };
	const clearSmoke = () => { try { const arr = JSON.parse(localStorage.getItem('fretboard-clips') || '[]').filter(x => !String(x.id).startsWith('smoke-')); localStorage.setItem('fretboard-clips', JSON.stringify(arr)); localStorage.removeItem('fretboard-last-clip'); } catch (e) {} };
	clearSmoke();

	localStorage.setItem('__smokeProgress', 'route');
	console.log('== 路由 ==');
	key('q');
	await sleep(1000);
	A('Q 进入动态页', location.hash.startsWith('#/dynamic'), location.hash);
	A('URL 携带 ?c=', location.hash.includes('c='), location.hash);
	const h0 = location.hash;
	btn('新建动图');
	await sleep(900);
	A('新建动图 → hash 更新', location.hash !== h0 && location.hash.includes('c=clip-'), location.hash);
	A('新建后 编辑 1/1', badge().includes('1/1'), badge());

	localStorage.setItem('__smokeProgress', 'edit');
	console.log('== 动态编辑 ==');
	A('点音点亮', clickNote('f5-s2') && (await sleep(700), noteLit('f5-s2')));
	const add = document.querySelector('.dyn-thumb-add');
	if (add) add.click();
	let two = false;
	for (let i = 0; i < 12 && !two; i++) { await sleep(300); const b2 = badge(); two = b2.includes('2/2') || b2.includes('2 帧'); }
	A('追加新帧（＋）→ 2/2', two, badge());
	key('s', { ctrlKey: true });
	let saved = false;
	for (let i = 0; i < 20 && !saved; i++) { await sleep(300); saved = [...document.querySelectorAll('[class*=toast],.toast')].map(x => x.textContent).join('').includes('动图堆'); }
	A('Ctrl+S 保存（toast）', saved);
	key('d', { ctrlKey: true });
	await sleep(800);
	A('Ctrl+D 板面还原不崩', !!document.querySelector('svg'));

	localStorage.setItem('__smokeProgress', 'play');
	console.log('== 播放器 ==');
	const played = btn('▶');
	await sleep(600);
	const playing = !!document.querySelector('.fretboard-stage-wrap.playing');
	btn('⏹');
	await sleep(300);
	A('▶ 播放/⏹ 停止', played && playing);

	localStorage.setItem('__smokeProgress', 'gesture');
	console.log('== 手势标注 ==');
	btn('✎');
	await sleep(500);
	if (!noteLit('f3-s2')) { clickNote('f3-s2'); await sleep(700); }
	const g3 = document.querySelector('.fretboard-stage-wrap svg #f3-s2');
	const c3 = g3?.querySelector('circle')?.getBoundingClientRect();
	const g5 = document.querySelector('.fretboard-stage-wrap svg #f5-s2');
	const c5 = g5?.querySelector('circle')?.getBoundingClientRect();
	if (g3 && c3 && c5 && noteLit('f3-s2')) {
		const a = { x: c3.x + c3.width / 2, y: c3.y + c3.height / 2 };
		const b = { x: c5.x + c5.width / 2, y: c5.y + c5.height / 2 };
		g3.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, clientX: a.x, clientY: a.y, bubbles: true, isPrimary: true, button: 0 }));
		await sleep(120);
		for (let i = 1; i <= 6; i++) { window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, clientX: a.x + (b.x - a.x) * i / 6, clientY: a.y, bubbles: true, isPrimary: true })); await sleep(70); }
		await sleep(900);
		window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, clientX: b.x, clientY: b.y, bubbles: true, isPrimary: true }));
		await sleep(900);
		A('sl 手势：A 灭 B 亮', !noteLit('f3-s2') && noteLit('f5-s2'), 'f3=' + noteLit('f3-s2') + ' f5=' + noteLit('f5-s2'));
	} else A('sl 手势：A 灭 B 亮', false, '前置失败 f3=' + noteLit('f3-s2'));

	// pre 手势回归：帧内做 pre → ＋追加帧 → 新帧不得继承 preSlides（曾整段复制的根因）
	const gA = document.querySelector('.fretboard-stage-wrap svg #f3-s2');
	const gB2 = document.querySelector('.fretboard-stage-wrap svg #f5-s2');
	const rA = gA?.querySelector('circle')?.getBoundingClientRect();
	const rB2 = gB2?.querySelector('circle')?.getBoundingClientRect();
	let preDone = false;
	if (gA && gB2 && rA && rB2 && !noteLit('f3-s2') && noteLit('f5-s2')) { // pre 起点=暗音(sl 后的 f3)，终点=亮音 f5
		gA.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, clientX: rA.x + rA.width / 2, clientY: rA.y + rA.height / 2, bubbles: true, isPrimary: true, button: 0 }));
		await sleep(120);
		for (let i = 1; i <= 6; i++) { window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 11, clientX: rA.x + rA.width / 2 + (rB2.x + rB2.width / 2 - rA.x - rA.width / 2) * i / 6, clientY: rA.y + rA.height / 2, bubbles: true, isPrimary: true })); await sleep(70); }
		await sleep(1300);
		window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, clientX: rB2.x + rB2.width / 2, clientY: rB2.y + rB2.height / 2, bubbles: true, isPrimary: true }));
		await sleep(900);
		const add2 = document.querySelector('.dyn-thumb-add');
		if (add2) add2.click();
		await sleep(900);
		key('s', { ctrlKey: true });
		await sleep(1500);
		try {
			const clips = JSON.parse(localStorage.getItem('fretboard-clips') || '[]');
			const mine = clips.filter(c => String(c.id).startsWith('clip-')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
			if (mine && mine.frames.some(f => (f.preSlides || []).length > 0)) {
				const pres = mine.frames.map(f => (f.preSlides || []).length);
				const firstPre = pres.indexOf(1);
				const after = pres.slice(firstPre + 1);
				preDone = true;
				A('pre 不被追加帧继承', after.every(x => x === 0), JSON.stringify(pres));
			}
		} catch (e) {}
		if (!preDone) A('pre 不被追加帧继承（手势未注册=SKIP）', true, 'skip');
	} else A('pre 不被追加帧继承（前置缺失=SKIP）', true, 'skip');

	localStorage.setItem('__smokeProgress', 'dock');
	console.log('== 动图堆 ==');
	A('堆计数徽标', !!document.querySelector('.dock-count'));

	localStorage.setItem('__smokeProgress', 'export');
	console.log('== 导出 ==');
	blobs.length = 0;
	const gifBtn = btn('GIF');
	let gif = null;
	for (let i = 0; i < 90 && !gif; i++) // 36s：标签若被系统节流导出会显著变慢，放宽防误报 { await sleep(400); gif = blobs.find(x => x.type === 'image/gif') || null; }
	A('GIF 导出产出 blob', gifBtn && !!gif, gif ? gif.size + 'B' : 'no blob');

	localStorage.setItem('__smokeProgress', 'ctrlc');
	console.log('== Ctrl+C 守卫 ==');
	const had = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
	try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch (e) {}
	blobs.length = 0;
	key('c', { ctrlKey: true });
	let guard = null;
	for (let i = 0; i < 70 && !guard; i++) { await sleep(400); if (blobs.some(x => x.type === 'image/gif')) guard = 'download'; }
	try { if (had) Object.defineProperty(navigator, 'clipboard', { ...had, configurable: true }); } catch (e) {}
	A('Ctrl+C 无剪贴板 → 回落下载', guard === 'download', String(guard));

	clearSmoke();
	return out;
})()`;
let results = null;
try { results = await c.ev(suiteSrc); }
catch (e) { console.error("页内用例执行异常:", e.message); results = null; }
if (!Array.isArray(results)) {
		try { console.error("挂起位置:", await c.ev(`localStorage.getItem('__smokeProgress')`)); } catch (e) {}
	console.error("页内用例未返回结果数组（got " + typeof results + "）——转储原始响应：");
	try { console.error(JSON.stringify(await c.rawT(suiteSrc)).slice(0, 500)); } catch (e) { console.error("raw 失败:", e.message); }
}
else console.log(`页内用例完成：${results.length} 项`);

// ---------- 收尾 ----------
for (const r of results || []) A(r.name, r.ok, r.detail);
await c.close();
console.log(fail === 0 ? `===== UI 冒烟全部通过（${n} 项）=====` : `===== ${fail}/${n} 项失败 =====`);
process.exit(fail ? 1 : 0);
