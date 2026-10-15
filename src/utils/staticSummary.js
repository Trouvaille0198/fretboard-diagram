// 静态整图快照的动作标注层（Ctrl+Shift+C 复制用）：把动图里每类动作画成静态图形语言。
// 金色统一、形状区分语义：
//   sl    实线箭头 A→B（沿弦滑过去）
//   rt    虚线双头箭头 A↔B（滑出去又回来）
//   hp    弧线箭头 A⇢B（击勾 slur，B 瞬时闪现）
//   pre   虚线箭头 B→A + 起点空心小圆（幽灵音划入本帧）
//   bd    弯钩箭头（从音符弯向推弦方向，终点无音——现实推弦记号）
//   chain 细虚线箭头依次相连（同帧内按序点亮）
// 新增音不加 glyph：出生色档深浅已是时间线（浅早深晚）；
// 离场音（出现过但不在末帧）由调用方整音降透明——"还在响 vs 已离开"一眼可分。
//
// 防重叠两层结构（返回 {under, over}，调用方按层插入板面 SVG）：
//   under 插在音符层之前——连线/弧线从音符背后穿过：起止端露在圆外（留白 R+5 起、R+11 止），
//         中途被音符圆自然遮挡，长滑弦/跨弦链永不压音名；
//   over  叠在最上——推弦弯钩与 pre 空心小圆：锚在音符边缘/圆心的小记号，需要可见。
// 推弦弯钩斜向落点（右偏 30px × 推向 42px）：与邻弦音符圆心距 √(30²+18²)≈35px > r(20)+15，
// 即使邻弦同品有音符也永不相压；链音与技法 pair 同 from+to 时去重，避免双线叠画。
import { CONSTS } from "../constants.js";
import { chainLinksOf } from "./timeline.js";

export const SUMMARY_GOLD = "#f3ba62";
const R = CONSTS.circleRadius;

// 沿切线角的实心箭头（路径终点用）
function arrowHead(x, y, angle, size = 7.5) {
	const c = Math.cos(angle), s = Math.sin(angle);
	const bx = x - c * size, by = y - s * size;
	const nx = -s, ny = c;
	const p1 = `${(bx + nx * size * 0.42).toFixed(1)},${(by + ny * size * 0.42).toFixed(1)}`;
	const p2 = `${(bx - nx * size * 0.42).toFixed(1)},${(by - ny * size * 0.42).toFixed(1)}`;
	return `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${p1} ${p2}" fill="${SUMMARY_GOLD}"/>`;
}

// 直线箭头（可双头/虚线）：两端各留音符半径 + 间隙；
// 短距（邻弦垂直 60px 一类）收紧留白，保证线身仍画得出来
function lineArrow(a, b, { dash, bothEnds = false, width = 2.6 } = {}) {
	const dx = b.x - a.x, dy = b.y - a.y;
	const len = Math.hypot(dx, dy) || 1;
	const ux = dx / len, uy = dy / len;
	const near = len < 2 * R + 24; // 邻弦垂直 60px 一类（<64）收紧留白；滑弦一 fret=80 起不受影响
	const gap = R + (near ? 2 : 5), headRoom = R + (near ? 7 : 11);
	if (len < gap + headRoom) return "";
	const sx = a.x + ux * gap, sy = a.y + uy * gap;
	const ex = b.x - ux * headRoom, ey = b.y - uy * headRoom;
	const ang = Math.atan2(uy, ux);
	const line = `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${SUMMARY_GOLD}" stroke-width="${width}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
	const head = arrowHead(ex + ux * 2, ey + uy * 2, ang);
	const back = bothEnds ? arrowHead(sx - ux * 2, sy - uy * 2, ang + Math.PI) : "";
	return line + head + back;
}

// 弧线箭头（击勾 slur）：二次贝塞尔从中点上方跨过，箭头落在 B 侧
function arcArrow(a, b) {
	const dx = b.x - a.x, dy = b.y - a.y;
	const len = Math.hypot(dx, dy) || 1;
	const ux = dx / len, uy = dy / len;
	const gap = R + 5, headRoom = R + 11;
	if (len < gap + headRoom + 14) return lineArrow(a, b, {});
	const sx = a.x + ux * gap, sy = a.y + uy * gap;
	const ex = b.x - ux * headRoom, ey = b.y - uy * headRoom;
	// 弓起侧：A→B 的法线，始终朝指板上方弓（与 tab 击勾 slur 一致）
	let nx = -uy, ny = ux;
	if (ny > 0) { nx = -nx; ny = -ny; }
	const bow = 20;
	const cx = (sx + ex) / 2 + nx * bow, cy = (sy + ey) / 2 + ny * bow;
	const tangX = ex - cx, tangY = ey - cy;
	return `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${SUMMARY_GOLD}" stroke-width="2.6" stroke-linecap="round"/>`
		+ arrowHead(ex, ey, Math.atan2(tangY, tangX));
}

// 推弦弯钩：从音符边缘向推的方向弯出的小钩，箭头在钩尖——终点不是音符。
// 钩尖落在「右偏 30 × 推向 42」的斜角空档：与邻弦音符圆心距 ≈35px（> r 20 + 15 余量），
// 邻弦同品有音符也永不相压
function bendHook(pos, dir) {
	const s = { x: pos.x - 6, y: pos.y + dir * (R - 6) };
	const c = { x: pos.x + 26, y: pos.y + dir * (R + 2) };
	const e = { x: pos.x + 30, y: pos.y + dir * (R + 22) };
	const tangX = e.x - c.x, tangY = e.y - c.y;
	return `<path d="M ${s.x} ${s.y.toFixed(1)} Q ${c.x} ${c.y.toFixed(1)} ${e.x} ${e.y.toFixed(1)}" fill="none" stroke="${SUMMARY_GOLD}" stroke-width="2.8" stroke-linecap="round"/>`
		+ arrowHead(e.x, e.y, Math.atan2(tangY, tangX), 8);
}

// 汇总一张动图的全部动作 → { under, over } 两个 SVG 片段（板面坐标系）：
// under 插在音符层之前（连线从音符背后过），over 叠最上（弯钩/小圆记号）。
// posOf(id) → {x,y}|null（音符圆心）
export function buildActionOverlay({ transitions = [], frames = [], posOf }) {
	const under = [], over = [];
	const seen = new Set();
	const pos = id => (id && posOf(id)) || null;

	// 帧间转移技法（sl/rt/hp/bd）：进入帧 i 的动作
	transitions.forEach(tr => (tr && tr.pairs || []).forEach(p => {
		const a = pos(p.from), b = pos(p.to);
		if (!a) return;
		if (p.technique === "bd") {
			if (!b) return;
			if (!seen.has(`bd|${p.from}|${p.to}`)) { seen.add(`bd|${p.from}|${p.to}`); over.push(bendHook(a, Math.sign(b.y - a.y) || 1)); }
			return;
		}
		if (!b) return;
		let svg = "";
		if (p.technique === "sl") svg = lineArrow(a, b, {});
		else if (p.technique === "rt") svg = lineArrow(a, b, { dash: "7 4", bothEnds: true });
		else if (p.technique === "hp") svg = arcArrow(a, b);
		if (svg && !seen.has(`${p.technique}|${p.from}|${p.to}`)) {
			seen.add(`${p.technique}|${p.from}|${p.to}`);
			under.push(svg);
		}
	}));

	// 帧内标注：前置划弦（B 划入 A）与链音（依次点亮）
	frames.forEach(f => {
		(f.preSlides || []).forEach(s => {
			const a = pos(s.from), b = pos(s.to);
			if (!a || !b) return;
			const key = `pre|${s.from}|${s.to}`;
			if (seen.has(key)) return;
			const arrow = lineArrow(a, b, { dash: "3 4", width: 2.2 });
			if (!arrow) return;
			seen.add(key);
			under.push(arrow);
			// 起点空心小圆：B 是幽灵音（从未真正点亮）——叠最上，标在幽灵音圆心
			over.push(`<circle cx="${a.x}" cy="${a.y}" r="4.5" fill="none" stroke="${SUMMARY_GOLD}" stroke-width="2"/>`);
		});
		chainLinksOf(f).forEach(l => {
			const a = pos(l.from), b = pos(l.to);
			if (!a || !b) return;
			// 与技法 pair 同 from+to 时只画技法那一条（同线双画只会叠成一团）
			const shadowed = ["sl", "rt", "hp", "bd"].some(t => seen.has(`${t}|${l.from}|${l.to}`));
			if (shadowed) return;
			const key = `chain|${l.from}|${l.to}`;
			if (seen.has(key)) return;
			const arrow = lineArrow(a, b, { dash: "2 3", width: 2 });
			if (!arrow) return;
			seen.add(key);
			under.push(arrow);
		});
	});

	return {
		under: under.length ? `<g class="summary-actions-under">${under.join("")}</g>` : "",
		over: over.length ? `<g class="summary-actions-over">${over.join("")}</g>` : ""
	};
}
