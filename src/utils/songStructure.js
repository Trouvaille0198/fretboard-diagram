// ============ 帧结构 ============

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

// ============ 和弦：级数 ⇄ 音名 ============

export const NOTE_NAMES = [
	["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
	["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
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
