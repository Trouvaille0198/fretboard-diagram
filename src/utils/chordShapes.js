// 和弦形状库——"相对根音的把位模板"体系：
// 形状 = { id, name, quality, rootString, rootPc(原根音,展示/开放形状判定), rel[6](相对根音品的偏移,null=闷),
//          open(原型含空弦音 → 不可平移,只按原把位出候选), links[{a:{s,r}, b:{s,r}}], builtin?, createdAt }
// 应用语义：当前拍和弦(质量+根音) → 库中同质量形状 → 在根音弦上找根音的各把位 → 平移出 N 个候选(校验品窗合法) → 点选写入小图。
// 收集：编辑器里捏好 → shapeFromBoard 提取(根音=最低发声弦,可指定;质量按音程集自动匹配,失败手动分类)。
// 纯 JS(localStorage 可注入),node 冒烟可跑。

import { CHORD_INTERVALS, QUALITIES, chordPcs, resolvedQuality } from "./chordLib.js";
import { OPEN_SHAPES, E_SHAPES, A_SHAPES } from "./voicing.js";

const KEY = "fretboard-chordshapes";

// 与 voicing.js 相同的空弦音高表(s0..s5 = E4 B3 G3 D3 A2 E2)
const STRING_PC = [4, 11, 7, 2, 9, 4];
const pcOf = (s, fret) => ((STRING_PC[s] + fret) % 12 + 12) % 12;

// ============ 存储 ============

export function loadShapes() {
	try {
		const raw = localStorage.getItem(KEY);
		const arr = raw ? JSON.parse(raw) : [];
		return Array.isArray(arr) ? arr.filter(x => x && x.rel && x.quality) : [];
	} catch (e) {
		return [];
	}
}

export function persistShapes(shapes) {
	try { localStorage.setItem(KEY, JSON.stringify(shapes)); } catch (e) { /* 忽略 */ }
}

export function newShapeId() {
	return `shape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// 内置形状（开放和弦 20 个 + E/A 可移动型各质量），与用户收集的合并展示（去重：用户可隐藏内置）
function relFromAbs(frets, rootString, rootFret) {
	return frets.map((f, s) => (f === null || f === undefined ? null : f - rootFret));
}
function linksBetweenStrings(frets) { // 内置形状无连线；占位以便结构一致
	return [];
}

export function builtinShapes() {
	const out = [];
	Object.entries(OPEN_SHAPES).forEach(([k, v]) => {
		const [rootPc, quality] = k.split(":");
		// 根音弦 = 最低发声弦（表内注释保证其 pc = 根音）
		let rootString = -1;
		v.frets.forEach((f, s) => { if (f !== null && f !== undefined) rootString = Math.max(rootString, s); });
		const rootFret = v.frets[rootString];
		out.push({
			id: `bi-open-${k.replace(/[:#]/g, "_")}`, name: `开放 ${rootPc}:${quality || "三和弦"}`, builtin: true,
			quality: quality || "", rootString, rootPc: +rootPc, rootFret,
			rel: relFromAbs(v.frets, rootString, rootFret), open: v.frets.some(f => f === 0),
			links: [], createdAt: 0,
		});
	});
	const addMovable = (table, rootString, rootPc, tag) => {
		Object.entries(table).forEach(([q, frets]) => {
			out.push({
				id: `bi-${tag}-${q || "tri"}`, name: `${tag}型 ${q || "三和弦"}`, builtin: true,
				quality: q, rootString, rootPc, rootFret: 0,
				rel: frets.slice(), open: false, links: [], createdAt: 0,
			});
		});
	};
	addMovable(E_SHAPES, 5, 4, "E");
	addMovable(A_SHAPES, 4, 9, "A");
	return out;
}

// ============ 收集：编辑图数据 → 形状 ============

// data(普通图 data 体系) → 形状；rootNoteId 可指定根音(默认最低发声弦的最高品音)
// 返回 { shape?, quality? 匹配不到时 null(调用方让用户手动分类), intervals }
export function shapeFromBoard(data, rootNoteId = null) {
	const points = [];
	Object.entries(data || {}).forEach(([id, n]) => {
		if (!n || id === "connections" || id.startsWith("conn-")) return;
		if (n.visibility !== "visible" && n.visibility !== "selected") return;
		const m = /^(?:o|f(-?\d+))-s(\d)$/.exec(id);
		if (!m) return;
		points.push({ id, string: +m[2], fret: m[1] === undefined ? 0 : +m[1] + 1 });
	});
	if (!points.length) return { shape: null, quality: null, intervals: [] };
	// 根音：指定音 → 否则最低发声弦（弦号最大；同弦取低品）
	let root = rootNoteId ? points.find(p => p.id === rootNoteId) : null;
	if (!root) root = points.slice().sort((a, b) => b.string - a.string || a.fret - b.fret)[0];
	const rel = new Array(6).fill(null);
	points.forEach(p => { rel[p.string] = p.fret - root.fret; });
	// 连线：端点都在点亮音里才带入（相对坐标）
	const byId = new Map(points.map(p => [p.id, p]));
	const links = [];
	Object.values((data && data.connections) || {}).forEach(c => {
		const a = byId.get(c.startNoteId), b = byId.get(c.endNoteId);
		if (a && b) links.push({ a: { s: a.string, r: a.fret - root.fret }, b: { s: b.string, r: b.fret - root.fret } });
	});
	// 质量推断：音的 pc 集 相对根音 → 半音集；先精确匹配质量的 mod12 集,再允许缺音(省略5音/根音必有)
	const rootPc = pcOf(root.string, root.fret);
	const semis = [...new Set(points.map(p => ((pcOf(p.string, p.fret) - rootPc) % 12 + 12) % 12))].sort((a, b) => a - b);
	const quality = inferQuality(semis);
	return {
		shape: {
			id: newShapeId(), name: "", quality: quality || "",
			rootString: root.string, rootPc, rootFret: root.fret,
			rel, open: points.some(p => p.fret === 0), links, createdAt: Date.now(),
		},
		quality, intervals: semis,
	};
}

// 音程半音集 → 质量；精确相等优先，其次"形状音 ⊆ 质量音程集"(省略音的按法也算该质量)
export function inferQuality(semis) {
	if (!semis.length || !semis.includes(0)) return null;
	const norm = (arr) => [...new Set(arr.map(i => ((i % 12) + 12) % 12))].sort((a, b) => a - b).join(",");
	const target = norm(semis);
	// 精确相等优先;子集匹配(省略音)取音数最少的质量——不依赖遍历顺序
	// (JS 对象整数样键"5"/"6"…会重排到前,Object.keys 序不可靠;空串质量是 falsy 同样不可靠)
	let subsetMatch = null, subsetLen = Infinity;
	for (const q of QUALITIES) {
		const set = norm(CHORD_INTERVALS[q]).split(",");
		if (set.join(",") === target) return q;
		if (semis.every(s => set.includes(String(s))) && set.length < subsetLen) {
			subsetMatch = q; subsetLen = set.length;
		}
	}
	return subsetMatch;
}

// ============ 挑选：和弦 → N 个把位候选 ============

// 候选：{ shape, name, rootString, rootFret(目标根音品), points:[{string,fret}], links:[{a:{s,f},b:{s,f}}] }
// 排序：把位低优先；根音品=0(E/A 开放把)排最后
export function candidatesForChord(chord, key, shapes) {
	if (!chord || chord.degree === undefined) return [];
	const q = resolvedQuality(chord, key);
	const rootPc = chordPcs(chord, key).root;
	const out = [];
	shapes.forEach(shape => {
		if (shape.quality !== q) return;
		if (shape.open) {
			// 开放形状：只在原根音与目标根音同 pc 时按原把位出现
			if (shape.rootPc !== rootPc) return;
			out.push(mkCandidate(shape, shape.rootString, shape.rootFret || 0, rootPc));
			return;
		}
		// 可移动形状：在根音弦上找目标 pc 的各品（0=开放把 E/A 型合法）
		const s = shape.rootString;
		for (let T = 0; T <= 13; T++) {
			if (pcOf(s, T) !== rootPc) continue;
			// 校验：全部按弦品 ∈ [0,15]，且无非根音落在品 0（品 0 只有根音本身合法——空弦音高固定）
			const rel = shape.rel;
			let ok = true;
			for (let i = 0; i < 6 && ok; i++) {
				if (rel[i] === null) continue;
				const f = T + rel[i];
				if (f < 0 || f > 15) { ok = false; break; }
				if (f === 0 && rel[i] !== 0) ok = false; // 平移出的"空弦位"音高不对,非法
			}
			if (ok) out.push(mkCandidate(shape, s, T, rootPc));
		}
	});
	out.sort((a, b) => (a.rootFret === 0 ? 99 : a.rootFret) - (b.rootFret === 0 ? 99 : b.rootFret));
	return out;
}

function mkCandidate(shape, rootString, rootFret, rootPc) {
	const points = [];
	shape.rel.forEach((r, s) => {
		if (r === null) return;
		points.push({ string: s, fret: rootFret + r });
	});
	const links = (shape.links || []).map(l => ({
		a: { s: l.a.s, f: rootFret + l.a.r },
		b: { s: l.b.s, f: rootFret + l.b.r },
	}));
	return { shape, name: shape.name || (shape.builtin ? "内置" : "自定义"), rootString, rootFret, points, links, rootPc };
}

// 候选 → 普通图 data（noteId 体系 + connections），直接可挂拍格小图
export function candidateToData(candidate) {
	const data = {};
	candidate.points.forEach(p => {
		const id = p.fret === 0 ? `o-s${p.string}` : `f${p.fret - 1}-s${p.string}`;
		data[id] = { type: "note", color: "mono", color2: null, visibility: "visible" };
	});
	if (candidate.links.length) {
		data.connections = {};
		candidate.links.forEach((l, i) => {
			const idA = l.a.f === 0 ? `o-s${l.a.s}` : `f${l.a.f - 1}-s${l.a.s}`;
			const idB = l.b.f === 0 ? `o-s${l.b.s}` : `f${l.b.f - 1}-s${l.b.s}`;
			data.connections[`conn-fig-${i}`] = { startNoteId: idA, endNoteId: idB, type: "arc", arrowDirection: "none", strokeWidth: 2 };
		});
	}
	return data;
}
