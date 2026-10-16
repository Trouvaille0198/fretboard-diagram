// 和弦 → 吉他指板按法（和弦谱播放与动图生成都走这里，看到=听到）
// 约定与 audioService 一致：string 0-5 = 1弦(细)→6弦(粗)；品 idx：-1=空弦，0=第一品
// noteId：`f${idx}-s${s}` / `o-s${s}`

import { chordPcs, bassPc, resolvedQuality } from "./chordLib.js";

// C 基 pitch class：s0..s5 = E4 B3 G3 D3 A2 E2
const STRING_PC = [4, 11, 7, 2, 9, 4];

// 物理品（0=空弦）→ pitch class
export const pcPhys = (s, f) => ((STRING_PC[s] + f) % 12 + 12) % 12;

// noteId → pitch class（测试/校验用）
export function noteIdPc(id) {
	const m = /^(?:o|f(-?\d+))-s(\d)$/.exec(id || "");
	if (!m) return null;
	const fret = m[1] === undefined ? 0 : parseInt(m[1], 10) + 1; // 物理品
	return pcPhys(parseInt(m[2], 10), fret);
}

// ============ 开放和弦表 ============
// key = `${rootPc}:${quality}`；frets 为物理品 s0..s5（null=闷音）
// 最低发声弦的 pc 都等于根音（表内已核对）
const OPEN_SHAPES = {
	"0:": { frets: [0, 1, 0, 2, 3, null] },      // C  x32010
	"0:7": { frets: [0, 1, 3, 2, 3, null] },     // C7 x32310
	"0:maj7": { frets: [0, 0, 0, 2, 3, null] },  // Cmaj7 x32000
	"2:": { frets: [2, 3, 2, 0, null, null] },   // D  xx0232
	"2:m": { frets: [1, 3, 2, 0, null, null] },  // Dm xx0231
	"2:7": { frets: [2, 1, 2, 0, null, null] },  // D7 xx0212
	"2:sus2": { frets: [0, 3, 2, 0, null, null] },  // Dsus2 xx0230
	"2:sus4": { frets: [3, 3, 2, 0, null, null] },  // Dsus4 xx0233
	"4:": { frets: [0, 0, 1, 2, 2, 0] },         // E  022100
	"4:m": { frets: [0, 0, 0, 2, 2, 0] },        // Em 022000
	"4:7": { frets: [0, 0, 1, 0, 2, 0] },        // E7 020100
	"4:maj7": { frets: [0, 0, 1, 1, 2, 0] },     // Emaj7 021100
	"7:": { frets: [3, 0, 0, 0, 2, 3] },         // G  320003
	"7:7": { frets: [1, 0, 0, 0, 2, 3] },        // G7 320001
	"9:": { frets: [0, 2, 2, 2, 0, null] },      // A  x02220
	"9:m": { frets: [0, 1, 2, 2, 0, null] },     // Am x02210
	"9:7": { frets: [0, 2, 0, 2, 0, null] },     // A7 x02020
	"9:maj7": { frets: [0, 2, 1, 2, 0, null] },  // Amaj7 x02120
	"9:sus2": { frets: [0, 0, 2, 2, 0, null] },  // Asus2 x02200
	"9:sus4": { frets: [0, 3, 2, 2, 0, null] }   // Asus4 x02230
};

// ============ 可移动把位 ============
// 偏移相对根音品（物理品）；null=闷音
// E 型：根音在 6 弦（s5）
const E_SHAPES = {
	"": [0, 0, 1, 2, 2, 0],
	m: [0, 0, 0, 2, 2, 0],
	7: [0, 0, 1, 0, 2, 0],
	m7: [0, 0, 0, 0, 2, 0],
	maj7: [null, 0, 1, 1, 2, 0],
	sus4: [0, 0, 2, 2, 2, 0],
	sus2: [null, null, 4, 4, 2, 0],
	6: [0, 2, 1, 2, 2, 0]
};

// A 型：根音在 5 弦（s4），6 弦闷
const A_SHAPES = {
	"": [0, 2, 2, 2, 0, null],
	m: [0, 1, 2, 2, 0, null],
	7: [0, 2, 0, 2, 0, null],
	m7: [0, 1, 0, 2, 0, null],
	maj7: [0, 2, 1, 2, 0, null],
	sus4: [0, 3, 2, 2, 0, null],
	sus2: [0, 0, 2, 2, 0, null],
	6: [2, 2, 2, 2, 0, null]
};

const idxOf = (f) => (f === 0 ? -1 : f - 1); // 物理品 → audioService 品 idx

function fromFrets(frets, shape) {
	const notes = [];
	let minFret = Infinity, maxFret = -Infinity, hasOpen = false;
	frets.forEach((f, s) => {
		if (f === null || f === undefined) return;
		if (f === 0) hasOpen = true;
		else { minFret = Math.min(minFret, f); maxFret = Math.max(maxFret, f); }
		notes.push({ id: f === 0 ? `o-s${s}` : `f${f - 1}-s${s}`, string: s, idx: idxOf(f), fret: f });
	});
	if (!notes.length) return null;
	notes.sort((a, b) => b.string - a.string); // 低音弦在前（播放低音→高音）
	return { notes, minFret: hasOpen ? 0 : minFret, maxFret: Math.max(maxFret, hasOpen ? 0 : minFret), hasOpen, shape };
}

function lowestPc(v) {
	return v.notes.length ? pcPhys(v.notes[0].string, v.notes[0].fret) : null;
}

// 根音品候选（物理品）：弦 s 上能按下 rootPc 的最低两档位置
function rootCandidates(rootPc, s) {
	const f0 = ((rootPc - STRING_PC[s]) % 12 + 12) % 12;
	return [f0, f0 + 12].filter(f => f <= 13);
}

// 算法兜底按法（斜杠转位、dim/aug/9/add9 等无形状表的质量）：
// 锚点 = 低音在低音弦上的落点（斜杠）或根音品（普通）；逐弦在 [锚, 锚+3] ∪ 低把位空弦内取最低和弦音
function autoVoicing(pcs, rootPc, bass, slash) {
	const set = new Set(pcs);
	// 锚点候选：斜杠 → 低音先落 6/5 弦；普通 → 根音 E/A 型锚
	const anchors = [];
	if (slash) {
		[5, 4].forEach(s => {
			const f0 = ((bass - STRING_PC[s]) % 12 + 12) % 12;
			[f0, f0 + 12].filter(f => f <= 8).forEach(f => anchors.push({ anchor: f, bassString: s }));
		});
	} else {
		[5, 4].forEach(s => rootCandidates(rootPc, s).forEach(f => anchors.push({ anchor: f, bassString: s })));
	}
	anchors.sort((a, b) => a.anchor - b.anchor || b.bassString - a.bassString);

	for (const { anchor, bassString } of anchors) {
		const allowOpen = anchor <= 4; // 低把位才允许混空弦/伸展
		const frets = new Array(6).fill(null);
		// 低音弦以下全闷（保证最低发声 = 低音）
		for (let s = 5; s > bassString; s--) frets[s] = null;
		frets[bassString] = anchor; // 锚点本身必是低音/根音
		// 其余弦：低把位允许锚下 2 品伸展（C/G 才会得出经典 332010），否则严格 [锚, 锚+3]
		const lo = allowOpen ? Math.max(0, anchor - 2) : anchor;
		for (let s = bassString - 1; s >= 0; s--) {
			for (let f = lo; f <= anchor + 3; f++) {
				if (set.has(pcPhys(s, f))) { frets[s] = f; break; }
			}
		}
		const v = fromFrets(frets, "auto");
		if (v && v.notes.length >= 3
			&& lowestPc(v) === bass
			&& v.notes.some(n => pcPhys(n.string, n.fret) === rootPc)) {
			return v;
		}
	}
	return null;
}

// 和弦 → 按法。返回 { notes:[{id,string,idx,fret}], minFret, maxFret, hasOpen, shape } | null
// 选择顺序：开放和弦（低音匹配）→ 把位低的可移动形状 → 算法兜底 → 根音大三形状保底
export function voiceChord(chord, key) {
	if (!chord) return null;
	const { root, pcs } = chordPcs(chord, key);
	const bass = bassPc(chord, key);
	const q = resolvedQuality(chord, key);

	// 1) 开放和弦（要求最低发声弦就是要求的低音）
	const open = OPEN_SHAPES[`${root}:${q}`];
	if (open) {
		const v = fromFrets(open.frets, "open");
		if (v && lowestPc(v) === bass) return v;
	}

	// 2) 可移动形状：E 型 / A 型按根音品升序取最顺手把位
	if (!chord.bass && (E_SHAPES[q] || A_SHAPES[q])) {
		const candidates = [];
		if (E_SHAPES[q]) rootCandidates(root, 5).forEach(f => candidates.push({ f, table: E_SHAPES, name: "E" }));
		if (A_SHAPES[q]) rootCandidates(root, 4).forEach(f => candidates.push({ f, table: A_SHAPES, name: "A" }));
		candidates.sort((a, b) => a.f - b.f || (a.name === "E" ? -1 : 1));
		const pick = candidates[0];
		if (pick) {
			const frets = pick.table[q].map((o, s) => (o === null ? null : pick.f + o));
			const v = fromFrets(frets, pick.name);
			if (v) return v;
		}
	}

	// 3) 算法兜底（斜杠/无表质量）
	const auto = autoVoicing(pcs, root, bass, !!chord.bass);
	if (auto) return auto;

	// 4) 保底：根音大三 E 型（总得有声有图）
	const e = E_SHAPES[""].map((o, s) => (o === null ? null : rootCandidates(root, 5)[0] + o));
	return fromFrets(e, "fallback");
}

// 按法 → 指板帧品窗
export function voicingWindow(v) {
	if (!v) return { startFret: 0, endFret: 15 };
	const lo = v.hasOpen ? 0 : Math.max(0, v.minFret - 1);
	const hi = Math.min(15, Math.max(lo + 5, v.maxFret + 1));
	return { startFret: lo, endFret: hi };
}
