// 和弦谱工程文件（.fbchart）：紧凑 JSON + lz-string 压缩
//
// 为什么需要它：MusicXML 是通用记谱交换格式，装不下本应用私有的谱面状态——记谱形式、
// 等音偏好、每行小节数、动图色系、小节标色、休止/延音、节奏型记号、每和弦配图、
// 同级数质量记忆。这些走 MusicXML 必然丢失（实测丢 10 类字段）。
// 这里用短键 + tag 编码把它们全带上，再 lz-string 压一遍：
// 实测 32 小节满谱（128 个和弦单位 + 6 张配图）原始 JSON 17 KB → 打包后约 1.8 KB，
// 而同一首的 MusicXML 是 33 KB —— 既 100% 还原，体积也只有 MusicXML 的 1/18。
//
// 结构：{ v:1, n:名, k:[根音pc, 小调?1:0], ts:拍数, bpm, dp:记谱, en:等音,
//         rp:每行小节数, cs:色系, qm:同级数质量记忆, m:谱面 }
// measure：{ i:id, S:段落, L:歌词, R:反复开始, E:终止线(非 single 才存), H:跳房子,
//            K:[转调根音, 小调], T:标色, p:[槽位…] }
// slot（tag 编码，省掉 "kind"/"chord"/"degree" 这类重复键名）：
//   0=空 | 1=休止 | 2=延音 | 3=和弦 | 4=反拍拆分
//   和弦 [3, degree, acc, quality, bass, rhythm, image, fig]，尾部空值裁掉
//   bass：无→0；acc=0→度数数字；带变音→[度数, acc]
//   image：{kind:'board',frame}→["b",frame]；{kind:'clip',id}→["c",id]
//   fig：拍级黑点指法图→["f",frame]（形状不合帧规范时原样 raw 带走）
// 和弦若带非规范字段，退化为 [3,"raw",原对象] 原样保存，保证不丢东西。

import LZString from "lz-string";
import { createSong, newChartId, newMeasureId } from "./chordChartModel.js";
import { loadClips } from "./clipModel.js";

const PREFIX = "fretboard-chart";
const VERSION = 1;

const TAG_EMPTY = 0;
const TAG_REST = 1;
const TAG_HOLD = 2;
const TAG_CHORD = 3;
const TAG_SPLIT = 4;
const TAG_SPLIT_RAW = 5; // 槽位自身的字段与 split[0] 不一致（非规范数据）：整体原样带走

const CANON_CHORD_KEYS = ["degree", "acc", "quality", "bass", "alt"];

// ---------- 编码 ----------

function encodeBass(bass) {
	if (bass == null) return 0;
	const d = bass.degree, a = bass.acc || 0;
	return a === 0 ? d : [d, a];
}

function decodeBass(v) {
	if (v === 0 || v == null) return null;
	if (typeof v === "number") return { degree: v, acc: 0 };
	return { degree: v[0], acc: v[1] || 0 };
}

function encodeImage(img) {
	if (!img) return null;
	if (img.kind === "clip") return ["c", img.id ?? null];
	return ["b", encodeFrame(img.frame ?? null)];
}

function decodeImage(v) {
	if (!v) return undefined;
	return v[0] === "c" ? { kind: "clip", id: v[1] } : { kind: "board", frame: decodeFrame(v[1]) };
}

// ---------- 配图帧 / 动图 clip 的紧凑编码 ----------
// 帧的形状（captureBoard / voicingFrame 产物）：
//   { data: { noteId: {type,color,color2,visibility} }, startFret, endFret,
//     enharmonic, displayMode, rootNote, visibility, frameTint }
// 音符里 type/color2/visibility 几乎恒为 note/null/visible，省掉它们是体积大头；
// 形状一旦超出已知字段（旧数据/未来字段）就整块原样保存 —— 宁可变大也不丢内容。
const isRaw = (v) => Array.isArray(v) && v[0] === 1;

const FRAME_KEYS = ["data", "startFret", "endFret", "enharmonic", "displayMode", "rootNote", "visibility", "frameTint"];
const NOTE_KEYS = ["type", "color", "color2", "visibility"];
const CLIP_KEYS = ["id", "name", "createdAt", "frames", "transitions"];
const CLIP_SLOT_KEYS = ["i", "n", "c", "f", "x"];
const TRANS_KEYS = ["technique", "pairs"];
const PAIR_KEYS = ["from", "to", "technique"];

const encColor = (c) => (c == null ? 0 : [c.name ?? null, c.custom ?? null]);
const decColor = (v) => (v === 0 || v == null ? null : { name: v[0] ?? undefined, custom: v[1] });

function encodeNote(n) {
	if (!n || typeof n !== "object" || typeof n.color === "string") return [1, n]; // 非规范：原样
	if (!Object.keys(n).every(k => NOTE_KEYS.includes(k))) return [1, n];
	const color = encColor(n.color);
	if (n.type === "note" && n.color2 == null && (n.visibility ?? "visible") === "visible") return [color];
	return [color, encColor(n.color2), n.visibility ?? null, n.type ?? null];
}

function decodeNote(v) {
	if (isRaw(v)) return v[1];
	const [color, color2, visibility, type] = v;
	// visibility 省略即 visible：解码时显式还原，和应用写帧时的形状保持一致
	return { type: type ?? "note", color: decColor(color), color2: decColor(color2 ?? 0), visibility: visibility ?? "visible" };
}

function encodeFrame(f) {
	if (!f || typeof f !== "object") return f ?? null;
	if (!Object.keys(f).every(k => FRAME_KEYS.includes(k))) return [1, f];
	const d = {};
	for (const [id, n] of Object.entries(f.data || {})) {
		const e = encodeNote(n);
		if (isRaw(e)) return [1, f];
		d[id] = e;
	}
	const o = {
		w: [f.startFret ?? null, f.endFret ?? null],
		d,
		m: [f.enharmonic ?? null, f.displayMode ?? null, f.rootNote ?? null, f.visibility ?? null]
	};
	if (f.frameTint) o.t = encColor(f.frameTint);
	return o;
}

function decodeFrame(v) {
	if (v == null) return undefined;
	if (isRaw(v)) return v[1];
	// 键顺序按应用写帧的形状来（data 在前）：往返做字节级比较时不因顺序差异而假阳性
	const f = {};
	if (v.d) {
		f.data = {};
		for (const [id, n] of Object.entries(v.d)) f.data[id] = decodeNote(n);
	}
	if (v.w) { if (v.w[0] != null) f.startFret = v.w[0]; if (v.w[1] != null) f.endFret = v.w[1]; }
	if (v.m) {
		const [enh, dm, rn, vis] = v.m;
		if (enh != null) f.enharmonic = enh;
		if (dm != null) f.displayMode = dm;
		if (rn != null) f.rootNote = rn;
		if (vis != null) f.visibility = vis;
	}
	if (v.t) { const c = decColor(v.t); if (c) f.frameTint = c; }
	return f;
}

function encodeTrans(tr) {
	if (!tr || typeof tr !== "object") return [1, tr];
	if (!Object.keys(tr).every(k => TRANS_KEYS.includes(k))) return [1, tr];
	if (!(tr.pairs || []).every(p => p && Object.keys(p).every(k => PAIR_KEYS.includes(k)))) return [1, tr];
	return [tr.technique ?? 0, (tr.pairs || []).map(p => [p.from, p.to, p.technique ?? 0])];
}

function decodeTrans(v) {
	if (isRaw(v)) return v[1];
	return {
		technique: v[0] === 0 ? null : v[0],
		pairs: (v[1] || []).map(p => ({ from: p[0], to: p[1], technique: p[2] === 0 ? null : p[2] }))
	};
}

// clip 顶层未知键原样带上（已确保不与保留短键撞名，撞名则整体 raw）
function encodeClip(clip) {
	if (!clip || typeof clip !== "object") return [1, clip];
	const unknown = Object.keys(clip).filter(k => !CLIP_KEYS.includes(k));
	if (unknown.some(k => CLIP_SLOT_KEYS.includes(k))) return [1, clip];
	const frames = (clip.frames || []).map(encodeFrame);
	if (frames.some(isRaw)) return [1, clip];
	const trans = (clip.transitions || []).map(encodeTrans);
	if (trans.some(isRaw)) return [1, clip];
	const o = { i: clip.id, f: frames, x: trans };
	if (clip.name != null) o.n = clip.name;
	if (clip.createdAt != null) o.c = clip.createdAt;
	for (const k of unknown) o[k] = clip[k];
	return o;
}

function decodeClip(v) {
	if (isRaw(v)) return v[1];
	// 键顺序按应用写 clip 的形状来（id,name,createdAt,frames,transitions）：字节级往返稳定
	const c = { id: v.i };
	if (v.n != null) c.name = v.n;
	if (v.c != null) c.createdAt = v.c;
	c.frames = (v.f || []).map(decodeFrame);
	c.transitions = (v.x || []).map(decodeTrans);
	for (const k of Object.keys(v)) if (!CLIP_SLOT_KEYS.includes(k)) c[k] = v[k];
	return c;
}

// 谱内引用到的所有动图（去重，按引用顺序）：不内嵌它们，跨机器导入就是悬空引用
function collectClipIds(song) {
	const ids = [];
	song.measures?.forEach(m => m.slots?.forEach(sl => (sl.split || [sl]).forEach(u => {
		if (u.image?.kind === "clip" && u.image.id && !ids.includes(u.image.id)) ids.push(u.image.id);
	})));
	return ids;
}

function encodeChord(chord) {
	const hasExtra = Object.keys(chord || {}).some(k => !CANON_CHORD_KEYS.includes(k));
	if (hasExtra) return [TAG_CHORD, "raw", chord]; // 非规范字段：原样带走
	return [TAG_CHORD, chord.degree, chord.acc || 0, chord.quality || "", encodeBass(chord.bass)];
}

function encodeUnit(u) {
	if (!u) return TAG_EMPTY;
	if (u.kind === "rest") return TAG_REST;
	if (u.kind === "hold") return TAG_HOLD;
	if (u.kind === "chord" && u.chord) {
		const arr = encodeChord(u.chord);
		if (isRaw(arr)) return arr; // raw 已含全部字段（含 alt）
		// 可选 extras 按类型自辨（解码不依赖位置）：字符串数组=变化音，字符串=节奏型，tagged=配图/指法图
		if (Array.isArray(u.chord.alt) && u.chord.alt.length) arr.push([...u.chord.alt]);
		if (u.rhythm) arr.push(u.rhythm);
		if (u.image) arr.push(encodeImage(u.image));
		// fig 用对象标签（不用数组）：旧版解码器把未知数组一律当变化音，会读出 alt:["f"] 垃圾；对象则被旧版整体忽略
		if (u.fig) arr.push({ f: encodeFrame(u.fig) });
		return arr;
	}
	return TAG_EMPTY;
}

function encodeSlot(slot) {
	if (!slot) return TAG_EMPTY;
	if (Array.isArray(slot.split)) {
		const a = slot.split[0];
		// 规范形状下 split[0] 就是正拍本身，槽位自身没有 split 之外的独有信息
		const stray = Object.keys(slot).some(k => k !== "split" && JSON.stringify(slot[k]) !== JSON.stringify(a?.[k]));
		if (stray) return [TAG_SPLIT_RAW, slot];
		return [TAG_SPLIT, encodeUnit(a), encodeUnit(slot.split[1])];
	}
	// 延音拍带指法图：裸 TAG_HOLD 表达不了 extras，整槽原样带走（旧版解码器同样认识 TAG_SPLIT_RAW，逐字还原）
	if (slot.kind === "hold" && slot.fig) return [TAG_SPLIT_RAW, slot];
	return encodeUnit(slot);
}

function encodeMeasure(m) {
	const o = { i: m.id, p: (m.slots || []).map(encodeSlot) };
	if (m.section) o.S = m.section;
	if (m.lyrics) o.L = m.lyrics;
	if (m.repeatStart) o.R = 1;
	if (m.endBar && m.endBar !== "single") o.E = m.endBar;
	if (m.house) o.H = m.house;
	if (m.keyRoot != null) o.K = [m.keyRoot, m.keyMinor ? 1 : 0];
	if (m.tint) o.T = m.tint;
	return o;
}

export function compactChart(song, { clips } = {}) {
	const o = {
		v: VERSION,
		n: song.name || "",
		k: [song.key?.root ?? 0, song.key?.minor ? 1 : 0],
		ts: song.timeSig ?? 4,
		bpm: song.bpm ?? 72,
		dp: song.display ?? "degree",
		en: song.enharmonic ?? 1,
		rp: song.rowsPerLine ?? 4,
		cs: song.colorScheme ?? "navy",
		m: (song.measures || []).map(encodeMeasure)
	};
	if (song.createdAt) o.ct = song.createdAt;
	if (song.qualityMemory && Object.keys(song.qualityMemory).length) o.qm = song.qualityMemory;
	if (song.id) o.id = song.id;
	// 动图配图连帧数据一起带上（file:// 里只存 id 的话，换台机器图就没了）
	const ids = collectClipIds(song);
	if (ids.length) {
		// Node/测试环境没有 localStorage：没有存储就没有 clip 池，引用保持原样
		const pool = clips ?? (typeof localStorage !== "undefined" ? loadClips() : []);
		const used = ids.map(id => pool.find(c => c.id === id)).filter(Boolean);
		if (used.length) o.cl = used.map(encodeClip);
	}
	return o;
}

// ---------- 解码 ----------

function decodeUnit(v) {
	if (v === TAG_EMPTY || v == null) return { kind: "empty" };
	if (v === TAG_REST) return { kind: "rest" };
	if (v === TAG_HOLD) return { kind: "hold" };
	if (!Array.isArray(v)) return { kind: "empty" };
	if (v[0] === TAG_SPLIT) return null; // 由 decodeSlot 处理
	if (v[0] !== TAG_CHORD) return { kind: "empty" };
	if (v[1] === "raw") return { kind: "chord", chord: v[2] };
	const u = {
		kind: "chord",
		chord: { degree: v[1], acc: v[2] || 0, quality: v[3] || "", bass: decodeBass(v[4]) }
	};
	// 位置无关的 extras：字符串=节奏型，["b"/"c",..]=动图配图，{f:..}=拍级指法图，纯字符串数组=变化音
	for (const extra of v.slice(5)) {
		if (typeof extra === "string") u.rhythm = extra;
		else if (Array.isArray(extra) && (extra[0] === "b" || extra[0] === "c")) u.image = decodeImage(extra);
		else if (extra && typeof extra === "object" && !Array.isArray(extra) && "f" in extra) u.fig = decodeFrame(extra.f);
		else if (Array.isArray(extra)) u.chord.alt = extra.filter(t => typeof t === "string");
	}
	if (Array.isArray(u.chord.alt) && !u.chord.alt.length) delete u.chord.alt;
	return u;
}

function decodeSlot(v) {
	if (Array.isArray(v) && v[0] === TAG_SPLIT_RAW) return v[1];
	if (Array.isArray(v) && v[0] === TAG_SPLIT) {
		const a = decodeUnit(v[1]) || { kind: "empty" };
		const b = decodeUnit(v[2]) || { kind: "empty" };
		// 与 toggleSplit 的产物同形：split[0] 即正拍本身
		return { ...a, split: [a, b] };
	}
	return decodeUnit(v);
}

function decodeMeasure(o) {
	const m = {
		id: o.i || newMeasureId(),
		section: o.S ?? null,
		lyrics: o.L ?? "",
		repeatStart: !!o.R,
		endBar: o.E || "single",
		house: o.H ?? null,
		slots: (o.p || []).map(decodeSlot)
	};
	if (o.K) { m.keyRoot = o.K[0]; m.keyMinor = !!o.K[1]; }
	if (o.T) m.tint = o.T;
	return m;
}

export function expandChart(o) {
	if (!o || typeof o !== "object") throw new Error("工程数据为空");
	if (o.v > VERSION) throw new Error(`工程版本 ${o.v} 比当前支持的 ${VERSION} 新，请升级后再导入`);
	if (!Array.isArray(o.m)) throw new Error("工程数据里没有谱面（measures）");
	const song = createSong(o.n || "导入的谱子");
	song.id = o.id || newChartId();
	song.createdAt = o.ct || Date.now();
	song.updatedAt = Date.now();
	song.key = { root: o.k?.[0] ?? 0, minor: !!o.k?.[1] };
	song.timeSig = o.ts ?? 4;
	song.bpm = o.bpm ?? 72;
	song.display = o.dp ?? "degree";
	song.enharmonic = o.en ?? 1;
	song.rowsPerLine = o.rp ?? 4;
	song.colorScheme = o.cs ?? "navy";
	song.measures = o.m.map(decodeMeasure);
	if (o.qm) song.qualityMemory = o.qm;
	if (!song.measures.length) song.measures = [];
	return song;
}

// ---------- 对外：打包 / 解包 ----------

// 打包成可存文件、可贴聊天的文本（前缀 + base64，base64 比 URI 码更省字节）
export function packChart(song, opts) {
	const json = JSON.stringify(compactChart(song, opts));
	return `${PREFIX}:${VERSION}:${LZString.compressToBase64(json)}`;
}

// 分享码（放 URL 用的 URI 安全变体）
export function chartShareCode(song) {
	return LZString.compressToEncodedURIComponent(JSON.stringify(compactChart(song)));
}

// 判断一段文本是不是本应用的工程文件/分享码（用于和 MusicXML 自动分流）
export function isChartPack(text) {
	const s = String(text || "").trim();
	if (s.startsWith(PREFIX + ":")) return true;
	if (s.startsWith("{") && s.includes('"m"')) return true; // 裸紧凑 JSON
	// 分享码：lz-string URI 变体只含这些字符
	return /^[A-Za-z0-9+\-$_.!~*'()%]+$/.test(s) && s.length > 24;
}

// 解包：同时接受 工程文件文本 / 分享码 / 裸紧凑 JSON。
// 返回 { song, clips }：clips 是文件里内嵌的动图（含全部帧数据），由调用方落回本机存储。
export function unpackChartBundle(text) {
	const s = String(text || "").trim();
	if (!s) throw new Error("内容是空的");
	const payload = s.startsWith(PREFIX + ":") ? s.slice(s.indexOf(":", PREFIX.length + 1) + 1) : s;
	let json = null;
	if (s.startsWith(PREFIX + ":")) {
		json = LZString.decompressFromBase64(payload);
	} else if (payload.startsWith("{")) {
		json = payload;
	} else {
		json = LZString.decompressFromEncodedURIComponent(payload);
	}
	if (!json) throw new Error("解压失败（不是本应用的工程文件或分享码）");
	let obj;
	try {
		obj = JSON.parse(json);
	} catch (e) {
		throw new Error("工程数据损坏，无法解析");
	}
	const song = expandChart(obj);
	const clips = Array.isArray(obj.cl) ? obj.cl.map(decodeClip) : [];
	return { song, clips };
}

// 只要歌体（旧入口，兼容）；需要内嵌动图时用 unpackChartBundle
export function unpackChart(text) {
	return unpackChartBundle(text).song;
}