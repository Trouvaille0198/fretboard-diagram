// 拼接区（Stitch Dock）模型：普通模式成图的横向拼接队列
// 条目 = 板面快照（state）+ 展示设置（opts，含水平/垂直截断）。
// 拼接核心不变量：指板 Y 向几何恒定（不随品窗变化），各图按指板坐标上下对齐；
// 垂直截断只裁掉上下留白，剩余部分按其所在位置参与对齐。
// 本模块保持纯 JS（可被 node 冒烟测试），渲染相关能力在 StitchDock.jsx。

import { boardGeometry } from "./fretboardCalculations.js";
import { cropBoxOfNotes } from "./animStage.js";

const KEY = "fretboard-stitch";

// ============ 本地存储（localStorage + 滚动备份 ×3，与动图堆同款规矩） ============

export function loadStitch() {
	try {
		const raw = localStorage.getItem(KEY);
		const items = raw ? JSON.parse(raw) : [];
		return Array.isArray(items) ? items.filter(it => it && it.state && typeof it.state === "object") : [];
	} catch (error) {
		console.error("读取拼接区失败:", error);
		return [];
	}
}

export function persistStitch(items) {
	try {
		for (let i = 2; i >= 1; i--) {
			const cur = localStorage.getItem(`fretboard-stitch-bak-${i}`);
			if (cur) localStorage.setItem(`fretboard-stitch-bak-${i + 1}`, cur);
		}
		const prev = localStorage.getItem(KEY);
		if (prev) localStorage.setItem("fretboard-stitch-bak-1", prev);
		localStorage.setItem(KEY, JSON.stringify(items));
	} catch (error) {
		console.error("保存拼接区失败:", error);
	}
}

export function newStitchId() {
	return `st-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============ 单图裁剪框（与动图导出的截断逻辑同式，共用 animStage.cropBoxOfNotes） ============

// 可见音符（含选中态）联合范围 → 统一裁剪框；无可见音符时返回 null（整框）
export function stitchCropBox(state, opts, full) {
	return cropBoxOfNotes([state], full, opts);
}

// 单条目 → 渲染框：full=整板框，vb=实际输出框（含截断）。y 方向锚定指板坐标。
export function stitchFrame(item) {
	const geo = boardGeometry(item.state.startFret, item.state.endFret);
	const full = { x: geo.svgViewBoxX, y: geo.svgViewBoxY, w: geo.svgViewBoxWidth, h: geo.svgViewBoxHeight };
	const crop = stitchCropBox(item.state, item.opts || {}, full);
	const vb = crop || full;
	return { full, vb, crop };
}

// ============ 拼接布局（从左到右 + 指板上下对齐 + 段间分割） ============
// 所有长度均为 SVG 单位；gap 为段间留白，divider 竖线位于留白中央。
// segs[i] = { x, y, w, h, vb, full }：x 为拼接画布内左缘，y 已按指板坐标换算
// （y = vb.y - unionY，即"截断后剩余部分落在画布何处"）。

export function stitchLayout(items, { gap = 26 } = {}) {
	if (!items.length) return { w: 0, h: 0, segs: [], dividers: [] };
	const frames = items.map(stitchFrame);
	const unionY = Math.min(...frames.map(f => f.vb.y));
	const unionB = Math.max(...frames.map(f => f.vb.y + f.vb.h));
	const unionH = unionB - unionY;
	let x = 0;
	const segs = frames.map((f, i) => {
		const seg = { x, y: f.vb.y - unionY, w: f.vb.w, h: f.vb.h, vb: f.vb, full: f.full };
		x += f.vb.w + (i < frames.length - 1 ? gap : 0);
		return seg;
	});
	const dividers = [];
	for (let i = 0; i < frames.length - 1; i++) {
		dividers.push(segs[i].x + segs[i].w + gap / 2);
	}
	return { w: x, h: unionH, y0: unionY, segs, dividers, gap };
}

// 复制/下载输出分辨率：目标高约 560px，段太多时按总宽上限收缩（下限只防退化成 0）
export function stitchScale(layout, { targetHeight = 560, maxWidth = 8192 } = {}) {
	if (!layout || !layout.h || !layout.w) return 1;
	return Math.max(0.05, Math.min(targetHeight / layout.h, maxWidth / layout.w, 2.5));
}

// #rrggbb / rgb() → rgba()（分割线取主题文字色降透明度；解析失败原样返回）
export function withAlpha(color, alpha) {
	if (!color) return color;
	const hex = color.match(/^#([0-9a-f]{6})$/i);
	if (hex) {
		const n = parseInt(hex[1], 16);
		return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
	}
	const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
	if (rgb) {
		const parts = rgb[1].split(",").map(s => parseFloat(s));
		return `rgba(${parts[0]}, ${parts[1] ?? 0}, ${parts[2] ?? 0}, ${alpha})`;
	}
	return color;
}
