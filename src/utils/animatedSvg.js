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

	// g 位置（data-x/y 优先，回退 translate 解析）
	const posOfG = (root, gid) => {
		const g = root.querySelector('#' + gid);
		if (!g) return null;
		const dx = parseFloat(g.getAttribute('data-x')), dy = parseFloat(g.getAttribute('data-y'));
		if (Number.isFinite(dx) && Number.isFinite(dy)) return { x: dx, y: dy };
		const m = (g.getAttribute('transform') || '').match(/translate\(\s*([\d.-]+)[\s,]+([\d.-]+)/);
		return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
	};
	const fxEnterLayer = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
	fxEnterLayer.setAttribute('class', 'fx-enter-smil');
	svg.appendChild(fxEnterLayer);

	// 每状态进入窗口的差分 fx（与播放器/GIF 的 desc 层同口径）：
	// 退场音=淡出圆（r 20→15 easeInCubic，op 0.9→0）；进场音=涟漪环（r 20→38 easeOutCubic，op 0.95*(1-u)^1.4）
	const easeInCubic = u => u * u * u;
	const easeOutCubic = u => 1 - Math.pow(1 - u, 3);
	const visSet = st => new Set(Object.entries((st && st.data) || {}).filter(([, n]) => n && (n.visibility === 'visible' || n.visibility === 'selected')).map(([id]) => id));
	const mkTrack = (pts, totalMs) => {
		const times = pts.map(p => Math.max(0, Math.min(totalMs, p.t)));
		if (times[0] > 0) { times.unshift(0); pts = [{ t: 0, v: pts[0].v }, ...pts]; }
		if (times[times.length - 1] < totalMs) { pts = [...pts, { t: totalMs, v: pts[pts.length - 1].v }]; times.push(totalMs); }
		return { values: pts.map(p => fmt(p.v)).join(';'), keyTimes: times.map(x => fmt(x / totalMs)).join(';') };
	};
	for (let k = 1; k < N; k++) {
		const enter = clock.enterOf(k - 1);
		if (!enter || enter <= 0) continue;
		const w0 = clock.starts[k], w1 = w0 + enter;
		const pv = visSet(states[k - 1]), cv = visSet(states[k]);
		const sampleU = [0, 0.25, 0.5, 0.75, 1];
		for (const id of pv) {
			if (cv.has(id)) continue;
			const pos = posOfG(svg, id);
			if (!pos) continue;
			const el = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
			el.setAttribute('cx', String(pos.x)); el.setAttribute('cy', String(pos.y));
			el.setAttribute('fill', 'rgba(159, 178, 192, 0.9)');
			el.setAttribute('opacity', '0');
			const rT = mkTrack([{ t: 0, v: 20 }, ...sampleU.map(u => ({ t: w0 + u * enter, v: 20 * (1 - 0.25 * easeInCubic(u)) })), { t: total, v: 15 }], total);
			const oT = mkTrack([{ t: 0, v: 0 }, ...sampleU.map(u => ({ t: w0 + u * enter, v: 0.9 * (1 - easeInCubic(u)) })), { t: total, v: 0 }], total);
			[['r', rT], ['opacity', oT]].forEach(([attr, tr]) => {
				if (!tr) return;
				const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
				a.setAttribute('attributeName', attr);
				a.setAttribute('values', tr.values);
				a.setAttribute('keyTimes', tr.keyTimes);
				a.setAttribute('dur', total + 'ms');
				a.setAttribute('repeatCount', 'indefinite');
				el.appendChild(a);
			});
			fxEnterLayer.appendChild(el);
		}
		for (const id of cv) {
			if (pv.has(id)) continue;
			const pos = posOfG(svg, id);
			if (!pos) continue;
			const n = states[k].data[id];
			const color = (n && n.color && typeof n.color === 'object' && n.color.custom) || 'rgba(243, 186, 98, 0.95)';
			const el = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
			el.setAttribute('cx', String(pos.x)); el.setAttribute('cy', String(pos.y));
			el.setAttribute('fill', 'none');
			el.setAttribute('stroke', color);
			el.setAttribute('opacity', '0');
			const rT = mkTrack([{ t: 0, v: 20 }, ...sampleU.map(u => ({ t: w0 + u * enter, v: 20 + 18 * easeOutCubic(u) })), { t: total, v: 38 }], total);
			const oT = mkTrack([{ t: 0, v: 0 }, ...sampleU.map(u => ({ t: w0 + u * enter, v: +(0.95 * Math.pow(1 - u, 1.4)).toFixed(3) })), { t: total, v: 0 }], total);
			const wT = mkTrack([{ t: 0, v: 3.5 }, ...sampleU.map(u => ({ t: w0 + u * enter, v: 3.5 * (1 - 0.5 * u) })), { t: total, v: 1.75 }], total);
			[['r', rT], ['opacity', oT], ['stroke-width', wT]].forEach(([attr, tr]) => {
				if (!tr) return;
				const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
				a.setAttribute('attributeName', attr);
				a.setAttribute('values', tr.values);
				a.setAttribute('keyTimes', tr.keyTimes);
				a.setAttribute('dur', total + 'ms');
				a.setAttribute('repeatCount', 'indefinite');
				el.appendChild(a);
			});
			fxEnterLayer.appendChild(el);
		}
	}

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
		// 配色同源：sl 光点=B 数据色；rt/hp/pre=该帧帧位档（与 describeTransition 一致）
		const frameStates = frameOf ? states.filter((_, si) => frameOf[si] === track.frame) : [];
		const hint = frameStates.length ? frameStates[frameStates.length - 1] : states[N - 1];
		const toNote = hint && hint.data && hint.data[pair.to];
		const pairColor = (pair.technique === 'sl' && toNote && toNote.color && typeof toNote.color === 'object' && toNote.color.custom)
			? toNote.color.custom
			: (hint && hint.frameTint ? hint.frameTint.custom : 'rgba(243, 186, 98, 0.95)');
		// 滑线轨迹（sl/pre 与播放器同形：跟随光点、首尾 12% 淡入淡出）
		if (pair.technique === 'sl' || pair.technique === 'pre') {
			const ln = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
			ln.setAttribute('x1', String(ax)); ln.setAttribute('y1', String(ay));
			ln.setAttribute('stroke', pairColor);
			ln.setAttribute('stroke-width', '3');
			ln.setAttribute('stroke-linecap', 'round');
			ln.setAttribute('opacity', '0');
			const mkX2 = linearTrack([...Array(13)].map((_, i) => { const u = i / 12; const e = 1 - Math.pow(1 - u, 3); return { t: t0 + u * dur, v: ax + (bx - ax) * e }; }), total);
			const mkY2 = linearTrack([...Array(13)].map((_, i) => { const u = i / 12; const e = 1 - Math.pow(1 - u, 3); return { t: t0 + u * dur, v: ay + (by - ay) * e }; }), total);
			// opacity 关键帧：0 → (窗口内按 12% 淡入淡出采样) → 0
			const opPts = [];
			for (let i = 0; i <= 12; i++) {
				const u = i / 12;
				const op = u < 0.12 ? u / 0.12 : u > 0.88 ? (1 - u) / 0.12 : 1;
				opPts.push({ t: t0 + u * dur, v: +op.toFixed(3) });
			}
			const lopT = linearTrack(opPts, total);
			[['x2', mkX2], ['y2', mkY2]].forEach(([attr, tr]) => {
				if (!tr) return;
				const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
				a.setAttribute('attributeName', attr);
				a.setAttribute('values', tr.values);
				a.setAttribute('keyTimes', tr.keyTimes);
				a.setAttribute('dur', total + 'ms');
				a.setAttribute('repeatCount', 'indefinite');
				ln.appendChild(a);
			});
			if (lopT) {
				const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
				a.setAttribute('attributeName', 'opacity');
				a.setAttribute('values', lopT.values);
				a.setAttribute('keyTimes', lopT.keyTimes);
				a.setAttribute('dur', total + 'ms');
				a.setAttribute('repeatCount', 'indefinite');
				ln.appendChild(a);
			}
			fxLayer.appendChild(ln);
		}
		const c = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
		c.setAttribute('r', '12');
		c.setAttribute('fill', pairColor);
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
