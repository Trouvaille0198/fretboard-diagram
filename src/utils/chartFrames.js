// 和弦谱 → 指板帧 / 动图 clip（"看到=听到"：舞台帧与播放同源 voicing）
import { voiceChord, voicingWindow } from "./voicing.js";
import { buildEvents } from "./chartPlayback.js";
import { newChartId } from "./chordChartModel.js";
import { tintAt, frameTintFromData } from "../colorConfig.js";
import { stringOfNote } from "./clipModel.js";

// 单个按法 → 指板帧（captureBoard 形状）；colorFn(noteId) → { name, custom }
export function voicingFrame(voicing, song, colorFn) {
	const data = {};
	(voicing.notes || []).forEach(nt => {
		data[nt.id] = { type: "note", color: colorFn(nt.id), color2: null, visibility: "visible" };
	});
	const w = voicingWindow(voicing);
	return {
		data,
		startFret: w.startFret,
		endFret: w.endFret,
		enharmonic: song.enharmonic ?? 1,
		displayMode: "note",
		rootNote: song.key ? song.key.root : null,
		visibility: "transparent"
	};
}

// 舞台帧（编辑选中/播放中的和弦，统一中档色）
export function stageFrame(chord, song, viewKey) {
	if (!chord) return null;
	const voicing = voiceChord(chord, viewKey);
	if (!voicing) return null;
	const scheme = song.colorScheme || "navy";
	const mid = tintAt(scheme, 1 / 3);
	return voicingFrame(voicing, song, () => ({ name: scheme, custom: mid }));
}

// 整曲 → 动图 clip：每个和弦变化一帧；出生帧色（出生档随帧位加深）；同弦移动自动标 sl
export function buildSongClip(song, viewKey) {
	const keyFor = (mi) => (typeof viewKey === "function" ? viewKey(mi) : viewKey);
	const events = buildEvents(song).filter(e => e.type === "chord" && e.chord);
	if (!events.length) return null;

	// 连续相同和弦合并为一帧
	const merged = [];
	events.forEach(ev => {
		const last = merged[merged.length - 1];
		if (last && JSON.stringify(last.chord) === JSON.stringify(ev.chord) && last.rhythm === ev.rhythm && last.mi === ev.mi) {
			last.beats += ev.beats;
		} else {
			merged.push({ chord: ev.chord, rhythm: ev.rhythm, beats: ev.beats, mi: ev.mi });
		}
	});

	const N = merged.length;
	const scheme = song.colorScheme || "navy";
	const frames = [];
	const transitions = [];
	const bornAt = new Map(); // noteId → 出生帧序

	merged.forEach((ev, i) => {
		const voicing = voiceChord(ev.chord, keyFor(ev.mi));
		if (!voicing) return;
		const ids = voicing.notes.map(n => n.id);
		ids.forEach(id => { if (!bornAt.has(id)) bornAt.set(id, i); });
		const data = {};
		ids.forEach(id => {
			const b = bornAt.get(id);
			data[id] = {
				type: "note",
				color: { name: scheme, custom: tintAt(scheme, N > 1 ? b / (N - 1) : 0) },
				color2: null,
				visibility: "visible",
				birth: b === i ? b : undefined
			};
		});
		Object.keys(data).forEach(id => { if (data[id].birth === undefined) delete data[id].birth; });
		frames.push(voicingFrame(voicing, song, id => data[id].color));

		// 与上一帧同弦不同位 → 自动滑弦对
		if (i > 0) {
			const prevIds = frames[i - 1] ? Object.keys(frames[i - 1].data) : [];
			const pairs = [];
			ids.forEach(id => {
				const prevSame = prevIds.find(p => stringOfNote(p) === stringOfNote(id) && p !== id);
				const movedAway = prevIds.find(p => stringOfNote(p) === stringOfNote(id) && !ids.includes(p));
				if (prevSame && movedAway && prevSame === movedAway) {
					pairs.push({ from: prevSame, to: id, technique: "sl" });
				}
			});
			transitions.push({ technique: null, pairs });
		}
	});

	if (!frames.length) return null;

	// 烙帧档色（与 persistClip 同款，dock 预览/加载直接取用）
	const stamped = frames.map((f, i) => {
		const ft = frameTintFromData(f.data, i, frames.length);
		return ft ? { ...f, frameTint: ft } : f;
	});

	return {
		clip: { id: newChartId(), name: song.name || "和弦谱", createdAt: Date.now(), frames: stamped, transitions },
		chordCount: N
	};
}
