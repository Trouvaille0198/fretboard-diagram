// 和弦谱播放引擎：展开反复/结尾 → 事件流 → 节奏型点火方案
// 视图负责时钟与音频（audioService），这里只产出纯数据

import { voiceChord } from "./voicing.js";
import { getT } from "../i18n/getT.js";

// 反复结束线所在小节 end 的回跳起点：本小节自带 repeatStart > 最近的前方 repeatStart > 前一反复段结束之后 > 开头。
// 播放的回跳、反复段一览、结尾括线的延伸范围三处共用这一个口径
function sectionStart(ms, end) {
	if (ms[end].repeatStart) return end;
	for (let k = end - 1; k >= 0; k--) {
		if (ms[k].repeatStart) return k;
		if (ms[k].endBar === "repeatEnd") return k + 1;
	}
	return 0;
}

// 有效结尾推导：结尾标记在段首小节，括线一路延伸到「收住本段」的反复结束线（结束的标志就是反复结束本身——
// 反复结束之前的小节即使没标结尾也归属该结尾：渲染括线连过去、播放同样跳过）。
// 规则：显式结尾开一段；段向后延伸到下一条 endBar==='repeatEnd'（含）为止，但只认回跳起点不晚于本结尾的那条——
// 后面另起的一段反复（‖: … :‖）不归它，括线不能越界划过去；中途遇到新的显式结尾即换段；
// 之后没有收口的反复结束线就不延伸（默认就是当前小节）。返回每小节的有效结尾（0=无）。
export function effectiveHouses(measures) {
	const ms = measures || [];
	const eff = ms.map(m => m.house || 0);
	for (let j = 0; j < ms.length; j++) {
		if (!ms[j].house) continue;
		let k = -1;
		for (let t = j + 1; t < ms.length; t++) {
			if (ms[t].house) break; // 新显式结尾开新段
			if (ms[t].endBar !== "repeatEnd") continue;
			if (sectionStart(ms, t) > j) break; // 那条反复结束线收的是后面另起的一段
			k = t;
			break;
		}
		if (k === -1) continue;
		for (let t = j + 1; t <= k; t++) if (!eff[t]) eff[t] = ms[j].house;
	}
	return eff;
}

// 反复段一览（收起态的记号结构）：每个 endBar==='repeatEnd' 收口一段 [start..end]，起点见 sectionStart。
// end2 = 段尾：反复结束线之后连续的「2.」结尾小节（按有效结尾判定，遇反复开始/反复结束线即止）；没有则 = end。
export function repeatSections(measures) {
	const ms = measures || [];
	const eff = effectiveHouses(ms);
	const out = [];
	ms.forEach((m, end) => {
		if (!m || m.endBar !== "repeatEnd") return;
		const start = sectionStart(ms, end);
		let end2 = end;
		while (end2 + 1 < ms.length && eff[end2 + 1] === 2 && !ms[end2 + 1].repeatStart && ms[end2 + 1].endBar !== "repeatEnd") end2++;
		out.push({ start, end, end2 });
	});
	return out;
}

// 展开反复/结尾 → 线性小节索引序列（支持一层反复×自定义遍数；结尾 1 第一遍、结尾 2 第二遍起）
export function expandSong(song) {
	const ms = song.measures || [];
	const eff = effectiveHouses(ms);
	const seq = [];
	const jumpCount = new Map(); // repeatEnd 小节索引 → 已回跳次数（默认反复 2 遍 = 回跳 1 次）
	const maxTimes = Math.max(2, ...ms.map(m => m.repeatTimes || 2)); // 防呆上限跟着遍数走
	let i = 0, pass = 1, guard = 0;
	while (i < ms.length && guard++ <= ms.length * maxTimes + 10) {
		const m = ms[i];
		const skip = (eff[i] === 1 && pass >= 2) || (eff[i] === 2 && pass === 1);
		if (skip) { i++; continue; }
		seq.push(i);
		if (m.endBar === "final") break;
		if (m.endBar === "repeatEnd") {
			const jumps = Math.max(2, m.repeatTimes || 2) - 1;
			const done = jumpCount.get(i) || 0;
			if (done < jumps) {
				jumpCount.set(i, done + 1);
				i = sectionStart(ms, i);
				pass = done + 2; // 进入第几遍（结尾按遍次显隐）
				continue;
			}
			pass = 1; // 出反复段，回第一遍语义
		}
		i++;
	}
	return seq;
}

// 槽位事件流：反拍拆分展开成半槽；hold 并入前一个和弦事件；empty/rest 都是静音
// 事件 = { mi, si, half, type:'chord'|'rest', chord?, rhythm?, beats }
// 遍次：序列回跳（下一小节下标不大于当前）= 进入下一遍；正向走到另一个反复段的起点 = 回到第 1 遍。
// 第 2 遍起，带 alt2（收起反复时挂上的「第 2 遍替代」）的拍改用替代内容：收起态谱面只展示第 1 遍，
// 播放 / 动图仍按每一遍自己标注的内容走
export function buildEvents(song) {
	const events = [];
	const seq = expandSong(song) || [];
	const ms = song.measures || [];
	const secStarts = new Set(repeatSections(ms).map(s => s.start));
	let pass = 1;
	seq.forEach((mi, k) => {
		if (k > 0) {
			if (seq[k] <= seq[k - 1]) pass++;
			else if (secStarts.has(mi)) pass = 1;
		}
		const second = pass >= 2;
		const m = ms[mi];
		(m.slots || []).forEach((slot, si) => {
			const use = second && slot.alt2 ? slot.alt2 : slot; // 第 2 遍替代拍（收起反复的产物）
			const units = use.split && use.split.length === 2 ? use.split : [use];
			units.forEach((u, uh) => {
				const half = use.split ? uh : null; // 非拆分槽统一 half=null（合并判定依赖）
				const beats = use.split ? 0.5 : 1;
				if (u.kind === "chord" && u.chord) {
					const ev = { mi, si, half, type: "chord", chord: u.chord, rhythm: u.rhythm || use.rhythm || null, beats };
					const prev = events[events.length - 1];
					if (prev && prev.type === "chord" && beats === 1 && !use.split
						&& sameEvChord(prev.chord, u.chord) && prev.rhythm === ev.rhythm && prev.half === null) {
						prev.beats += beats; // 同和弦连拍合并（播放连贯）
					} else {
						events.push(ev);
					}
				} else if (u.kind === "hold") {
					const prev = events[events.length - 1];
					if (prev && prev.type === "chord" && prev.mi === mi) prev.beats += beats;
					else events.push({ mi, si, half, type: "rest", beats });
				} else {
					events.push({ mi, si, half, type: "rest", beats });
				}
			});
		});
	});
	return events;
}

function sameEvChord(a, b) {
	if (!a || !b) return false;
	const k = c => `${c.acc || 0}|${c.degree}|${c.quality || ""}|${c.bass ? `${c.bass.acc || 0}|${c.bass.degree}` : ""}`;
	return k(a) === k(b);
}

// ============ 节奏型 ============
// RHYTHMS：null/'strum' 扫弦 | 'ballad' 分解 | 'block' 柱式 | 'waltz' 华尔兹（3 拍低音-和弦-和弦）
export const RHYTHMS = [
	{ id: "strum", get label() { return getT().chords.rhythmLabels.strum; }, def: true },
	{ id: "ballad", get label() { return getT().chords.rhythmLabels.ballad; } },
	{ id: "block", get label() { return getT().chords.rhythmLabels.block; } },
	{ id: "waltz", get label() { return getT().chords.rhythmLabels.waltz; } },
	{ id: "rock8", get label() { return getT().chords.rhythmLabels.rock8; } },
	{ id: "bossa", get label() { return getT().chords.rhythmLabels.bossa; } },
	{ id: "rumba", get label() { return getT().chords.rhythmLabels.rumba; } },
	{ id: "slow", get label() { return getT().chords.rhythmLabels.slow; } }
];

// 节奏型 → 点火方案：[{ delayMs, idx, string, durMs }]（idx 为 audioService 品索引）
// beatMs 单槽毫秒（随拍单位 4/8 缩放）；beatPos 事件在小节内的槽位（0 起）；beats 事件时长（槽）
// slotUnit：拍单位（4=四分槽，8=八分槽）——八分槽里华尔兹按 3+3 复拍感给强位（0、3 槽低音）
export function firePlan(rhythm, beatPos, beats, beatMs, voicing, slotUnit = 4) {
	if (!voicing || !voicing.notes.length) return [];
	const notes = voicing.notes.slice(); // 低音弦在前
	const bass = notes[0];
	const lowMid = notes.slice(0, 2);
	const chord = notes;
	const treble = notes.slice(-3);
	const out = [];
	const strum = (delay, list, dur) => list.forEach((n, k) => out.push({ delayMs: delay + k * 14, idx: n.idx, string: n.string, durMs: dur }));
	const pick = (delay, n, dur) => n && out.push({ delayMs: delay, idx: n.idx, string: n.string, durMs: dur });

	const r = rhythm || "strum";
	if (r === "block") {
		strum(0, chord, Math.max(300, beatMs * beats * 0.95));
	} else if (r === "ballad") {
		// 分解：每拍"低音 → 高音区"两个八分；两拍以上按 T-高-中-高 循环
		const stepMs = beatMs / 2;
		if (beats <= 1) {
			pick(0, bass, stepMs * 1.8);
			strum(stepMs, treble, stepMs * 1.8);
		} else {
			const seqList = [bass, ...treble, notes[Math.min(1, notes.length - 1)], ...treble.slice(0, Math.ceil(beats) - 0)];
			seqList.slice(0, Math.ceil(beats * 2)).forEach((n, k) => pick(k * stepMs, n, stepMs * 1.8));
		}
	} else if (r === "waltz") {
		// 华尔兹：强位 = 低音+和弦，其余槽 = 和弦；四分槽强位只在 0，八分槽（6/8 复拍）0、3 都给低音
		const onBeat = slotUnit === 8 ? beatPos % 3 === 0 : beatPos === 0;
		if (onBeat) { pick(0, bass, beatMs * 0.9); strum(30, chord.slice(1), beatMs * 0.85); }
		else strum(0, chord, beatMs * 0.85);
	} else if (r === "rock8") {
		// 摇滚 8 分下上：每拍 低音→下→上
		const dur = Math.max(260, beatMs * 0.45);
		pick(0, bass, dur);
		strum(beatMs * 0.25, chord, dur);
		strum(beatMs * 0.7, treble, dur);
	} else if (r === "bossa") {
		// 波萨：低音 1↘5 拍点 + 中后半拍轻点
		const dur = Math.max(280, beatMs * 0.6);
		pick(0, bass, dur);
		strum(beatMs * 0.5, notes.slice(1, 3), dur);
		pick(beatMs * 0.75, notes[Math.min(2, notes.length - 1)], dur);
	} else if (r === "rumba") {
		// 伦巴：低音 → 半拍点 → 3/4 拍点
		const dur = Math.max(260, beatMs * 0.5);
		pick(0, bass, dur);
		strum(beatMs * 0.5, chord, dur);
		strum(beatMs * 0.75, treble, dur);
	} else if (r === "slow") {
		// 慢灵魂（12/8 感）：低音 + 三连感的两次滚动
		const dur = Math.max(320, beatMs * 0.6);
		pick(0, bass, dur);
		strum(beatMs / 3, chord, dur);
		strum(beatMs * 2 / 3, treble, dur);
	} else {
		// strum 扫弦：低音先走，紧跟全弦下扫
		const dur = Math.max(320, beatMs * Math.min(beats, 1) * 0.9);
		strum(0, lowMid, dur);
		strum(45, chord, dur);
	}
	return out;
}

// 播放计划：把事件流变成 [{ startMs, mi, si, half, chord, voicing, plan, beats }] + 总时长
// startMi：从第几小节开始——按展开后播放顺序找到第一个该小节（或其后）的事件切片，
// 反复/结尾结构保持完整；startBeat = 切片前的累计拍数（节拍器强拍对齐用）
export function buildPlayPlan(song, viewKey, startMi = 0) {
	const beatMs = 60000 / (song.bpm || 72);
	// bpm 语义恒为 ♩=（四分）；槽长按拍单位缩放（4/8）——6/8 的槽是八分，半拍即一槽
	const slotMs = beatMs * 4 / (song.timeSigUnit === 8 ? 8 : 4);
	const keyFor = (mi) => (typeof viewKey === "function" ? viewKey(mi) : viewKey); // 支持谱内转调：按小节取调
	const events = buildEvents(song);
	let begin = 0, startBeat = 0;
	if (startMi > 0) {
		begin = events.findIndex(e => e.mi >= startMi);
		if (begin === -1) begin = events.length;
		for (let i = 0; i < begin; i++) startBeat += events[i].beats;
	}
	let t = 0;
	const items = events.slice(begin).map(ev => {
		const item = { startMs: t, mi: ev.mi, si: ev.si, half: ev.half, beats: ev.beats, chord: ev.chord || null, voicing: null, plan: [] };
		if (ev.type === "chord") {
			item.voicing = voiceChord(ev.chord, keyFor(ev.mi));
			const beatPos = ev.si % song.timeSig;
			item.plan = firePlan(ev.rhythm, beatPos, ev.beats, slotMs, item.voicing, song.timeSigUnit);
		}
		t += ev.beats * slotMs;
		return item;
	});
	return { items, totalMs: t, beatMs, beats: t / beatMs, startBeat };
}
