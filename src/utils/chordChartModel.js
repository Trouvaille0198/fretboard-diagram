import { sameContent, queuePush, queueDelete, setApplier, setPuller, setConflictHandler, outboxPending } from "./syncEngine.js";
import { createBigStore } from "./idbStore.js";
import { trashPut } from "./trashModel.js";
import { degreePc } from "./chordLib.js";
import { effectiveHouses, expandSong, repeatSections } from "./chartPlayback.js";
import { getT, fmt } from "../i18n/getT.js";

// 和弦谱（8pu 式功能谱）歌曲模型与本地存储
// song = { id, name, createdAt, updatedAt,
//   key: { root: 0-11(C基), minor }, timeSig: 拍数(2|3|4|6), timeSigUnit: 拍单位(4|8，缺省=4；8=八分拍，如 6/8), bpm,
//   display: 'degree'|'name', enharmonic: 1, rowsPerLine: 每行小节数,
//   colorScheme: 动图生成用的色系名（LEVEL1_COLORS 键）,
//   measures: [measure] }
// measure = { id, section?: 段落标记, lyrics?: 按小节歌词, lyricsBold?: [[start,end),...](加粗区间,升序合并不重叠),
//   repeatTimes?: 反复遍数(>1,配合 endBar='repeatEnd';缺省=标准 2 遍),
//   repeatStart?: true(小节前有反复开始线), endBar: 'single'|'double'|'repeatEnd'|'final',
//   house?: 1|2(结尾), slots: [slot] × 拍数,
//   alt2Lyrics?/alt2LyricsBold?/alt2Section?/alt2Tint?/alt2LineBreak?: 第 2 遍独有的歌词/段落标记/标色/换行
//     (收起反复时两遍这些属性不同的产物),
//   unfold?: { id, pass, part } 展开态反复块的成员标记(见文件末「反复段展开 / 收起」) }
// slot = { kind: 'empty'|'chord'|'rest'|'hold', chord?: 和弦对象, split?: [子槽,子槽](反拍拆分), rhythm?: 节奏型,
//   alt2?: 第 2 遍起这一拍的替代槽位(同 slot 形状，不再嵌套) }

const CHARTS_KEY = "fretboard-chordcharts";

const hasLS = () => typeof localStorage !== "undefined";

export function newChartId() {
	return `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newMeasureId() {
	return `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createMeasure(timeSig) {
	return {
		id: newMeasureId(),
		section: null,
		lyrics: "",
		repeatStart: false,
		endBar: "single",
		house: null,
		slots: Array.from({ length: timeSig }, () => ({ kind: "empty" }))
	};
}


// ===== 歌词加粗区间（lyricsBold）=====
// 区间 = [start, end) 字符下标,end 独占;存放前一律过 normalizeBoldRanges(裁界/去空/升序/合并重叠相邻)。

export function normalizeBoldRanges(ranges, len = Infinity) {
	const clamped = (ranges || [])
		.map(r => [Math.max(0, Math.min(r[0], len)), Math.max(0, Math.min(r[1], len))])
		.filter(([a, b]) => b > a)
		.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
	const out = [];
	clamped.forEach(([a, b]) => {
		const last = out[out.length - 1];
		if (last && a <= last[1]) last[1] = Math.max(last[1], b); // 重叠/相邻并段
		else out.push([a, b]);
	});
	return out;
}

// 切换 [s,e) 的加粗:整段已在粗区间内 → 去粗(裁剪分割);否则并粗(与重叠区间合并)
export function toggleBoldRange(ranges, s, e, len) {
	if (!(e > s)) return normalizeBoldRanges(ranges, len);
	const norm = normalizeBoldRanges(ranges, len);
	if (norm.some(([a, b]) => s >= a && e <= b)) {
		const out = [];
		norm.forEach(([a, b]) => {
			if (b <= s || a >= e) out.push([a, b]);
			else {
				if (a < s) out.push([a, s]);
				if (b > e) out.push([e, b]);
			}
		});
		return out;
	}
	const overlap = norm.filter(([a, b]) => a < e && b > s);
	const rest = norm.filter(([a, b]) => !(a < e && b > s));
	const lo = Math.min(s, ...overlap.map(([a]) => a));
	const hi = Math.max(e, ...overlap.map(([, b]) => b));
	return normalizeBoldRanges([...rest, [lo, hi]], len);
}


// ===== 同和弦既有指法（编辑器默认面板"最近同和弦"）=====
// 全曲收集与给定和弦(解析根音 pc + 质量)相同的指法图；靠后的小节(=最近画过)在前,内容去重。
// keyAtMi:按小节取生效调(谱内转调自动隔离——B 段的 4maj7 不会匹配 D 段的 4maj7)
// skip:{mi,si,half} 排除正在编辑的这一拍——历史参考列表不该包含当前这张
export function collectSameChordFigs(measures, rootPc, quality, keyAtMi, skip = null) {
	const seen = new Set();
	const list = [];
	for (let m = (measures || []).length - 1; m >= 0; m--) {
		const mm = measures[m];
		(mm.slots || []).forEach((sl, si) => {
			(sl.split ? sl.split : [sl]).forEach((u, hi) => {
				if (skip && m === skip.mi && si === skip.si && hi === (skip.half || 0)) return;
				if (!u || u.kind !== "chord" || !u.chord || !u.fig || !Object.keys(u.fig).length) return;
				let uRoot = null;
				try { uRoot = degreePc(u.chord.degree, u.chord.acc || 0, keyAtMi ? keyAtMi(m) : { root: 0, minor: false }); } catch (e) { /* 坏数据跳过 */ }
				const nq = (q) => (q === "M" ? "" : q || ""); // 显式大三 "M" ≡ ""（两侧都归一）
				if (uRoot !== rootPc || nq(u.chord.quality) !== nq(quality)) return;
				// 规范化签名：只看"画了什么"——音位(可见性+是否幽灵)与连线端点/类型，不看连线随机键名/颜色等
				//（实测踩雷：JSON.stringify 整对象，连线键名 conn-<随机> 不同 → 内容相同的两张图去重失效）
				const notes = Object.keys(u.fig).filter(k => !k.startsWith("conn") && k !== "connections")
					.map(k => {
						const n = u.fig[k] || {};
						const ghost = (!n.color || n.color === "white") && n.color2 == null;
						return [k, n.visibility, ghost];
					}).sort();
				const conns = Object.values(u.fig.connections || {})
					.map(c => [c.startNoteId, c.endNoteId, c.type || "line", c.ghost ? 1 : 0, c.arrowDirection || "none"]).sort();
				const sig = JSON.stringify([notes, conns]);
				if (seen.has(sig)) return;
				seen.add(sig);
				list.push({ fig: u.fig, mi: m });
			});
		});
	}
	return list;
}


// ===== 调的拼写（音名 + 升降号）=====
// 调的显示与存储分离：root（0-11 音高，供换算/播放）+ letter（0-6 主音音名）+ acc（-1/0/1 升降号）。
// 老数据只有 root：按升号拼写推导（1→C♯、3→D♯、6→F♯、8→G♯、10→A♯），自然音同名。
export const KEY_LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
export function keyPcOf(letter, acc) {
  return (LETTER_PC[letter] + (acc || 0) + 120) % 12;
}
const PC_TO_LETTER = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
export function keySpellOf(rootPc) {
  const spelled = { 1: [0, 1], 3: [1, 1], 6: [3, 1], 8: [4, 1], 10: [5, 1] }[rootPc];
  if (spelled) return { letter: spelled[0], acc: spelled[1] };
  return { letter: PC_TO_LETTER[rootPc] ?? 0, acc: 0 };
}
export function keyLabelText(letter, acc, minor) {
  return "1 = " + KEY_LETTERS[letter] + (acc > 0 ? "♯" : acc < 0 ? "♭" : "") + (minor ? "m" : "");
}

export function createSong(name = getT().chords.untitled) {
	return {
		id: newChartId(),
		name,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		key: { root: 0, minor: false },
		timeSig: 4,
		timeSigUnit: 4,
		bpm: 72,
		display: "degree",
		enharmonic: 1,
		rowsPerLine: 4,
		colorScheme: "navy",
		figOpts: defaultFigOpts(),
		measures: [0, 1, 2, 3].map(() => createMeasure(4)) // 新歌给满一行
	};
}

// 和弦图展示设置：每谱一份（song.figOpts），随谱走账号同步 / 工程文件 / 分享码——
// 不再是全局一份：两台设备打开同一首谱子，图的样子应当一致，而不是各按各的全局偏好渲染
export const FIG_SIZES = [112, 144, 176];
export const FIG_OPTS_V = 3;
export function defaultFigOpts() {
	return { orientation: "h", degMode: "chord", size: 144, mode: "inline", figV: FIG_OPTS_V };
}
// 白名单清洗：localStorage / 服务端 / 工程文件来的值不可信，缺的补默认、错的回默认，坏数据不炸渲染
export function normalizeFigOpts(v) {
	const d = defaultFigOpts();
	if (!v || typeof v !== "object") return d;
	const size = FIG_SIZES.includes(v.size) ? v.size
		: Number.isFinite(v.size) ? (v.size <= 88 ? FIG_SIZES[0] : v.size <= 104 ? FIG_SIZES[1] : FIG_SIZES[2])
		: d.size;
	return {
		orientation: v.orientation === "v" || v.orientation === "h" ? v.orientation : d.orientation,
		degMode: v.degMode === "chord" || v.degMode === "scale" || v.degMode === "none" ? v.degMode : d.degMode,
		size,
		mode: v.mode === "inline" || v.mode === "hover" ? v.mode : d.mode,
		figV: FIG_OPTS_V,
	};
}

// 拍号变化时补齐/裁剪小节槽位（已有和弦的槽保留在前）
export function resizeMeasure(measure, timeSig) {
	const slots = measure.slots.slice(0, timeSig);
	while (slots.length < timeSig) slots.push({ kind: "empty" });
	return { ...measure, slots };
}

// 谱子库大键已迁 IndexedDB（v188）：同步读写走内存缓存（idbStore），防抖刷 IDB，备份在 IDB 里轮转——
// localStorage 只剩同步小件（outbox/台账/token/偏好），5MB 配额不再是库的天花板。
// 无 IDB 环境由 idbStore 自动退回 localStorage 老路径；旧键在首次落盘成功后自动清除。
const chartsStore = createBigStore(CHARTS_KEY, {
	legacyKeys: (k) => [k, `${k}-bak-1`, `${k}-bak-2`, `${k}-bak-3`],
	lsRead: () => {
		try {
			const raw = hasLS() ? localStorage.getItem(CHARTS_KEY) : null;
			return raw ? JSON.parse(raw) : [];
		} catch (error) { return []; }
	},
});

export function loadCharts() {
	const charts = chartsStore.getSync();
	return Array.isArray(charts) ? charts.filter(c => c && Array.isArray(c.measures)) : [];
}

export function persistCharts(charts) {
	// 写 = 更新内存缓存（同步语义不变，调用方零改动）+ 防抖刷 IDB。
	// 异步写失败由 idbStore 广播 fretboard:storage-full；返回恒 true（缓存已是权威，同步 outbox 照走）。
	chartsStore.setSync(charts);
	return true;
}

export function saveChart(song) {
	const charts = loadCharts();
	const existing = charts.find(c => c.id === song.id);
	// 内容判脏：内容一模一样就不是改动——不写盘、不升版本、不下发。
	// 这一条根治了旧行为"只是打开了一首歌也会被当成改动保存"。
	if (existing && sameContent(existing, song)) return existing;
	const stamped = { ...song, updatedAt: Date.now() };
	const i = existing ? charts.indexOf(existing) : -1;
	if (i !== -1) charts[i] = stamped;
	else charts.unshift(stamped);
	if (!persistCharts(charts)) return stamped; // 本机存储已满（fretboard:storage-full 已广播）：不/outbox 下发——本机都没存住，云端先别动
	queuePush("charts", stamped); // 登录用户进离线队列异步下发（游客不入队，纯本地）
	return stamped;
}

// 批量保存（导入整包用）：合并成一次落盘——逐首 saveChart 会把全库 JSON 写 N 遍，大库直接把配额写爆
export function saveCharts(list) {
	const charts = loadCharts();
	const stamped = [];
	for (const song of list || []) {
		if (!song || !song.id) continue;
		const existing = charts.find(c => c.id === song.id);
		if (existing && sameContent(existing, song)) continue;
		const s0 = { ...song, updatedAt: Date.now() };
		const i = existing ? charts.indexOf(existing) : -1;
		if (i !== -1) charts[i] = s0;
		else charts.unshift(s0);
		stamped.push(s0);
	}
	if (stamped.length && persistCharts(charts)) {
		stamped.forEach(s => queuePush("charts", s));
	}
	return stamped;
}

export function deleteChart(id) {
	// 删除＝先进回收站（10 天可还原），不是立即丢弃
	const target = loadCharts().find(c => c.id === id);
	if (target) trashPut("charts", target);
	persistCharts(loadCharts().filter(c => c.id !== id));
	queueDelete("charts", id); // 删除也走离线队列：断网时删除不会丢
}

// 选中槽位（编辑光标）：{ mi: 小节序, si: 槽序, half: 0|1(反拍拆分后) | null }
export function firstEditableSlot(song) {
	return { mi: 0, si: 0, half: null };
}

// 在 (mi, si) 处插入一拍：从该拍起全曲的拍整体后移一位，内容一个不丢。
// 小节长度固定等于拍号，所以"后移"表现为拍跨小节线流动：本小节装不下的末拍流到下一小节开头，
// 逐节下传；全曲末尾溢出的拍落到新追加的小节里，终止线/反复线/结尾跟着真正的曲尾走。
export function insertBeatInSong(song, mi, si) {
	const target = song.measures[mi];
	if (!target) return song;
	const cap = song.timeSig || target.slots.length || 4;
	const measures = song.measures.map(m => ({ ...m, slots: m.slots.slice() }));
	const at = Math.max(0, Math.min(target.slots.length, si)); // si == 拍数 = 末尾追加（末小节加拍钮用）
	measures[mi].slots.splice(at, 0, { kind: "empty" });
	for (let k = mi; k < measures.length - 1; k++) {
		while (measures[k].slots.length > cap) measures[k + 1].slots.unshift(measures[k].slots.pop());
	}
	const last = measures[measures.length - 1];
	if (last.slots.length > cap) {
		const overflow = last.slots.splice(cap);
		const extra = { ...createMeasure(cap), slots: overflow, endBar: last.endBar, house: last.house ?? null };
		last.endBar = "single";
		last.house = null;
		measures.push(extra);
	}
	return { ...song, measures };
}

// 删除一拍：插入一拍的逆操作。(mi, si) 处的拍移除，从它起全曲的拍整体前移（跨小节流动），
// 末小节补空拍补满拍号；末小节因此被掏空时自动缩掉（小节线/结尾随内容回移——插入时的正向搬运在此还原）
export function deleteBeatInSong(song, mi, si) {
	const target = song.measures[mi];
	if (!target) return song;
	const cap = song.timeSig || target.slots.length || 4;
	const measures = song.measures.map(m => ({ ...m, slots: m.slots.slice() }));
	const at = Math.max(0, Math.min(target.slots.length - 1, si));
	measures[mi].slots.splice(at, 1);
	for (let k = mi + 1; k < measures.length; k++) {
		while (measures[k - 1].slots.length < cap && measures[k].slots.length) {
			measures[k - 1].slots.push(measures[k].slots.shift());
		}
	}
	const last = measures[measures.length - 1];
	while (last.slots.length < cap) last.slots.push({ kind: "empty" });
	const prev = measures[measures.length - 2];
	if (prev && last.slots.every(s => s.kind === "empty") && measures.length > 1) {
		prev.endBar = last.endBar;
		prev.house = last.house ?? prev.house;
		measures.pop();
	}
	return { ...song, measures };
}

// 槽位导航：上下左右在 (小节, 槽) 网格上移动；返回 null = 越界
export function moveCursor(song, cur, dmi, dsi) {
	if (!cur) return null;
	let mi = cur.mi + dmi;
	let si = cur.si + dsi;
	if (mi < 0 || mi >= song.measures.length) return null;
	const m = song.measures[mi];
	if (si < 0) {
		// 左行到上一小节末槽
		if (mi === 0) return null;
		mi -= 1;
		si = song.measures[mi].slots.length - 1;
		return { mi, si, half: null };
	}
	if (si >= m.slots.length) {
		if (mi === song.measures.length - 1) return null;
		mi += 1;
		si = 0;
		return { mi, si, half: null };
	}
	return { mi, si, half: null };
}

// ===== 反复段展开 / 收起 =====
// 反复开始处的图标：把「反复线 + 第一/第二结尾」摊成线性小节（展开），或无损还原成记号（收起）。
// 展开块成员带 unfold = { id, pass, part }：pass 第几遍，part = 'A' 共用段 / '1' 第一结尾 / '2' 第二结尾。
// 收起后谱面只展示第 1 遍；第 2 遍与第 1 遍不同的拍挂在该拍上（slot.alt2 = 第 2 遍那一拍的完整内容），
// 第 2 遍独有的歌词 / 段落标记 / 标色 / 换行存为小节上的 alt2* 字段——谱面上不显示，
// 只用于播放 / 动图（第 2 遍起走第 2 遍自己的内容）和再展开时原样还原。
// 挂在拍上而不是整小节：插入/删除一拍、复制粘贴、改拍号时替代内容自动跟着走。
// 「两段式」记法 ‖: A [1.] :‖ ‖: A' [2.] :‖（两段各带各的和弦/和弦图）按同一个两结尾反复处理：
// 展开成 A 第一结尾 A' 第二结尾，收起成标准的 ‖: A [1.] :‖ [2.]。

const cloneJson = (x) => JSON.parse(JSON.stringify(x));
// 键序无关的深比较：同一个和弦/指法图重新保存后键序可能变，不该被当成「两遍不同」
const canon = (x) => {
	if (Array.isArray(x)) return `[${x.map(canon).join(",")}]`;
	if (x && typeof x === "object") return `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canon(x[k])}`).join(",")}}`;
	return JSON.stringify(x);
};
const sameJson = (a, b) => canon(a) === canon(b);
// 小节内容签名（比较各遍是否相同时用）：不计 id、展开标记、手动换行
const contentSig = (m) => canon({ ...m, id: undefined, unfold: undefined, lineBreak: undefined });
const sameKey = (x, y) => x.keyRoot === y.keyRoot && x.keyMinor === y.keyMinor && x.keyLetter === y.keyLetter && x.keyAcc === y.keyAcc;

// 展开块：同 unfold.id 的首到尾；中间没标记的小节（展开后插入的）归入前一个成员的遍次与段落
function unfoldedBlock(measures, mi) {
	const bid = measures[mi]?.unfold?.id;
	if (!bid) return null;
	let head = -1, tail = -1;
	measures.forEach((m, i) => { if (m?.unfold?.id === bid) { if (head < 0) head = i; tail = i; } });
	if (head < 0) return null;
	const members = [];
	let cur = null;
	for (let i = head; i <= tail; i++) {
		const u = measures[i]?.unfold;
		if (u) cur = { pass: u.pass || 1, part: u.part || "A" };
		if (cur) members.push({ mi: i, ...cur });
	}
	return { head, tail, members };
}

// 各遍 = 按遍次分组的成员序列（出现顺序）；每遍再分共用段 A 与结尾 E
function blockPasses(members) {
	const passes = [];
	members.forEach(x => {
		let p = passes.find(q => q.pass === x.pass);
		if (!p) { p = { pass: x.pass, A: [], E: [] }; passes.push(p); }
		(x.part === "A" ? p.A : p.E).push(x.mi);
	});
	return passes;
}

// 第 2 遍独有的小节属性（挂在主体小节上；再展开时还原到第 2 遍）
const ALT2_KEYS = ["alt2Lyrics", "alt2LyricsBold", "alt2Section", "alt2Tint", "alt2LineBreak"];

// 第 1 遍版本的小节：去掉所有替代内容（拍的与小节的），键形不变
function stripAlt2(m) {
	const out = { ...m };
	ALT2_KEYS.forEach(k => { delete out[k]; });
	out.slots = (m.slots || []).map(sl => {
		if (!sl?.alt2) return sl;
		const { alt2, ...s } = sl;
		return s;
	});
	return out;
}

// 收起用的小节底版：第 1 遍版本再去掉展开标记与遍数，记号位清零（后面按新结构重新挂）
function foldBase(m) {
	const { unfold, repeatTimes, ...rest } = stripAlt2(m);
	return { ...rest, repeatStart: false, house: null, endBar: m.endBar === "repeatEnd" ? "single" : m.endBar };
}

// 主体小节：第 1 遍的内容 + 第 2 遍不同的拍（slot.alt2）与第 2 遍独有的歌词 / 段落标记 / 标色 / 换行（alt2*）
function bodyMeasure(first, second) {
	const out = foldBase(first);
	const fs = out.slots, ss = second.slots || [];
	let slots = fs;
	fs.forEach((sl, si) => {
		if (sameJson(sl, ss[si])) return;
		if (slots === fs) slots = fs.slice();
		slots[si] = { ...sl, alt2: cloneJson(ss[si]) };
	});
	const base = slots === fs ? out : { ...out, slots };
	const extra = {};
	if ((base.lyrics || "") !== (second.lyrics || "") || !sameJson(base.lyricsBold || [], second.lyricsBold || [])) {
		extra.alt2Lyrics = second.lyrics || "";
		if (second.lyricsBold?.length) extra.alt2LyricsBold = second.lyricsBold;
	}
	if ((first.section ?? null) !== (second.section ?? null)) extra.alt2Section = second.section ?? null;
	if ((first.tint ?? null) !== (second.tint ?? null)) extra.alt2Tint = second.tint ?? null;
	if (!!first.lineBreak !== !!second.lineBreak) extra.alt2LineBreak = !!second.lineBreak;
	return Object.keys(extra).length ? { ...base, ...extra } : base;
}

// 第 2 遍版本的小节：有替代的拍换成替代内容，歌词 / 段落标记 / 标色 / 换行换成第 2 遍的（替代字段一并清掉）
function pass2Of(m) {
	const out = stripAlt2(m);
	out.slots = (m.slots || []).map(sl => (sl?.alt2 ? cloneJson(sl.alt2) : sl));
	if (m.alt2Lyrics !== undefined) {
		out.lyrics = m.alt2Lyrics;
		if (m.alt2LyricsBold?.length) out.lyricsBold = m.alt2LyricsBold;
		else delete out.lyricsBold;
	}
	if (m.alt2Section !== undefined) out.section = m.alt2Section;
	if (m.alt2Tint !== undefined) {
		if (m.alt2Tint) out.tint = m.alt2Tint;
		else delete out.tint;
	}
	if (m.alt2LineBreak !== undefined) {
		if (m.alt2LineBreak) out.lineBreak = true;
		else delete out.lineBreak;
	}
	return out;
}

// 收起方案：null = 不是可收起的块；{ fail } = 现有记号表达不了；{ head, tail, out } = 用 out 替换 [head..tail]
function planFold(measures, mi) {
	const blk = unfoldedBlock(measures, mi);
	if (!blk) return null;
	const P = blockPasses(blk.members);
	if (P.length < 2) return null; // 只剩一遍：没有可收起的东西
	const fail = { fail: true, head: blk.head, tail: blk.tail };
	// 3 遍以上只能收成「第 2 遍起用替代拍」的纯反复：带结尾括线、或第 2 遍起各遍互不相同，都表达不了
	const sig2 = P[1].A.map(i => contentSig(measures[i]));
	if (P.length >= 3 && (P.some(p => p.E.length) || P.slice(1).some(p => !sameJson(p.A.map(i => contentSig(measures[i])), sig2)))) return fail;
	const [p1, p2] = P;
	const a = p1.A, b = p2.A;
	// 主体对位：逐小节比第 1 遍与第 2 遍的共用段。转调标记不同、拍数不同——替代拍表达不了，从这里起余下部分改走结尾括线
	const body = [];
	for (let i = 0; i < a.length && i < b.length; i++) {
		const x = measures[a[i]], y = measures[b[i]];
		if (!sameKey(x, y) || (x.slots?.length || 0) !== (y.slots?.length || 0)) break;
		body.push(bodyMeasure(x, y));
	}
	const cut = body.length;
	let e1 = [...a.slice(cut), ...p1.E].map(i => foldBase(measures[i]));
	let e2 = [...b.slice(cut), ...p2.E].map(i => foldBase(measures[i]));
	if (P.length >= 3 && (e1.length || e2.length)) return fail; // 两遍长短不同 → 多出的部分要进结尾括线，3 遍以上表达不了
	// 第 1 遍没有结尾而第 2 遍有：现有播放引擎下「2.」前面必须有「1.」才会被演奏——主体最后一小节同时放进两个结尾
	if (!e1.length && e2.length && body.length) {
		const last = body.pop();
		e1.push(foldBase(last));
		e2.unshift(pass2Of(last));
	}
	const out = body.slice();
	const tailEnd = measures[blk.tail]?.endBar || "single";
	if (!e1.length && !e2.length) {
		// 纯反复：‖: 挂在主体第一小节、:‖ 挂在最后一小节；第 2 遍起用替代拍
		out[0] = { ...out[0], repeatStart: true };
		out[out.length - 1] = { ...out[out.length - 1], endBar: "repeatEnd", ...(P.length > 2 ? { repeatTimes: P.length } : {}) };
	} else {
		if (body.length) out[0] = { ...out[0], repeatStart: true };
		else e1[0] = { ...e1[0], repeatStart: true };
		// 两个结尾的每一小节都挂上编号：「2.」在反复结束线之后，有效结尾不会自动向后延伸——只标段首的话，
		// 多小节的第二结尾只有第一小节算数（括线、展开范围都会漏掉后面的小节）
		e1 = e1.map(m => ({ ...m, house: 1 }));
		e1[e1.length - 1] = { ...e1[e1.length - 1], endBar: "repeatEnd" };
		e2 = e2.map(m => ({ ...m, house: 2 }));
		if (e2.length) e2[e2.length - 1] = { ...e2[e2.length - 1], endBar: tailEnd };
		out.push(...e1, ...e2);
	}
	return { head: blk.head, tail: blk.tail, out };
}

// 「两段式」记法：第一段带「1.」结尾，紧接着的第二段（自己的 ‖: … :‖）带「2.」结尾——
// 实际是同一个两结尾反复被写成了首尾相接的两段（两段各带各的和弦/和弦图，如 Verse / Verse2）。
// 两段各只收口在自己身上（第一段没有「2.」、第二段没有「1.」）才算；返回合并后的块，否则 null
function coupledPair(eff, secs, k) {
	const x = secs[k], y = secs[k + 1];
	if (!x || !y || y.start !== x.end + 1) return null;
	const has = (sec, h) => {
		for (let i = sec.start; i <= sec.end; i++) if (eff[i] === h) return true;
		return false;
	};
	if (!has(x, 1) || has(x, 2) || !has(y, 2) || has(y, 1)) return null;
	return { start: x.start, end: y.end, first: x, second: y };
}

// mi 所在的可展开块：{ start, end2, seq: [{ mi, pass, part }] }（按演奏顺序）；不在任何可展开的块里 → null
//   普通反复段：取演奏序列落在段内的部分（看到 = 听到），回跳处遍数加一；段内有小节进不了演奏序列（中途夹终止线）→ null
//   两段式：第 1 遍 = 第一段（「1.」之前共用段、之后第一结尾），第 2 遍 = 第二段（「2.」之前共用段、之后第二结尾）
function blockPlan(song, mi) {
	const ms = song?.measures || [];
	const eff = effectiveHouses(ms);
	const secs = repeatSections(ms);
	const skip = new Set(); // 两段式的第二段：已并入前一段的块
	for (let k = 0; k < secs.length; k++) {
		if (skip.has(k)) continue;
		const pair = coupledPair(eff, secs, k);
		if (pair) {
			skip.add(k + 1);
			if (mi < pair.start || mi > pair.end) continue;
			const split = (sec, h, pass) => {
				const A = [], E = [];
				for (let i = sec.start; i <= sec.end; i++) (eff[i] === h ? E : A).push(i);
				return [...A.map(i => ({ mi: i, pass, part: "A" })), ...E.map(i => ({ mi: i, pass, part: String(h) }))];
			};
			return { start: pair.start, end2: pair.end, seq: [...split(pair.first, 1, 1), ...split(pair.second, 2, 2)] };
		}
		const sec = secs[k];
		if (mi < sec.start || mi > sec.end2) continue;
		const idxs = expandSong(song).filter(i => i >= sec.start && i <= sec.end2);
		if (!idxs.length || new Set(idxs).size !== sec.end2 - sec.start + 1) return null;
		let pass = 1;
		return {
			start: sec.start, end2: sec.end2,
			seq: idxs.map((idx, j) => {
				if (j > 0 && idxs[j] <= idxs[j - 1]) pass++;
				return { mi: idx, pass, part: eff[idx] === 1 ? "1" : eff[idx] === 2 ? "2" : "A" };
			})
		};
	}
	return null;
}

// 渲染用的开关表：Map<小节下标, { kind:'unfold', start, end } | { kind:'fold', head, tail }>
//   unfold：收起态反复块的起点（含隐式起点；两段式落在第一段的起点）；普通段里有小节进不了演奏序列（中途夹终止线）时不给
//   fold：展开态反复块的首小节，且结构能无损收起
export function repeatToggles(song) {
	const ms = song?.measures || [];
	const out = new Map();
	const eff = effectiveHouses(ms);
	const secs = repeatSections(ms);
	const seq = new Set(expandSong(song || { measures: [] }));
	const skip = new Set();
	secs.forEach((sec, k) => {
		if (skip.has(k)) return;
		const pair = coupledPair(eff, secs, k);
		if (pair) { // 两段式：一个开关管两段，落在第一段的起点
			skip.add(k + 1);
			out.set(pair.start, { kind: "unfold", start: pair.start, end: pair.end });
			return;
		}
		for (let i = sec.start; i <= sec.end2; i++) {
			if (!seq.has(i)) return;
		}
		out.set(sec.start, { kind: "unfold", start: sec.start, end: sec.end2 });
	});
	ms.forEach((m, mi) => {
		const bid = m?.unfold?.id;
		if (!bid || out.has(mi)) return; // 同一小节既有收起态记号又是块首：让位给展开
		if (ms.findIndex(x => x?.unfold?.id === bid) !== mi) return; // 只在块首
		const plan = planFold(ms, mi);
		if (plan && !plan.fail) out.set(mi, { kind: "fold", head: plan.head, tail: plan.tail });
	});
	return out;
}

// 展开反复段：mi 所在块按 blockPlan 的顺序落成线性小节。同一小节落下来不止一次时，后续的深拷贝换新 id；
// 第 2 遍起套用替代拍 / 第 2 遍属性。不在可展开的块里 → null
export function unfoldRepeat(song, mi) {
	const ms = song?.measures || [];
	const plan = blockPlan(song, mi);
	if (!plan) return null;
	const tag = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	const seen = new Set();
	const out = plan.seq.map(({ mi: idx, pass, part }) => {
		const src = ms[idx];
		const { unfold, repeatTimes, ...rest } = pass >= 2 ? pass2Of(src) : stripAlt2(src);
		const first = !seen.has(idx);
		seen.add(idx);
		return {
			...rest,
			repeatStart: false,
			house: null,
			endBar: src.endBar === "repeatEnd" ? "single" : src.endBar,
			...(first ? {} : { id: newMeasureId() }),
			unfold: { id: tag, pass, part }
		};
	});
	return { ...song, measures: [...ms.slice(0, plan.start), ...out, ...ms.slice(plan.end2 + 1)] };
}

// 收起展开态反复块（unfoldRepeat 的逆，无损）：mi 所在块按 planFold 的规则还原成记号。
// → { song } | { fail: true }（3 遍以上且现有记号表达不了）| null（不是可收起的块）
export function foldRepeat(song, mi) {
	const plan = planFold(song?.measures || [], mi);
	if (!plan) return null;
	if (plan.fail) return { fail: true };
	const ms = song.measures;
	return { song: { ...song, measures: [...ms.slice(0, plan.head), ...plan.out, ...ms.slice(plan.tail + 1)] } };
}

// ===== 云端同步落地 =====

// 服务端确认下发后：把新版本号写回本地。
// 不回写的话，下一次下发还会带着过期的 baseRev，等于自己跟自己冲突。
setApplier("charts", (serverItem) => {
	const charts = loadCharts();
	const i = charts.findIndex(c => c.id === serverItem.id);
	if (i === -1) return;
	charts[i] = { ...charts[i], rev: serverItem.rev };
	persistCharts(charts);
});

// 增量拉取落地：只接 rev 更大的行 + 墓碑。
// 本地还有未下发的编辑时本地赢——别用云端盖掉用户正在改的东西（冲突留到下发时统一处理）。
setPuller("charts", (data) => {
	const charts = loadCharts();
	const byId = new Map(charts.map(c => [c.id, c]));
	const pending = new Set(outboxPending("charts").map(e => e.id));
	let changed = false;
	(data.items || []).forEach(remote => {
		if (!remote || !remote.id) return;
		if (pending.has(remote.id)) return;
		const local = byId.get(remote.id);
		if (local && (local.rev || 0) >= (remote.rev || 0)) return; // 本地不旧于云端
		byId.set(remote.id, remote);
		changed = true;
	});
	(data.deleted || []).forEach(d => {
		if (!d || !d.id) return;
		if (pending.has(d.id)) return;
		if (byId.has(d.id)) { byId.delete(d.id); changed = true; }
	});
	if (!changed) return;
	persistCharts([...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
	window.dispatchEvent(new CustomEvent("fretboard:charts-synced"));
});

// 冲突（云端版本更新）：云端版本为准，本地被拒的版本另存副本——两边都不丢
setConflictHandler("charts", (entry, serverItem) => {
	const charts = loadCharts();
	const i = charts.findIndex(c => c.id === entry.id);
	if (i !== -1 && serverItem) charts[i] = serverItem;
	const t = getT();
	const copy = {
		...entry.item,
		id: newChartId(),
		name: `${entry.item.name || t.chords.untitled}${t.utils.conflictSuffix}`,
		createdAt: Date.now(),
		updatedAt: Date.now()
	};
	charts.unshift(copy);
	persistCharts(charts);
	window.dispatchEvent(new CustomEvent("fretboard:charts-synced"));
	window.dispatchEvent(new CustomEvent("fretboard:toast", {
		detail: { msg: fmt(t.utils.conflictToast, { name: entry.item.name, copy: copy.name }) }
	}));
});
