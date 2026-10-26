// 帧间过渡动画内核：页面播放与导出动图共用同一套描述符 + 插值，保证所见即所得
// 数据来源 = TransitionSpec（技法 + 显式 pairs）+ 帧差分兜底（未标注的亮灭）
// 规则：
//   退出音 → 淡出消隐；进入音 → 扩散环（可琶音错开）；
//   复色音（前后帧都亮、颜色变了）→ 同款扩散环（颜色不变不出）
//   pairs：sl 滑线+匀速光点；h/p 急促缓动+字母；mv 光点平移无字母；hp A→B→A 往返+双字母，B 为瞬时音

import { CONSTS } from "../constants.js";
import { generateNotes, computeNoteName, computeNoteIndex } from "./fretboardCalculations.js";
import { noteToSolfege } from "../utils.js";
import { getLevel1FillColor, generateTintVariants } from "../colorConfig.js";
import { activeNoteIdsOf } from "./songStructure.js";
import { BEND_OUT, BEND_HOLD, BEND_TOTAL } from "./timeline.js";

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

// 从帧数据取音符颜色（跟随动图色系）：{name,custom} 取 custom，色名取基础填充。
// SMIL 导出的涟漪层同口径复用（复色涟漪的判定必须与内核一致）
export function noteColorOf(state, id) {
	const c = state?.data?.[id]?.color;
	if (!c) return null;
	if (typeof c === "object" && c.custom) return c.custom;
	if (typeof c === "string" && c !== "white" && c !== "trans") {
		const fill = getLevel1FillColor(c);
		if (fill && fill !== "white") return fill;
	}
	return null;
}

// ============ 涟漪环可视性 ============
// 涟漪是纯描边环（无填充托底），数据色直接当环色时，深档色画在深背景上会隐身
// （如 deep 蓝 rgb(8,70,165) vs 背景 #10161c 亮度差仅 ~65，环不可见）。
// 保障：环色与背景亮度差不足 RING_MIN_DIFF 时，向远离背景的一端（白或黑）线性混合，
// 色相保持——观感是"同色的更亮/更深一档"，而不是换成别的颜色。

const RING_MIN_DIFF = 110;

export function parseColorValue(c) {
	if (typeof c !== "string") return null;
	const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (hex) {
		const h = hex[1].length === 3 ? hex[1].split("").map(x => x + x).join("") : hex[1];
		const n = parseInt(h, 16);
		return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
	}
	const rgx = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)\s*)?\)$/i);
	if (rgx) return { r: +rgx[1], g: +rgx[2], b: +rgx[3], a: rgx[4] === undefined ? 1 : +rgx[4] };
	return null;
}

const luma = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// 环色/背景任一解析失败 → 原样返回（var() 等运行时色、node 冒烟无背景）
export function ensureRingVisible(color, background) {
	const fg = parseColorValue(color);
	const bg = parseColorValue(background);
	if (!fg || !bg) return color;
	const yFg = luma(fg), yBg = luma(bg);
	if (yBg < 128) {
		if (yFg - yBg >= RING_MIN_DIFF) return color;
		const t = Math.min(1, (RING_MIN_DIFF + yBg - yFg) / (255 - yFg)); // 向白混合
		const mix = c => Math.round(c + t * (255 - c));
		return fg.a >= 1 ? `rgb(${mix(fg.r)}, ${mix(fg.g)}, ${mix(fg.b)})` : `rgba(${mix(fg.r)}, ${mix(fg.g)}, ${mix(fg.b)}, ${fg.a})`;
	}
	if (yBg - yFg >= RING_MIN_DIFF) return color;
	const t = Math.min(1, (yFg - (yBg - RING_MIN_DIFF)) / yFg); // 向黑压暗
	const mix = c => Math.round(c * (1 - t));
	return fg.a >= 1 ? `rgb(${mix(fg.r)}, ${mix(fg.g)}, ${mix(fg.b)})` : `rgba(${mix(fg.r)}, ${mix(fg.g)}, ${mix(fg.b)}, ${fg.a})`;
}

// 应用背景色（页面运行时读主题变量；node/SSR 无 DOM → null → 不调整，保持冒烟确定性）
function appBackgroundColor() {
	if (typeof document === "undefined") return null;
	try {
		const v = getComputedStyle(document.documentElement).getPropertyValue("--background-color").trim();
		return v || null;
	} catch (e) {
		return null;
	}
}

// 涟漪环色：数据色 → 金色兜底 → 可视性保障（与背景对比不足时提亮/压暗）
export function rippleColorOf(state, id) {
	return ensureRingVisible(noteColorOf(state, id) || FX_COLORS.ringStroke, appBackgroundColor());
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

	// 复色涟漪：前后帧都亮着、但颜色变了的音 → 也出扩散环（颜色不变则不出，用户定稿）。
	// 环色 = 新色（涟漪宣告"变成了这个颜色"）；技法参与音同样让位（muteEnter）
	const recolored = nextNotes
		.filter(n => nextActive.has(n.id) && prevActive.has(n.id)
			&& !pairToIds.has(n.id) && !pairFromIds.has(n.id) && !muteEnter.has(n.id))
		.filter(n => {
			const a = noteColorOf(prevState, n.id);
			const b = noteColorOf(nextState, n.id);
			return a && b && a !== b;
		})
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
			// 轨迹颜色（渲染时实时算，不存快照——存了会随帧结构/色系变化过期）：
			// sl 的 B 用结果帧实际色；rt/hp 瞬时 B = A 深一整档（pale→vivid→rich→deep）；
			// bd 推弦的移动本体就是 A——必须用 A 的数据色（B 从未点亮，帧档色会造成推出去时换色）
			const color = tech === "bd"
				? (noteColorOf(nextState, p.from) || noteColorOf(prevState, p.from) || FX_COLORS.dotFill)
				: (noteColorOf(nextState, p.to) // 优先 B 的数据色：pre 移动音符到达时与板面 B 同色交接（无缝，无闪影）
					|| (nextState?.frameTint ? nextState.frameTint.custom : null)
					|| noteColorOf(prevState, p.from)
					|| FX_COLORS.dotFill);
			return {
				from: posOf(prevNotes, p.from),
				to: posOf(nextNotes, p.to),
				tech,
				fromColor: noteColorOf(prevState, p.from), // sl 补画 A（撑到光点抵达）用
				fromLabel: fromNote ? fromNote.noteName : null, // fx 音符的数字/音名（与板面渲染同源）
				toLabel: toNote ? toNote.noteName : null,
				transient: tech === "rt" || tech === "hp" || tech === "pre", // 往返/前置的瞬态音
				color
			};
		})
		.filter(p => p.from && p.to);

	// 复色不参与琶音错开（它不是"出现"，只是"变色"），随进入音一起渲染；
	// 环色统一走 rippleColorOf（数据色→金色兜底→可视性保障：深色环在深背景上要提亮到可见）
	const enteringColored = [...enteringStaggered, ...recolored.map(n => ({ ...n, delayMs: 0 }))].map(n => ({
		...n,
		color: rippleColorOf(nextState, n.id)
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
		// 推弦：模仿真实吉他推弦——音符本体垂直推向邻弦（半程）再弹回，A 的亮灭由板面状态边驱动。
		// 时间分配 = 弯弓搭箭射箭：弯弓（慢推出、张力渐满）→ 搭箭（满弓屏息停顿）→
		// 放箭（出弦即最快、微过冲后回稳，弓弦回弹的余韵）。尾部 100ms 停在 A 盖住板面复亮渐入
		//（dur = BEND_TOTAL + 100，与 timeline 的 fx 轨道同源约定，改常量两边一起）
		if (tech === "bd") {
			const ms = t * dur;
			const amp = (p.to.y - p.from.y) * 0.5; // 推出半程：读作"弦被推向邻弦"，不误读为落到邻弦上
			// 三拍按 dur 等比缩放：标准 fx 轨道 dur=BEND_TOTAL+100 时 k=1（比例即绝对时长）；
			// dock 预览等短窗口（200ms）也能读出弯弓→搭箭→放箭的节奏，而非几乎不动
			const TOT = Math.max(1, dur - 100);
			const k = TOT / BEND_TOTAL;
			const T_OUT = BEND_OUT * k, T_HOLD = (BEND_OUT + BEND_HOLD) * k;
			let disp = 0;
			if (ms >= TOT) disp = 0; // 尾驻留：已回到 A，等板面复亮交接
			else if (ms >= T_HOLD) {
				// 放箭：前段急速弹回并微过冲（越过原位 8%），后段从过冲回稳
				const u = (ms - T_HOLD) / Math.max(1, TOT - T_HOLD);
				if (u < 0.72) disp = amp + (-1.08 * amp) * easeOutQuick(u / 0.72);
				else disp = -0.08 * amp * (1 - easeInOutCubic((u - 0.72) / 0.28));
			}
			else if (ms >= T_OUT) disp = amp; // 搭箭：满弓屏息
			else disp = amp * easeOutCubic(ms / T_OUT); // 弯弓：越拉越沉
			const y = +(p.from.y + disp).toFixed(2);
			els.push({ kind: "note", x: p.from.x, y, r: R, opacity: 1, color: p.color }); // 全程不透明：回到 A 与板面同位同色交接
			// 音名走板面同款渲染（boardStyle）：推的是同一个音，文字观感必须与静止时一致，不能显"变浅"
			if (p.fromLabel) els.push({ kind: "label", x: p.from.x, y, text: p.fromLabel, opacity: 1, color: p.color, boardStyle: true });
			return;
		}

		const isRT = tech === "rt";
		const isQuick = tech === "h" || tech === "p";

		if (tech === "pre" || tech === "sl") {
			// 移动音符语义（sl 与前置划弦同款，用户定稿"A 直接到 B"）：
			// 滑行的就是一个"音符"（圆 + 音名），从 A 划到 B，到达即与板面 B 重合停住。
			// 出发原位/抵达点亮的亮灭由板面状态边驱动，fx 只画移动音符。
			// 行程在前 (dur - 100)ms 内完成、尾部 100ms 停在目的地盖住板面 B 的 CSS 渐入——
			// 板面点亮边在 DOT（=行程完成时刻），音符必须同一刻抵达，否则 B 会"提前出现"
			// （100 = timeline 的 fx 尾驻留，两边常量需一起改）
			const mt = clamp01(t * dur / Math.max(1, dur - 100));
			const prog = easeInOutCubic(mt);
			const x = p.from.x + (p.to.x - p.from.x) * prog;
			els.push({ kind: "note", x: +x.toFixed(2), y: p.from.y, r: R, opacity: 1, color: p.color }); // 全程不透明：到达瞬间与板面 B 同位同色交接
			// 音名交叉淡化：行程前半 A 名淡出，后半 B 名淡入（居中在音符上）
			const fromOp = mt < 0.5 ? +(1 - mt * 2).toFixed(3) : 0;
			const toOp = mt >= 0.5 ? +((mt - 0.5) * 2).toFixed(3) : 0;
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
			// 板面同款音名（推弦移动音符用）：白字 + 同字号 + 投影，与静止音符的文字观感一致；
			// 默认走 ink（sl 交叉淡化等轻提示场景）
			if (el.boardStyle) {
				return `<text x="${el.x}" y="${el.y}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.round(ns.fontSz || 20)}" fill="#ffffff" style="filter:drop-shadow(0 0 1.6px rgb(0,0,1))" opacity="${el.opacity}">${esc(el.text)}</text>`;
			}
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
