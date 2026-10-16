// 和弦谱（8pu 式功能谱）歌曲模型与本地存储
// song = { id, name, createdAt, updatedAt,
//   key: { root: 0-11(C基), minor }, timeSig: 拍数(2|3|4|6，单位四分), bpm,
//   display: 'degree'|'name', enharmonic: 1, rowsPerLine: 每行小节数,
//   colorScheme: 动图生成用的色系名（LEVEL1_COLORS 键）,
//   measures: [measure] }
// measure = { id, section?: 段落标记, lyrics?: 按小节歌词,
//   repeatStart?: true(小节前有反复开始线), endBar: 'single'|'double'|'repeatEnd'|'final',
//   house?: 1|2(跳房子), slots: [slot] × 拍数 }
// slot = { kind: 'empty'|'chord'|'rest'|'hold', chord?: 和弦对象, split?: [子槽,子槽](反拍拆分), rhythm?: 节奏型 }

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

export function createSong(name = "未命名") {
	return {
		id: newChartId(),
		name,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		key: { root: 0, minor: false },
		timeSig: 4,
		bpm: 72,
		display: "degree",
		enharmonic: 1,
		rowsPerLine: 4,
		colorScheme: "navy",
		measures: [0, 1, 2, 3].map(() => createMeasure(4)) // 新歌给满一行
	};
}

// 拍号变化时补齐/裁剪小节槽位（已有和弦的槽保留在前）
export function resizeMeasure(measure, timeSig) {
	const slots = measure.slots.slice(0, timeSig);
	while (slots.length < timeSig) slots.push({ kind: "empty" });
	return { ...measure, slots };
}

export function loadCharts() {
	try {
		const raw = hasLS() ? localStorage.getItem(CHARTS_KEY) : null;
		const charts = raw ? JSON.parse(raw) : [];
		return Array.isArray(charts) ? charts.filter(c => c && Array.isArray(c.measures)) : [];
	} catch (error) {
		console.error("读取和弦谱失败:", error);
		return [];
	}
}

export function persistCharts(charts) {
	try {
		// 滚动备份最近 3 份（与 clipModel 同策略）
		for (let i = 2; i >= 1; i--) {
			const cur = hasLS() ? localStorage.getItem(`fretboard-chordcharts-bak-${i}`) : null;
			if (cur && hasLS()) localStorage.setItem(`fretboard-chordcharts-bak-${i + 1}`, cur);
		}
		const prev = hasLS() ? localStorage.getItem(CHARTS_KEY) : null;
		if (prev && hasLS()) localStorage.setItem("fretboard-chordcharts-bak-1", prev);
		if (hasLS()) localStorage.setItem(CHARTS_KEY, JSON.stringify(charts));
	} catch (error) {
		console.error("保存和弦谱失败:", error);
	}
}

export function saveChart(song) {
	const charts = loadCharts();
	const stamped = { ...song, updatedAt: Date.now() };
	const existing = charts.findIndex(c => c.id === song.id);
	if (existing !== -1) charts[existing] = stamped;
	else charts.unshift(stamped);
	persistCharts(charts);
	return stamped;
}

export function deleteChart(id) {
	persistCharts(loadCharts().filter(c => c.id !== id));
}

// 选中槽位（编辑光标）：{ mi: 小节序, si: 槽序, half: 0|1(反拍拆分后) | null }
export function firstEditableSlot(song) {
	return { mi: 0, si: 0, half: null };
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
