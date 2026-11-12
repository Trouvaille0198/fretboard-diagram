// 和弦谱黑点小图(传统 voicing 格)——内核:普通图数据(data 体系)→ 竖式 SVG
// 本质 = 普通图的另一种展示:手画(点格亮灭)、连线带入、随拍格复制,展示时转成竖式黑点格。
// 度数两套可切换:和弦内(R/♭3/5,相对该拍和弦根音) / 调内(1-7 首调数字,相对谱面调)。
// 视觉参数集中在 figSvg();纯 JS 无 DOM,可被 node 冒烟。

import { chordPcs } from "./chordLib.js";

// ============ 度数标签 ============

// 和弦内:半音 → 级数(相对和弦根音)
const CHORD_DEGREES = { 0: "R", 1: "♭2", 2: "2", 3: "♭3", 4: "3", 5: "4", 6: "♭5", 7: "5", 8: "♭6", 9: "6", 10: "♭7", 11: "7" };
// 调内:简谱数字(与谱面级数记谱同体系,b/# 变化音写法一致);小调主音级数优先用自然小调表
const MAJOR_DEGREES = { 0: "1", 1: "#1", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "#4", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" };
const MINOR_NATURAL = { 0: "1", 2: "2", 3: "♭3", 5: "4", 7: "5", 8: "♭6", 10: "♭7" };

const STRING_OPEN_PC = [4, 11, 7, 2, 9, 4]; // s0..s5 = E4 B3 G3 D3 A2 E2(C 基 pitch class)

const pcOfNote = (string, fret) => (STRING_OPEN_PC[string] + fret) % 12;

// 度数标签:mode='chord'(和弦内,rootPc=和弦根音) | 'scale'(调内,keyRoot+minor)
export function degreeLabel(string, fret, mode, rootPc, key) {
	const pc = pcOfNote(string, fret);
	if (mode === "scale") {
		const rel = (pc - key.root + 120) % 12;
		if (key.minor) return MINOR_NATURAL[rel] ?? MAJOR_DEGREES[rel] ?? "";
		return MAJOR_DEGREES[rel] ?? "";
	}
	if (rootPc == null) {
		// 无和弦根（延音拍等）：降级为调内级数，不给空白点
		const rel = (pc - key.root + 120) % 12;
		return key.minor ? (MINOR_NATURAL[rel] ?? MAJOR_DEGREES[rel] ?? "") : (MAJOR_DEGREES[rel] ?? "");
	}
	return CHORD_DEGREES[(pc - rootPc + 120) % 12] ?? "";
}

// ============ 普通图数据 → 竖式小图数据 ============

// 幽灵音符（划音起点）：可见性透明、无实色——主编辑器"从空音符拖到相邻一品实音"的半音划音手势产生
const isGhostNote = (n) => !!n && (!n.color || n.color === "white") && n.color2 == null;

// data = 普通图 data(noteId→noteData + connections);产出:
// { points: [{string, fret, ghost?, id}], links: [{a,b, type:'line'|'arc', arrowDirection, ghost?}],
//   startFret, window, rootPc(用于和弦内度数,可 null), fail }
// 一弦多点(音阶式)合法;划音的幽灵起点(透明音)也进 points(ghost:true)——但不参与品窗收敛(它不是实音)
export function boardFigData(data, chord, viewKey) {
	const points = [];
	Object.entries(data || {}).forEach(([id, n]) => {
		if (!n || id === "connections" || id.startsWith("conn-")) return;
		if (n.visibility !== "visible" && n.visibility !== "selected") return;
		const m = /^(?:o|f(-?\d+))-s(\d)$/.exec(id);
		if (!m) return;
		const string = parseInt(m[2], 10);
		const fret = m[1] === undefined ? 0 : parseInt(m[1], 10) + 1;
		points.push({ id, string, fret, ghost: false });
	});
	// 划音幽灵起点：透明音符，只作为连线端点存在——补进点集（ghost:true），不参与品窗
	const conns = Object.values((data && data.connections) || {});
	conns.forEach(c => {
		for (const nid of [c.startNoteId, c.endNoteId]) {
			if (points.some(p => p.id === nid)) continue;
			// 纯幽灵起点在主板上根本没有 data 条目（空音符从未着色）——noteId 本身带弦/品位，直接补点；
			// 非幽灵连线的熄灭端点照旧丢弃（与主板同款：删音连线不渲染）
			if (!c.ghost) continue;
			const m = /^(?:o|f(-?\d+))-s(\d)$/.exec(nid);
			if (!m) continue;
			const string = parseInt(m[2], 10);
			const fret = m[1] === undefined ? 0 : parseInt(m[1], 10) + 1;
			points.push({ id: nid, string, fret, ghost: true });
		}
	});
	if (!points.length) return { points: [], links: [], fail: true, startFret: 1, window: 4, rootPc: null };
	const pressed = points.map(p => p.fret).filter(f => f > 0); // 空弦(品0)不算起点;幽灵起点参与品窗覆盖（滑入起点常比实音低一品，窗必须盖住它）
	const startFret = pressed.length ? Math.min(...pressed) : 1;
	const maxFret = pressed.length ? Math.max(...pressed) : 1;
	const window = Math.max(4, Math.min(6, maxFret - startFret + 1));
	// 连线:端点必须在点集里(含幽灵起点);样式(直线/弧、箭头、划音 ghost)随主板数据原样带入——
	// 以前只存 {a,b},小图把三种预设一律画成弧,直线也成了弧、箭头全丢
	const byId = new Map(points.map(p => [p.id, p]));
	const links = [];
	conns.forEach(c => {
		const a = byId.get(c.startNoteId), b = byId.get(c.endNoteId);
		if (a && b) links.push({ a, b, type: c.type === "arc" ? "arc" : "line", arrowDirection: c.arrowDirection || "none", ghost: !!c.ghost, arcCurvature: c.arcCurvature });
	});
	// 和弦内度数的根音(该拍有和弦才给;无和弦拍退化为调内/无标注由调用方决定)
	let rootPc = null;
	try {
		if (chord && chord.degree !== undefined) rootPc = chordPcs(chord, viewKey).root;
	} catch (e) { rootPc = null; }
	return { points, links, startFret, window, rootPc, fail: false };
}

// ============ 编辑器品窗 ============

// 已点亮(visible/selected)的按弦物理品号列表(空弦不算)——与 serializeBoard/boardFigData 同口径,熄灭的不算"有音符"
export function pressedFrets(data) {
	return Object.entries(data || {}).map(([id, n]) => {
		if (!n || (n.visibility !== "visible" && n.visibility !== "selected")) return null;
		const m = /^f(-?\d+)-s\d$/.exec(id);
		return m ? +m[1] + 1 : null;
	}).filter(v => v && v > 0);
}

// 指法图编辑器品窗({start,end}:显示品位 = start+1..end,start=0 带开放弦列)——有音符的部分永远居中:
//   音符两侧等量留白铺到 defSpan;左侧撞琴枕(起品 <1)时右侧也等量收回,音符仍在正中——
//   原先只把 start 夹到 0、右边照铺,开放/低把位和弦(C/G/Am 这些最常见的)就成了 14 品大板堆在最左;
//   收到比 minSpan 还短时只能往右补(左边已是琴枕);右侧顶到 22 品则整体左移。无点亮按弦音 → 0..defSpan 空板。
export function fitFretWindow(data, defSpan = 14, minSpan = 5) {
	const pressed = pressedFrets(data);
	if (!pressed.length) return { start: 0, end: defSpan };
	const min = Math.min(...pressed), max = Math.max(...pressed);
	const pad = Math.max(0, Math.floor((defSpan - (max - min + 1)) / 2));
	let s = min - pad, e = max + pad;
	if (s < 1) { e -= 1 - s; s = 1; }
	const mn = Math.min(minSpan, defSpan);
	if (e - s + 1 < mn) e = s + mn - 1;
	if (e > 22) { s = Math.max(1, s - (e - 22)); e = 22; }
	return { start: s - 1, end: e };
}

// ============ 渲染 ============

// 小图几何(与 figSvg 同源):cell/网格矩形/坐标映射,编辑器点击交互用
// opts.boxW/boxH(px,成对给):跨拍拉宽——图要撑满一个已知宽高的盒子时,弦轴/品轴各自定格距(cellS/cellF),
// 格子只在宽度方向拉开、高度不变;点径/字号/线宽等"视觉尺寸"取两轴较紧的一侧(cell),与不拉宽时完全一致。
// 盒宽低于自然纵横比的 0.62 倍(再拉就压成纸条)时忽略盒子,退回原比例——轻微压扁可以,纸条不行。
export function figGeometry(fig, opts = {}) {
	const compact = !!opts.compact;
	const horizontal = opts.orientation === "h";
	const nFrets = fig.window || 4;
	const size = opts.size ?? (compact ? 40 : 56);
	// 品数侧的边距要容下"白点半径 0.40c + 间隙 + 两位品数宽(~0.7c)"——品数贴网格摆会被边缘音白点盖住(白字叠白点)
	const padLc = horizontal ? 0.88 : 1.3, padRc = 0.5;
	const padTc = horizontal ? 0.5 : 0.88, padBc = horizontal ? 1.0 : 0.5;
	// 两轴总格数(含边距):x 轴 / y 轴
	const unitsX = horizontal ? nFrets + padLc + padRc : 5 + padLc + padRc;
	const unitsY = horizontal ? 5 + padTc + padBc : nFrets + padTc + padBc;
	let cellS, cellF, cell, W, H;
	// 守卫下限 = 自然纵横比的 0.62 倍：跨拍盒宽(简略模式跨2拍才 ~150px)常低于自然宽(如 h/6品 164px、v/4品 182px),
	// 按自然比卡会把这些全打成信箱留白、网格根本没拉开; mild 压扁无害——点径/字号取紧轴自动缩小,
	// 品数位 padL 在 0.62 时仍有 ~0.8 品距余量。比 0.62 还窄才退回原比例(绝不压成纸条)。
	const boxOk = opts.boxW != null && opts.boxH != null && opts.boxW >= opts.boxH * unitsX / unitsY * 0.62 - 0.5;
	if (boxOk) {
		W = Math.round(opts.boxW); H = Math.round(opts.boxH);
		const cellX = W / unitsX, cellY = H / unitsY;
		cellS = horizontal ? cellY : cellX; // 弦轴:h 在 y、v 在 x
		cellF = horizontal ? cellX : cellY; // 品轴:h 在 x、v 在 y
		cell = Math.min(cellX, cellY);
	} else {
		cell = size / (5 + (horizontal ? padTc + padBc : padLc + padRc));
		cellS = cellF = cell;
		W = Math.round(horizontal ? nFrets * cell + (padLc + padRc) * cell : size);
		H = Math.round(horizontal ? size : nFrets * cell + (padTc + padBc) * cell);
	}
	const spanS = 5 * cellS, spanF = nFrets * cellF;
	// 边距按所在轴的格距走:x 轴边距(品数位/右留白)×x 轴格距,y 轴同理
	const L = padLc * (horizontal ? cellF : cellS), T = padTc * (horizontal ? cellS : cellF);
	const pt = (fo, so) => horizontal ? { x: L + fo, y: T + so } : { x: L + so, y: T + fo };
	return { horizontal, nFrets, cell, cellS, cellF, spanS, spanF, W, H, L, T, pt, startFret: fig.startFret };
}

// 点击命中:svg 内像素坐标(px,py,已按 viewBox 换算) → { string, fret }(品窗格位,含空弦列) | null
export function figHitTest(geom, px, py) {
	const rel = geom.horizontal ? { fo: px - geom.L, so: py - geom.T } : { fo: py - geom.T, so: px - geom.L };
	if (rel.so < -0.3 * geom.cell || rel.so > geom.spanS + 0.3 * geom.cell) return null;
	const string = Math.round(rel.so / geom.spanS * 5);
	// 品轴:-0.35c 处为空弦列;[0, spanF] 每格一档
	if (rel.fo >= -0.7 * geom.cell && rel.fo < 0.2 * geom.cell) return { string, fret: 0 };
	const inGrid = rel.fo - 0.2 * geom.cell;
	if (inGrid < 0 || inGrid > geom.spanF) return null;
	const col = Math.floor(inGrid / geom.spanF * geom.nFrets);
	return { string, fret: geom.startFret + col };
}

// fig(boardFigData) → SVG 字符串。
// opts: { orientation 'v'(默认,琴头在上)| 'h'(普通图方向,琴头在左、品窗横向拉开),
//         size 主轴px(默认 v:宽56 / h:高64), compact 半拍简版, degMode 'chord'|'scale'|'none',
//         key({root,minor},degMode='scale' 必须), editGrid 编辑态(全格白点),
//         theme {line, fret, dot, ink, link},
//         boxW/boxH 撑满指定盒子(px,成对):内嵌图行跨拍拉宽用,只拉开弦/品格距、点径字号不变(见 figGeometry) }
export function figSvg(fig, opts = {}) {
	const compact = !!opts.compact;
	const horizontal = opts.orientation === "h";
	const th = Object.assign({
		line: "rgba(230,237,242,0.5)", fret: "rgba(230,237,242,0.28)",
		dot: "#e8eef4", ink: "#0d141a", link: "rgba(243,186,98,0.8)",
	}, opts.theme);
	const nFrets = fig.window || 4;
	const showNut = fig.startFret <= 1;

	// 正方格(品距=弦距;boxW/boxH 拉宽时品距/弦距各算,cell 取紧轴只管视觉尺寸)。两轴:
	//   弦轴:6 弦 = 5 格距;品轴:nFrets 格。
	//   v(琴头在上):弦轴=x、品轴=y;h(琴头在左):弦轴=y、品轴=x —— 网格矩形随方向转置。
	// pad(×cell):v = 左(品数)+顶(×/○ 与琴枕);h = 左(×/○ 与琴枕)+底(品数)。
	// 几何与 hitTest 同源(figGeometry),编辑器点击反算才与渲染完全一致
	const G = figGeometry(fig, opts);
	const cell = G.cell, cellF = G.cellF, spanS = G.spanS, spanF = G.spanF;
	const W = G.W, H = G.H, L = G.L, R = L + (horizontal ? spanF : spanS);
	const T = G.T, B = T + (horizontal ? spanS : spanF);
	const offS = (i) => spanS * i / 5;
	const offF = (i) => spanF * i / nFrets;
	const pt = G.pt;
	const X1 = (o) => o.x.toFixed(2), Y1 = (o) => o.y.toFixed(2);

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chord-fig">`;

	// 弦线(等宽):沿品轴方向的直线,过各自弦轴位置
	const sw = (0.9 * cell / 9).toFixed(2);
	for (let i = 0; i < 6; i++) {
		const a = pt(0, offS(i)), b = pt(spanF, offS(i));
		svg += `<line x1="${X1(a)}" y1="${Y1(a)}" x2="${X1(b)}" y2="${Y1(b)}" stroke="${th.line}" stroke-width="${sw}"/>`;
	}
	// 品线:沿弦轴方向,过各品格线
	const fw = (1 * cell / 9).toFixed(2);
	for (let i = 0; i <= nFrets; i++) {
		const a = pt(offF(i), 0), b = pt(offF(i), spanS);
		svg += `<line x1="${X1(a)}" y1="${Y1(a)}" x2="${X1(b)}" y2="${Y1(b)}" stroke="${th.fret}" stroke-width="${fw}"/>`;
	}
	// 琴枕:品轴起点外侧的粗条(v=顶部横条,h=左侧竖条)
	if (showNut) {
		const t = (2.2 * cell / 9).toFixed(2);
		if (horizontal) svg += `<rect x="${(L - parseFloat(t)).toFixed(2)}" y="${T.toFixed(2)}" width="${t}" height="${spanS.toFixed(2)}" rx="${(cell / 14).toFixed(2)}" fill="${th.line}"/>`;
		else svg += `<rect x="${L.toFixed(2)}" y="${(T - parseFloat(t)).toFixed(2)}" width="${spanS.toFixed(2)}" height="${t}" rx="${(cell / 14).toFixed(2)}" fill="${th.line}"/>`;
	}
	// 音符坐标:品格中心(品轴)+ 弦位(弦轴)
	const posOf = (p) => {
		// 空弦音(品0)落在品轴负向外(琴枕外)的小黑点位;按弦音=各自品格中心——品轴偏移按品轴格距(拉宽时与弦轴不同)
		const fo = p.fret === 0 ? -0.35 * cellF : (p.fret - fig.startFret + 0.5) * cellF;
		return pt(Math.min(spanF, fo), offS(p.string));
	};
	// 度数与点径(连线箭头要贴点边缘落,先于连线算)
	const degMode = opts.degMode || "none";
	const degFor = (p) => {
		if (degMode === "chord" && fig.rootPc !== null) return degreeLabel(p.string, p.fret, "chord", fig.rootPc);
		if (degMode === "scale" && opts.key) return degreeLabel(p.string, p.fret, "scale", null, opts.key);
		return "";
	};
	// 带度数的点 0.40 格:相邻弦的点之间留 0.2 格空隙(0.44 时 R 5 ♭3 三点相贴)
	const rDeg = 0.42 * cell, rPlain = 0.40 * cell;
	const dotR = (p) => (degFor(p) ? rDeg : rPlain);
	// 连线(压点下层):主板三种预设如实成形——line/line-arrow 直线;arc-arrow 弧线:两端各沿垂直于两音连线的方向
	// 起落的 cubic(切线正对圆心,可见段始终"对着音符中心";二次曲线的控制点悬在两音中点上,短跨距时斜切圆边像没对准)。
	// 以前不分预设一律画弧,直线也成了弧、箭头全丢。带箭头的一端沿路径实际走向画小三角,箭尖贴圆点边缘
	const linkStroke = (1.5 * cell / 9).toFixed(2);
	const arrowLen = 0.5 * cell, arrowHalf = 0.375 * arrowLen;
	const rGhost = 0.3 * cell; // 划音幽灵起点：空心圆环半径（比实音点小一号）
	// 幽灵端点的线从圆环边缘起笔（空心环里穿过线会显脏）；实音端仍从圆心
	const anchor = (p, other) => {
		if (!p.ghost) return posOf(p);
		const o = posOf(other);
		const px = posOf(p);
		const dx = o.x - px.x, dy = o.y - px.y, len = Math.hypot(dx, dy) || 1;
		return { x: px.x + dx / len * rGhost, y: px.y + dy / len * rGhost };
	};
	(fig.links || []).forEach(({ a, b, type = "line", arrowDirection = "none", arcCurvature }) => {
		const pa = anchor(a, b), pb = anchor(b, a);
		const dx = pb.x - pa.x, dy = pb.y - pa.y;
		const len = Math.hypot(dx, dy) || 1;
		let P1 = null, P2 = null, QC = null;
		let d = `M ${pa.x.toFixed(2)} ${pa.y.toFixed(2)}`;
		if (type === "arc" && typeof arcCurvature === "number") {
			// 编辑时为准：与主板 calculateArcPath 同式——正=向上拱，Q 曲线，拱高=|k|·距离·0.3
			// （h 版谱面坐标整体转置，同一公式在转置坐标系里自然给出转置后的弯曲，画面与编辑一致）
			const h = Math.abs(arcCurvature) * len * 0.3;
			const sign = arcCurvature > 0 ? -1 : 1;
			QC = { x: (pa.x + pb.x) / 2 + (-dy / len) * h * sign, y: (pa.y + pb.y) / 2 + (dx / len) * h * sign };
			d += ` Q ${QC.x.toFixed(2)} ${QC.y.toFixed(2)}, ${pb.x.toFixed(2)} ${pb.y.toFixed(2)}`;
		} else if (type === "arc") {
			const bend = 0.55 * cell;
			let nx = -dy / len, ny = dx / len; // 连线方向的垂直线
			if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; } // 旧数据无弧度字段：沿用启发式，弧统一拱向谱面上方/左侧
			P1 = { x: pa.x + nx * bend, y: pa.y + ny * bend };
			P2 = { x: pb.x + nx * bend, y: pb.y + ny * bend };
			d += ` C ${P1.x.toFixed(2)} ${P1.y.toFixed(2)}, ${P2.x.toFixed(2)} ${P2.y.toFixed(2)}, ${pb.x.toFixed(2)} ${pb.y.toFixed(2)}`;
		} else {
			d += ` L ${pb.x.toFixed(2)} ${pb.y.toFixed(2)}`;
		}
		svg += `<path d="${d}" fill="none" stroke="${th.link}" stroke-width="${linkStroke}" stroke-linecap="round" opacity="0.9"/>`;
		// 路径上 t∈[0,1] 的点(直线/Q/cubic 同一入口,箭头按采样走向摆——弧线末端方向≠两音连线方向)
		const at = (t) => {
			if (type !== "arc") return { x: pa.x + dx * t, y: pa.y + dy * t };
			if (QC) { const s = 1 - t; return { x: s * s * pa.x + 2 * s * t * QC.x + t * t * pb.x, y: s * s * pa.y + 2 * s * t * QC.y + t * t * pb.y }; }
			const s = 1 - t, k0 = s * s * s, k1 = 3 * s * s * t, k2 = 3 * s * t * t, k3 = t * t * t;
			return { x: k0 * pa.x + k1 * P1.x + k2 * P2.x + k3 * pb.x, y: k0 * pa.y + k1 * P1.y + k2 * P2.y + k3 * pb.y };
		};
		// 从该端沿路径向内:走出圆点半径处=箭尖,再走一个箭长=箭底;三角沿箭底→箭尖方向
		const arrowAt = (end) => {
			const r = dotR(end === "end" ? b : a);
			const N2 = 48, pts = [];
			for (let i = 0; i <= N2; i++) pts.push(at(end === "end" ? 1 - i / N2 : i / N2));
			let acc = 0, tip = null, base = null;
			for (let i = 1; i < pts.length && !base; i++) {
				acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
				if (!tip && acc >= r) tip = pts[i];
				else if (tip && acc >= r + arrowLen) base = pts[i];
			}
			if (!tip || !base) return; // 两音挨得太近,放不下箭头就不画
			const ux = tip.x - base.x, uy = tip.y - base.y, ul = Math.hypot(ux, uy) || 1;
			const px = -uy / ul * arrowHalf, py = ux / ul * arrowHalf;
			svg += `<polygon points="${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${(base.x + px).toFixed(2)},${(base.y + py).toFixed(2)} ${(base.x - px).toFixed(2)},${(base.y - py).toFixed(2)}" fill="${th.link}" opacity="0.95"/>`;
		};
		if (arrowDirection === "end" || arrowDirection === "both") arrowAt("end");
		if (arrowDirection === "start" || arrowDirection === "both") arrowAt("start");
	});
	// (闷音/空弦不画 ×/○ —— 传统黑点图不带圈叉标记;闷音直接不显示)
	// 点 + 度数(点径=格距固定比例);划音幽灵起点不画圈——只留箭头指向目标音（用户要求起点音不展示）
	fig.points.forEach(p => {
		const { x, y } = posOf(p);
		if (p.ghost) {
			return; // 幽灵起点只作为箭头几何端点存在（posOf 坐标仍供连线用），不画圈不标度数
		}
		const deg = degFor(p);
		// 所有点(格内按弦音与琴枕外空弦音)同一套半径/字号的度数——视觉全等
		const r = deg ? rDeg : rPlain;
		svg += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${th.dot}"/>`;
		if (deg) {
			// 变化音用 ASCII b/#(与调内写法一致):♭/♯ 在 Segoe UI 等正文字体里没有字形,会掉到衬线符号字体——
			// 又细又宽还带空隙,与粗体数字不搭;整段普通字体同字号,数字也不会被挤小
			const label = deg.replace(/♭/g, "b").replace(/♯/g, "#");
			const acc = /^([b#])(\d)$/.exec(label);
			if (acc) {
				// 带升降号的度数(b3/#4):升降号缩小(1.05r)、数字放大(1.8r,接近单字的 1.9r)——
				// 原先两字同为 1.5r,升降号喧宾夺主、数字反而小。总墨迹宽 ≈0.55r+1.08r=1.63r,仍在点径(2r)内;
				// 升降号用 dy 抬到数字中线附近(两者高度差的 0.35),第二个 tspan 用 dy 回到基线
				const fsD = r * 1.8, fsA = r * 1.05;
				const lift = (0.35 * (fsD - fsA)).toFixed(2);
				svg += `<text x="${x.toFixed(2)}" y="${(y + fsD * 0.36).toFixed(2)}" font-weight="700" fill="${th.ink}" text-anchor="middle">` +
					`<tspan font-size="${fsA.toFixed(2)}" dy="-${lift}">${acc[1]}</tspan><tspan font-size="${fsD.toFixed(2)}" dy="${lift}">${acc[2]}</tspan></text>`;
			} else {
				// 字号按字数顶满点径不溢出:单字 1.9r(大写高≈点径 2/3),双字 1.5r(最宽的 #4 墨迹宽≈点径 85%),更多按比例缩
				const fs = r * (label.length === 1 ? 1.9 : label.length === 2 ? 1.5 : 3 / label.length);
				svg += `<text x="${x.toFixed(2)}" y="${(y + fs * 0.36).toFixed(2)}" font-size="${fs.toFixed(2)}" font-weight="700" fill="${th.ink}" text-anchor="middle">${label}</text>`;
			}
		}
	});
	// 编辑态:全部格位铺白点暗圆(点击目标)
	if (opts.editGrid) {
		const lit = new Set(fig.points.map(p => p.string + ":" + p.fret));
		const gr = 0.2 * cell;
		for (let i = 0; i < 6; i++) {
			const cols = [];
			for (let f = fig.startFret; f < fig.startFret + nFrets; f++) { if (!lit.has(i + ":" + f)) cols.push(f); }
			if (fig.startFret <= 1 && !lit.has(i + ":0")) cols.push(0);
			cols.forEach(f => {
				const p2 = { string: i, fret: f };
				const o = posOf(p2);
				svg += `<circle cx="${o.x.toFixed(2)}" cy="${o.y.toFixed(2)}" r="${gr.toFixed(2)}" fill="rgba(230,237,242,0.13)"/>`;
			});
		}
	}
	// 品数:每品标实际品号(品轴各品中心、弦轴外侧:v=网格左,h=网格下);compact 只标起始品
	if (opts.fretNums !== false && nFrets > 0) {
		const fs = (0.6 * cell).toFixed(2);
		for (let i = 0; i < nFrets; i++) {
			if (compact && i > 0) break;
			if ((fig.startFret + i) % 2 === 0) continue; // 只标奇数品(教材惯例,偶数品留白)
			const center = (i + 0.5) * cellF; // 品轴格距(拉宽时≠弦轴)
			let anchor;
			if (horizontal) {
				// h(琴头在左):品数在网格下方——基线沉到边缘音白点底(spanS+rDeg)+0.5c,字顶(基线上方 0.42c)才清得开白点
				const o = pt(center, spanS + rDeg + 0.50 * cell);
				anchor = { x: o.x, y: o.y, ta: "middle" };
			} else {
				// v(琴头上):品数在网格左侧,退到边缘音白点(rDeg)之外再留间隙;x=弦轴负向外偏, y=品轴中心(+文字垂直居中补偿)
				const o = pt(center + 0.19 * cell, -(rDeg + 0.10 * cell));
				anchor = { x: o.x, y: o.y, ta: "end" };
			}
			svg += `<text x="${anchor.x.toFixed(2)}" y="${anchor.y.toFixed(2)}" font-size="${fs}" font-weight="600" fill="${th.dot}" text-anchor="${anchor.ta}">${fig.startFret + i}</text>`;
		}
	}
let s = svg;
return s + "</svg>";
}
