// 和弦谱播放引擎：展开反复/跳房子 → 事件流 → 节奏型点火方案
// 视图负责时钟与音频（audioService），这里只产出纯数据

import { voiceChord } from "./voicing.js";

// 展开反复/跳房子 → 线性小节索引序列（v1 支持一层反复；房子 1 第一遍、房子 2 第二遍）
export function expandSong(song) {
	const ms = song.measures || [];
	const seq = [];
	const repeated = new Set(); // 已回跳过的 repeatEnd 小节索引
	let i = 0, pass = 1, guard = 0;
	while (i < ms.length && guard++ <= ms.length * 6) {
		const m = ms[i];
		const skip = (m.house === 1 && pass === 2) || (m.house === 2 && pass === 1);
		if (skip) { i++; continue; }
		seq.push(i);
		if (m.endBar === "final") break;
		if (m.endBar === "repeatEnd" && !repeated.has(i)) {
			repeated.add(i);
			// 段起点：本小节自带 repeatStart > 最近的前方 repeatStart > 前一反复段结束之后 > 开头
			let start = m.repeatStart ? i : null;
			if (start === null) {
				for (let k = i - 1; k >= 0; k--) {
					if (ms[k].repeatStart) { start = k; break; }
					if (ms[k].endBar === "repeatEnd") { start = k + 1; break; }
				}
			}
			if (start === null) start = 0;
			i = start;
			pass = 2;
			continue;
		}
		if (m.endBar === "repeatEnd") pass = 1; // 出反复段，回第一遍语义
		i++;
	}
	return seq;
}

// 槽位事件流：反拍拆分展开成半拍；hold 并入前一个和弦事件；empty/rest 都是静音
// 事件 = { mi, si, half, type:'chord'|'rest', chord?, rhythm?, beats }
export function buildEvents(song) {
	const events = [];
	(expandSong(song) || []).forEach(mi => {
		const m = song.measures[mi];
		(m.slots || []).forEach((slot, si) => {
			const units = slot.split && slot.split.length === 2 ? slot.split : [slot];
			units.forEach((u, uh) => {
				const half = slot.split ? uh : null; // 非拆分槽统一 half=null（合并判定依赖）
				const beats = slot.split ? 0.5 : 1;
				if (u.kind === "chord" && u.chord) {
					const ev = { mi, si, half, type: "chord", chord: u.chord, rhythm: u.rhythm || slot.rhythm || null, beats };
					const prev = events[events.length - 1];
					if (prev && prev.type === "chord" && beats === 1 && !slot.split
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
	{ id: "strum", label: "扫弦", def: true },
	{ id: "ballad", label: "分解" },
	{ id: "block", label: "柱式" },
	{ id: "waltz", label: "华尔兹" },
	{ id: "rock8", label: "摇滚" },
	{ id: "bossa", label: "波萨" },
	{ id: "rumba", label: "伦巴" },
	{ id: "slow", label: "慢魂" }
];

// 节奏型 → 点火方案：[{ delayMs, idx, string, durMs }]（idx 为 audioService 品索引）
// beatMs 一拍毫秒；beatPos 事件在小节内的拍位（0 起）；beats 事件时长（拍）
export function firePlan(rhythm, beatPos, beats, beatMs, voicing) {
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
		// 华尔兹：拍位 0 = 低音+和弦，其余拍 = 和弦
		if (beatPos === 0) { pick(0, bass, beatMs * 0.9); strum(30, chord.slice(1), beatMs * 0.85); }
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
// 反复/跳房子结构保持完整；startBeat = 切片前的累计拍数（节拍器强拍对齐用）
export function buildPlayPlan(song, viewKey, startMi = 0) {
	const beatMs = 60000 / (song.bpm || 72);
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
			item.plan = firePlan(ev.rhythm, beatPos, ev.beats, beatMs, item.voicing);
		}
		t += ev.beats * beatMs;
		return item;
	});
	return { items, totalMs: t, beatMs, beats: t / beatMs, startBeat };
}
