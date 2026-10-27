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
	return CHORD_DEGREES[(pc - rootPc + 120) % 12] ?? "";
}

// ============ 普通图数据 → 竖式小图数据 ============

// data = 普通图 data(noteId→noteData + connections);产出:
// { points: [{string, fret, id}], links: [{a:{string,fret}, b:{string,fret}, tech}],
//   startFret, window, rootPc(用于和弦内度数,可 null), fail }
// 一弦多点(音阶式)合法:全部点亮音都进 points;fret 用物理品(0=空弦)。
export function boardFigData(data, chord, viewKey) {
	const points = [];
	Object.entries(data || {}).forEach(([id, n]) => {
		if (!n || id === "connections" || id.startsWith("conn-")) return;
		if (n.visibility !== "visible" && n.visibility !== "selected") return;
		const m = /^(?:o|f(-?\d+))-s(\d)$/.exec(id);
		if (!m) return;
		const string = parseInt(m[2], 10);
		const fret = m[1] === undefined ? 0 : parseInt(m[1], 10) + 1;
		points.push({ id, string, fret });
	});
	if (!points.length) return { points: [], links: [], fail: true, startFret: 1, window: 4, rootPc: null };
	const pressed = points.filter(p => p.fret > 0).map(p => p.fret);
	const startFret = pressed.length ? Math.min(...pressed) : 1;
	const maxFret = pressed.length ? Math.max(...pressed) : 1;
	const window = Math.max(4, Math.min(6, maxFret - startFret + 1));
	// 连线:端点必须在点亮音里(两端都找得到才带入)
	const byId = new Map(points.map(p => [p.id, p]));
	const links = [];
	Object.values((data && data.connections) || {}).forEach(c => {
		const a = byId.get(c.startNoteId), b = byId.get(c.endNoteId);
		if (a && b) links.push({ a, b });
	});
	// 和弦内度数的根音(该拍有和弦才给;无和弦拍退化为调内/无标注由调用方决定)
	let rootPc = null;
	try {
		if (chord && chord.degree !== undefined) rootPc = chordPcs(chord, viewKey).root;
	} catch (e) { rootPc = null; }
	return { points, links, startFret, window, rootPc, fail: false };
}

// ============ 渲染 ============

// 小图几何(与 figSvg 同源):cell/网格矩形/坐标映射,编辑器点击交互用
export function figGeometry(fig, opts = {}) {
	const compact = !!opts.compact;
	const horizontal = opts.orientation === "h";
	const nFrets = fig.window || 4;
	const size = opts.size ?? (compact ? 40 : 56);
	const padLc = horizontal ? 0.88 : 1.0, padRc = 0.5;
	const padTc = horizontal ? 0.5 : 0.88, padBc = horizontal ? 0.6 : 0.5;
	const cell = size / (5 + (horizontal ? padTc + padBc : padLc + padRc));
	const spanS = 5 * cell, spanF = nFrets * cell;
	const gridW = horizontal ? spanF : spanS;
	const gridH = horizontal ? spanS : spanF;
	const W = Math.round(horizontal ? spanF + (padLc + padRc) * cell : size);
	const H = Math.round(horizontal ? size : spanF + (padTc + padBc) * cell);
	const L = padLc * cell, T = padTc * cell;
	const pt = (fo, so) => horizontal ? { x: L + fo, y: T + so } : { x: L + so, y: T + fo };
	return { horizontal, nFrets, cell, spanS, spanF, W, H, L, T, pt, startFret: fig.startFret };
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
//         theme {line, fret, dot, ink, link} }
export function figSvg(fig, opts = {}) {
	const compact = !!opts.compact;
	const horizontal = opts.orientation === "h";
	const th = Object.assign({
		line: "rgba(230,237,242,0.5)", fret: "rgba(230,237,242,0.28)",
		dot: "#e8eef4", ink: "#0d141a", link: "rgba(243,186,98,0.8)",
	}, opts.theme);
	const nFrets = fig.window || 4;
	const showNut = fig.startFret <= 1;

	// 正方格(品距=弦距)。两轴:
	//   弦轴:6 弦 = 5 格距;品轴:nFrets 格。
	//   v(琴头在上):弦轴=x、品轴=y;h(琴头在左):弦轴=y、品轴=x —— 网格矩形随方向转置。
	// pad(×cell):v = 左(品数)+顶(×/○ 与琴枕);h = 左(×/○ 与琴枕)+底(品数)。
	// 几何与 hitTest 同源(figGeometry),编辑器点击反算才与渲染完全一致
	const G = figGeometry(fig, opts);
	const cell = G.cell, spanS = G.spanS, spanF = G.spanF;
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
		// 空弦音(品0)落在品轴负向外(琴枕外)的小黑点位;按弦音=各自品格中心
		const fo = p.fret === 0 ? -0.35 * cell : (p.fret - fig.startFret + 0.5) * cell;
		return pt(Math.min(spanF, fo), offS(p.string));
	};
	// 连线(压点下层):沿弦轴外凸的弧
	(fig.links || []).forEach(({ a, b }) => {
		const pa = posOf(a), pb = posOf(b);
		const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
		const bend = 0.55 * cell;
		const horizPair = Math.abs(pa.x - pb.x) > Math.abs(pa.y - pb.y);
		const cx = horizPair ? mx : mx - bend * Math.sign(pb.y - pa.y || 1);
		const cy = horizPair ? my - bend : my;
		svg += `<path d="M ${pa.x.toFixed(2)} ${pa.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${pb.x.toFixed(2)} ${pb.y.toFixed(2)}" fill="none" stroke="${th.link}" stroke-width="${(1.5 * cell / 9).toFixed(2)}" stroke-linecap="round" opacity="0.9"/>`;
	});
	// (闷音/空弦不画 ×/○ —— 传统黑点图不带圈叉标记;闷音直接不显示)
	// 点 + 度数(点径=格距固定比例)
	const degMode = opts.degMode || "none";
	const rDeg = 0.48 * cell, rPlain = 0.35 * cell;
	fig.points.forEach(p => {
		const { x, y } = posOf(p);
		let deg = "";
		if (degMode === "chord" && fig.rootPc !== null) deg = degreeLabel(p.string, p.fret, "chord", fig.rootPc);
		else if (degMode === "scale" && opts.key) deg = degreeLabel(p.string, p.fret, "scale", null, opts.key);
		// 所有点(格内按弦音与琴枕外空弦音)同一套半径/字号的度数——视觉全等
		const r = deg ? rDeg : rPlain;
		svg += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${th.dot}"/>`;
		if (deg) {
			const fs = r * (deg.length > 1 ? 1.02 : 1.22);
			svg += `<text x="${x.toFixed(2)}" y="${(y + fs * 0.36).toFixed(2)}" font-size="${fs.toFixed(2)}" font-weight="700" fill="${th.ink}" text-anchor="middle">${deg}</text>`;
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
		const fs = (0.52 * cell).toFixed(2);
		for (let i = 0; i < nFrets; i++) {
			if (compact && i > 0) break;
			if ((fig.startFret + i) % 2 === 0) continue; // 只标奇数品(教材惯例,偶数品留白)
			const center = (i + 0.5) * cell;
			let anchor;
			if (horizontal) {
				const o = pt(center, spanS + 0.46 * cell);
				anchor = { x: o.x, y: o.y, ta: "middle" };
			} else {
				// v(琴头上):品数在网格左侧 —— x=弦轴负向外偏, y=品轴中心(+文字垂直居中补偿)
				const o = pt(center + 0.19 * cell, -0.18 * cell);
				anchor = { x: o.x, y: o.y, ta: "end" };
			}
			svg += `<text x="${anchor.x.toFixed(2)}" y="${anchor.y.toFixed(2)}" font-size="${fs}" fill="${th.line}" opacity="0.85" text-anchor="${anchor.ta}">${fig.startFret + i}</text>`;
		}
	}
let s = svg;
return s + "</svg>";
}
