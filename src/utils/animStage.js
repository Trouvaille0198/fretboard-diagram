// 动图舞台与导出共用的纯工具：联合品窗 / 统一裁剪框 / SMIL 关键帧轨道。
// 预览播放、GIF/WebM/SMIL 导出、整图快照全部经此模块取同一套几何，
// "预览 = 导出"按构造成立（不允许任何一侧私自内联同式计算）。
// 保持纯 JS（可被 node 冒烟测试），不触碰 DOM。

import { CONSTS } from "../constants.js";
import { boardGeometry, generateNotes, computeNoteName, computeNoteIndex } from "./fretboardCalculations.js";

const fmt = (n) => Math.round(n * 1000) / 1000;

// ============ 联合品窗 ============

// 跨全部帧的品窗并集（跨度超限时截到 maxSpan，与导出历史行为一致）
export function unionFretWindow(frames, maxSpan = 16) {
	let wStart = Infinity, wEnd = -Infinity;
	frames.forEach(f => {
		if (!f) return;
		wStart = Math.min(wStart, f.startFret);
		wEnd = Math.max(wEnd, f.endFret);
	});
	if (!Number.isFinite(wStart) || !Number.isFinite(wEnd)) return { wStart: 0, wEnd: maxSpan };
	if (wEnd - wStart > maxSpan) wEnd = wStart + maxSpan;
	return { wStart, wEnd };
}

// ============ 统一裁剪框 ============

// 音名只影响文字不影响几何，裁剪计算不需要唱名真值
const NO_SOLFEGE = () => "";
function notesOf(state) {
	return generateNotes(
		state.startFret,
		state.endFret,
		state.data,
		state.displayMode,
		state.rootNote,
		state.enharmonic,
		state.visibility,
		(fret, string) => computeNoteName(fret, string, state.enharmonic),
		computeNoteIndex,
		NO_SOLFEGE
	);
}

// states（展开后的板面态数组）里全部可见音符（含选中态）的联合范围 → 统一裁剪框；
// 各帧同视野不跳动。无可见音符 / 未开截断返回 null（整框）。
// pad 语义：左右 14；上下含品数标尺 30、关标尺 8；窗口退化下限 120×80。
export function cropBoxOfNotes(states, full, opts = {}) {
	if (!opts.horizontalCrop && !opts.verticalCrop) return null;
	const R = CONSTS.circleRadius;
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	states.forEach(state => {
		const notes = notesOf(state);
		Object.entries(state.data || {}).forEach(([id, n]) => {
			if (!n || (n.visibility !== "visible" && n.visibility !== "selected")) return;
			const p = notes.find(q => q.id === id);
			if (!p) return;
			minX = Math.min(minX, p.x - R); maxX = Math.max(maxX, p.x + R);
			minY = Math.min(minY, p.y - R); maxY = Math.max(maxY, p.y + R);
		});
	});
	if (minX === Infinity) return null;
	const padX = 14, padY = opts.includeMarkers === false ? 8 : 30;
	let cx = full.x, cy = full.y, cw = full.w, ch = full.h;
	if (opts.horizontalCrop) {
		const x1 = Math.max(full.x, minX - padX), x2 = Math.min(full.x + full.w, maxX + padX);
		cx = x1; cw = Math.max(120, x2 - x1);
	}
	if (opts.verticalCrop) {
		const y1 = Math.max(full.y, minY - padY), y2 = Math.min(full.y + full.h, maxY + padY);
		cy = y1; ch = Math.max(80, y2 - y1);
	}
	return { x: cx, y: cy, w: cw, h: ch };
}

// ============ 舞台窗口（预览与导出共用的"取景器"） ============

// frames → 联合品窗；states 重映射到该窗（同坐标系，fx/板面/裁剪三者的位置基准一致）；
// 再按显示设置算统一裁剪框。返回 { windowed, full, cropBox, window }。
export function stageWindowOf(frames, states, opts = {}) {
	const window = unionFretWindow(frames);
	const windowed = states.map(s => ({ ...s, startFret: window.wStart, endFret: window.wEnd }));
	const geo = boardGeometry(window.wStart, window.wEnd);
	const full = { x: geo.svgViewBoxX, y: geo.svgViewBoxY, w: geo.svgViewBoxWidth, h: geo.svgViewBoxHeight };
	const cropBox = cropBoxOfNotes(windowed, full, opts);
	return { windowed, full, cropBox, window };
}

// ============ SMIL 关键帧轨道（animatedSvg 专用，抽出以便冒烟） ============

// 序列化后验：相邻 keyTimes 相等 → 丢弃前一个点（保留后值）。keyTimes 非严格递增时
// 浏览器会丢弃整个 animate 元素，这是导出 SVG"整段动画不动"的一类根因。
// 只去重不动值：vals 原样返回，值的格式化（数字 fmt / 字符串透传）由调用方决定
function dedupeKeyTimes(times, vals, totalMs) {
	const keyTimes = times.map(t => fmt(t / totalMs));
	for (let i = keyTimes.length - 1; i > 0; i--) {
		if (keyTimes[i] === keyTimes[i - 1]) { keyTimes.splice(i - 1, 1); vals.splice(i - 1, 1); times.splice(i - 1, 1); }
	}
	return { vals, keyTimes };
}

// 离散轨道：[{t(ms), v}] 升序 → values/keyTimes（去重相邻同值；保证首 keyTime=0 尾=1）。
// values 是"任意属性值"（数字 0/1、颜色字符串都合法），必须原样透传——
// 绝不能过 fmt（数字格式化），颜色字符串会被 Math.round 洗成 NaN，fill 动画整条失效
export function discreteTrack(points, totalMs) {
	const vals = [];
	const times = [];
	let last = null;
	for (const p of points) {
		if (p.v !== last) { vals.push(p.v); times.push(Math.max(0, p.t)); last = p.v; }
	}
	if (!vals.length) return null;
	if (times[0] > 0) { times.unshift(0); vals.unshift(vals[0]); }
	if (times[times.length - 1] >= totalMs - 0.5) { times[times.length - 1] = totalMs - Math.max(1, totalMs * 0.002); }
	times.push(totalMs);
	vals.push(vals[vals.length - 1]);
	const dd = dedupeKeyTimes(times, vals, totalMs);
	// values 原样透传（数字/颜色字符串均可）
	return { values: dd.vals.join(";"), keyTimes: dd.keyTimes.join(";") };
}

// 线性分段轨道：waypoints [{t, v}]（区间内线性插值、区间外保持）。
// 时间统一钳到 [0, totalMs] 并排序、相近点（<0.5ms）合并取后值
// （曾在此把"同刻两值"写成 旧值@t+0.5 / 新值@t 的乱序，导出 SVG 整段动画失效的根因）
export function linearTrack(waypoints, totalMs) {
	if (!waypoints.length) return null;
	const pts = waypoints
		.map(w => ({ t: Math.max(0, Math.min(totalMs, w.t)), v: w.v }))
		.sort((a, b) => a.t - b.t);
	const times = [];
	const vals = [];
	pts.forEach(p => {
		if (times.length && p.t - times[times.length - 1] < 0.5) { vals[vals.length - 1] = p.v; return; }
		times.push(p.t); vals.push(p.v);
	});
	if (!times.length) return null;
	if (times[0] > 0) { times.unshift(0); vals.unshift(vals[0]); }
	if (times[times.length - 1] < totalMs) { times.push(totalMs); vals.push(vals[vals.length - 1]); }
	const dd = dedupeKeyTimes(times, vals, totalMs);
	// 线性轨道的值恒为数字（坐标/透明度），fmt 安全
	return { values: dd.vals.map(fmt).join(";"), keyTimes: dd.keyTimes.join(";") };
}

// 渐变轨道（板面音符亮灭的 CSS 0.1s 渐变在 SMIL 里的同款表达）：
// jumps [{t, v}] 为"值跳变时刻"，跳变处保持旧值、随后 FADE_MS 线性滑到新值。
// 相邻跳变间隔小于渐变窗时退化为近似瞬切（与 CSS transition 的中断重定向观感一致）。
export function fadeTrack(jumps, totalMs, fadeMs = 100) {
	if (!jumps.length) return null;
	const pts = [{ t: 0, v: jumps[0].v }];
	for (let i = 1; i < jumps.length; i++) {
		const t = Math.max(0, Math.min(totalMs, jumps[i].t));
		if (t - pts[pts.length - 1].t < 0.05) { pts[pts.length - 1] = { t, v: jumps[i].v }; continue; }
		const rampEnd = Math.min(t + fadeMs, totalMs);
		pts.push({ t, v: pts[pts.length - 1].v });
		pts.push({ t: rampEnd, v: jumps[i].v });
	}
	return linearTrack(pts, totalMs);
}
