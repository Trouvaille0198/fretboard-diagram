import { CONSTS } from "../constants.js";

// ============ 小节 / 帧结构 ============

const META_KEY = "fretboard-measure-meta";

export function readMeasureMeta() {
	try {
		return JSON.parse(localStorage.getItem(META_KEY) || "{}");
	} catch (error) {
		console.error("读取小节信息失败:", error);
		return {};
	}
}

export function writeMeasureMeta(meta) {
	try {
		localStorage.setItem(META_KEY, JSON.stringify(meta));
	} catch (error) {
		console.error("保存小节信息失败:", error);
	}
}

export function measureIdOf(snapshot) {
	return snapshot?.measureId || snapshot?.id;
}

// history 数组是"新的在前"，先反转成时间正序再按 measureId 分组
// 没标 measureId 的旧快照各自成单帧小节（惰性迁移，不重写数据）
export function deriveMeasures(historyStates, directoryId) {
	const ordered = (historyStates || [])
		.filter(s => s.directoryId === directoryId)
		.slice()
		.reverse();

	const measures = [];
	const byId = new Map();
	ordered.forEach(snapshot => {
		const mid = measureIdOf(snapshot);
		if (!byId.has(mid)) {
			const measure = { id: mid, frames: [] };
			byId.set(mid, measure);
			measures.push(measure);
		}
		byId.get(mid).frames.push(snapshot);
	});
	return measures;
}

// 展平的帧序列（播放用）
export function flattenFrames(measures) {
	const list = [];
	measures.forEach((measure, m) => {
		measure.frames.forEach((frame, f) => {
			list.push({ measure, frame, m, f });
		});
	});
	return list;
}

// ============ 帧差异（小节内"变化"的来源） ============

// 一帧里正在发声的音符：可见且有颜色
export function activeNoteIdsOf(state) {
	const ids = new Set();
	if (!state || !state.data) return ids;
	Object.entries(state.data).forEach(([id, noteData]) => {
		if (id === "connections" || !noteData || typeof noteData !== "object") return;
		const visibility = noteData.visibility || state.visibility || "transparent";
		if (visibility !== "visible" && visibility !== "selected") return;
		const colored = noteData.color && noteData.color !== "white";
		if (colored || noteData.color2) ids.add(id);
	});
	return ids;
}

export function stringOfNote(noteId) {
	if (noteId.startsWith("o-s")) return parseInt(noteId.slice(3), 10);
	const match = noteId.match(/-s(\d+)$/);
	return match ? parseInt(match[1], 10) : null;
}

// 相邻两帧的差异：进入的音、退出的音、同弦配对（滑/击/勾的转移）
export function diffFrames(prevState, nextState) {
	const prev = activeNoteIdsOf(prevState);
	const next = activeNoteIdsOf(nextState);
	const removed = [...prev].filter(id => !next.has(id));
	const added = [...next].filter(id => !prev.has(id));

	const pairs = [];
	const usedAdded = new Set();
	const usedRemoved = new Set();
	removed.forEach(fromId => {
		const toId = added.find(id => !usedAdded.has(id) && stringOfNote(id) === stringOfNote(fromId));
		if (toId !== undefined) {
			pairs.push({ fromId, toId });
			usedAdded.add(toId);
			usedRemoved.add(fromId);
		}
	});

	return {
		entered: added.filter(id => !usedAdded.has(id)),
		exited: removed.filter(id => !usedRemoved.has(id)),
		pairs
	};
}

// ============ 和弦：级数 ⇄ 音名 ============

export const NOTE_NAMES = [
	["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
	["C", "Db", "D", "Eb", "E", "F", "Gb", "G#", "Ab", "A", "Bb", "B"]
];
export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
export const LETTER_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 解析用户输入：级数（6m / b3 / 5）或音名（Am / F / G7）
export function parseChordToken(token) {
	const trimmed = String(token || "").trim();
	if (!trimmed) return null;

	const degreeMatch = trimmed.match(/^([b#]?)([1-7])(.*)$/);
	if (degreeMatch) {
		return {
			kind: "degree",
			accidental: degreeMatch[1] === "b" ? -1 : degreeMatch[1] === "#" ? 1 : 0,
			degree: parseInt(degreeMatch[2], 10),
			suffix: degreeMatch[3]
		};
	}

	const nameMatch = trimmed.match(/^([A-G])([#b]?)(.*)$/);
	if (nameMatch) {
		return {
			kind: "name",
			rootName: nameMatch[1],
			accidental: nameMatch[2] === "b" ? -1 : nameMatch[2] === "#" ? 1 : 0,
			suffix: nameMatch[3]
		};
	}
	return null;
}

// 双向显示：输入级数给音名，输入音名给级数
export function chordDisplay(token, rootNote, isMinor, enharmonic = 1) {
	const parsed = parseChordToken(token);
	if (!parsed) return { text: String(token || "").trim() };

	const steps = isMinor ? MINOR_STEPS : MAJOR_STEPS;
	const names = NOTE_NAMES[enharmonic] || NOTE_NAMES[1];

	if (parsed.kind === "degree") {
		const semitone = (((rootNote || 0) + parsed.accidental + steps[parsed.degree - 1]) % 12 + 12) % 12;
		const name = names[semitone] + parsed.suffix;
		return { text: `${token.trim()} · ${name}`, primary: token.trim(), secondary: name };
	}

	const pitch = (((LETTER_SEMITONES[parsed.rootName] || 0) + parsed.accidental) % 12 + 12) % 12;
	const relative = (((pitch - (rootNote || 0)) % 12) + 12) % 12;
	const degreeIndex = steps.indexOf(relative);
	if (degreeIndex === -1) {
		return { text: token.trim(), primary: token.trim(), secondary: "" };
	}
	const degree = degreeIndex + 1;
	return { text: `${token.trim()} · ${degree}`, primary: token.trim(), secondary: String(degree) };
}
