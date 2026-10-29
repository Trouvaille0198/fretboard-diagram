import { sameContent, queuePush, queueDelete, setApplier, setPuller, setConflictHandler, outboxPending } from "./syncEngine.js";

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
	const existing = charts.find(c => c.id === song.id);
	// 内容判脏：内容一模一样就不是改动——不写盘、不升版本、不下发。
	// 这一条根治了旧行为"只是打开了一首歌也会被当成改动保存"。
	if (existing && sameContent(existing, song)) return existing;
	const stamped = { ...song, updatedAt: Date.now() };
	const i = existing ? charts.indexOf(existing) : -1;
	if (i !== -1) charts[i] = stamped;
	else charts.unshift(stamped);
	persistCharts(charts);
	queuePush("charts", stamped); // 登录用户进离线队列异步下发（游客不入队，纯本地）
	return stamped;
}

export function deleteChart(id) {
	persistCharts(loadCharts().filter(c => c.id !== id));
	queueDelete("charts", id); // 删除也走离线队列：断网时删除不会丢
}

// 选中槽位（编辑光标）：{ mi: 小节序, si: 槽序, half: 0|1(反拍拆分后) | null }
export function firstEditableSlot(song) {
	return { mi: 0, si: 0, half: null };
}

// 在 (mi, si) 处插入一拍：从该拍起全曲的拍整体后移一位，内容一个不丢。
// 小节长度固定等于拍号，所以"后移"表现为拍跨小节线流动：本小节装不下的末拍流到下一小节开头，
// 逐节下传；全曲末尾溢出的拍落到新追加的小节里，终止线/反复线/跳房子跟着真正的曲尾走。
export function insertBeatInSong(song, mi, si) {
	const target = song.measures[mi];
	if (!target) return song;
	const cap = song.timeSig || target.slots.length || 4;
	const measures = song.measures.map(m => ({ ...m, slots: m.slots.slice() }));
	const at = Math.max(0, Math.min(target.slots.length - 1, si));
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
	const copy = {
		...entry.item,
		id: newChartId(),
		name: `${entry.item.name || "未命名"}（冲突副本）`,
		createdAt: Date.now(),
		updatedAt: Date.now()
	};
	charts.unshift(copy);
	persistCharts(charts);
	window.dispatchEvent(new CustomEvent("fretboard:charts-synced"));
	window.dispatchEvent(new CustomEvent("fretboard:toast", {
		detail: { msg: `「${entry.item.name}」云端已有更新版本，已采用云端版本；你的改动另存为「${copy.name}」` }
	}));
});
