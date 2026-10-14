// 动画 SVG 导出（SMIL）：状态时钟 → 每音符 opacity/fill 离散关键帧 + 光点轨迹关键帧
// 产物为自包含矢量动图——无限清晰、体积极小，浏览器/文档/<img> 直接播放，微信可作为文件发。
// 注意：剪贴板 API 只收 image/png（浏览器限制），所以 Ctrl+C 仍是 PNG 回落；动画 SVG 走下载。
import { stateClock, END_PAUSE_MS } from './timeline.js';

const fmt = (n) => Math.round(n * 1000) / 1000;

// 关键帧序列 → SMIL 离散动画元素属性串（去重相邻同值；保证首 keyTime=0 尾=1）
function discreteTrack(points, totalMs) {
	// points: [{t(ms), v}] 升序
	const vals = [];
	const times = [];
	let last = null;
	for (const p of points) {
		if (p.v !== last) { vals.push(p.v); times.push(Math.max(0, p.t)); last = p.v; }
	}
	if (!vals.length) return null;
	if (times[0] > 0) { times.unshift(0); vals.unshift(vals[0]); }
	const dur = totalMs;
	if (times[times.length - 1] >= dur) { times[times.length - 1] = dur - 0.001; }
	times.push(dur);
	vals.push(vals[vals.length - 1]);
	return { values: vals.join(';'), keyTimes: times.map(t => fmt(t / dur)).join(';') };
}

// 线性分段轨迹（光点）：waypoints [{t, v}]（区间内线性插值、区间外保持）
function linearTrack(waypoints, totalMs) {
	const times = [];
	const vals = [];
	for (const w of waypoints) {
		const t = Math.max(0, Math.min(totalMs, w.t));
		if (times.length && Math.abs(times[times.length - 1] - t) < 0.5 && Math.abs(vals[vals.length - 1] - w.v) > 0.01) {
			times.push(t + 0.5); vals.push(vals[vals.length - 1]); // 折线拐点：同刻两值
		} else if (times.length && Math.abs(times[times.length - 1] - t) < 0.5) {
			continue;
		}
		times.push(t); vals.push(w.v);
	}
	if (!times.length) return null;
	if (times[0] > 0) { times.unshift(0); vals.unshift(vals[0]); }
	if (times[times.length - 1] < totalMs) { times.push(totalMs); vals.push(vals[vals.length - 1]); }
	return { values: vals.map(fmt).join(';'), keyTimes: times.map(t => fmt(t / totalMs)).join(';') };
}

export async function buildAnimatedSvg({ states, fx, frameOf, renderSvg, labelColor }) {
	const clock = stateClock(states, 300, 200);
	const total = clock.total + END_PAUSE_MS;
	const N = states.length;

	// 联合板面（并集数据；可见性交给动画）
	const unionData = {};
	for (let k = 0; k < N; k++) {
		const d = states[k].data || {};
		for (const id of Object.keys(d)) {
			if (id === 'connections' || id.startsWith('conn-')) continue;
			if (!unionData[id]) unionData[id] = JSON.parse(JSON.stringify(d[id]));
			else if (d[id].visibility === 'visible') unionData[id] = JSON.parse(JSON.stringify(d[id])); // 用可见态的形（带色）
		}
	}
	const unionState = { ...states[N - 1], data: unionData };
	const svgString = await renderSvg(unionState);
	const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
	const svg = doc.documentElement;

	// 每音符：opacity/fill 离散关键帧（按状态边界）
	const noteGs = [...svg.querySelectorAll('g.note')];
	noteGs.forEach(g => {
		const id = g.id;
		let has = false;
		for (let k = 0; k < N; k++) if (states[k].data && states[k].data[id]) { has = true; break; }
		if (!has) return;
		// 剥 class 与内联 opacity（避免 CSS 压过动画属性），保留其余内联样式
		g.removeAttribute('class');
		const st = g.getAttribute('style');
		if (st) g.setAttribute('style', st.replace(/opacity\s*:[^;]+;?/g, '').trim());
		const opPts = [];
		const fillPts = [];
		let prevVis = null, prevFill = null;
		for (let k = 0; k < N; k++) {
			const n = states[k].data && states[k].data[id];
			const vis = !!(n && (n.visibility === 'visible' || n.visibility === 'selected'));
			const fill = vis && n.color && typeof n.color === 'object' && n.color.custom ? n.color.custom : (vis && typeof n.color === 'string' && n.color !== 'white' ? n.color : null);
			const t = clock.starts[k];
			if (vis !== prevVis) { opPts.push({ t, v: vis ? 1 : 0 }); prevVis = vis; }
			if (vis && fill && fill !== prevFill) { fillPts.push({ t, v: fill }); prevFill = fill; }
		}
		const opTrack = discreteTrack(opPts, total);
		if (opTrack) {
			const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
			a.setAttribute('attributeName', 'opacity');
			a.setAttribute('calcMode', 'discrete');
			a.setAttribute('values', opTrack.values);
			a.setAttribute('keyTimes', opTrack.keyTimes);
			a.setAttribute('dur', total + 'ms');
			a.setAttribute('repeatCount', 'indefinite');
			g.appendChild(a);
		}
		const circle = g.querySelector('circle');
		if (circle && fillPts.length) {
			// 剥 circle 内联 fill，交给动画
			const cst = circle.getAttribute('style');
			if (cst) circle.setAttribute('style', cst.replace(/fill\s*:[^;]+;?/g, '').trim());
			const fTrack = discreteTrack(fillPts, total);
			const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
			a.setAttribute('attributeName', 'fill');
			a.setAttribute('calcMode', 'discrete');
			a.setAttribute('values', fTrack.values);
			a.setAttribute('keyTimes', fTrack.keyTimes);
			a.setAttribute('dur', total + 'ms');
			a.setAttribute('repeatCount', 'indefinite');
			circle.appendChild(a);
		}
	});

	// 光点轨道：每条 fx 一个圆，cx/cy 线性分段 + opacity 离散 + fill 恒定
	const fxLayer = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
	fxLayer.setAttribute('class', 'fx-smil');
	svg.appendChild(fxLayer);
	(fx || []).forEach(track => {
		const pair = track.spec && track.spec.pairs && track.spec.pairs[0];
		if (!pair) return;
		// 端点坐标：序列化后的音符 g 用 transform 定位（circle 本地坐标 0,0）——优先 data-x/y，回退解析 translate
		const posOf = (gid) => {
			const g = svg.querySelector('#' + gid);
			if (!g) return null;
			const dx = parseFloat(g.getAttribute('data-x')), dy = parseFloat(g.getAttribute('data-y'));
			if (Number.isFinite(dx) && Number.isFinite(dy)) return { x: dx, y: dy };
			const m = (g.getAttribute('transform') || '').match(/translate\(\s*([\d.-]+)[\s,]+([\d.-]+)/);
			return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
		};
		const pa = posOf(pair.from), pb = posOf(pair.to);
		if (!pa || !pb) return;
		const ax = pa.x, ay = pa.y, bx = pb.x, by = pb.y;
		const dur = track.dur, t0 = track.t0, t1 = t0 + dur;
		const c = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
		c.setAttribute('r', '12');
		c.setAttribute('fill', 'rgba(243, 186, 98, 0.95)');
		c.setAttribute('stroke', 'rgba(0,0,0,0.35)');
		c.setAttribute('stroke-width', '2');
		c.setAttribute('opacity', '0');
		const mkLinear = (a, b) => {
			const wp = [{ t: 0, v: a }];
			const STEPS = 10;
			for (let i = 0; i <= STEPS; i++) {
				const u = i / STEPS;
				const e = 1 - Math.pow(1 - u, 3); // easeOutCubic（与 sampleTransition 光点一致）
				wp.push({ t: t0 + u * dur, v: a + (b - a) * e });
			}
			wp.push({ t: total, v: b });
			return linearTrack(wp, total);
		};
		const xT = mkLinear(ax, bx), yT = mkLinear(ay, by);
		const opT = discreteTrack([{ t: 0, v: 0 }, { t: t0, v: 1 }, { t: t1, v: 0 }], total);
		[['cx', xT], ['cy', yT]].forEach(([attr, tr]) => {
			if (!tr) return;
			const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
			a.setAttribute('attributeName', attr);
			a.setAttribute('values', tr.values);
			a.setAttribute('keyTimes', tr.keyTimes);
			a.setAttribute('dur', total + 'ms');
			a.setAttribute('repeatCount', 'indefinite');
			c.appendChild(a);
		});
		if (opT) {
			const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
			a.setAttribute('attributeName', 'opacity');
			a.setAttribute('calcMode', 'discrete');
			a.setAttribute('values', opT.values);
			a.setAttribute('keyTimes', opT.keyTimes);
			a.setAttribute('dur', total + 'ms');
			a.setAttribute('repeatCount', 'indefinite');
			c.appendChild(a);
		}
		fxLayer.appendChild(c);
	});

	return new XMLSerializer().serializeToString(svg);
}
