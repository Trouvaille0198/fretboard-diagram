// 帧间过渡动画内核：页面播放与导出动图共用同一套描述符 + 插值，保证所见即所得
// 数据来源 = TransitionSpec（技法 + 显式 pairs）+ 帧差分兜底（未标注的亮灭）
// 规则：
//   退出音 → 淡出消隐；进入音 → 扩散环（可琶音错开）
//   pairs：sl 滑线+匀速光点；h/p 急促缓动+字母；mv 光点平移无字母；hp A→B→A 往返+双字母，B 为瞬时音

import { CONSTS } from "../constants";
import { generateNotes, computeNoteName, computeNoteIndex } from "./fretboardCalculations";
import { noteToSolfege } from "../utils";
import { getLevel1FillColor, generateTintVariants } from "../colorConfig";
import { activeNoteIdsOf } from "./songStructure";

// 与编辑区一致的音符构建（全指板所有位置，含未点亮的）
function buildAllNotes(state) {
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
		noteToSolfege
	);
}

// 音符 id（f5-s2 / o-s3）→ 半音距离（排序用，单调即可）
export function pitchOf(noteId) {
	const match = noteId.match(/^(?:o|f(-?\d+))-s(\d+)$/);
	if (!match) return 0;
	const fret = noteId.startsWith("o") ? 0 : parseInt(match[1], 10);
	const string = parseInt(match[2], 10);
	return (CONSTS.stringIntervals[string] ?? 0) + fret;
}

const clamp01 = t => Math.max(0, Math.min(1, t));
const easeInCubic = t => t * t * t;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// 击/勾：急进急停，与滑音的匀速感区分开
const easeOutQuick = t => 1 - Math.pow(1 - t, 4);

const FX_COLORS = {
	ringStroke: "rgba(243, 186, 98, 0.95)",
	lineStroke: "rgba(243, 186, 98, 0.75)",
	dotFill: "rgba(243, 186, 98, 0.95)"
};

// 从帧数据取音符颜色（跟随动图色系）：{name,custom} 取 custom，色名取基础填充
function noteColorOf(state, id) {
	const c = state?.data?.[id]?.color;
	if (!c) return null;
	if (typeof c === "object" && c.custom) return c.custom;
	if (typeof c === "string" && c !== "white" && c !== "trans") {
		const fill = getLevel1FillColor(c);
		if (fill && fill !== "white") return fill;
	}
	return null;
}

// 过渡静态描述：显式 pairs（spec）+ 差分兜底（未标注的进/出音），一次算好
// spec: { technique: 'sl'|'h'|'p'|'hp'|'mv'|null, pairs: [{from,to}], arpeggio? }
export function describeTransition(prevState, nextState, spec = {}) {
	const technique = spec.technique || null;
	const pairs = Array.isArray(spec.pairs) ? spec.pairs : [];

	const prevNotes = buildAllNotes(prevState);
	const nextNotes = buildAllNotes(nextState);
	const posOf = (list, id) => {
		const n = list.find(x => x.id === id);
		return n ? { id, x: n.x, y: n.y } : null;
	};

	const prevActive = activeNoteIdsOf(prevState);
	const nextActive = activeNoteIdsOf(nextState);
	const pairFromIds = new Set(pairs.map(p => p.from));
	const pairToIds = new Set(pairs.map(p => p.to));
	// 涟漪静默：目标态若标注了 muteEnter（技法帧窗开启态），其中技法参与音的新进入
	// 不再出扩散环——划线/滑弦的表演已交代其出现（"有划线优先级更高"）
	const muteEnter = new Set(nextState?.muteEnter || []);

	// 差分：排除已被 pairs 消费的音
	const exiting = prevNotes
		.filter(n => prevActive.has(n.id) && !nextActive.has(n.id) && !pairFromIds.has(n.id))
		.map(n => ({ id: n.id, x: n.x, y: n.y, color: noteColorOf(prevState, n.id) }));
	const entering = nextNotes
		.filter(n => nextActive.has(n.id) && !prevActive.has(n.id) && !pairToIds.has(n.id) && !muteEnter.has(n.id))
		.map(n => ({ id: n.id, x: n.x, y: n.y }));

	// 琶音：进入音按音高次序错开延迟（pairs 始终同步，保证"整体移动"观感）
	const arp = spec.arpeggio;
	let enteringStaggered = entering.map(n => ({ ...n, delayMs: 0 }));
	if (arp && arp.mode && arp.mode !== "sim" && entering.length > 1) {
		const sorted = entering.slice().sort((a, b) => pitchOf(a.id) - pitchOf(b.id));
		const ordered = arp.mode === "low" ? sorted : sorted.slice().reverse();
		const gap = Number(arp.gapMs) > 0 ? Number(arp.gapMs) : 60;
		enteringStaggered = ordered.map((n, i) => ({ ...n, delayMs: i * gap }));
	}

	const resolvedPairs = pairs
		.map(p => {
			const tech = p.technique || technique; // 每对自带技法（拖拽标注），兼容旧的整步技法
			const fromNote = prevNotes.find(n => n.id === p.from);
			const toNote = nextNotes.find(n => n.id === p.to);
			return {
				from: posOf(prevNotes, p.from),
				to: posOf(nextNotes, p.to),
				tech,
				fromColor: noteColorOf(prevState, p.from), // sl 补画 A（撑到光点抵达）用
				fromLabel: fromNote ? fromNote.noteName : null, // fx 音符的数字/音名（与板面渲染同源）
				toLabel: toNote ? toNote.noteName : null,
				transient: tech === "rt" || tech === "hp" || tech === "pre", // 往返/前置的瞬态音
				// 轨迹颜色（渲染时实时算，不存快照——存了会随帧结构/色系变化过期）：
				// sl 的 B 用结果帧实际色；rt/hp 瞬时 B = A 深一整档（pale→vivid→rich→deep）
				color: noteColorOf(nextState, p.to) // 优先 B 的数据色：pre 移动音符到达时与板面 B 同色交接（无缝，无闪影）
					|| (nextState?.frameTint ? nextState.frameTint.custom : null)
					|| noteColorOf(prevState, p.from)
					|| FX_COLORS.dotFill
			};
		})
		.filter(p => p.from && p.to);

	const enteringColored = enteringStaggered.map(n => ({
		...n,
		color: noteColorOf(nextState, n.id) || FX_COLORS.ringStroke
	}));

	return { technique, exiting, entering: enteringColored, pairs: resolvedPairs };
}

// t ∈ [0,1] 过渡进度 → 绘制元素（纯数据：kind + 内联属性）
export function sampleTransition(desc, t, transMs) {
	const els = [];
	const R = CONSTS.circleRadius;
	const dur = Math.max(1, Number(transMs) || 300);
	const isRT = desc.technique === "rt" || desc.technique === "hp"; // 原位滑弦（兼容旧 hp 数据）
	// 退场灰圆已移除：v5 板面状态用 CSS 过渡处理熄灭，fx 层灰圆是双重渲染（用户报告的"白点"）

	desc.entering.forEach(n => {
		const delayN = Math.min(0.6, n.delayMs / dur);
		const u = clamp01((t - delayN) / Math.max(0.35, 1 - delayN));
		if (u <= 0 || u >= 1) return;
		els.push({
			kind: "ring",
			x: n.x, y: n.y,
			r: +(R + 18 * easeOutCubic(u)).toFixed(2),
			opacity: +(0.95 * Math.pow(1 - u, 1.4)).toFixed(3),
			width: +(3.5 * (1 - u * 0.5)).toFixed(2),
			color: n.color
		});
	});

	desc.pairs.forEach(p => {
		const tech = p.tech || desc.technique;
		// 击勾：离散跳音（TransitionFx 直连场景，如 dock 预览）——前半 B 亮起、后半 A 重亮环，无滑动
		if (tech === "hp") {
			// 回 A 复亮：涟漪环（用户要求回 A 时 A 也有涟漪）+ 光点提示（技法帧无进入环——由 fx 显式画）
			const rb = clamp01((t - 0.55) / 0.35);
			if (rb > 0 && rb < 1) {
				els.push({ kind: "ring", x: p.from.x, y: p.from.y, r: +(R + 18 * easeOutCubic(rb)).toFixed(2), opacity: +(0.9 * Math.pow(1 - rb, 1.2)).toFixed(3), width: +(3.5 * (1 - rb * 0.4)).toFixed(2), color: p.color });
			}
			const aBack = clamp01((t - 0.55) / 0.12) * (1 - clamp01((t - 0.9) / 0.1));
			if (aBack > 0) els.push({ kind: "dot", x: p.from.x, y: p.from.y, r: 7, opacity: +(0.8 * aBack).toFixed(3), color: p.color });
			return;
		}
		const isRT = tech === "rt";
		const isQuick = tech === "h" || tech === "p";

		if (tech === "pre" || tech === "sl") {
			// 移动音符语义（sl 与前置划弦同款，用户定稿"A 直接到 B"）：
			// 滑行的就是一个"音符"（圆 + 音名），从 A 划到 B，到达即与板面 B 重合停住。
			// 出发原位/抵达点亮的亮灭由板面状态边驱动，fx 只画移动音符
			const prog = easeInOutCubic(t);
			const x = p.from.x + (p.to.x - p.from.x) * prog;
			els.push({ kind: "note", x: +x.toFixed(2), y: p.from.y, r: R, opacity: 1, color: p.color }); // 全程不透明：到达瞬间与板面 B 同位同色交接
			// 音名交叉淡化：前半程 A 名淡出，后半程 B 名淡入（居中在音符上）
			const fromOp = t < 0.5 ? +(1 - t * 2).toFixed(3) : 0;
			const toOp = t >= 0.5 ? +((t - 0.5) * 2).toFixed(3) : 0;
			if (p.fromLabel && fromOp > 0.02) els.push({ kind: "label", x: +x.toFixed(2), y: p.from.y, text: p.fromLabel, opacity: fromOp, color: p.color });
			if (p.toLabel && toOp > 0.02) els.push({ kind: "label", x: +x.toFixed(2), y: p.from.y, text: p.toLabel, opacity: toOp, color: p.color });
			return;
		}

		if (isRT) {
			// 原位滑弦：前半 A→B，后半 B→A（无字母，颜色跟随色系）
			const half = clamp01(t / 0.5);
			const secondHalf = clamp01((t - 0.5) / 0.5);
			const p1 = easeOutQuick(half);
			const p2 = easeOutQuick(secondHalf);
			const x = p2 > 0
				? p.to.x + (p.from.x - p.to.x) * p2
				: p.from.x + (p.to.x - p.from.x) * p1;
			els.push({ kind: "dot", x: +x.toFixed(2), y: p.from.y, r: 7, opacity: 1, color: p.color });
			return; // 回程抵达 A 的重亮由板面状态表达（无环）
		}

		// mv/h/p 等：光点平移（rt 双腿、击勾直连场景）
		const prog = isQuick ? easeOutQuick(t) : easeInOutCubic(t);
		const x = p.from.x + (p.to.x - p.from.x) * prog;
		const y = p.from.y + (p.to.y - p.from.y) * prog;
		els.push({ kind: "dot", x: +x.toFixed(2), y: +y.toFixed(2), r: 7, opacity: t > 0.96 ? +((1 - t) / 0.04).toFixed(3) : 1, color: p.color });
	});

	return els;
}

function esc(v) {
	return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 元素数组 → 独立 SVG 字符串（颜色全部内联，脱离页面 CSS 也能正确渲染，导出用）
export function elsToSvgString(els, viewBox, opts = {}) {
	const c = FX_COLORS;
	const body = els.map(el => {
		if (el.kind === "fade") {
			return `<circle cx="${el.x}" cy="${el.y}" r="${el.r}" fill="${el.color || c.exitFill}" opacity="${el.opacity}"/>`;
		}
		if (el.kind === "ring") {
			return `<circle cx="${el.x}" cy="${el.y}" r="${el.r}" fill="none" stroke="${el.color || c.ringStroke}" stroke-width="${el.width}" opacity="${el.opacity}"/>`;
		}
		if (el.kind === "line") {
			return `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${el.color || c.lineStroke}" stroke-width="3" stroke-linecap="round" opacity="${el.opacity}"/>`;
		}
		if (el.kind === "dot") {
			return `<circle cx="${el.x}" cy="${el.y}" r="${el.r}" fill="${el.color || c.dotFill}" opacity="${el.opacity}"/>`;
		}
		if (el.kind === "label") {
			const ns = opts.noteStyle || {};
			const ink = ns.ink || "var(--text-color)";
			const fontSz = Math.round((ns.fontSz || 20) * 0.72);
			return `<text x="${el.x}" y="${el.y}" text-anchor="middle" dominant-baseline="middle" font-size="${fontSz}" font-weight="600" fill="${ink}" opacity="${el.opacity}">${esc(el.text)}</text>`;
		}
		if (el.kind === "note") {
			const ns = opts.noteStyle || {};
			const ink = ns.ink || "var(--text-color)";
			const strokeW = ns.strokeW || 1.5;
			return `<circle cx="${el.x}" cy="${el.y}" r="${el.r}" fill="${el.color || c.dotFill}" stroke="${ink}" stroke-width="${strokeW}" opacity="${el.opacity}"/>`;
		}
		return "";
	}).join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
}
