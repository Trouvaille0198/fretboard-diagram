// 和弦谱纯逻辑冒烟：chordLib（级数⇄音名/调内默认/音高）+ chordChartModel（模型/光标）+ voicing（按法不变量）
// 纯 Node 直跑：node scripts/smoke-chords.mjs
import {
	CHORD_INTERVALS, degreePc, diatonicQuality, chordFromDegreeToken, formatDegree, chordParts, formatInline,
	formatName, chordFromNameToken, chordPcs, chordMidi, bassPc, sameChord
} from "../src/utils/chordLib.js";
import { createSong, createMeasure, resizeMeasure, moveCursor } from "../src/utils/chordChartModel.js";
import { voiceChord, voicingWindow, noteIdPc } from "../src/utils/voicing.js";

let fail = 0, n = 0;
const A = (name, ok, detail) => { n++; if (!ok) { fail++; console.error(`  ✗ ${name}${detail ? "  [" + detail + "]" : ""}`); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const C = { root: 0, minor: false };
const G = { root: 7, minor: false };
const F = { root: 5, minor: false };
const Am = { root: 9, minor: true };
const Dm = { root: 2, minor: true };

console.log("== chordLib：级数 → 音高 ==");
A("C大调 1/4/6 的根音", degreePc(1, 0, C) === 0 && degreePc(4, 0, C) === 5 && degreePc(6, 0, C) === 9);
A("a小调 1/4/7 的根音", degreePc(1, 0, Am) === 9 && degreePc(4, 0, Am) === 2 && degreePc(7, 0, Am) === 7);
A("b7 在 C 大调 = Bb", degreePc(7, -1, C) === 10);

console.log("== chordLib：调内默认质量 ==");
A("大调 1/4/5 大三、2/3/6 小三、7 减",
	eq([1, 2, 3, 4, 5, 6, 7].map(d => diatonicQuality(d, 0, C)), ["", "m", "m", "", "", "m", "dim"]));
A("小调 1 小三、3 大三、2 减、7 大三",
	eq([1, 2, 3, 4, 5, 6, 7].map(d => diatonicQuality(d, 0, Am)), ["m", "dim", "", "m", "m", "", ""]));
A("变音度数默认大三（流行借用）", diatonicQuality(7, -1, C) === "" && diatonicQuality(3, -1, C) === "");

console.log("== chordLib：级数 token 解析/格式化 ==");
A("6m 解析", eq(chordFromDegreeToken("6m"), { degree: 6, acc: 0, quality: "m", bass: null }));
A("b3 解析", eq(chordFromDegreeToken("b3"), { degree: 3, acc: -1, quality: "", bass: null }));
A("5/7 解析", eq(chordFromDegreeToken("5/7"), { degree: 5, acc: 0, quality: "", bass: { degree: 7, acc: 0 } }));
A("4m7 解析", eq(chordFromDegreeToken("4m7"), { degree: 4, acc: 0, quality: "m7", bass: null }));
A("maj7 不被 7 抢先", eq(chordFromDegreeToken("1maj7"), { degree: 1, acc: 0, quality: "maj7", bass: null }));
A("垃圾输入 → null", chordFromDegreeToken("x!") === null && chordFromDegreeToken("") === null);
A("格式化往返 6m/b3/5/7/4m7", ["6m", "b3", "5/7", "4m7"].every(t => formatDegree(chordFromDegreeToken(t)) === t));

console.log("== chordLib：音名格式化 ==");
A("C大调 6m → Am", formatName(chordFromDegreeToken("6m"), C) === "Am");
A("C大调 4 → F", formatName(chordFromDegreeToken("4"), C) === "F");
A("C大调 b7 → Bb（降号度数记降）", formatName(chordFromDegreeToken("b7"), C) === "Bb");
A("G大调 5/7 → D/F#（调号记升）", formatName(chordFromDegreeToken("5/7"), G) === "D/F#");
A("F大调 4 → Bb（降号调）", formatName(chordFromDegreeToken("4"), F) === "Bb");
A("a小调 1 → Am、5 → Em", formatName(chordFromDegreeToken("1"), Am) === "Am" && formatName(chordFromDegreeToken("5"), Am) === "Em");
A("d小调 6 → Bb（等大调 F 记降）", formatName(chordFromDegreeToken("6"), Dm) === "Bb");
A("c小调 5 → Gm（降表 pc7=G，曾错拼 G#）", formatName(chordFromDegreeToken("5"), { root: 0, minor: true }) === "Gm");
A("c小调 调内名行 1..7 = Cm Ddim Eb Fm Gm Ab Bb", ["Cm","Ddim","Eb","Fm","Gm","Ab","Bb"].every((n, i) => formatName(chordFromDegreeToken(String(i + 1)), { root: 0, minor: true }) === n));

console.log("== chordLib：罗马数字功能谱 ==");
{
	const P = (t, k) => chordParts(chordFromDegreeToken(t), "roman", k);
	A("C大调 1→I 4→IV 6m→vi（副行空）", (() => { const a = P("1", C), b = P("4", C), c = P("6m", C); return a.main === "I" && !a.sub && b.main === "IV" && c.main === "vi" && !c.sub; })());
	A("C大调 b7→bVII（变音前缀保留）", P("b7", C).main === "bVII");
	A("C大调 2m7→ii+7、1maj7→I+maj7", P("2m7", C).main === "ii" && P("2m7", C).sub === "7" && P("1maj7", C).main === "I" && P("1maj7", C).sub === "maj7");
	A("C大调 5/7→V+/vii（转位低音小写罗马）", P("5/7", C).main === "V" && P("5/7", C).sub === "/vii");
	A("a小调 1→i 2→ii dim 3→III 7→VII（小调调内）", (() => { const k = Am; return P("1", k).main === "i" && P("2", k).main === "ii" && P("2", k).sub === "dim" && P("3", k).main === "III" && !P("3", k).sub && P("7", k).main === "VII"; })());
	A("a小调 1maj7→I+maj7（显式质量不受调性影响）", P("1maj7", Am).main === "I" && P("1maj7", Am).sub === "maj7");
	A("G大调 5→V（移调只换音高不改级数）", P("5", G).main === "V");
	A("sus 族大写：5sus4→V+sus4", P("5sus4", C).main === "V" && P("5sus4", C).sub === "sus4");
	A("减七：1dim7→1dim7（数字）/ vii°7（罗马小写）/ pcs 减减七", (() => { const k = C; const c = { degree: 1, acc: 0, quality: "dim7", bass: null }; const r = { degree: 7, acc: 0, quality: "dim7", bass: null }; return formatInline(c, "degree", k) === "1dim7" && formatInline(r, "roman", k) === "vii°7" && eq(chordPcs(c, k).pcs, [0, 3, 6, 9]) && formatName(c, k) === "Cdim7"; })());
}

console.log("== chordLib：音名 → 级数 ==");
A("C大调 Am → 6m", eq(chordFromNameToken("Am", C), { degree: 6, acc: 0, quality: "m", bass: null }));
A("C大调 F → 4", eq(chordFromNameToken("F", C), { degree: 4, acc: 0, quality: "", bass: null }));
A("C大调 G7 → 5/7", eq(chordFromNameToken("G7", C), { degree: 5, acc: 0, quality: "7", bass: null }));
A("C大调 Bb → b7", eq(chordFromNameToken("Bb", C), { degree: 7, acc: -1, quality: "", bass: null }));
A("C大调 D/F# → 2/#4", formatDegree(chordFromNameToken("D/F#", C)) === "2/#4");
A("音名→级数→音名往返", ["Am", "F", "G7", "Bb", "Dm", "Em"].every(t => formatName(chordFromNameToken(t, C), C) === t));

console.log("== chordLib：和弦音高 ==");
A("C大调 1 的 pcs = C E G", eq(chordPcs(chordFromDegreeToken("1"), C).pcs, [0, 4, 7]));
A("C大调 7(dim) 的 pcs = B D F", eq(chordPcs(chordFromDegreeToken("7"), C).pcs, [2, 5, 11]));
A("5/7 的低音 = 7 度根音（G/B）", bassPc(chordFromDegreeToken("5/7"), C) === degreePc(7, 0, C));
A("裸级数取调内默认质量（C 大调 6 = Am）", formatName(chordFromDegreeToken("6"), C) === "Am" && eq(chordPcs(chordFromDegreeToken("6"), C).pcs, [0, 4, 9]));
A("无 bass 低音 = 根音", bassPc(chordFromDegreeToken("6m"), C) === 9);
A("chordMidi C3 = 48 基", eq(chordMidi(chordFromDegreeToken("1"), C, 3), [48, 52, 55]));
A("sameChord 判等", sameChord(chordFromDegreeToken("6m"), chordFromNameToken("Am", C)) && !sameChord(chordFromDegreeToken("6m"), chordFromDegreeToken("6")));
A("全 quality 有音程表", Object.keys(CHORD_INTERVALS).length >= 13);

console.log("== chordChartModel：模型 ==");
{
	const song = createSong("测试");
	A("新歌给满一行（4 小节 × 4 槽空位）", song.measures.length === 4 && song.measures.every(m => m.slots.length === 4 && m.slots.every(s => s.kind === "empty")));
	A("拍号改 3 裁槽", resizeMeasure(createMeasure(4), 3).slots.length === 3);
	A("拍号改 6 补槽且保留前槽", (() => { const m = { slots: [{ kind: "chord", chord: { degree: 1, acc: 0, quality: "", bass: null } }] }; const r = resizeMeasure(m, 6); return r.slots.length === 6 && r.slots[0].kind === "chord" && r.slots[5].kind === "empty"; })());
	A("末槽右移跨到下一小节", eq(moveCursor(song, { mi: 0, si: 3, half: null }, 0, 1), { mi: 1, si: 0, half: null }));
	const two = { measures: [createMeasure(4), createMeasure(4)] };
	A("光标右移跨小节", eq(moveCursor(two, { mi: 0, si: 3, half: null }, 0, 1), { mi: 1, si: 0, half: null }));
	A("光标左移跨小节", eq(moveCursor(two, { mi: 1, si: 0, half: null }, 0, -1), { mi: 0, si: 3, half: null }));
	A("光标上/下越界", moveCursor(two, { mi: 0, si: 0, half: null }, 0, -1) === null && moveCursor(two, { mi: 1, si: 3, half: null }, 0, 1) === null);
}

console.log("== voicing：按法不变量 ==");
// 不变量：按法所有音 ∈ 和弦音集；最低发声弦 pc = 低音；品距 ≤ 4；窗口合理
const checkVoicing = (token, key, label) => {
	const chord = chordFromDegreeToken(token);
	const { pcs } = chordPcs(chord, key);
	const v = voiceChord(chord, key);
	if (!v) { A(`${label}：有按法`, false, "null"); return null; }
	const set = new Set(pcs);
	A(`${label}：所有音 ∈ 和弦音集`, v.notes.every(nt => set.has(noteIdPc(nt.id))), v.notes.map(nt => `${nt.id}:${noteIdPc(nt.id)}`).join(" "));
	A(`${label}：最低发声弦 = 低音`, noteIdPc(v.notes[0].id) === bassPc(chord, key), `${v.notes[0].id}=${noteIdPc(v.notes[0].id)} 期望${bassPc(chord, key)}`);
	A(`${label}：品距 ≤ 4`, (v.hasOpen ? v.maxFret : v.maxFret - v.minFret) <= 4, `min${v.minFret} max${v.maxFret} open${v.hasOpen}`);
	A(`${label}：≥ 3 个发声弦`, v.notes.length >= 3, String(v.notes.length));
	A(`${label}：noteId 格式`, v.notes.every(nt => /^(o-s\d|f\d+-s\d)$/.test(nt.id)));
	return v;
};
const vC = checkVoicing("1", C, "C 开放");
A("C 用开放按法", vC && vC.shape === "open");
A("C 窗口含空弦区", vC && voicingWindow(vC).startFret === 0);
const vCm = checkVoicing("1m", C, "Cm 横按");
A("Cm 是横按（非开放）", vCm && vCm.shape !== "open" && vCm.minFret >= 1, vCm && `min=${vCm.minFret} shape=${vCm.shape}`);
checkVoicing("4m7", G, "G 调 Cm7");
checkVoicing("1/5", C, "C/G 转位");
checkVoicing("2/#4", C, "D/F# 斜杠");
checkVoicing("7", C, "Bdim 裸级数");
checkVoicing("1aug", C, "Caug 无表质量");
checkVoicing("6m7", G, "Em7");
checkVoicing("1", Dm, "Dm 调裸 1 = Dm");
checkVoicing("5/7", C, "G/B 斜杠");
// 移调一致性：同一和弦对象换 viewKey 求按法 → 音集整体平移
{
	const chord = chordFromDegreeToken("1");
	const v1 = voiceChord(chord, C);
	const v2 = voiceChord(chord, { root: 7, minor: false });
	const uniq = (arr) => [...new Set(arr)].sort((a, b) => a - b);
	const pcs1 = uniq(v2.notes.map(x => (noteIdPc(x.id) + 5) % 12));
	const pcs2 = uniq(v1.notes.map(x => noteIdPc(x.id)));
	A("移调后按法音集 = 原音集 + 7", eq(pcs1, pcs2), `${pcs1} vs ${pcs2}`);
}
// 窗口：Bm（A 型 2 品横按）窗口合理
{
	const v = voiceChord(chordFromDegreeToken("1m"), { root: 11, minor: false });
	const w = voicingWindow(v);
	A("Bm 横按窗口含把位且跨度 ≥ 4", w.startFret >= 1 && w.endFret - w.startFret >= 4, JSON.stringify(w));
}


console.log("== 播放引擎：展开反复/跳房子 ==");
import { expandSong, buildEvents, buildPlayPlan } from "../src/utils/chartPlayback.js";
{
	const chT = (t) => chordFromDegreeToken(t);
	const M = (slots, extra) => ({ id: "m", section: null, lyrics: "", repeatStart: false, endBar: "single", house: null, slots, ...(extra || {}) });
	A("简单反复", eq(expandSong({ measures: [M([{}]), M([{}], { endBar: "repeatEnd" }), M([{}])] }), [0, 1, 0, 1, 2]));
	const housed = { measures: [M([{}]), M([{}], { house: 1, endBar: "repeatEnd" }), M([{}], { house: 2 }), M([{}], { endBar: "final" })] };
	A("跳房子两遍（1房→回跳→跳过1房进2房）", eq(expandSong(housed), [0, 1, 0, 2, 3]));
	const two = { measures: [M([{}], { endBar: "repeatEnd" }), M([{}], { endBar: "repeatEnd" }), M([{}])] };
	A("连续两段反复", eq(expandSong(two), [0, 0, 1, 1, 2]));
	const rs = { measures: [M([{}]), M([{}], { repeatStart: true }), M([{}], { endBar: "repeatEnd" }), M([{}])] };
	A("repeatStart 从标记处回跳", eq(expandSong(rs), [0, 1, 2, 1, 2, 3]));

	console.log("== 播放引擎：事件流 ==");
	const song1 = { timeSig: 4, bpm: 120, measures: [M([
		{ kind: "chord", chord: chT("1") }, { kind: "chord", chord: chT("1") }, { kind: "hold" },
		{ kind: "chord", chord: chT("5"), split: [{ kind: "chord", chord: chT("5") }, { kind: "chord", chord: chT("4") }] }
	])] };
	const evs = buildEvents(song1);
	A("同和弦合并 + hold 并入", evs[0].type === "chord" && evs[0].beats === 3, JSON.stringify(evs.map(e => [e.type, e.beats])));
	A("拆分半拍事件", evs.length === 3 && evs[1].beats === 0.5 && evs[2].beats === 0.5 && evs[2].half === 1, JSON.stringify(evs.map(e => [e.type, e.beats, e.half])));

	console.log("== 播放引擎：播放计划 ==");
	const plan = buildPlayPlan({ timeSig: 4, bpm: 120, measures: [M([{ kind: "chord", chord: chT("1") }, { kind: "empty" }])] }, C);
	A("计划 2 事件且总时长=2 拍", plan.items.length === 2 && Math.abs(plan.totalMs - 1000) < 1, String(plan.totalMs));
	A("和弦事件有按法与点火", !!plan.items[0].voicing && plan.items[0].plan.length >= 2);
	A("空槽事件无和弦", !plan.items[1].chord);

	console.log("== 动图 clip 生成 ==");
	const { buildSongClip } = await import("../src/utils/chartFrames.js");
	const clipSong = { name: "送别片段", key: C, timeSig: 4, bpm: 80, enharmonic: 1, colorScheme: "navy",
		measures: [M([{ kind: "chord", chord: chT("1") }, { kind: "chord", chord: chT("4") }, { kind: "chord", chord: chT("1") }, { kind: "chord", chord: chT("5") }])] };
	const built = buildSongClip(clipSong, C);
	const clip = built && built.clip;
	A("4 和弦 4 帧", clip.frames.length === 4 && clip.transitions.length === 3);
	A("帧数据形状（type/color/visibility）", clip.frames.every(f => Object.values(f.data).every(d => d.type === "note" && d.color && typeof d.color === "object" && d.visibility === "visible")));
	A("出生色随帧位变化", (() => { const c0 = Object.values(clip.frames[0].data)[0].color.custom, c3 = Object.values(clip.frames[3].data)[0].color.custom; return c0 !== c3; })());
	A("每帧有 frameTint", clip.frames.every(f => f.frameTint && f.frameTint.custom));
	A("品窗有效", clip.frames.every(f => f.endFret > f.startFret && f.startFret >= 0 && f.endFret <= 15));
	A("帧内音符带 noteId 品窗一致", clip.frames.every(f => Object.keys(f.data).every(id => /^(o-s\d|f\d+-s\d)$/.test(id))));
}

// ===== 变化音（alt）与新质量：maj9/m9/m7-5/dim7 + 7b9b13 这类叠加 =====
console.log("== chordLib：变化音与新质量 ==");
{
	const { chordPcs, chordMidi, formatDegree, formatInline, formatName, formatChord, sameChord, chordFromDegreeToken, ALT_ORDER } =
		await import("../src/utils/chordLib.js");
	const c7b9b13 = { degree: 5, acc: 0, quality: "7", alt: ["b9", "b13"], bass: null };
	const pcs = chordPcs(c7b9b13, C);
	A("7b9b13 的 pcs（G=B D F Ab Eb，含 b9=8、b13=3）", eq(pcs.pcs, [2, 3, 5, 7, 8, 11]), JSON.stringify(pcs.pcs));
	A("midi 含变化音（b9=+13、b13=+20）", (() => { const m = chordMidi(c7b9b13, C); return m.includes(68) && m.includes(75) && m.length === 6; })());
	A("formatDegree 带变化音", formatDegree(c7b9b13) === "57b9b13");
	A("行内记号 57b9b13", formatInline(c7b9b13, "degree", C) === "57b9b13");
	A("音名记号 G7b9b13", formatName(c7b9b13, C) === "G7b9b13");
	A("罗马数字副行带变化音", formatChord(c7b9b13, "roman", C).includes("b9b13"));
	A("alt 规范序（乱序输入按 ALT_ORDER 输出）", formatDegree({ ...c7b9b13, alt: ["b13", "b9"] }) === "57b9b13");
	A("sameChord 区分变化音", sameChord({ degree: 5, quality: "7" }, { degree: 5, quality: "7", alt: ["b9"] }) === false
		&& sameChord(c7b9b13, { degree: 5, acc: 0, quality: "7", alt: ["b9", "b13"], bass: null }));
	A("maj9/m9/m7-5/dim7 的 pcs", eq(chordPcs({ degree: 1, quality: "maj9" }, C).pcs, [0, 2, 4, 7, 11])
		&& eq(chordPcs({ degree: 2, quality: "m9" }, C).pcs, [0, 2, 4, 5, 9])
		&& eq(chordPcs({ degree: 2, quality: "m7-5" }, C).pcs, [0, 2, 5, 8])
		&& eq(chordPcs({ degree: 7, quality: "dim7" }, C).pcs, [2, 5, 8, 11]));
	A("行内记号 2m9 / 1maj9 / 2m7-5", formatInline({ degree: 2, quality: "m9" }, "degree", C) === "2m9"
		&& formatInline({ degree: 1, quality: "maj9" }, "degree", C) === "1maj9"
		&& formatInline({ degree: 2, quality: "m7-5" }, "degree", C) === "2m7-5");
	A("token 解析认 m7-5", eq(chordFromDegreeToken("2m7-5"), { degree: 2, acc: 0, quality: "m7-5", bass: null }));
	A("ALT_ORDER 覆盖 11 种（自然在前、变音随后）", eq(ALT_ORDER, ["b5", "#5", "9", "b9", "#9", "11", "b11", "#11", "13", "b13", "#13"]));
	// 记号结构化分解（UI 把级数装框用）：级数 / 质量后缀 / 转位 三段互不粘连
	const { chordSignParts } = await import("../src/utils/chordLib.js");
	A("signParts：57b9b13 分层", eq(chordSignParts(c7b9b13, "degree", C), { degree: "5", suffix: "7b9b13", bass: "" }));
	A("signParts：转位低音单列", eq(chordSignParts({ degree: 5, acc: 0, quality: "7", bass: { degree: 7, acc: 0 } }, "degree", C),
		{ degree: "5", suffix: "7", bass: "/7" }));
	A("signParts：三和弦/纯级数/变音级", chordSignParts({ degree: 6, acc: 0, quality: "m", bass: null }, "degree", C).suffix === "m"
		&& chordSignParts({ degree: 1, acc: 0, quality: "", bass: null }, "degree", C).suffix === ""
		&& chordSignParts({ degree: 3, acc: -1, quality: "", bass: null }, "degree", C).degree === "b3");
	A("signParts：maj7 用全称后缀、罗马/音名模式", chordSignParts({ degree: 4, acc: 0, quality: "maj7", bass: null }, "degree", C).suffix === "maj7"
		&& chordSignParts({ degree: 5, acc: 0, quality: "7", bass: null }, "roman", C).degree === "V"
		&& chordSignParts({ degree: 5, acc: 0, quality: "7", bass: null }, "name", C).flat === "G7");
		A("自然变化音 pcs：C7(9,13)", eq(chordPcs({ degree: 1, quality: "7", alt: ["9", "13"] }, C).pcs, [0, 2, 4, 7, 9, 10]));
		A("b5/#5 pcs：C7b5 / C7#5", eq(chordPcs({ degree: 1, quality: "7", alt: ["b5"] }, C).pcs, [0, 4, 6, 10])
			&& eq(chordPcs({ degree: 1, quality: "7", alt: ["#5"] }, C).pcs, [0, 4, 8, 10]));
		A("显示规则：一律直连（完整精确）", formatDegree({ degree: 5, acc: 0, quality: "7", bass: null, alt: ["b9", "b13"] }) === "57b9b13"
			&& formatDegree({ degree: 5, acc: 0, quality: "7", bass: null, alt: ["9", "13"] }) === "57913"
			&& formatDegree({ degree: 5, acc: 0, quality: "7", bass: null, alt: ["b9", "13"] }) === "57b913"
			&& formatDegree({ degree: 5, acc: 0, quality: "7", bass: null, alt: ["9", "b9", "b13"] }) === "579b9b13");
		A("强力和弦 5：pcs 与记号", eq(chordPcs({ degree: 1, quality: "5" }, C).pcs, [0, 7])
			&& formatInline({ degree: 1, acc: 0, quality: "5", bass: null }, "degree", C) === "15");
}

// 工程文件（.fbchart）往返：MusicXML 装不下的应用私有状态必须一个不丢
console.log("== chartPack：工程文件往返 ==");
{
	const { packChart, unpackChart, unpackChartBundle, chartShareCode, isChartPack, compactChart } = await import("../src/utils/chartPack.js");
	// 造一首把应用里所有字段都用上的谱子（含配图/标色/节奏型/反复/跳房子/谱中转调/质量记忆）
	const s = createSong("往返测试");
	s.key = { root: 9, minor: true };
	s.timeSig = 3; s.bpm = 88; s.display = "name"; s.enharmonic = -1; s.rowsPerLine = 3; s.colorScheme = "crimson";
	s.qualityMemory = { "1": "M7", "4": "m7" };
	s.measures = [];
	const qs = ["", "M", "m", "7", "M7", "m7", "maj7", "sus4", "dim", "aug", "m7b5"];
	for (let i = 0; i < 24; i++) {
		const m = createMeasure(3);
		m.section = i === 0 ? "主歌1" : i === 8 ? "副歌" : null;
		m.lyrics = i < 4 ? `歌词${i}` : "";
		m.repeatStart = i === 8;
		m.endBar = i === 23 ? "final" : i === 15 ? "repeatEnd" : i === 5 ? "double" : "single";
		m.house = i === 16 ? 1 : null;
		if (i === 12) { m.keyRoot = 2; m.keyMinor = false; }
		m.tint = i % 3 === 0 ? "blue" : null;
		m.slots = m.slots.map((_, si) => {
			if (i === 20 && si === 0) return { kind: "rest" };
			if (i === 20 && si === 1) return { kind: "hold", fig: { custom: "延音上的图" } };
			if (i === 18 && si === 0) {
				// 与 toggleSplit 产物同形：split[0] 就是正拍本身，fig 槽位与 split[0] 同有
				const d = { kind: "chord", chord: { degree: 1, acc: 0, quality: "M7", bass: null }, fig: { custom: "正半拍图" } };
				return { ...d, split: [{ ...d }, { kind: "chord", chord: { degree: 5, acc: 0, quality: "7", bass: { degree: 3, acc: 0 } } }] };
			}
			if (i === 19 && si === 0) return { kind: "chord", chord: { degree: 2, acc: 0, quality: "m7", bass: null }, split: [{ kind: "chord", chord: { degree: 2, acc: 0, quality: "m7", bass: null } }, { kind: "empty" }] };
			const u = { kind: "chord", chord: { degree: (si + i) % 7 + 1, acc: i % 5 === 0 ? -1 : 0, quality: qs[(si * 3 + i) % qs.length], bass: si === 2 ? { degree: 4, acc: -1 } : null } };
			if (i % 6 === 1 && si === 1) u.rhythm = "ballad";
			if (i < 2) u.image = { kind: "board", frame: { startFret: 1, endFret: 6, notes: [{ noteId: "o-s0", s: 0, f: 1 }], visibility: [true, false] } };
			if (i === 2) u.image = { kind: "clip", id: "clip-xyz" };
			if (i === 3 && si === 0) u.fig = { data: { "o-s0": { type: "note", color: { name: "navy", custom: null }, color2: null, visibility: "visible" } }, startFret: 1, endFret: 5, rootNote: 9 };
			if (i === 4 && si === 0) u.fig = { custom: "旧版手绘", notes: [1, 2, 3] };
			return u;
		});
		s.measures.push(m);
	}
	// 归一化：可选键取 null 与不存在在应用里等价（如清除标色留下的 tint:null），比较时统一抹平
	const norm = (v) => {
		if (Array.isArray(v)) return v.map(norm);
		if (v && typeof v === "object") {
			const o = {};
			for (const k of Object.keys(v)) {
				if (v[k] === null || v[k] === undefined) continue;
				o[k] = norm(v[k]);
			}
			return o;
		}
		return v;
	};
	const deepDiff = (a, b, path = "", out = []) => {
		if (JSON.stringify(norm(a)) === JSON.stringify(norm(b))) return out;
		if (out.length > 8) return out;
		const both = a && b && typeof a === "object" && typeof b === "object";
		if (!both) { out.push(path || "(根)"); return out; }
		const ka = Object.keys(a), kb = Object.keys(b);
		for (const k of ka) if (!kb.includes(k)) out.push(`${path}.${k} 往返后消失`);
		for (const k of kb) if (!ka.includes(k)) out.push(`${path}.${k} 往返后多出`);
		for (const k of ka) if (kb.includes(k)) deepDiff(a[k], b[k], `${path}.${k}`, out);
		return out;
	};

	const packed = packChart(s);
	const back = unpackChart(packed);
	// updatedAt 按设计取导入时刻，不参与比较
	const dropTs = (o) => { delete o.updatedAt; return o; };
	delete s.updatedAt; delete back.updatedAt;
	const diffs = deepDiff(s, back);
	A("工程文件往返无差异", diffs.length === 0, diffs.join(" / "));
	A("分享码往返无差异", deepDiff(s, dropTs(unpackChart(chartShareCode(s)))).length === 0);
	A("裸紧凑 JSON 往返无差异", deepDiff(s, dropTs(unpackChart(JSON.stringify(compactChart(s))))).length === 0);
	A("配图被带上（board）", back.measures[0].slots[0].image?.kind === "board" && !!back.measures[0].slots[0].image.frame);
	A("配图被带上（clip）", back.measures[2].slots[0].image?.id === "clip-xyz");
	A("小节标色被带上", back.measures[0].tint === "blue");
	A("休止/延音不被压成空拍", back.measures[20].slots[0].kind === "rest" && back.measures[20].slots[1].kind === "hold");
	A("节奏型被带上", back.measures[7].slots[1].rhythm === "ballad");
	A("质量记忆被带上", back.qualityMemory?.["1"] === "M7");
	A("谱中转调被带上", back.measures[12].keyRoot === 2 && back.measures[12].keyMinor === false);
	A("拍级指法图被带上（帧规范形）", deepDiff(back.measures[3].slots[0].fig, s.measures[3].slots[0].fig).length === 0,
		deepDiff(back.measures[3].slots[0].fig, s.measures[3].slots[0].fig).join(" / "));
	A("拍级指法图被带上（未知形状原样）", deepDiff(back.measures[4].slots[0].fig, s.measures[4].slots[0].fig).length === 0);
	A("延音拍上的指法图被带上", deepDiff(back.measures[20].slots[1].fig, s.measures[20].slots[1].fig).length === 0);
	A("反拍正半拍的指法图被带上", deepDiff(back.measures[18].slots[0].split[0].fig, s.measures[18].slots[0].split[0].fig).length === 0);
	A("反拍拆分带低音往返", eq(back.measures[18].slots[0].split[1].chord.bass, { degree: 3, acc: 0 }));
	A("显示设置（记谱/等音/每行/色系）", back.display === "name" && back.enharmonic === -1 && back.rowsPerLine === 3 && back.colorScheme === "crimson");
	A("小节 id 保持（React key 稳定）", back.measures.every((m, i) => m.id === s.measures[i].id));
	const size = Buffer.byteLength(packed, "utf8");
	A("工程文件体积 < 6KB（24 小节满谱）", size < 6144, `${size} B`);
	A("isChartPack 认工程文件与分享码", isChartPack(packed) && isChartPack(chartShareCode(s)));
	A("isChartPack 不误认 MusicXML", !isChartPack('<?xml version="1.0"?><score-partwise><part/></score-partwise>'));

	// ===== 动图配图内嵌：只存 id 的话换台机器就是悬空引用 =====
	console.log("== chartPack：动图配图内嵌 ==");
	const { buildSongClip } = await import("../src/utils/chartFrames.js");
	const chT2 = (t) => chordFromDegreeToken(t);
	const M2 = (slots) => ({ id: "m-" + Math.random().toString(36).slice(2, 6), section: null, lyrics: "", repeatStart: false, endBar: "single", house: null, slots });
	const clipSong = { name: "动图源", key: C, timeSig: 4, bpm: 80, enharmonic: 1, colorScheme: "navy",
		measures: [M2([{ kind: "chord", chord: chT2("1") }, { kind: "chord", chord: chT2("4") }, { kind: "chord", chord: chT2("5") }, { kind: "chord", chord: chT2("6m") }]),
			M2([{ kind: "chord", chord: chT2("2m") }, { kind: "chord", chord: chT2("5") }, { kind: "chord", chord: chT2("1") }, { kind: "chord", chord: chT2("4") }])] };
	const realClip = buildSongClip(clipSong, C).clip; // 8 帧 + 过渡，真实形状
	// 给谱子挂上：一个真 clip 引用 + 一个 board 帧（字段带全：frameTint/displayMode/rootNote/visibility）
	const withMedia = JSON.parse(JSON.stringify(s));
	withMedia.measures[0].slots[0].image = { kind: "clip", id: realClip.id };
	withMedia.measures[0].slots[1].image = { kind: "clip", id: "clip-xyz" }; // 本机没有的引用：保持原样不崩
	withMedia.measures[0].slots[2].image = { kind: "board", frame: {
		data: { "f1-s3": { type: "note", color: { name: "navy", custom: "rgb(204, 224, 250)" }, color2: null, visibility: "visible" },
			"o-s0": { type: "note", color: { name: "gold", custom: "rgb(243, 186, 98)" }, color2: { name: "blue", custom: "rgb(61, 139, 255)" }, visibility: "transparent" } },
		startFret: 0, endFret: 12, enharmonic: 1, displayMode: "note", rootNote: 0, visibility: "transparent",
		frameTint: { name: "navy", custom: "rgb(204, 224, 250)" } } };
	const mediaPacked = packChart(withMedia, { clips: [realClip] });
	const bundle = unpackChartBundle(mediaPacked);
	const clipBack = bundle.clips.find(c => c.id === realClip.id);
	A("内嵌 clip 随文件带回", !!clipBack);
	A("clip 深比较一致（帧/过渡/名字/时间戳）", clipBack && deepDiff(realClip, clipBack).length === 0,
		clipBack ? deepDiff(realClip, clipBack).join(" / ") : "missing");
	A("帧数与过渡数不缩水", clipBack && clipBack.frames.length === realClip.frames.length && clipBack.transitions.length === realClip.transitions.length);
	A("音符颜色逐字段还原", (() => {
		const f0 = clipBack.frames[0], r0 = realClip.frames[0];
		const id0 = Object.keys(r0.data)[0];
		return JSON.stringify(f0.data[id0]) === JSON.stringify(r0.data[id0]);
	})());
	A("board 帧整帧还原（含 frameTint/color2/各元数据）", (() => {
		const orig = withMedia.measures[0].slots[2].image.frame;
		const back = unpackChartBundle(packChart(withMedia, { clips: [realClip] })).song.measures[0].slots[2].image.frame;
		return JSON.stringify(back) === JSON.stringify(orig);
	})());
	A("本机没有的 clip 引用原样保留（不虚构数据）", bundle.song.measures[0].slots[1].image?.id === "clip-xyz");
	A("谱体本身往返仍一致（含新配图字段）", (() => {
		const b2 = unpackChartBundle(packChart(withMedia, { clips: [realClip] })).song;
		delete withMedia.updatedAt; delete b2.updatedAt;
		return deepDiff(withMedia, b2).length === 0;
	})());
	// raw 兜底：clip 带未知顶层键 / 帧带未知字段 → 原样保存，不丢
	const weirdClip = { ...JSON.parse(JSON.stringify(realClip)), futureField: { a: 1 } };
	const weirdBack = unpackChartBundle(packChart(withMedia, { clips: [weirdClip] })).clips.find(c => c.id === realClip.id);
	A("未知字段的 clip 原样带回（raw 兜底）", weirdBack && JSON.stringify(weirdBack.futureField) === '{"a":1}' && deepDiff(weirdClip, weirdBack).length === 0);
	// 尺寸：内嵌 8 帧动图 + board 帧之后的真实增量
	const noMediaSize = Buffer.byteLength(packed, "utf8");
	const mediaSize = Buffer.byteLength(mediaPacked, "utf8");
	console.log(`   尺寸：纯谱 ${noMediaSize} B → +8帧动图×1 +board×1 +悬空引用 = ${mediaSize} B（内嵌增量 ${(mediaSize - noMediaSize)} B）`);
	A("版本过新时报错而不是静默出错谱", (() => {
		const bad = JSON.stringify({ ...compactChart(s), v: 99 });
		try { unpackChart(bad); return false; } catch (e) { return /版本/.test(e.message); }
	})());
	A("空/垃圾输入报错", (() => {
		let ok = 0;
		for (const bad of ["", "   ", "这不是工程文件"]) { try { unpackChart(bad); } catch (e) { ok++; } }
		return ok === 3;
	})());

	// 变化音随工程文件往返（extras 追加式编码，与旧文件互相兼容）
	const altSong = JSON.parse(JSON.stringify(s));
	altSong.measures[0].slots[1] = { kind: "chord", chord: { degree: 5, acc: 0, quality: "7", bass: null, alt: ["b9", "b13"] } };
	altSong.measures[0].slots[2] = { kind: "chord", chord: { degree: 2, acc: 0, quality: "m7-5", bass: null } };
	const altBack = unpackChart(packChart(altSong, { clips: [realClip] }));
	A("变化音随工程文件往返", eq(altBack.measures[0].slots[1].chord.alt, ["b9", "b13"]));
	A("新质量 m7-5 随工程文件往返", altBack.measures[0].slots[2].chord.quality === "m7-5");
	// MusicXML <degree> 往返：7b9b13 进出一致；新质量 kind 映射往返
	const { exportMusicXml, importMusicXml } = await import("../src/utils/musicxmlChart.js");
	const altXmlSong = { ...altSong, key: C, measures: altSong.measures.map((m, i) => i === 0 ? { ...m, slots: m.slots.slice(0, 3) } : m) };
	const altXml = exportMusicXml(altXmlSong, () => C);
	A("导出 XML 带 <degree>", altXml.includes("<degree-value>9</degree-value>") && altXml.includes("<degree-alter>-1</degree-alter>"));
	const altXmlBack = importMusicXml(altXml, "x");
	A("MusicXML degree 往返还原 alt", eq(altXmlBack.measures[0].slots[1]?.chord?.alt, ["b9", "b13"]), JSON.stringify(altXmlBack.measures[0].slots[1]?.chord));
	const natXmlSong = { ...altXmlSong, measures: altXmlSong.measures.map((m, i) => i === 0
		? { ...m, slots: [{ kind: "chord", chord: { degree: 5, acc: 0, quality: "7", bass: null, alt: ["9", "13"] } }, { kind: "chord", chord: { degree: 5, acc: 0, quality: "7", bass: null, alt: ["b5", "#9"] } }, { kind: "empty" }, { kind: "empty" }] } : m) };
	const natXmlBack = importMusicXml(exportMusicXml(natXmlSong, () => C), "x");
	A("自然音级/五音层经 MusicXML 往返", eq(natXmlBack.measures[0].slots[0]?.chord?.alt, ["9", "13"])
		&& eq(natXmlBack.measures[0].slots[1]?.chord?.alt, ["b5", "#9"]),
		JSON.stringify([natXmlBack.measures[0].slots[0]?.chord?.alt, natXmlBack.measures[0].slots[1]?.chord?.alt]));
	const qOnlySong = { ...altXmlSong, measures: altXmlSong.measures.map((m, i) => i === 0
		? { ...m, slots: [{ kind: "chord", chord: { degree: 1, acc: 0, quality: "maj9", bass: null } }, { kind: "chord", chord: { degree: 2, acc: 0, quality: "m7-5", bass: null } }, { kind: "chord", chord: { degree: 7, acc: 0, quality: "dim7", bass: null } }, { kind: "empty" }] } : m) };
	const qXmlBack = importMusicXml(exportMusicXml(qOnlySong, () => C), "x");
	A("maj9/m7-5/dim7 经 MusicXML kind 往返",
		qXmlBack.measures[0].slots[0]?.chord?.quality === "maj9"
		&& qXmlBack.measures[0].slots[1]?.chord?.quality === "m7-5"
		&& qXmlBack.measures[0].slots[2]?.chord?.quality === "dim7",
		JSON.stringify(qXmlBack.measures[0].slots.slice(0, 3).map(x => x?.chord?.quality)));
	// 外部软件（MuseScore 等）的歌词写在 <note><lyric><text>（自家导出的在方向词里）：两条都要认
	const extLyrXml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes><harmony><root><root-step>C</root-step></root><kind>major</kind></harmony><note><rest/><duration>2</duration><type>quarter</type></note><harmony><root><root-step>G</root-step></root><kind>major</kind></harmony><note><rest/><duration>2</duration><type>quarter</type><lyric number="1"><text>一</text></lyric></note><harmony><root><root-step>A</root-step></root><kind>minor</kind></harmony><note><rest/><duration>2</duration><type>quarter</type><lyric number="1"><text>二</text></lyric></note><note><rest/><duration>2</duration><type>quarter</type></note></measure></part></score-partwise>`;
	const extLyrBack = importMusicXml(extLyrXml, "ext");
	A("外部 MusicXML <lyric> 歌词导入", extLyrBack?.measures?.[0]?.lyrics === "一 二", JSON.stringify(extLyrBack?.measures?.[0]?.lyrics));
	A("自家 MusicXML 歌词往返保留", importMusicXml(exportMusicXml({ ...altXmlSong, measures: altXmlSong.measures.map((m, i) => i === 0 ? { ...m, lyrics: "词 甲 乙" } : m) }, () => C), "x").measures[0].lyrics === "词 甲 乙");
}

console.log("== chordChartModel：删除一拍（插入的逆：全曲整体前移） ==");
{
	const { deleteBeatInSong, insertBeatInSong, createSong: newSong } = await import("../src/utils/chordChartModel.js");
	const chT = (t) => chordFromDegreeToken(t);
	const beat = (t) => ({ kind: "chord", chord: chT(t) });
	const song2 = () => ({ ...newSong("t"), measures: [
		{ ...createMeasure(4), slots: [beat("1"), beat("4"), beat("1"), beat("4")] },
		{ ...createMeasure(4), endBar: "repeatEnd", house: 2, slots: [{ kind: "rest" }, beat("5"), { kind: "empty" }, { kind: "empty" }] }
	] });
	const flat = (s) => s.measures.flatMap(m => m.slots.map(x => x.kind === "chord" ? `d${x.chord.degree}` : x.kind));
	const src = song2();

	// 逆操作恒等：插一拍再删同一拍 = 原曲
	const ins = insertBeatInSong(song2(), 0, 1);
	const back = deleteBeatInSong(ins, 0, 1);
	A("插入→删除同一位置 = 回到原曲", eq(flat(back), flat(src)) && back.measures.length === 2);
	A("小节线/跳房子随内容还原", back.measures[1].endBar === "repeatEnd" && back.measures[1].house === 2);

	// 直接删：m0 删第 2 拍（d4），后面整体前移，末尾补空拍
	const a = deleteBeatInSong(song2(), 0, 1);
	A("小节长度仍按拍号", a.measures[0].slots.length === 4 && a.measures[1].slots.length === 4);
	A("该位变成后一拍（d1），原 d1 前移", a.measures[0].slots[1].chord.degree === 1 && a.measures[0].slots[0].chord.degree === 1);
	A("下一小节首拍(rest)流上来补位", a.measures[0].slots[3].kind === "rest");
	A("全曲末尾补空拍", a.measures[1].slots[3].kind === "empty");
	A("内容零丢失（删掉的拍除外）", eq(flat(a).filter((x, i) => i < 7), flat(src).filter((x, i) => i !== 1).filter((x, i) => i < 7)));
	A("纯函数不改原 song", flat(src)[1] === "d4");

	// 末小节被掏空 → 自动缩掉（3 小节歌删到末节全空）
	const song3 = () => ({ ...newSong("t"), measures: [
		{ ...createMeasure(4), slots: [beat("1"), beat("4"), beat("1"), beat("4")] },
		{ ...createMeasure(4), slots: [beat("5"), beat("6"), beat("1"), beat("4")] },
		{ ...createMeasure(4), endBar: "final", slots: [{ kind: "empty" }, { kind: "empty" }, { kind: "empty" }, { kind: "empty" }] }
	] });
	const b = deleteBeatInSong(song3(), 1, 1);
	A("删中间拍：后面拍前移（d6 补位）", b.measures[1].slots[0].chord.degree === 5 && b.measures[1].slots[1].chord.degree === 1);
	A("本就全空的末节被吸空后缩掉", b.measures.length === 2 && b.measures[1].endBar === "final");
	const c = deleteBeatInSong(song3(), 0, 1);
	A("末节被掏空自动缩掉", c.measures.length === 2 && c.measures[1].endBar === "final");
	A("缩掉后终止线回移到新末节", c.measures[1].slots.every(s => s.kind === "empty") === false || c.measures.length === 2);

	// 越界防御
	const d = deleteBeatInSong(song2(), 99, 0);
	A("小节越界原样返回（防御）", d.measures.length === 2);
}

console.log("== chordChartModel：插入一拍（全曲整体后移） ==");
{
	const { insertBeatInSong, createSong: newSong } = await import("../src/utils/chordChartModel.js");
	const chT = (t) => chordFromDegreeToken(t);
	const beat = (t) => ({ kind: "chord", chord: chT(t) });
	// 两小节 4/4：m0 = 1 4 1 4，m1 = rest 5 · ·（末小节挂反复终止线）
	const song2 = () => ({ ...newSong("t"), measures: [
		{ ...createMeasure(4), slots: [beat("1"), beat("4"), beat("1"), beat("4")] },
		{ ...createMeasure(4), endBar: "repeatEnd", house: 2, slots: [{ kind: "rest" }, beat("5"), { kind: "empty" }, { kind: "empty" }] }
	] });
	const flat = (s) => s.measures.flatMap(m => m.slots.map(x => x.kind === "chord" ? `d${x.chord.degree}` : x.kind));
	const src = song2();
	const before = flat(src);

	const a = insertBeatInSong(song2(), 0, 1);
	A("小节长度仍按拍号（4 拍/节）", a.measures[0].slots.length === 4 && a.measures[1].slots.length === 4);
	A("光标处变成空拍", a.measures[0].slots[1].kind === "empty");
	A("本小节后移一位", a.measures[0].slots[2].chord.degree === 4 && a.measures[0].slots[3].chord.degree === 1);
	A("末拍溢出流到下一小节开头", a.measures[1].slots[0].chord.degree === 4 && a.measures[1].slots[1].kind === "rest" && a.measures[1].slots[2].chord.degree === 5);
	A("全曲末尾溢出的拍追加新小节", a.measures.length === 3 && a.measures[2].slots.length === 1 && a.measures[2].slots[0].kind === "empty");
	A("内容零丢失（展平序 = 原序+一个空拍）", eq(flat(a).filter(x => x !== "empty"), before.filter(x => x !== "empty")));
	A("终止线/跳房子跟曲尾走", a.measures[2].endBar === "repeatEnd" && a.measures[2].house === 2 && a.measures[1].endBar === "single" && a.measures[1].house == null);
	A("纯函数不改原 song", eq(flat(src), before) && before[0] === "d1");

	const b = insertBeatInSong(song2(), 0, 0);
	A("插在首拍：全曲右移一位", b.measures[0].slots[0].kind === "empty" && b.measures[0].slots[1].chord.degree === 1);

	const c = insertBeatInSong(song2(), 99, 0);
	A("小节越界原样返回（防御）", c.measures.length === 2 && eq(flat(c), before));

	// 连续插两拍：内容整体后移两位（新末节是残节，再吸一拍不追加）
	const twice = insertBeatInSong(insertBeatInSong(song2(), 0, 1), 0, 1);
	A("连插两拍累计后移", twice.measures[0].slots[1].kind === "empty" && twice.measures[0].slots[2].kind === "empty" && twice.measures.length === 3 && twice.measures[2].slots.length === 2);

	// 末小节插入：溢出直接落新小节，不下传
	const d = insertBeatInSong(song2(), 1, 0);
	A("末小节插入追加新小节", d.measures.length === 3 && d.measures[1].slots[0].kind === "empty" && d.measures[1].slots[1].kind === "rest" && d.measures[1].slots[2].chord.degree === 5 && d.measures[2].slots[0].kind === "empty" && d.measures[2].endBar === "repeatEnd");

	// 3/4：按 3 拍容量流动；单拍残缺小节也能插（不溢出就原地变长）
	const s3 = { ...newSong("t"), timeSig: 3, measures: [
		{ ...createMeasure(3), slots: [beat("1"), beat("4"), beat("5")] },
		{ ...createMeasure(3), slots: [{ kind: "empty" }] }
	] };
	const e3 = insertBeatInSong(s3, 0, 1);
	A("3/4 按 3 拍流动", e3.measures[0].slots.length === 3 && e3.measures[0].slots[2].chord.degree === 4 && e3.measures[1].slots[0].chord.degree === 5 && e3.measures[1].slots.length === 2 && e3.measures.length === 2);
	A("残缺末小节插拍原地变长不溢出", insertBeatInSong(s3, 1, 0).measures[1].slots.length === 2 && insertBeatInSong(s3, 1, 0).measures.length === 2);
}


// ===== 和弦形状库(相对根音模板 + 平移候选 + 收集推断) =====
{
	const { builtinShapes, candidatesForChord, inferQuality, shapeFromBoard, candidateToData } = await import("../src/utils/chordShapes.js");
	const KEY = { root: 0, minor: false };
	const ch = (degree, quality) => ({ degree, quality });
	const SP = [4, 11, 7, 2, 9, 4];
	const pcName = (s, f) => ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][(SP[s] + f) % 12];

	const shapes = builtinShapes();
	A("内置形状: 开放20+可移动16", shapes.length === 36 && shapes.filter(x => x.open).length === 20);
	A("内置形状: rel 相对根音(开放C根品3)", (() => { const c = shapes.find(x => x.id === "bi-open-0_"); return c && c.rootFret === 3 && c.rel[4] === 0; })());

	const f = candidatesForChord(ch(4, "maj7"), KEY, shapes); // C大调 4maj7 = Fmaj7
	const e1 = f.find(c => c.rootFret === 1 && c.shape.rootString === 5);
	const a8 = f.find(c => c.rootFret === 8 && c.shape.rootString === 4);
	A("Fmaj7 候选含 E型@根品1 与 A型@根品8", !!e1 && !!a8);
	A("Fmaj7 E型@1 音集 = F A C E", [...new Set(e1.points.map(p => pcName(p.string, p.fret)))].sort().join("") === "ACEF");
	A("候选平移不超品窗(≤15)", f.every(c => c.points.every(p => p.fret >= 0 && p.fret <= 15)));
	A("候选排序: 把位低在前", f[0].rootFret <= f[f.length - 1].rootFret || f[f.length - 1].rootFret === 0);

	const c0 = candidatesForChord(ch(1, ""), KEY, shapes); // C 大三
	A("C 和弦候选 3 个(开放原把位/E型8/A型3)", c0.length === 3 && c0.some(c => c.shape.open && c.rootFret === 3));
	const g0 = candidatesForChord(ch(5, ""), KEY, shapes); // G
	A("开放形状只在同根音时出现(G 不带开放C)", g0.every(c => !c.shape.open || c.shape.rootPc === 7));

	A("推断: 大三", inferQuality([0, 4, 7]) === "");
	A("推断: m7", inferQuality([0, 3, 7, 10]) === "m7");
	A("推断: maj7", inferQuality([0, 4, 7, 11]) === "maj7");
	A("推断: 省略5音仍归大三", inferQuality([0, 4]) === "");

	const data = candidateToData(e1);
	const back = shapeFromBoard(data);
	A("候选→data→收集往返: 质量 maj7 保持", back.quality === "maj7");
	A("候选→data: noteId 体系可读", Object.keys(data).some(k => /^f0-s1$/.test(k)) || Object.keys(data).some(k => k.startsWith("f")));
	const linked = candidateToData({ ...e1, links: [{ a: { s: 1, f: 1 }, b: { s: 2, f: 2 } }] });
	A("候选连线进 data.connections", linked.connections && Object.values(linked.connections)[0].startNoteId === "f0-s1");
}

// ===== 指法小图渲染几何(figSvg/figGeometry/figHitTest 同源一致性) =====
{
	const { boardFigData, figSvg, figGeometry, figHitTest, degreeLabel } = await import("../src/utils/chordFig.js");
	const KEY = { root: 0, minor: false };
	const N = () => ({ visibility: "visible" });
	const am = { "o-s0": N(), "f0-s1": N(), "f1-s2": N(), "f1-s3": N(), "o-s4": N(), connections: {} };
	const fa = boardFigData(am, { degree: 6, quality: "m" }, KEY);
	for (const o of [{}, { orientation: "h" }]) {
		const g = figGeometry(fa, o);
		const svg = figSvg(fa, o);
		const m = svg.match(/width="(\d+)" height="(\d+)"/);
		A("几何与渲染尺寸一致(" + (o.orientation ?? "v") + ")", g.W === +m[1] && g.H === +m[2]);
		const p = g.pt(0.5 * g.cell, g.spanS / 5);
		const hit = figHitTest(g, p.x, p.y);
		A("hitTest 命中品1弦1(" + (o.orientation ?? "v") + ")", hit && hit.string === 1 && hit.fret === 1);
		const e = g.pt(-0.35 * g.cell, 0);
		const eh = figHitTest(g, e.x, e.y);
		A("hitTest 命中空弦位(" + (o.orientation ?? "v") + ")", eh && eh.string === 0 && eh.fret === 0);
	}
	// Am 根音 A(pc9):B弦品1=C→♭3、E空弦→5;C大调内:A空弦=6、G空弦=5、C音=1
	A("度数:和弦内(Am 根 A, x02210 的音)", degreeLabel(1, 1, "chord", 9) === "♭3" && degreeLabel(0, 0, "chord", 9) === "5" && degreeLabel(4, 0, "chord", 9) === "R");
	A("度数:调内(C 大调, A=6 G=5 C=1)", degreeLabel(4, 0, "scale", null, KEY) === "6" && degreeLabel(2, 0, "scale", null, KEY) === "5" && degreeLabel(1, 1, "scale", null, KEY) === "1");
}

console.log(fail ? `\n✗ ${fail}/${n} 断言失败` : `\n✓ 全部 ${n} 项断言通过`);
process.exit(fail ? 1 : 0);