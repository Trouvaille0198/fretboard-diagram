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
import { deepenTint } from "../colorConfig";

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
	exitFill: "rgba(159, 178, 192, 0.9)",
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

// 从帧数据推该音色系的强色档（vivid）：原位滑弦的瞬时 B 在结果帧无色，用它点亮
function vividColorOf(state, id) {
	const c = state?.data?.[id]?.color;
	const name = typeof c === "object" ? c.name : c;
	if (!name || name === "white" || name === "trans") return null;
	const variants = generateTintVariants(getLevel1FillColor(name));
	return variants && variants[1] ? variants[1] : null;
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

	// 差分：排除已被 pairs 消费的音
	const exiting = prevNotes
		.filter(n => prevActive.has(n.id) && !nextActive.has(n.id) && !pairFromIds.has(n.id))
		.map(n => ({ id: n.id, x: n.x, y: n.y, color: noteColorOf(prevState, n.id) }));
	const entering = nextNotes
		.filter(n => nextActive.has(n.id) && !prevActive.has(n.id) && !pairToIds.has(n.id))
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
				color: (tech === "pre" ? null : noteColorOf(nextState, p.to)) // pre 的 to=常亮 A，取 A 原色会和板面 B 瞬态色打架（淡蓝滑完突变深蓝）
					|| (nextState?.frameTint ? nextState.frameTint.custom : null) // rt/hp/pre 瞬时 B＝当帧帧档色（与新增音符一致）
					|| deepenTint(prevState?.data?.[p.from]?.color, 1 / 3)
					|| noteColorOf(prevState, p.from)
					|| vividColorOf(prevState, p.from)
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
			// B 闪现由板面状态驱动；这里只保留 A 复亮装饰环
			const aBack = clamp01((t - 0.55) / 0.12) * (1 - clamp01((t - 0.9) / 0.1));
			if (aBack > 0) els.push({ kind: "ring", x: p.from.x, y: p.from.y, r: R + 4 + 8 * aBack, opacity: +(0.9 * aBack).toFixed(3), width: 3, color: p.color });
			return;
		}
		const isSl = tech === "sl";
		const isRT = tech === "rt";
		const isQuick = tech === "h" || tech === "p";

		if (tech === "pre") {
			// 前置划弦：滑行音的亮/灭由板面状态驱动（半程亮、抵达灭）——fx 只画线+光点，
			// 不再渲染 bHold 滑行音符（旧语义残留：80% 行程满透明 pale 音符=白点不消失的根因）
			const prog = easeInOutCubic(t);
			const x = p.from.x + (p.to.x - p.from.x) * prog;
			const lineOp = t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1;
			els.push({ kind: "line", x1: p.from.x, y1: p.from.y, x2: p.to.x, y2: p.to.y, opacity: +lineOp.toFixed(3), color: p.color });
			els.push({ kind: "dot", x: +x.toFixed(2), y: p.from.y, r: 7, opacity: t > 0.96 ? +((1 - t) / 0.04).toFixed(3) : 1, color: p.color });
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
			// 返回抵达 A：A 重亮脉冲环
			const back = clamp01((t - 0.72) / 0.2) * (1 - clamp01((t - 0.92) / 0.08));
			if (back > 0) {
				els.push({ kind: "ring", x: p.from.x, y: p.from.y, r: R + 4 + 10 * back, opacity: +(0.9 * back).toFixed(3), width: 3, color: p.color });
			}
			return;
		}

		const prog = isQuick ? easeOutQuick(t) : easeInOutCubic(t);
		const x = p.from.x + (p.to.x - p.from.x) * prog;
		const y = p.from.y + (p.to.y - p.from.y) * prog;

		if (isSl) {
			// 只画轨迹线+光点：A 的存续与 B 的抵达点亮全部由数据步表达（v3），不再覆盖绘制
			const lineOp = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;
			els.push({ kind: "line", x1: p.from.x, y1: p.from.y, x2: p.to.x, y2: p.to.y, opacity: +lineOp.toFixed(3), color: p.color });
		}
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
		if (el.kind === "note") {
			// 音符视觉三件套（填充/外框/文字）——参数一律取 opts.noteStyle（由调用方从应用真实计算样式解析），
			// 与板面 g.note 单一来源，板面改样式这里自动跟随；数值仅是缺省兜底
			const ns = opts.noteStyle || {};
			const ink = ns.ink || "var(--text-color)";
			const strokeW = ns.strokeW || 1.5;
			const fontSz = ns.fontSz || 20;
			const label = el.label ? `<text x="${el.x}" y="${el.y}" text-anchor="middle" dominant-baseline="middle" font-size="${fontSz}" fill="${ink}" opacity="${el.opacity}">${esc(el.label)}</text>` : "";
			return `<g><circle cx="${el.x}" cy="${el.y}" r="${el.r}" fill="${el.color || c.dotFill}" stroke="${ink}" stroke-width="${strokeW}" opacity="${el.opacity}"/>${label}</g>`;
		}
		if (el.kind === "dot") {
			return `<circle cx="${el.x}" cy="${el.y}" r="${el.r}" fill="${el.color || c.dotFill}" opacity="${el.opacity}"/>`;
		}
		return "";
	}).join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
}
