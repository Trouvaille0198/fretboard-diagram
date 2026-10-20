// 和弦谱核心乐理：级数 ⇄ 音名、调内默认质量、quality → 音程、和弦音高
// 约定：pitch class 一律 C 基 0-11；key = { root: 0-11, minor: false }
// 和弦对象 = { degree: 1-7, acc: -1|0|1, quality: "", bass: { degree, acc } | null }
//   quality ∈ CHORD_INTERVALS（超出词表的原样保留，可显示、按法走算法兜底）

import { MAJOR_STEPS, MINOR_STEPS, NOTE_NAMES, LETTER_SEMITONES } from "./songStructure.js";

// quality → 根音起的半音集
export const CHORD_INTERVALS = {
	"": [0, 4, 7],
	m: [0, 3, 7],
	"5": [0, 7],
	maj9: [0, 4, 7, 11, 14],
	m9: [0, 3, 7, 10, 14],
	"m7-5": [0, 3, 6, 10],
	7: [0, 4, 7, 10],
	m7: [0, 3, 7, 10],
	maj7: [0, 4, 7, 11],
	6: [0, 4, 7, 9],
	m6: [0, 3, 7, 9],
	9: [0, 4, 7, 10, 14],
	add9: [0, 4, 7, 14],
	sus4: [0, 5, 7],
	sus2: [0, 2, 7],
	dim: [0, 3, 6],
	aug: [0, 4, 8],
	dim7: [0, 3, 6, 9]
};

// 变化音（extension alterations）：叠在质量之上，可多个共存 —— 57b9b13、1M7#11 这类
// 体系 = 音级 5/9/11/13 × 降/原/升；记法用 ASCII（b/#），与级数变音一致
// 5 音层的 b5/#5 与 11 层的 #11/b13 在 pitch class 上等音（+6/+8），但记法与八度落位不同
export const ALT_ORDER = ["b5", "#5", "b9", "9", "#9", "b11", "11", "#11", "b13", "13", "#13"];
export const ALT_INTERVALS = {
	b5: 6, "#5": 8,
	b9: 13, "9": 14, "#9": 15,
	b11: 16, "11": 17, "#11": 18,
	b13: 20, "13": 21, "#13": 22
};

export const QUALITIES = Object.keys(CHORD_INTERVALS);

// 解析用：长词在前，避免 "m7" 被 "7" 抢先
const QUALITY_PATTERN = QUALITIES.slice().sort((a, b) => b.length - a.length).join("|");

// 调内三和弦默认质量：数字键直输 1-7 时的常用形态
// 大调 1/4/5 大三、2/3/6 小三、7 减；自然小调同构。带变音（b3/b6/b7）按流行借用默认大三
const DIATONIC = {
	major: ["", "m", "m", "", "", "m", "dim"],
	minor: ["m", "dim", "", "m", "m", "", ""]
};

// 降号调（F/Bb/Eb/Ab/Db）里歧义音级（F#/Gb、C#/Db）记降号，其余记升号
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]);

const ACC_SIGN = { "-1": "b", "0": "", "1": "#" };

export const stepsOf = (key) => (key.minor ? MINOR_STEPS : MAJOR_STEPS);

// 级数(+变音) → 根音 pitch class
export function degreePc(degree, acc, key) {
	const steps = stepsOf(key);
	return ((((key.root || 0) + (acc || 0) + steps[degree - 1]) % 12) + 12) % 12;
}

// 调内七和弦：级数点击的默认形态——大调 5 级属七，其余大三 maj7、小三 m7、减 dim7
export function diatonicSeventh(degree, acc, key) {
	const triad = diatonicQuality(degree, acc, key);
	if (triad === "m") return "m7";
	if (triad === "dim") return "dim7";
	return (!key.minor && degree === 5 && !acc) ? "7" : "maj7";
}

export function diatonicQuality(degree, acc, key) {
	if (acc) return "";
	const table = DIATONIC[key.minor ? "minor" : "major"] || [];
	return table[degree - 1] ?? "";
}

// ============ 级数 token ⇄ 和弦对象 ============

// "6m" / "b3" / "5/7" / "4m7" → 和弦对象（null = 解析失败）
export function chordFromDegreeToken(token) {
	const m = String(token || "").trim().match(
		new RegExp(`^([b#]?)([1-7])(${QUALITY_PATTERN})?(?:/([b#]?)([1-7]))?$`)
	);
	if (!m) return null;
	const chord = {
		degree: parseInt(m[2], 10),
		acc: m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0,
		quality: m[3] || "",
		bass: null
	};
	if (m[5]) chord.bass = { degree: parseInt(m[5], 10), acc: m[4] === "b" ? -1 : m[4] === "#" ? 1 : 0 };
	return chord;
}

export function formatDegree(chord) {
	if (!chord) return "";
	let out = `${ACC_SIGN[String(chord.acc || 0)]}${chord.degree}${chord.quality || ""}${altText(chord)}`;
	if (chord.bass) out += `/${ACC_SIGN[String(chord.bass.acc || 0)]}${chord.bass.degree}`;
	return out;
}

// ============ 音名 token ⇄ 和弦对象 ============

// 音级拼写：降号度数（acc<0）记降、升号度数（acc>0）记升、自然度数随调号
// （等大调签名定升/降调倾向：F/Bb/Eb/Ab/Db 记降，其余记升）
function nameOfPc(pc, key, prefer) {
	const relMajorRoot = key.minor ? (((key.root || 0) + 3) % 12) : (key.root || 0);
	const flats = prefer === "flat" || (prefer !== "sharp" && FLAT_KEYS.has(relMajorRoot % 12));
	const names = flats ? NOTE_NAMES[1] : NOTE_NAMES[0];
	return names[((pc % 12) + 12) % 12];
}

// 生效质量：显式 quality 优先；裸级数（quality ""）用调内默认（acc≠0 → 大三）
// 级数记谱 "6" = 调内三和弦（C 大调里就是 Am）；音名/音高/按法一律走生效质量
export function resolvedQuality(chord, key) {
	if (!chord) return "";
	if (chord.quality) return chord.quality;
	return diatonicQuality(chord.degree, chord.acc || 0, key);
}

// 和弦对象 → 音名 token（相对 viewKey —— 移调看谱时传入移调后的调）
export function formatName(chord, viewKey) {
	if (!chord) return "";
	const accPref = (a) => (a < 0 ? "flat" : a > 0 ? "sharp" : null);
	const root = nameOfPc(degreePc(chord.degree, chord.acc, viewKey), viewKey, accPref(chord.acc || 0));
	let out = root + resolvedQuality(chord, viewKey) + altText(chord);
	if (chord.bass) {
		out += "/" + nameOfPc(degreePc(chord.bass.degree, chord.bass.acc, viewKey), viewKey, accPref(chord.bass.acc || 0));
	}
	return out;
}

// 音名 token → 和弦对象（级数相对 key；quality 原样保留，词表外也存得进）
// 分组：1=根音字母 2=根音升降 3=quality 外组 4=quality 内文 5=低音字母 6=低音升降
export function chordFromNameToken(token, key) {
	const m = String(token || "").trim().match(
		new RegExp(`^([A-G])([#b]?)((${QUALITY_PATTERN})?)?(?:/([A-G])([#b]?))?$`, "i")
	);
	if (!m) return null;
	const pc = (((LETTER_SEMITONES[m[1].toUpperCase()] || 0) + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0)) % 12 + 12) % 12;
	const steps = stepsOf(key);
	const rel = (((pc - (key.root || 0)) % 12) + 12) % 12;
	const plain = steps.indexOf(rel);
	let degree = 0, acc = 0;
	if (plain !== -1) {
		degree = plain + 1;
	} else {
		const resolved = resolveChromaticPc(rel, key);
		if (!resolved) return null; // 距调太远（±1 半音内无级数音），交给面板处理
		degree = resolved.degree;
		acc = resolved.acc;
	}
	const chord = { degree, acc, quality: m[4] || "", bass: null };
	if (m[5]) {
		const bpc = (((LETTER_SEMITONES[m[5].toUpperCase()] || 0) + (m[6] === "#" ? 1 : m[6] === "b" ? -1 : 0)) % 12 + 12) % 12;
		chord.bass = resolveDegreeFromPc(bpc, key);
	}
	return chord;
}

// 音级 pc → 级数(+变音)（相对 key）；null = 无近似级数
function resolveDegreeFromPc(pc, key) {
	const rel = (((pc - (key.root || 0)) % 12) + 12) % 12;
	const steps = stepsOf(key);
	const plain = steps.indexOf(rel);
	if (plain !== -1) return { degree: plain + 1, acc: 0 };
	const resolved = resolveChromaticPc(rel, key);
	return resolved || null;
}

// 离调半音（rel 不在音阶里）的级数拼写按通行记法：
// b3/b6/b7 记降（acc=-1，级数音在 pc 上方半音），#4/#1 记升（acc=+1）；
// 歧义音级（C#/Db、F#/Gb）随调号倾向走
function resolveChromaticPc(rel, key) {
	const steps = stepsOf(key);
	const sharpPc = steps.indexOf(((rel - 1) % 12 + 12) % 12); // 级数音 = pc-1 → 记 #级数
	const flatPc = steps.indexOf((rel + 1) % 12); // 级数音 = pc+1 → 记 b级数
	const preferFlats = FLAT_KEYS.has((key.root || 0) % 12);
	const sharpFirst = rel === 6 || (rel === 1 && !preferFlats);
	if (sharpFirst ? sharpPc !== -1 : flatPc !== -1) {
		return { degree: (sharpFirst ? sharpPc : flatPc) + 1, acc: sharpFirst ? 1 : -1 };
	}
	if (sharpPc !== -1 || flatPc !== -1) {
		return { degree: (sharpPc !== -1 ? sharpPc : flatPc) + 1, acc: sharpPc !== -1 ? 1 : -1 };
	}
	return null;
}

// 统一格式化（display: 'degree' | 'roman' | 'name'；viewKey 为移调后的调，默认原调）
export function formatChord(chord, display, viewKey) {
	if (!chord) return "";
	if (display === "name") return formatName(chord, viewKey);
	if (display === "roman") { const p = formatRomanParts(chord, viewKey); return p.main + (p.sub ? " " + p.sub : ""); }
	return formatDegree(chord);
}

// 罗马数字功能谱（预览显示）：三和弦性质决定大小写——大三/属七/增/挂留大写，
// 小三/减/小七族小写（i、ii、vii dim）；扩展音与转位低音进副行，与数字谱共用副行词表
const ROMAN_NUMS = ["I", "II", "III", "IV", "V", "VI", "VII"];
export function formatRomanParts(chord, viewKey) {
	if (!chord) return { main: "", sub: "" };
	const q = resolvedQuality(chord, viewKey);
	const roman = (deg, acc) => `${ACC_SIGN[String(acc || 0)]}${ROMAN_NUMS[(deg - 1 + 7) % 7]}`;
	const head = roman(chord.degree, chord.acc);
	const lowerTriad = q.startsWith("dim") || q === "m" || (q.startsWith("m") && !q.startsWith("maj")); // dim 族、m/m7/m6/m9… 小写，maj7 除外
	const main = lowerTriad ? head.toLowerCase() : head;
	let sub = "";
	if (q !== "" && q !== "m") {
		const extMap = { "5": "5", maj7: "maj7", m7: "7", "7": "7", 6: "6", m6: "6", "9": "9", m9: "9", maj9: "maj9", "m7-5": "7-5", add9: "add9", sus4: "sus4", sus2: "sus2", dim: "dim", dim7: "dim7", aug: "aug" };
		sub = extMap[q] ?? (chord.quality || "");
	}
	sub += altText(chord);
	if (chord.bass) sub = (sub ? sub + " " : "") + "/" + roman(chord.bass.degree, chord.bass.acc).toLowerCase();
	return { main, sub };
}

// 记号的结构化分解（给 UI 把级数装进圆角框用）：
//   degree = 级数（含变音记号，罗马模式=罗马数字大小写）→ 装框
//   suffix = 质量后缀 + 变化音（小字跟在框外）
//   bass   = "/n" 转位低音（再小一号）
// 音名模式不分层，返回 flat = 整个音名（音名本身自分隔）
export function chordSignParts(chord, display, viewKey) {
	if (!chord) return null;
	if (display === "name") return { degree: "", suffix: "", bass: "", flat: formatName(chord, viewKey) };
	if (display === "roman") {
		const p = formatRomanParts(chord, viewKey);
		const toks = p.sub ? p.sub.split(" ") : [];
		return {
			degree: p.main,
			suffix: toks.filter(t => !t.startsWith("/")).join(""),
			bass: toks.find(t => t.startsWith("/")) || ""
		};
	}
	const q = resolvedQuality(chord, viewKey);
	const head = `${ACC_SIGN[String(chord.acc || 0)]}${chord.degree}`;
	const triadMap = { "": "", m: "m" };
	const triadOf = { m7: "m", m6: "m", m9: "m", "m7-5": "m" };
	const extMap = { maj7: "maj7", "7": "7", m7: "7", "9": "9", m9: "9", maj9: "maj9", "m7-5": "7-5", add9: "add9", "6": "6", m6: "6", sus4: "sus4", sus2: "sus2", dim: "°", dim7: "°7", aug: "+", "5": "5" };
	let suffix;
	if (triadMap[q] !== undefined) suffix = triadMap[q];
	else if (extMap[q] !== undefined) suffix = (triadOf[q] || "") + extMap[q];
	else suffix = chord.quality || "";
	suffix += altText(chord);
	const bass = chord.bass ? "/" + `${ACC_SIGN[String(chord.bass.acc || 0)]}${chord.bass.degree}` : "";
	return { degree: head, suffix, bass };
}

// 单行内联记号（8pu 式）：4M7 / 57（属七省 M）/ 6m / 5M/7 / 4sus4 / 7° —— 主行+副行串成一行
export function formatInline(chord, display, viewKey) {
	const p = chordParts(chord, display, viewKey);
	if (!p.sub) return p.main;
	return p.main + p.sub.replace(/\s+/g, "").replace("dim", "°").replace("aug", "+");
}

// 8pu 式竖排记号分解：主行（级数+三和弦质量）+ 副行（扩展音/特殊质量/转位）
// 1M+7=maj7、3m+7=m7、5+7=属七（主行省 M）、6/9/sus/dim/aug 进副行
export function chordParts(chord, display, viewKey) {
	if (!chord) return { main: "", sub: "" };
	if (display === "name") return { main: formatName(chord, viewKey), sub: "" };
	if (display === "roman") return formatRomanParts(chord, viewKey);
	const q = resolvedQuality(chord, viewKey);
	const head = `${ACC_SIGN[String(chord.acc || 0)]}${chord.degree}`;
	let main = head, sub = "";
	const triadMap = { "": "", m: "m" }; // 大三和弦省字母（1 不写 1M），小三写 m
	const extMap = { "5": "5", maj7: "maj7", m7: "7", "7": "7", 6: "6", m6: "6", "9": "9", m9: "9", maj9: "maj9", "m7-5": "7-5", add9: "add9", sus4: "sus4", sus2: "sus2", dim: "dim", dim7: "dim7", aug: "aug" };
	if (triadMap[q] !== undefined) {
		main = head + triadMap[q];
		sub = altText(chord);
	} else if (extMap[q] !== undefined) {
		// 七/六/九族：主行只带小三质量（属七/六/九默认大三省字母），maj7 全写；
		// dim/aug/sus 无三和弦质量可言，主行只写级数
		const triadOf = { m7: "m", m6: "m", "m9": "m", "m7-5": "m" }[q] || "";
		main = head + triadOf;
		sub = extMap[q] + altText(chord);
	} else {
		main = head + (chord.quality || "");
		sub = altText(chord);
	}
	if (chord.bass) sub = (sub ? sub + " " : "") + "/" + `${ACC_SIGN[String(chord.bass.acc || 0)]}${chord.bass.degree}`;
	return { main, sub };
}

// ============ 音高 ============

// 和弦音 pitch class 集（含转位低音；返回 { root, pcs }，pcs 去重升序）
export function chordPcs(chord, key) {
	const root = degreePc(chord.degree, chord.acc, key);
	const intervals = chordIntervals(chord, key);
	const pcs = new Set([root, ...intervals.map(i => (root + i) % 12)]);
	if (chord.bass) pcs.add(degreePc(chord.bass.degree, chord.bass.acc, key));
	return { root, pcs: [...pcs].sort((a, b) => a - b) };
}

// 和弦音 MIDI 集（根音落在 octave 八度，C 基：octave 3 → MIDI 48 起）
export function chordMidi(chord, key, octave = 3) {
	const root = degreePc(chord.degree, chord.acc, key);
	const base = 12 * (octave + 1) + root;
	return chordIntervals(chord, key).map(i => base + i);
}

// 质量音程 + 变化音音程
// 语义按音级分两类：9/11/13 是「叠加」（add），b5/#5 是「替换」——7b5 不含自然五音
function chordIntervals(chord, key) {
	const base = CHORD_INTERVALS[resolvedQuality(chord, key)] || CHORD_INTERVALS[""];
	const alts = chord.alt || [];
	const has = t => alts.includes(t);
	let out = base;
	if (has("b5") || has("#5")) out = out.filter(i => i !== 7);
	const added = alts.map(t => ALT_INTERVALS[t]).filter(v => v != null);
	return added.length ? [...out, ...added] : out;
}

// 变化音文本（规范序）；无则空串。
// 全带变音记号时直接连写（7b9b13，通行记法）；含自然音级时括号+逗号（7(9,13)），避免 7913 歧义
export function altText(chord) {
	if (!chord || !Array.isArray(chord.alt) || !chord.alt.length) return "";
	const toks = ALT_ORDER.filter(t => chord.alt.includes(t));
	if (!toks.length) return "";
	const allAccidental = toks.every(t => t.startsWith("b") || t.startsWith("#"));
	return allAccidental ? toks.join("") : `(${toks.join(",")})`;
}

// 转位低音 pitch class（无 bass 即根音）
export function bassPc(chord, key) {
	return chord.bass ? degreePc(chord.bass.degree, chord.bass.acc, key) : degreePc(chord.degree, chord.acc, key);
}

export function sameChord(a, b) {
	if (!a || !b) return false;
	const keyOf = (c) => `${c.acc || 0}|${c.degree}|${c.quality || ""}|${(c.alt || []).join(",")}|${c.bass ? `${c.bass.acc || 0}|${c.bass.degree}` : ""}`;
	return keyOf(a) === keyOf(b);
}

// ============ MusicXML kind 词表映射 ============
// 词表外的（m6/9 等）导出时降级 kind="other" text=原词；导入时反向同理
export const QUALITY_TO_KIND = {
	"": "major",
	m: "minor",
	7: "dominant",
	m7: "minor-seventh",
	maj7: "major-seventh",
	6: "major-sixth",
	dim: "diminished",
	aug: "augmented",
	sus4: "suspended-fourth",
	sus2: "suspended-second",
	dim7: "diminished-seventh",
	maj9: "major-ninth",
	m9: "minor-ninth",
	"m7-5": "half-diminished"
};

export const KIND_TO_QUALITY = Object.fromEntries(
	Object.entries(QUALITY_TO_KIND).map(([q, k]) => [k, q])
);
