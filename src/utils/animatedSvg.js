// 动画 SVG 导出（SMIL）：状态时钟 → 每音符 opacity/fill 关键帧 + 光点轨迹关键帧
// 产物为自包含矢量动图——无限清晰、体积极小，浏览器/文档/<img> 直接播放，微信可作为文件发。
// 注意：剪贴板 API 只收 image/png（浏览器限制），所以 Ctrl+C 仍是 PNG 回落；动画 SVG 走下载。
// 视觉与播放器/GIF 同源约定：涟漪/光点/移动音符的几何与配色全部对齐 transitionAnimator 的
// sampleTransition 分支（同一公式），板面亮灭用 100ms 线性渐变对齐预览 CSS（.playing .note 0.1s）。
import { stateClock, END_PAUSE_MS } from './timeline.js';
import { describeTransition, sampleTransition, noteColorOf, rippleColorOf } from './transitionAnimator.js';
import { discreteTrack, linearTrack, fadeTrack } from './animStage.js';
import { CONSTS } from '../constants.js';

const easeOutCubic = u => 1 - Math.pow(1 - u, 3);

const mkAnimate = (doc, parent, attr, track, calcMode) => {
	if (!track) return;
	const a = doc.createElementNS('http://www.w3.org/2000/svg', 'animate');
	a.setAttribute('attributeName', attr);
	if (calcMode) a.setAttribute('calcMode', calcMode);
	a.setAttribute('values', track.values);
	a.setAttribute('keyTimes', track.keyTimes);
	a.setAttribute('dur', track.dur);
	a.setAttribute('repeatCount', 'indefinite');
	parent.appendChild(a);
};

// 关键帧轨道统一补上时长（mkAnimate 局部化 dur，避免每个分支手抄 total）
const trackWith = (track, totalMs) => (track ? { ...track, dur: totalMs + 'ms' } : null);

export async function buildAnimatedSvg({ states, fx, frameOf, sub, renderSvg, labelColor, noteStyle, holdMs = 300, transMs = 200 }) {
	const subList = Array.isArray(sub) ? sub : null;
	const clock = stateClock(states, holdMs, transMs);
	const total = clock.total + END_PAUSE_MS;
	const N = states.length;
	const ns = noteStyle || {};

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

	// 每音符：opacity 渐变关键帧（100ms 线性滑变 = 预览 CSS 0.1s 渐变）+ fill 离散关键帧（fill 无 CSS 过渡，瞬切一致）
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
		const opTrack = trackWith(fadeTrack(opPts, total), total);
		if (opTrack) mkAnimate(doc, g, 'opacity', opTrack);
		const circle = g.querySelector('circle');
		if (circle && fillPts.length) {
			// 剥 circle 内联 fill，交给动画
			const cst = circle.getAttribute('style');
			if (cst) circle.setAttribute('style', cst.replace(/fill\s*:[^;]+;?/g, '').trim());
			const fTrack = trackWith(discreteTrack(fillPts, total), total);
			if (fTrack) mkAnimate(doc, circle, 'fill', fTrack, 'discrete');
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
	// 进场音=涟漪环（r R→R+18 easeOutCubic，op 0.95*(1-u)^1.4，宽 3.5*(1-u*0.5)——describeTransition entering 同式）
	const visSet = st => new Set(Object.entries((st && st.data) || {}).filter(([, n]) => n && (n.visibility === 'visible' || n.visibility === 'selected')).map(([id]) => id));
	const R0 = CONSTS.circleRadius;
	// 涟漪采样 9 点：折线逼近 easeOutCubic 衰减（5 点时尾段斜率明显失真）
	const sampleU = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
	// 单个涟漪环：r R0→R0+18 easeOutCubic、op 0.95*(1-u)^1.4、宽 3.5*(1-u*0.5)——describeTransition entering 同式
	const appendRipple = (pos, color, w0, enter) => {
		const w1 = w0 + enter;
		const el = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
		el.setAttribute('cx', String(pos.x)); el.setAttribute('cy', String(pos.y));
		el.setAttribute('fill', 'none');
		el.setAttribute('stroke', color);
		el.setAttribute('opacity', '0');
		const rT = trackWith(linearTrack([{ t: 0, v: R0 }, { t: w0 - 1, v: R0 }, { t: w0, v: R0 }, ...sampleU.slice(1).map(u => ({ t: w0 + u * enter, v: +(R0 + 18 * easeOutCubic(u)).toFixed(2) })), { t: w1, v: R0 + 18 }, { t: total, v: R0 + 18 }], total), total);
		const oT = trackWith(linearTrack([{ t: 0, v: 0 }, { t: w0 - 1, v: 0 }, { t: w0, v: 0.95 }, ...sampleU.slice(1).map(u => ({ t: w0 + u * enter, v: +(0.95 * Math.pow(1 - u, 1.4)).toFixed(3) })), { t: w1, v: 0 }, { t: total, v: 0 }], total), total);
		const wT = trackWith(linearTrack([{ t: 0, v: 3.5 }, { t: w0 - 1, v: 3.5 }, { t: w0, v: 3.5 }, ...sampleU.slice(1).map(u => ({ t: w0 + u * enter, v: +(3.5 * (1 - u * 0.5)).toFixed(2) })), { t: w1, v: 1.75 }, { t: total, v: 1.75 }], total), total);
		mkAnimate(doc, el, 'r', rT);
		mkAnimate(doc, el, 'opacity', oT);
		mkAnimate(doc, el, 'stroke-width', wT);
		fxEnterLayer.appendChild(el);
	};
	for (let k = 1; k < N; k++) {
		const enter = clock.enterOf(k - 1);
		if (!enter || enter <= 0) continue;
		if (subList && subList[k]) continue; // 技法边状态不渲染涟漪（与播放器统一）
		const w0 = clock.starts[k];
		const pv = visSet(states[k - 1]), cv = visSet(states[k]);
		// 涟漪静默（与 describeTransition 的 muteEnter 同口径）：技法参与音的新进入/复色不出环
		const muteEnter = new Set(states[k].muteEnter || []);
		for (const id of cv) {
			if (muteEnter.has(id)) continue;
			const pos = posOfG(svg, id);
			if (!pos) continue;
			if (!pv.has(id)) {
				// 新进入：环色 = rippleColorOf（数据色→金色兜底→深色环在深背景上提亮到可见）
				appendRipple(pos, rippleColorOf(states[k], id), w0, enter);
				continue;
			}
			// 复色（describeTransition 的 recolored 同口径）：前后态都亮、颜色变了 → 也出环，环色 = 新色
			const a = noteColorOf(states[k - 1], id), b = noteColorOf(states[k], id);
			if (a && b && a !== b) appendRipple(pos, rippleColorOf(states[k], id), w0, enter);
		}
	}
	// 回环涟漪（循环重开处 = 末态→首态，与播放器 loopWrap / GIF loopDesc 同语义）：
	// 复色（deep→pale 这类回环变色）与重新出现的音都出环；w0=0 时 appendRipple 的轨道
	// 在 t=0 直接以峰值开始（涟漪随循环重开瞬间绽放），轨道路径与普通涟漪完全共用
	if (N > 1) {
		const loopEnter = Math.max(1, transMs);
		const pvL = visSet(states[N - 1]), cvL = visSet(states[0]);
		const muteL = new Set(states[0].muteEnter || []);
		for (const id of cvL) {
			if (muteL.has(id)) continue;
			const pos = posOfG(svg, id);
			if (!pos) continue;
			const wasLit = pvL.has(id);
			const a = wasLit ? noteColorOf(states[N - 1], id) : null;
			const b = noteColorOf(states[0], id);
			if (!wasLit || (a && b && a !== b)) appendRipple(pos, rippleColorOf(states[0], id), 0, loopEnter);
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
		// 反查 null 会整条静默丢轨（"多条前置滑弦只有一条有动画"的根因）。
		// states 必须已统一到联合品窗（stageWindowOf.windowed）：板面 fx 坐标系一致，跨品窗帧不再错位
		const frameStates = frameOf ? states.filter((_, si) => frameOf[si] === track.frame) : [];
		const hint = frameStates.length ? frameStates[frameStates.length - 1] : states[N - 1];
		const desc = describeTransition(hint, hint, track.spec);
		const p0 = desc.pairs && desc.pairs[0];
		if (!p0 || !p0.from || !p0.to) return;
		const ax = p0.from.x, ay = p0.from.y, bx = p0.to.x, by = p0.to.y;
		const dur = track.dur, t0 = track.t0, t1 = t0 + dur;
		const pairColor = p0.color; // B 数据色 → 帧位档 → A 数据色 → 金色兜底（describeTransition 色链，播放器同款）
		// 击勾：板面只闪 B；回 A 的复亮涟漪+光点由 fx 显式画（与 sampleTransition hp 分支同形）
		if (pair.technique === 'hp') {
			const w0 = t0 + dur * 0.55, w1 = t0 + dur * 0.9;
			const rc = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
			rc.setAttribute('cx', String(ax)); rc.setAttribute('cy', String(ay));
			rc.setAttribute('fill', 'none');
			rc.setAttribute('stroke', pairColor);
			rc.setAttribute('stroke-width', '3.5');
			rc.setAttribute('opacity', '0');
			const rT = trackWith(linearTrack([{ t: 0, v: R0 }, { t: w0 - 0.5, v: R0 }, ...sampleU.map(u => ({ t: w0 + (w1 - w0) * u, v: +(R0 + 18 * easeOutCubic(u)).toFixed(2) })), { t: w1, v: R0 + 18 }, { t: total, v: R0 + 18 }], total), total);
			const oT = trackWith(linearTrack([{ t: 0, v: 0 }, { t: w0 - 0.5, v: 0 }, ...sampleU.map(u => ({ t: w0 + (w1 - w0) * u, v: +(0.9 * Math.pow(1 - u, 1.2)).toFixed(3) })), { t: w1, v: 0 }, { t: total, v: 0 }], total), total);
			const wT = trackWith(linearTrack([{ t: 0, v: 3.5 }, { t: w0 - 0.5, v: 3.5 }, ...sampleU.map(u => ({ t: w0 + (w1 - w0) * u, v: +(3.5 * (1 - u * 0.4)).toFixed(2) })), { t: w1, v: 3.5 * 0.6 }, { t: total, v: 3.5 * 0.6 }], total), total);
			mkAnimate(doc, rc, 'r', rT);
			mkAnimate(doc, rc, 'opacity', oT);
			mkAnimate(doc, rc, 'stroke-width', wT);
			fxLayer.appendChild(rc);
			// 回 A 光点（sampleTransition aBack 同形：0.55→0.67 起坡保持、0.9→1.0 收坡）
			const dt = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
			dt.setAttribute('cx', String(ax)); dt.setAttribute('cy', String(ay));
			dt.setAttribute('r', '7');
			dt.setAttribute('fill', pairColor);
			dt.setAttribute('opacity', '0');
			const dT = trackWith(linearTrack([
				{ t: 0, v: 0 }, { t: t0 + dur * 0.55, v: 0 }, { t: t0 + dur * 0.67, v: 0.8 },
				{ t: t0 + dur * 0.9, v: 0.8 }, { t: t1, v: 0 }, { t: total, v: 0 }
			], total), total);
			mkAnimate(doc, dt, 'opacity', dT);
			fxLayer.appendChild(dt);
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
				nc.setAttribute('stroke', ns.ink || labelColor || 'var(--text-color)');
				nc.setAttribute('stroke-width', String(ns.strokeW || 1.5));
				nc.setAttribute('opacity', '0');
				const cxT = trackWith(linearTrack(notePts, total), total);
				const nopT = trackWith(discreteTrack([{ t: 0, v: 0 }, { t: t0, v: 1 }, { t: t1, v: 0 }], total), total);
				mkAnimate(doc, nc, 'cx', cxT);
				mkAnimate(doc, nc, 'opacity', nopT, 'discrete');
				fxLayer.appendChild(nc);
			}
			const labelFontSz = Math.round((ns.fontSz || 20) * 0.72); // elsToSvgString 轻提示标签同式
			labelPts.forEach((tr, text) => {
				const tx = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
				tx.setAttribute('text-anchor', 'middle');
				tx.setAttribute('dominant-baseline', 'middle');
				tx.setAttribute('font-size', String(labelFontSz));
				tx.setAttribute('font-weight', '600');
				tx.setAttribute('fill', ns.ink || labelColor || 'var(--text-color)');
				tx.setAttribute('opacity', '0');
				if (tr.y !== null && tr.y !== undefined) tx.setAttribute('y', String(tr.y)); // 缺省 y=0 → 数字飘到板顶
				tx.textContent = text;
				const xT = trackWith(linearTrack([{ t: 0, v: tr.x[0].v }, ...tr.x], total), total);
				// 窗口外强制 0（linearTrack 会拿首采样值向前填充，而交叉淡化首值是 1 → 标签整程可见）。
				// 前置零点停在 t0-0.5ms：与首采样同刻会撞出非单调 keyTimes；t0=0（首帧前置）无需前置
				const opPre = t0 > 0.5 ? [{ t: 0, v: 0 }, { t: t0 - 0.5, v: 0 }] : [];
				const opT = trackWith(linearTrack([...opPre, ...tr.op, { t: t1 + 0.5, v: 0 }], total), total);
				mkAnimate(doc, tx, 'x', xT);
				mkAnimate(doc, tx, 'opacity', opT);
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
			const opT = trackWith(discreteTrack([{ t: 0, v: 0 }, { t: t0, v: 1 }, { t: t1, v: 0 }], total), total);
			if (noteYP.length && noteX !== null) {
				const nc = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
				nc.setAttribute('cx', String(noteX));
				nc.setAttribute('r', String(noteR));
				nc.setAttribute('fill', pairColor);
				nc.setAttribute('stroke', ns.ink || labelColor || 'var(--text-color)');
				nc.setAttribute('stroke-width', String(ns.strokeW || 1.5));
				nc.setAttribute('opacity', '0');
				const cyT = trackWith(linearTrack(noteYP, total), total);
				mkAnimate(doc, nc, 'cy', cyT);
				mkAnimate(doc, nc, 'opacity', opT, 'discrete');
				fxLayer.appendChild(nc);
			}
			if (labelText !== null && labelYP.length && noteX !== null) {
				const tx = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
				tx.setAttribute('text-anchor', 'middle');
				tx.setAttribute('dominant-baseline', 'middle');
				tx.setAttribute('font-size', String(Math.round(ns.fontSz || 20))); // 板面同款：推的是同一个音，音名观感与静止一致（白字+投影），不显"变浅"
				tx.setAttribute('fill', '#ffffff');
				tx.setAttribute('style', 'filter:drop-shadow(0 0 1.6px rgb(0,0,1))');
				tx.setAttribute('opacity', '0');
				tx.setAttribute('x', String(noteX));
				tx.textContent = labelText;
				const yT = trackWith(linearTrack(labelYP, total), total);
				mkAnimate(doc, tx, 'y', yT);
				mkAnimate(doc, tx, 'opacity', opT, 'discrete');
				fxLayer.appendChild(tx);
			}
			return;
		}
		// mv 光点：与播放器/GIF 同款（sampleTransition dot：r=7 无描边，easeOutCubic 平移）
		const c = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
		c.setAttribute('r', '7');
		c.setAttribute('fill', pairColor);
		c.setAttribute('opacity', '0');
		const mkLinear = (a, b) => {
			const wp = [{ t: 0, v: a }];
			const STEPS = 10;
			for (let i = 0; i <= STEPS; i++) {
				const u = i / STEPS;
				const e = easeOutCubic(u); // 与 sampleTransition 光点一致
				wp.push({ t: t0 + u * dur, v: a + (b - a) * e });
			}
			wp.push({ t: total, v: b });
			return trackWith(linearTrack(wp, total), total);
		};
		const xT = mkLinear(ax, bx), yT = mkLinear(ay, by);
		const opT = trackWith(discreteTrack([{ t: 0, v: 0 }, { t: t0, v: 1 }, { t: t1, v: 0 }], total), total);
		mkAnimate(doc, c, 'cx', xT);
		mkAnimate(doc, c, 'cy', yT);
		mkAnimate(doc, c, 'opacity', opT, 'discrete');
		fxLayer.appendChild(c);
	});

	return new XMLSerializer().serializeToString(svg);
}
