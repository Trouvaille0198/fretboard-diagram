// 和弦谱纯逻辑冒烟：chordLib（级数⇄音名/调内默认/音高）+ chordChartModel（模型/光标）+ voicing（按法不变量）
// 纯 Node 直跑：node scripts/smoke-chords.mjs
import {
	CHORD_INTERVALS, degreePc, diatonicQuality, chordFromDegreeToken, formatDegree,
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

console.log(fail ? `\n✗ ${fail}/${n} 断言失败` : `\n✓ 全部 ${n} 项断言通过`);
process.exit(fail ? 1 : 0);