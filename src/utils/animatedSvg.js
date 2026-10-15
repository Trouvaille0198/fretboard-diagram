// 动画 SVG 导出（SMIL）：状态时钟 → 每音符 opacity/fill 离散关键帧 + 光点轨迹关键帧
// 产物为自包含矢量动图——无限清晰、体积极小，浏览器/文档/<img> 直接播放，微信可作为文件发。
// 注意：剪贴板 API 只收 image/png（浏览器限制），所以 Ctrl+C 仍是 PNG 回落；动画 SVG 走下载。
import { stateClock, END_PAUSE_MS } from './timeline.js';
import { describeTransition, sampleTransition } from './transitionAnimator.js';

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

export async function buildAnimatedSvg({ states, fx, frameOf, sub, renderSvg, labelColor }) {
	const subList = Array.isArray(sub) ? sub : null;
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
		if (subList && subList[k]) continue; // 技法边状态不渲染涟漪（与播放器统一）
		const w0 = clock.starts[k], w1 = w0 + enter;
		const pv = visSet(states[k - 1]), cv = visSet(states[k]);
		// 涟漪静默（与 describeTransition 的 muteEnter 同口径）：技法参与音的新进入不出环
		const muteEnter = new Set(states[k].muteEnter || []);
		const sampleU = [0, 0.25, 0.5, 0.75, 1];
		// 退场灰圆不渲染（与播放器统一：熄灭由板面状态/SMIL opacity 离散帧负责）
		for (const id of cv) {
			if (pv.has(id)) continue;
			if (muteEnter.has(id)) continue;
			const pos = posOfG(svg, id);
			if (!pos) continue;
			const n = states[k].data[id];
			const color = (n && n.color && typeof n.color === 'object' && n.color.custom) || 'rgba(243, 186, 98, 0.95)';
			const el = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
			el.setAttribute('cx', String(pos.x)); el.setAttribute('cy', String(pos.y));
			el.setAttribute('fill', 'none');
			el.setAttribute('stroke', color);
			el.setAttribute('opacity', '0');
			const rT = mkTrack([{ t: 0, v: 20 }, { t: w0 - 1, v: 20 }, { t: w0, v: 20 }, ...sampleU.slice(1).map(u => ({ t: w0 + u * enter, v: 20 + 18 * easeOutCubic(u) })), { t: w1, v: 38 }, { t: total, v: 38 }], total);
			const oT = mkTrack([{ t: 0, v: 0 }, { t: w0 - 1, v: 0 }, { t: w0, v: 0.95 }, ...sampleU.slice(1).map(u => ({ t: w0 + u * enter, v: +(0.95 * Math.pow(1 - u, 1.4)).toFixed(3) })), { t: w1, v: 0 }, { t: total, v: 0 }], total);
			const wT = mkTrack([{ t: 0, v: 3.5 }, { t: w0 - 1, v: 3.5 }, { t: w0, v: 3.5 }, ...sampleU.slice(1).map(u => ({ t: w0 + u * enter, v: 3.5 * (1 - 0.5 * u) })), { t: w1, v: 1.75 }, { t: total, v: 1.75 }], total);
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
		// 几何与配色同源：与播放器/GIF 一样取自 describeTransition（generateNotes 全指板坐标，与音符亮灭无关）。
		// 绝不能从渲染板 DOM 反查音符 g——pre 的起点音从未点亮，showNotes=false 的导出板不渲染它，
		// 反查 null 会整条静默丢轨（"多条前置滑弦只有一条有动画"的根因）
		const frameStates = frameOf ? states.filter((_, si) => frameOf[si] === track.frame) : [];
		const hint = frameStates.length ? frameStates[frameStates.length - 1] : states[N - 1];
		const desc = describeTransition(hint, hint, track.spec);
		const p0 = desc.pairs && desc.pairs[0];
		if (!p0 || !p0.from || !p0.to) return;
		const ax = p0.from.x, ay = p0.from.y, bx = p0.to.x, by = p0.to.y;
		const dur = track.dur, t0 = track.t0, t1 = t0 + dur;
		const pairColor = p0.color; // B 数据色 → 帧位档 → A 数据色 → 金色兜底（describeTransition 色链，播放器同款）
		// 击勾：板面只闪 B；回 A 的复亮涟漪由 fx 显式画（与 sampleTransition hp 分支同形：
		// 后 55%~90% 时间窗内 r=R→R+18 扩散、透明度衰减）
		if (pair.technique === 'hp') {
			const R = 22;
			const w0 = t0 + dur * 0.55, w1 = t0 + dur * 0.9;
			const rc = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
			rc.setAttribute('cx', String(ax)); rc.setAttribute('cy', String(ay));
			rc.setAttribute('fill', 'none');
			rc.setAttribute('stroke', pairColor);
			rc.setAttribute('stroke-width', '3.5');
			rc.setAttribute('opacity', '0');
			const easeOut = u => 1 - Math.pow(1 - u, 3);
			const rT = linearTrack([{ t: 0, v: R }, { t: w0 - 0.5, v: R }, ...[0, 0.25, 0.5, 0.75, 1].map(u => ({ t: w0 + (w1 - w0) * u, v: +(R + 18 * easeOut(u)).toFixed(2) })), { t: w1, v: R + 18 }, { t: total, v: R + 18 }], total);
			const oT = linearTrack([{ t: 0, v: 0 }, { t: w0 - 0.5, v: 0 }, ...[0, 0.25, 0.5, 0.75, 1].map(u => ({ t: w0 + (w1 - w0) * u, v: +(0.9 * Math.pow(1 - u, 1.2)).toFixed(3) })), { t: w1, v: 0 }, { t: total, v: 0 }], total);
			[['r', rT], ['opacity', oT]].forEach(([attr, tr]) => {
				if (!tr) return;
				const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
				a.setAttribute('attributeName', attr);
				a.setAttribute('values', tr.values);
				a.setAttribute('keyTimes', tr.keyTimes);
				a.setAttribute('dur', total + 'ms');
				a.setAttribute('repeatCount', 'indefinite');
				rc.appendChild(a);
			});
			fxLayer.appendChild(rc);
			return;
		}
		// 移动音符技法（sl 与前置划弦 pre 同款）：与播放器/GIF 同语义（sampleTransition 分支）——
		// 一个音符（圆+音名交叉淡化）从 A 划到 B，到达与板面 B 同色交接。不画轨迹线
		if (pair.technique === 'pre' || pair.technique === 'sl') {
			const STEPS = 24;
			const notePts = [];
			let noteR = 22, noteY = null; // 采样元素自带 r/y（同弦滑动 y 恒定），与播放器同源
			const labelPts = new Map(); // text -> {x:[], op:[], y}
			for (let i = 0; i <= STEPS; i++) {
				const t = i / STEPS;
				const at = t0 + t * dur;
				sampleTransition(desc, t, dur).forEach(el => {
					if (el.kind === 'note') {
						noteR = el.r || noteR;
						if (Number.isFinite(el.y)) noteY = el.y;
						notePts.push({ t: at, v: el.x });
					} else if (el.kind === 'label') {
						let tr = labelPts.get(el.text);
						if (!tr) { tr = { x: [], op: [] }; labelPts.set(el.text, tr); }
						tr.y = Number.isFinite(el.y) ? el.y : (tr.y ?? noteY);
						tr.x.push({ t: at, v: el.x });
						tr.op.push({ t: at, v: el.opacity });
					}
				});
			}
			if (notePts.length) {
				const nc = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
				nc.setAttribute('r', String(noteR));
				if (noteY !== null) nc.setAttribute('cy', String(noteY)); // 缺省 y=0 → 音符画到板顶
				nc.setAttribute('fill', p0.color);
				nc.setAttribute('stroke', labelColor || 'var(--text-color)');
				nc.setAttribute('stroke-width', '1.5');
				nc.setAttribute('opacity', '0');
				const cxT = linearTrack(notePts, total);
				const nopT = discreteTrack([{ t: 0, v: 0 }, { t: t0, v: 1 }, { t: t1, v: 0 }], total);
				[['cx', cxT], ['opacity', nopT]].forEach(([attr, tr]) => {
					if (!tr) return;
					const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
					a.setAttribute('attributeName', attr);
					if (attr === 'opacity') a.setAttribute('calcMode', 'discrete');
					a.setAttribute('values', tr.values);
					a.setAttribute('keyTimes', tr.keyTimes);
					a.setAttribute('dur', total + 'ms');
					a.setAttribute('repeatCount', 'indefinite');
					nc.appendChild(a);
				});
				fxLayer.appendChild(nc);
			}
			labelPts.forEach((tr, text) => {
				const tx = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
				tx.setAttribute('text-anchor', 'middle');
				tx.setAttribute('dominant-baseline', 'middle');
				tx.setAttribute('font-size', '14');
				tx.setAttribute('font-weight', '600');
				tx.setAttribute('fill', labelColor || 'var(--text-color)');
				tx.setAttribute('opacity', '0');
				if (tr.y !== null && tr.y !== undefined) tx.setAttribute('y', String(tr.y)); // 缺省 y=0 → 数字飘到板顶
				tx.textContent = text;
				const xT = linearTrack([{ t: 0, v: tr.x[0].v }, ...tr.x], total);
				// 窗口外强制 0（linearTrack 会拿首采样值向前填充，而交叉淡化首值是 1 → 标签整程可见）。
				// 前置零点停在 t0-0.5ms：与首采样同刻会撞出非单调 keyTimes；t0=0（首帧前置）无需前置
				const opPre = t0 > 0.5 ? [{ t: 0, v: 0 }, { t: t0 - 0.5, v: 0 }] : [];
				const opT = linearTrack([...opPre, ...tr.op, { t: t1 + 0.5, v: 0 }], total);
				[['x', xT], ['opacity', opT]].forEach(([attr, trk]) => {
					if (!trk) return;
					const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
					a.setAttribute('attributeName', attr);
					a.setAttribute('values', trk.values);
					a.setAttribute('keyTimes', trk.keyTimes);
					a.setAttribute('dur', total + 'ms');
					a.setAttribute('repeatCount', 'indefinite');
					tx.appendChild(a);
				});
				fxLayer.appendChild(tx);
			});
			return;
		}
		// 推弦（bd）：与播放器/GIF 同语义（sampleTransition bd 分支）——音符本体垂直推出/弹回。
		// x 恒定（同品），只有 cy 动；弯弓慢出→满弓停→放箭急回的轨迹用采样点分段线性逼近
		//（急回段短，采样密度比 sl 高一档，不然放箭的过冲回稳会被线性抹平）
		if (pair.technique === 'bd') {
			const STEPS = 40;
			const noteYP = [];
			const labelYP = [];
			let noteR = 22, noteX = null, labelText = null;
			for (let i = 0; i <= STEPS; i++) {
				const t = i / STEPS;
				const at = t0 + t * dur;
				sampleTransition(desc, t, dur).forEach(el => {
					if (el.kind === 'note') {
						noteR = el.r || noteR;
						noteX = el.x;
						noteYP.push({ t: at, v: el.y });
					} else if (el.kind === 'label') {
						labelText = el.text;
						labelYP.push({ t: at, v: el.y });
					}
				});
			}
			const opT = discreteTrack([{ t: 0, v: 0 }, { t: t0, v: 1 }, { t: t1, v: 0 }], total);
			if (noteYP.length && noteX !== null) {
				const nc = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
				nc.setAttribute('cx', String(noteX));
				nc.setAttribute('r', String(noteR));
				nc.setAttribute('fill', pairColor);
				nc.setAttribute('stroke', labelColor || 'var(--text-color)');
				nc.setAttribute('stroke-width', '1.5');
				nc.setAttribute('opacity', '0');
				const cyT = linearTrack(noteYP, total);
				[['cy', cyT, null], ['opacity', opT, 'discrete']].forEach(([attr, tr, calc]) => {
					if (!tr) return;
					const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
					a.setAttribute('attributeName', attr);
					if (calc) a.setAttribute('calcMode', calc);
					a.setAttribute('values', tr.values);
					a.setAttribute('keyTimes', tr.keyTimes);
					a.setAttribute('dur', total + 'ms');
					a.setAttribute('repeatCount', 'indefinite');
					nc.appendChild(a);
				});
				fxLayer.appendChild(nc);
			}
			if (labelText !== null && labelYP.length && noteX !== null) {
				const tx = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
				tx.setAttribute('text-anchor', 'middle');
				tx.setAttribute('dominant-baseline', 'middle');
				tx.setAttribute('font-size', '20'); // 板面同款：推的是同一个音，音名观感与静止一致（白字+投影），不显"变浅"
				tx.setAttribute('fill', '#ffffff');
				tx.setAttribute('style', 'filter:drop-shadow(0 0 1.6px rgb(0,0,1))');
				tx.setAttribute('opacity', '0');
				tx.setAttribute('x', String(noteX));
				tx.textContent = labelText;
				const yT = linearTrack(labelYP, total);
				[['y', yT, null], ['opacity', opT, 'discrete']].forEach(([attr, tr, calc]) => {
					if (!tr) return;
					const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
					a.setAttribute('attributeName', attr);
					if (calc) a.setAttribute('calcMode', calc);
					a.setAttribute('values', tr.values);
					a.setAttribute('keyTimes', tr.keyTimes);
					a.setAttribute('dur', total + 'ms');
					a.setAttribute('repeatCount', 'indefinite');
					tx.appendChild(a);
				});
				fxLayer.appendChild(tx);
			}
			return;
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
