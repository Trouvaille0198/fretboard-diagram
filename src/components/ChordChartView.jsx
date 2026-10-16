import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n";
import { ScoreBoard } from "./ScorePieces";
import { ChordPopup, PianoBar } from "./ChordPopup";
import { AttachPicker, AttachView } from "./AttachEditor";
import { Toast } from "./Toast";
import audioService from "../services/audioService";
import { chordParts, formatName, chordFromNameToken } from "../utils/chordLib";
import {
	loadCharts, saveChart, deleteChart, createSong, createMeasure, resizeMeasure
} from "../utils/chordChartModel";
import { buildPlayPlan } from "../utils/chartPlayback";
import { buildSongClip, stageFrame } from "../utils/chartFrames";
import { exportMusicXml, importMusicXml } from "../utils/musicxmlChart";
import { saveClip } from "../utils/clipModel";
import { saveToRememberedDir, rememberedDirSupported } from "../utils/saveFile";

const PC_KEY = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// 小节标色（着色页签）：段落视觉标记
const TINTS = {
	red: { name: "红", bg: "rgba(240, 138, 132, 0.10)" },
	blue: { name: "蓝", bg: "rgba(61, 139, 255, 0.10)" },
	green: { name: "绿", bg: "rgba(136, 211, 159, 0.10)" },
	gold: { name: "金", bg: "rgba(243, 186, 98, 0.12)" }
};

const END_BARS = [
	{ v: "single", label: "|", name: "单线" },
	{ v: "double", label: "‖", name: "双线" },
	{ v: "repeatEnd", label: ":‖", name: "反复结束" },
	{ v: "final", label: "⏨", name: "终止" }
];

// 和弦谱页（8pu 式和弦谱复刻）：格子谱面 + 键盘编辑 + 播放 + 移调 + MusicXML + 一键动图
export function ChordChartView() {
	const { t } = useLanguage();
	const ts = t?.chords ?? {};

	const [charts, setCharts] = useState(() => loadCharts());
	const [currentId, setCurrentId] = useState(() => (loadCharts()[0] || {}).id ?? null);
	const [song, setSong] = useState(() => loadCharts()[0] || createSong("第一首歌"));
	const [cursor, setCursor] = useState({ mi: 0, si: 0, half: null });
	const [transposeRoot, setTransposeRoot] = useState(null); // null = 原调；数字 = 移调后 root pc
	const [playing, setPlaying] = useState(null); // { mi, si, half } 当前发声槽
	const [metronome, setMetronome] = useState(true);
	const [speed, setSpeed] = useState(1);
	const [menuOpen, setMenuOpen] = useState(false); // 工具行「更多」菜单
	const [toolTab, setToolTab] = useState("chord"); // 工具栏页签：和弦 | 小节
	const [stageOpen, setStageOpen] = useState(true); // 右下角指板预览悬浮卡
	const [viewTab, setViewTab] = useState("text"); // 查看：文本谱 | 动态谱
	const [cpTab, setCpTab] = useState("chord"); // 弹层页签（C/B/R 切换）
	const [cellMenu, setCellMenu] = useState(null); // 打开的小节菜单 mi
	const [popupOpen, setPopupOpen] = useState(false); // 就地和弦面板
	const [popupPos, setPopupPos] = useState(null);
	const [typedHint, setTypedHint] = useState(""); // 键盘输入中的和弦串（面板头显示）
	const [toast, setToast] = useState(null); // { msg, key } 应用内轻提示（替代 alert）
	// 应用内对话框（替代原生 prompt/confirm/alert）：{ type:'prompt'|'confirm'|'alert', title, label?, value?, text?, onOk }
	const [dialog, setDialog] = useState(null);
	const dialogInputRef = useRef(null);
	const showToast = (msg) => setToast({ msg, key: Date.now() });
	const clipRef = useRef(null); // Ctrl+C/V 剪贴板：{type:'chord',chord} | {type:'measure',slots}
	const typeRef = useRef({ t: 0, mode: null, sub: null }); // 键入状态：mode='degree'|'name'，sub='bass'

	useEffect(() => {
		if (!popupOpen) return;
		const close = (e) => { if (!e.target.closest(".cc-cp, .cc-beat, .cc-cell-menu-btn, .cc-mmenu")) setPopupOpen(false); };
		document.addEventListener("mousedown", close);
		return () => document.removeEventListener("mousedown", close);
	}, [popupOpen]);

	// 就地面板定位（absolute 相对谱面；面板矮，下方不足翻上方）
	useEffect(() => {
		const place = () => {
			if (!popupOpen) { setPopupPos(null); return; }
			const score = scoreRef.current;
			const el = document.querySelector(".cc-beat.cur");
			if (!score || !el) { setPopupPos(null); return; }
			const sr = score.getBoundingClientRect();
			const r = el.getBoundingClientRect();
			const ph = popupRef.current ? popupRef.current.offsetHeight : 216;
			const openUp = window.innerHeight - 74 - r.bottom < ph + 14;
			const left = Math.max(4, Math.min(r.left - sr.left, sr.width - 340));
			const top = openUp ? null : r.bottom - sr.top + 8;
			const bottom = openUp ? sr.height - (r.top - sr.top) + 8 : null;
			setPopupPos(prev => (prev && prev.left === left && prev.top === top && prev.bottom === bottom) ? prev : { left, top, bottom });
		};
		place();
		const id = requestAnimationFrame(place);
		return () => cancelAnimationFrame(id);
	}, [popupOpen, cursor, song]);

	useEffect(() => {
		if (cellMenu === null) return;
		const close = (e) => { if (!e.target.closest(".cc-mmenu, .cc-cell-menu-btn")) setCellMenu(null); };
		document.addEventListener("mousedown", close);
		return () => document.removeEventListener("mousedown", close);
	}, [cellMenu]);
	const undoStackRef = useRef([]);
	const redoStackRef = useRef([]);
	const prevSongRef = useRef(null);
	const suppressHistoryRef = useRef(false); // undo/redo 恢复不算新编辑
	const lastPushAtRef = useRef(0); // 上次压栈时刻：短时间连击合并为一步撤销
	// 会话级切换（切歌/新建/删除/导入）：撤销栈整体作废——不能让 Ctrl+Z 翻回另一首歌
	const clearHistory = () => {
		undoStackRef.current = [];
		redoStackRef.current = [];
		suppressHistoryRef.current = true;
		lastPushAtRef.current = 0;
	};
	const fileRef = useRef(null);
	const [attachOpen, setAttachOpen] = useState(false); // 配图编辑弹窗
	const typeTimerRef = useRef(null);
	const scoreRef = useRef(null);
	const popupRef = useRef(null);
	const timersRef = useRef([]);
	const saveTimerRef = useRef(null);

	const editing = toolTab !== "preview"; // 预览页签 = 查看态；其余页签 = 编辑（tab 栏永远不变）
	const viewKey = { root: transposeRoot ?? song.key.root, minor: song.key.minor };
	// 生效调：小节级转调标记（keyRoot）覆盖到该小节起；全局移调叠加 —— 播放/按法/音名显示都用它
	const keyAt = (mi) => {
		let key = { root: song.key.root, minor: song.key.minor };
		for (let i = 0; i <= mi && song.measures.length; i++) {
			const m = song.measures[i];
			if (m && m.keyRoot != null) key = { root: m.keyRoot, minor: !!m.keyMinor };
		}
		if (transposeRoot != null && transposeRoot !== song.key.root) {
			key = { root: (key.root + (transposeRoot - song.key.root) + 24) % 12, minor: key.minor };
		}
		return key;
	};
	const keyAtFn = (mi) => keyAt(typeof mi === "number" ? mi : cursor.mi);
	const songRef = useRef(song);
	songRef.current = song;

	const stopPlayback = useCallback(() => {
		timersRef.current.forEach(id => clearTimeout(id));
		timersRef.current = [];
		audioService.stopAll?.(); // 掐掉已拨响的采样尾音
		setPlaying(null);
	}, []);

	// 换歌
	const openChart = (id) => {
		const c = charts.find(x => x.id === id);
		if (!c) return;
		stopPlayback();
		clearHistory();
		setSong(c);
		setCurrentId(id);
		setTransposeRoot(null);
		setCursor({ mi: 0, si: 0, half: null });
	};

	// 多标签页同步：其他标签页保存了更新的谱子 → 采纳，避免本页用旧内存覆盖丢数据
	useEffect(() => {
		const onStorage = (e) => {
			if (e.key !== "fretboard-chordcharts") return;
			try {
				const latest = loadCharts().find(c => c.id === songRef.current.id);
				if (latest && latest.updatedAt > (songRef.current.updatedAt || 0)) {
					clearHistory(); // 采纳远端后旧撤销栈失效
					setSong(latest);
				}
			} catch (err) { /* 忽略 */ }
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	// 编辑历史（撤销/重做）：song 变化自动记录前值；800ms 内的连击（跟打修饰/歌词连输）合并为一步
	useEffect(() => {
		if (prevSongRef.current && prevSongRef.current !== song) {
			if (suppressHistoryRef.current) {
				suppressHistoryRef.current = false;
			} else {
				const now = Date.now();
				if (now - lastPushAtRef.current > 800) {
					undoStackRef.current.push(prevSongRef.current);
					if (undoStackRef.current.length > 60) undoStackRef.current.shift();
					redoStackRef.current = [];
				}
				lastPushAtRef.current = now;
			}
		}
		prevSongRef.current = song;
	}, [song]);

	const undo = useCallback(() => {
		const prev = undoStackRef.current.pop();
		if (!prev) return;
		redoStackRef.current.push(songRef.current);
		suppressHistoryRef.current = true;
		lastPushAtRef.current = 0;
		setSong(prev);
		setCurrentId(prev.id); // 跨歌撤销时歌单高亮同步
	}, []);

	const redo = useCallback(() => {
		const next = redoStackRef.current.pop();
		if (!next) return;
		undoStackRef.current.push(songRef.current);
		suppressHistoryRef.current = true;
		lastPushAtRef.current = 0;
		setSong(next);
		setCurrentId(next.id);
	}, []);

	// 自动保存（防抖）；卸载时冲刷最后 800ms 内的编辑
	useEffect(() => {
		clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(() => {
			const saved = saveChart(song);
			setCharts(loadCharts());
			setCurrentId(saved.id);
		}, 800);
		return () => clearTimeout(saveTimerRef.current);
	}, [song]);

	useEffect(() => () => {
		timersRef.current.forEach(id => clearTimeout(id));
		audioService.stopAll?.();
		try {
			const stored = loadCharts().find(c => c.id === songRef.current.id);
			if (!(stored && stored.updatedAt > (songRef.current.updatedAt || 0))) saveChart(songRef.current);
		} catch (e) { /* 存不了就算了 */ }
	}, []);

	// ============ 结构编辑 ============

	const patchMeasure = (mi, fn) => setSong(s => ({ ...s, measures: s.measures.map((m, i) => (i === mi ? fn(m) : m)) }));

	const unitOf = (mi, si, half) => {
		const slot = song.measures[mi]?.slots[si];
		if (!slot) return null;
		if (slot.split) return slot.split[half || 0] || null;
		return slot;
	};

	const patchUnit = (mi, si, half, patch) => {
		patchMeasure(mi, m => {
			if (si < 0 || si >= m.slots.length) return m; // 光标越界（如刚缩拍号）不产生幽灵槽
			const slots = m.slots.slice();
			const slot = { ...slots[si] };
			if (slot.split) {
				const split = slot.split.slice();
				split[half || 0] = { ...split[half || 0], ...patch };
				slot.split = split;
			} else {
				Object.assign(slot, patch);
			}
			slots[si] = slot;
			return { ...m, slots };
		});
	};

	const currentUnit = unitOf(cursor.mi, cursor.si, cursor.half);
	const patchCurrentUnit = (patch) => patchUnit(cursor.mi, cursor.si, cursor.half, patch);

	// 弹层选完和弦即进入跟打态：后续 m/7/M、b/#、/低音 等键盘修饰能接上
	const patchUnitFromPanel = (patch) => {
		if (patch && patch.kind === "chord" && patch.chord) {
			typeRef.current = { t: Date.now(), mode: "degree", sub: null, lastKind: "mod" };
		}
		patchCurrentUnit(patch);
	};

	// 段落标记（应用内对话框，替代原生 prompt）
	const promptSection = (mi) => setDialog({
		type: "prompt",
		title: ts.sectionBtn ?? "段落标记",
		label: ts.sectionPrompt ?? "段落名（如 主歌1）",
		value: song.measures[mi]?.section || "",
		onOk: (v) => patchMeasure(mi, x => ({ ...x, section: String(v ?? "").trim() || null }))
	});

	// ============ 键盘直接键入 ============
	// 度数模式：1-7 起手立即成和弦；900ms 内跟打 m/7/M/6/9/s/d/a 质量、b/# 变音、/低音
	// 音名模式：Shift+A-G 起手，跟打小写/数字补全（如 Am、G7、Bb），超时或落键提交
	const QUALITY_KEYS = { m: "m", 7: "7", M: "maj7", 6: "6", "9": "9", s: "sus4", d: "dim", a: "aug" };

	const applyTyped = (chord) => {
		if (!chord) return;
		patchCurrentUnit({ kind: "chord", chord });
	};

	const onChordKey = (e) => {
		const now = Date.now();
		const st = typeRef.current;
		const inWindow = now - st.t < 900;
		const k = e.key;
		const touch = (extra = {}) => { typeRef.current = { ...typeRef.current, t: now, ...extra }; };

		// 音名缓冲进行中：吃掉字母/数字/升降/斜杠
		if (st.mode === "name") {
			if (/^[a-gA-GmM0-9#b/]$/.test(k) && k.length === 1) {
				e.preventDefault();
				st.buf = (st.buf || "") + k;
				st.t = now;
				setTypedHint(st.buf);
				clearTimeout(typeTimerRef.current);
				typeTimerRef.current = setTimeout(() => commitTyped(), 900);
				return true;
			}
			commitTyped(); // 其他键：先提交再走原逻辑
		}

		// Shift+大写字母起手：音名模式
		if (/^[A-G]$/.test(k)) {
			e.preventDefault();
			typeRef.current = { t: now, mode: "name", buf: k };
			setTypedHint(k);
			clearTimeout(typeTimerRef.current);
			typeTimerRef.current = setTimeout(() => commitTyped(), 900);
			return true;
		}

		const unit = unitOf(cursor.mi, cursor.si, cursor.half);
		const activeChord = inWindow && unit && unit.kind === "chord" ? unit.chord : null;

		// 低音模式：/ 后的数字
		if (activeChord && st.sub === "bass" && /^[1-7]$/.test(k)) {
			e.preventDefault();
			touch({ sub: null, lastKind: "mod" });
			setTypedHint("");
			applyTyped({ ...activeChord, bass: { degree: parseInt(k, 10), acc: 0 } });
			return true;
		}

		// 数字跟在质量字母后 → 质量数字（1 m 7 = 1m7）；否则为新度数起手
		if (activeChord && st.lastKind === "mod" && ["7", "6", "9"].includes(k)) {
			e.preventDefault();
			const q = activeChord.quality || "";
			const digitQ = k === "7" ? (q === "m" ? "m7" : "7")
				: k === "6" ? (q === "m" ? "m6" : "6")
					: "9";
			touch({ lastKind: "mod" });
			setTypedHint("");
			applyTyped({ ...activeChord, quality: digitQ });
			return true;
		}

		// 度数起手（立即成和弦，可继续跟打修饰）
		if (/^[1-7]$/.test(k)) {
			e.preventDefault();
			touch({ mode: "degree", sub: null, lastKind: "start" });
			const degree = parseInt(k, 10);
			applyTyped({ degree, acc: 0, quality: "", bass: null });
			return true;
		}

		if (activeChord) {
			// 质量/变音/低音 跟打
			let next = null;
			if (QUALITY_KEYS[k]) {
				const q = QUALITY_KEYS[k];
				next = { ...activeChord, quality: (activeChord.quality === q && q === "m") ? "" : q };
			} else if (k === "b") next = { ...activeChord, acc: -1 };
			else if (k === "#") next = { ...activeChord, acc: 1 };
			else if (k === "/") {
				touch({ sub: "bass", lastKind: "mod" });
				setTypedHint(activeChord.degree + (activeChord.quality || "") + "/");
				return true;
			}
			if (next) {
				e.preventDefault();
				touch({ lastKind: "mod" });
				setTypedHint("");
				applyTyped(next);
				return true;
			}
		}
		return false;
	};

	const commitTyped = () => {
		const st = typeRef.current;
		clearTimeout(typeTimerRef.current);
		if (st.mode === "name" && st.buf) {
			const chord = chordFromNameToken(st.buf, viewKey);
			if (chord) applyTyped(chord);
			else setTypedHint("");
		}
		typeRef.current = { t: 0, mode: null, sub: null };
		setTypedHint("");
	};

	const setSlotChord = (degree) => {
		const existing = currentUnit && currentUnit.kind === "chord" ? currentUnit.chord : null;
		const chord = {
			degree,
			acc: existing && existing.degree === degree ? (existing.acc || 0) : 0,
			quality: existing && existing.degree === degree ? (existing.quality || "") : "",
			bass: null
		};
		patchCurrentUnit({ kind: "chord", chord });
		// 光标停留：面板随即展开该和弦，便于加质量/低音（前进用 →/Tab）
	};

	const addMeasure = (after = song.measures.length - 1) => setSong(s => {
		const measures = s.measures.slice();
		measures.splice(after + 1, 0, createMeasure(s.timeSig));
		return { ...s, measures };
	});

	// 新增一行：末行残缺时先补满，再整加一行完整空小节（8pu 的行概念）
	const addRow = () => setSong(s => {
		const measures = s.measures.slice();
		const per = s.rowsPerLine || 4;
		const pad = (per - (measures.length % per)) % per;
		for (let i = 0; i < pad + per; i++) measures.push(createMeasure(s.timeSig));
		return { ...s, measures };
	});

	const removeMeasure = (mi) => {
		if (song.measures.length <= 1) return;
		setSong(s => ({ ...s, measures: s.measures.filter((_, i) => i !== mi) }));
		// 删除后光标钳回仍存在的小节
		setCursor(c => {
			const mi2 = Math.max(0, Math.min(c.mi, song.measures.length - 2));
			const m = song.measures[mi2];
			return { mi: mi2, si: Math.min(c.si, (m?.slots.length || 1) - 1), half: null };
		});
	};

	const duplicateMeasure = (mi) => setSong(s => {
		const measures = s.measures.slice();
		const copy = JSON.parse(JSON.stringify(measures[mi]));
		copy.id = createMeasure(s.timeSig).id;
		measures.splice(mi + 1, 0, copy);
		return { ...s, measures };
	});

	const toggleSplit = () => {
		const willSplit = !song.measures[cursor.mi]?.slots[cursor.si]?.split;
		patchMeasure(cursor.mi, m => {
			const slots = m.slots.slice();
			const slot = { ...slots[cursor.si] };
			if (slot.split) {
				// 合并：保留前半
				const first = slot.split[0];
				const rhythm = slot.rhythm;
				const merged = { ...first, rhythm };
				delete merged.split;
				slots[cursor.si] = merged;
			} else {
				slot.split = [{ ...slot }, { kind: "empty" }];
				slots[cursor.si] = slot;
			}
			return { ...m, slots };
		});
		// 拆分完光标直达新的空半拍；合并则回整拍
		setCursor(c => ({ ...c, half: willSplit ? 1 : null }));
	};

	const setTimeSig = (n) => {
		// 缩拍会裁掉尾部槽——含和弦的先提示再丢
		if (n < song.timeSig) {
			let dropped = 0;
			song.measures.forEach(m => m.slots.slice(n).forEach(sl => {
				if (sl.kind === "chord" || (sl.split && sl.split.some(u => u.kind === "chord"))) dropped++;
			}));
			if (dropped > 0) showToast((ts.resizeDrop ?? "拍号缩小：丢弃了 {n} 个有和弦的拍").replace("{n}", String(dropped)));
		}
		setSong(s => ({ ...s, timeSig: n, measures: s.measures.map(m => resizeMeasure(m, n)) }));
		// 光标钳回合法槽位（防幽灵拍）
		setCursor(c => {
			const mi = Math.max(0, Math.min(c.mi, song.measures.length - 1));
			const si = Math.max(0, Math.min(c.si, n - 1));
			return { mi, si, half: song.measures[mi]?.slots[si]?.split ? c.half : null };
		});
	};

	// ============ 光标 ============

	const moveCursor = (dmi, dsi) => setCursor(c => {
		let mi = c.mi + dmi, si = c.si + dsi;
		if (mi < 0) mi = 0;
		if (mi > song.measures.length - 1) mi = song.measures.length - 1;
		if (si < 0) { if (mi > 0) { mi -= 1; si = song.measures[mi].slots.length - 1; } else si = 0; }
		if (si > song.measures[mi].slots.length - 1) {
			if (mi < song.measures.length - 1) { mi += 1; si = 0; }
			else si = song.measures[mi].slots.length - 1;
		}
		return { mi, si, half: null };
	});

	// ============ 播放 ============

	const schedule = (ms, fn) => {
		const id = setTimeout(fn, Math.max(0, ms));
		timersRef.current.push(id);
		return id;
	};

	// fromMi：显式起始小节（Ctrl+Space 传 0 从头；调速重播传当前小节）；null = 从光标小节起
	const startPlayback = async (fromMi = null) => {
		if (!song.measures.length) return;
		stopPlayback();
		try { await audioService.init(); } catch (e) { /* 静音也能走 */ }
		const start = fromMi != null
			? Math.max(0, Math.min(fromMi, song.measures.length - 1))
			: (Number.isInteger(cursor.mi) && cursor.mi > 0 && song.measures[cursor.mi] ? cursor.mi : 0);
		const plan = buildPlayPlan(song, keyAtFn, start);
		if (!plan.items.length) return;
		const leadBeats = metronome ? song.timeSig : 0; // 预备拍：一小节节拍器领起
		const t0 = 100 + leadBeats * plan.beatMs / speed;
		if (metronome) {
			const totalBeats = Math.floor(plan.beats + 0.01);
			for (let b = -leadBeats; b <= totalBeats; b++) {
				// startBeat = 起播前的累计拍数：强拍对齐小节线（中起播也不乱）
				const barBeat = (((plan.startBeat + b) % song.timeSig) + song.timeSig) % song.timeSig;
				schedule(t0 + b * plan.beatMs / speed, () => audioService.click(barBeat === 0));
			}
		}
		plan.items.forEach(item => {
			schedule(t0 + item.startMs / speed, () => {
				try { document.querySelectorAll('.cc-beat.playing').forEach(function(el){ el.classList.remove('playing'); });
				document.querySelectorAll('[data-mi="' + item.mi + '"][data-si="' + item.si + '"]').forEach(function(el){ el.classList.add('playing'); }); } catch(e) {}
				setPlaying({ mi: item.mi, si: item.si, half: item.half });
				if (item.chord && item.plan) {
					item.plan.forEach(f => schedule(f.delayMs / speed, () => {
						audioService.playFretNote(f.idx, f.string, f.durMs / 1000 / speed);
					}));
				}
			});
		});
		schedule(t0 + plan.totalMs / speed + 150, () => stopPlayback());
	};

	// 播放中调速：定时器已按旧速度排死，从当前发声小节重排
	const onSpeedChange = (v) => {
		setSpeed(v);
		if (playing) {
			const mi = playing.mi;
			stopPlayback();
			startPlayback(mi);
		}
	};

	// ============ 键盘 ============

	useEffect(() => {
		const onKey = (e) => {
			if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable) return;
			if (dialog) { if (e.key === "Escape") { e.preventDefault(); setDialog(null); } return; }
			if (!editing) {
				if (e.key === " ") { e.preventDefault(); playing ? stopPlayback() : startPlayback(); }
				if (e.key === "Escape" && playing) stopPlayback();
				return;
			}
			if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
				e.preventDefault();
				if (e.shiftKey) redo(); else undo();
				return;
			}
			if (e.key === "Escape") { e.preventDefault(); if (popupOpen) setPopupOpen(false); else if (playing) stopPlayback(); return; }
			if (playing && e.key === " ") { e.preventDefault(); stopPlayback(); return; }
			if (popupOpen && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
				const k2 = e.key.toLowerCase();
				// 跟打进行中 b 优先当降号修饰（如 1 b = b1 / b7）；不跟打时才切弹层页签（8pu 的 C/B/R）
				const st1 = typeRef.current;
				const typingChord = Date.now() - st1.t < 900 && currentUnit?.kind === "chord" && !!currentUnit.chord;
				if (["c", "b", "r"].includes(k2) && !(k2 === "b" && typingChord)) {
					e.preventDefault();
					setCpTab({ c: "chord", b: "bass", r: "rhythm" }[k2]);
					return;
				}
			}
			if (onChordKey(e)) return;
			// ===== 8pu 官方键位（和弦谱）：Tab=下一个小节；Ctrl+←/→=上/下小节；Ctrl+Space=从头播放；Ctrl+C/V=复制/粘贴和弦或小节；Alt+A=段落标记 =====
			if (e.key === "Tab") {
				e.preventDefault(); commitTyped();
				setCursor(c => {
					const jump = e.shiftKey ? -1 : 1;
					const mi = Math.max(0, Math.min(song.measures.length - 1, c.mi + jump));
					return { mi, si: 0, half: null };
				});
				return;
			}
			if ((e.ctrlKey || e.metaKey) && e.key === "ArrowLeft") { e.preventDefault(); setCursor(c => ({ mi: Math.max(0, c.mi - 1), si: c.si, half: null })); return; }
			if ((e.ctrlKey || e.metaKey) && e.key === "ArrowRight") { e.preventDefault(); setCursor(c => ({ mi: Math.min(song.measures.length - 1, c.mi + 1), si: c.si, half: null })); return; }
			if ((e.ctrlKey || e.metaKey) && e.key === " ") { e.preventDefault(); startPlayback(0); return; }
			if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
				e.preventDefault();
				const u = unitOf(cursor.mi, cursor.si, cursor.half);
				if (u && u.kind === "chord" && u.chord) clipRef.current = { type: "chord", chord: u.chord };
				else clipRef.current = { type: "measure", slots: song.measures[cursor.mi]?.slots || [] };
				return;
			}
			if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
				e.preventDefault();
				const clip = clipRef.current;
				if (!clip) return;
				if (clip.type === "chord") patchCurrentUnit({ kind: "chord", chord: JSON.parse(JSON.stringify(clip.chord)) });
				else if (clip.slots) patchMeasure(cursor.mi, m => ({ ...m, slots: JSON.parse(JSON.stringify(clip.slots)) }));
				return;
			}
			if (e.altKey && (e.key === "a" || e.key === "A")) {
				e.preventDefault();
				promptSection(cursor.mi);
				return;
			}
			if (e.key === "Enter") { e.preventDefault(); commitTyped(); toggleSplit(); return; }
			switch (e.key) {
				case "ArrowLeft": e.preventDefault();
					if (cursor.half === 1) setCursor({ ...cursor, half: 0 });
					else moveCursor(0, -1);
					break;
				case "ArrowRight": e.preventDefault(); {
					const slot = song.measures[cursor.mi]?.slots[cursor.si];
					if (cursor.half === null && slot?.split) setCursor({ ...cursor, half: 0 });
					else if (cursor.half === 0) setCursor({ ...cursor, half: 1 });
					else moveCursor(0, 1);
					break;
				}
				case "ArrowUp": e.preventDefault(); moveCursor(-1, 0); break;
				case "ArrowDown": e.preventDefault(); moveCursor(1, 0); break;
				case "0": e.preventDefault(); patchCurrentUnit({ kind: "rest" }); moveCursor(0, 1); break;
				case "-": e.preventDefault(); patchCurrentUnit({ kind: "hold" }); moveCursor(0, 1); break;
				case "b": e.preventDefault(); if (currentUnit?.kind === "chord" && currentUnit.chord) patchCurrentUnit({ chord: { ...currentUnit.chord, acc: -1 } }); break;
				case "#": e.preventDefault(); if (currentUnit?.kind === "chord" && currentUnit.chord) patchCurrentUnit({ chord: { ...currentUnit.chord, acc: 1 } }); break;
				case "Backspace": e.preventDefault(); patchCurrentUnit({ kind: "empty", chord: undefined, split: undefined }); break;
				case " ": e.preventDefault(); if (playing) stopPlayback(); else startPlayback(); break;
				default: break;
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	// ============ 导入导出 / 动图 ============

	const doExportXml = async () => {
		const blob = new Blob([exportMusicXml(song)], { type: "application/xml;charset=utf-8" });
		const name = `${song.name || "chord-chart"}.musicxml`;
		const saved = rememberedDirSupported() ? await saveToRememberedDir(name, blob) : null;
		if (!saved) {
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = name;
			a.click();
			URL.revokeObjectURL(a.href);
		}
	};

	const doImportXml = (e) => {
		const file = e.target.files && e.target.files[0];
		e.target.value = "";
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const imported = importMusicXml(String(reader.result), file.name.replace(/\.musicxml$|\.xml$/i, ""));
				if (!imported) {
					setDialog({ type: "alert", title: ts.importXml ?? "导入 XML", text: ts.importFail ?? "没解析出和弦骨架（需要带 harmony 的 MusicXML）" });
					return;
				}
				clearHistory();
				setSong(imported);
				setTransposeRoot(null);
				setCursor({ mi: 0, si: 0, half: null });
				const saved = saveChart(imported);
				setCharts(loadCharts());
				setCurrentId(saved.id);
			} catch (err) {
				console.error(err);
				setDialog({ type: "alert", title: ts.importXml ?? "导入 XML", text: (ts.importFail ?? "导入失败") + "：" + err.message });
			}
		};
		reader.readAsText(file);
	};

	const makeClip = () => {
		const built = buildSongClip(song, keyAtFn);
		if (!built) {
			setDialog({ type: "alert", title: ts.makeClip ?? "生成动图", text: ts.noChords ?? "还没有和弦，先按 1-7 输入" });
			return;
		}
		saveClip(built.clip);
		window.location.hash = `#/dynamic?c=${built.clip.id}`;
	};

	// 面板动作路由（作用于当前槽/半拍）
	const canSplitCurrent = !!song.measures[cursor.mi]?.slots[cursor.si];
	const onPanelSetKind = (kind) => patchCurrentUnit({ kind, chord: undefined, split: undefined });

	// 常用和弦（8pu 式）：按本谱出现频率 top6；空歌给调内默认进行
	const frequentChords = useMemo(() => {
		const counter = new Map();
		song.measures.forEach(m => m.slots.forEach(sl => (sl.split || [sl]).forEach(u => {
			if (u.kind === "chord" && u.chord) {
				const k = `${u.chord.acc || 0}|${u.chord.degree}|${u.chord.quality || ""}|${u.chord.bass ? u.chord.bass.degree : ""}`;
				if (!counter.has(k)) counter.set(k, { chord: u.chord, n: 0 });
				counter.get(k).n++;
			}
		})));
		const sorted = [...counter.values()].sort((a, b) => b.n - a.n).slice(0, 6).map(x => x.chord);
		if (sorted.length) return sorted;
		const minor = !!song.key.minor;
		return [
			{ degree: 1, acc: 0, quality: minor ? "m" : "", bass: null },
			{ degree: minor ? 4 : 6, acc: 0, quality: "m", bass: null },
			{ degree: 4, acc: 0, quality: minor ? "m" : "", bass: null },
			{ degree: 5, acc: 0, quality: minor ? "m" : "", bass: null }
		];
	}, [song]);

	const formatChordDyn = (chord, mi) => {
		const p = chordParts(chord, song.display, keyAt(mi));
		return p.main + (p.sub ? p.sub : "");
	};

	// ============ 渲染（8pu 式格子谱） ============

	const stageChord = playing
		? (unitOf(playing.mi, playing.si, playing.half)?.chord || null)
		: (currentUnit && currentUnit.kind === "chord" ? currentUnit.chord : null);
	const stageSnapshot = useMemo(() => {
		const frame = stageChord ? stageFrame(stageChord, song, keyAt(playing ? playing.mi : cursor.mi)) : null;
		return frame ? { state: frame } : null;
	}, [stageChord, song.colorScheme, transposeRoot, song.key.root, song.enharmonic, cursor.mi, playing]);
	const stagePos = playing || { mi: cursor.mi, si: cursor.si };
	const stageSign = stageChord
		? `${chordParts(stageChord, "degree", keyAt(playing ? playing.mi : cursor.mi)).main.replace(/M$/, "")} · ${formatName(stageChord, keyAt(playing ? playing.mi : cursor.mi))}`
		: "";

	// 拍格内容（和弦竖排记号 / 休止 / 延音 / 空）
	const beatContent = (u, compact, mi) => {
		if (u.kind === "chord" && u.chord) {
			const parts = chordParts(u.chord, song.display, keyAt(mi));
			if (compact) {
				return <span className="cc-chordsign-compact">{parts.main}<sub>{parts.sub}</sub></span>;
			}
			return (
				<span className="cc-chordsign">
					<span className="cc-chordsign-main">{parts.main}</span>
					{parts.sub ? <span className="cc-chordsign-sub">{parts.sub}</span> : null}
				</span>
			);
		}
		if (u.kind === "rest") return <span className="cc-glyph rest">0</span>;
		if (u.kind === "hold") return <span className="cc-glyph hold">—</span>;
		return null; // 空拍留白（8pu 同款）：任何占位符都会破坏拍格对齐
	};

	const slotView = (mi, si) => {
		const slot = song.measures[mi].slots[si];
		const units = slot.split ? slot.split : [slot];
		const isCur = cursor.mi === mi && cursor.si === si;
		return (
			<div
				key={si}
				className={`cc-beat ${isCur ? "cur" : ""} ${playing && playing.mi === mi && playing.si === si ? "playing" : ""}`}
				data-mi={mi}
				data-si={si}
				onClick={e => { if (!editing) return; e.stopPropagation(); setCursor({ mi, si, half: null }); setPopupOpen(true); }}
			>
				{slot.split ? <span className="cc-beat-splitmark" title={ts.splitTip ?? "反拍拆分（Enter 合并）"}>╱</span> : null}
				{editing && isCur && !slot.split && slot.kind === "chord" ? (
					<button className="cc-add-beat-btn" title={ts.splitHint ?? "拆分当前拍（＋后半拍）"} onClick={e => { e.stopPropagation(); toggleSplit(); }}>＋</button>
				) : null}
				<div className={`cc-beat-units ${slot.split ? "halved" : ""}`}>
					{units.map((u, h) => {
						const active = isCur && slot.split && cursor.half === h;
						const playingHalf = playing && playing.mi === mi && playing.si === si && playing.half === h;
						return (
							<div key={h}
								className={`cc-beat-unit ${active ? "cur" : ""} ${playingHalf ? "playing" : ""}`}
								onClick={e => { if (!editing) return; e.stopPropagation(); setCursor({ mi, si, half: slot.split ? h : null }); setPopupOpen(true); }}
							>
								{beatContent(u, !!slot.split, mi)}
								{u.rhythm ? <span className="cc-rhythm-mark">{u.rhythm === "ballad" ? "∼" : u.rhythm === "block" ? "▮" : u.rhythm === "waltz" ? "③" : ""}</span> : null}
							</div>
						);
					})}
				</div>
			</div>
		);
	};

	const cellView = (m, mi) => {
		return (
			<div key={m.id} className={`cc-cell end-${m.endBar} ${m.repeatStart ? "rep-start" : ""} ${cursor.mi === mi ? "cur" : ""}`}
				style={m.tint && TINTS[m.tint] ? { background: TINTS[m.tint].bg } : undefined}
				onClick={e => {
					if (!editing) {
						// 预览态点谱面：回到和弦页签编辑并定位到该小节
						const firstEmpty = m.slots.findIndex(sl => (sl.split ? sl.split.every(u => u.kind !== "chord") : sl.kind !== "chord"));
						setCursor({ mi, si: firstEmpty === -1 ? 0 : firstEmpty, half: null });
						setToolTab("chord");
						return;
					}
					if (e.target.closest(".cc-beat, .cc-cell-lyrics, .cc-cell-menu-btn, .cc-mmenu")) return;
					const firstEmpty = m.slots.findIndex(sl => (sl.split ? sl.split.every(u => u.kind !== "chord") : sl.kind !== "chord"));
					const si = firstEmpty === -1 ? 0 : firstEmpty;
					setCursor({ mi, si, half: null });
					setPopupOpen(true);
				}}>
				{m.section ? (
					<span className="cc-sectionmark"
						title={ts.sectionDel ?? "双击删除段落标记"}
						onDoubleClick={() => patchMeasure(mi, x => ({ ...x, section: null }))}>
						{m.section}
					</span>
				) : null}
				{m.keyRoot != null ? <span className="cc-keymark">1 = {PC_KEY[m.keyRoot]}{m.keyMinor ? "m" : ""}</span> : null}
				{m.house ? <span className="cc-house">{m.house}.</span> : null}
				<div className="cc-cell-slots">{m.slots.map((_, si) => slotView(mi, si))}</div>
				<input key={`cl-${m.id}-${m.lyrics || ""}`} className={`cc-cell-lyrics ${m.lyrics ? "has" : ""}`} defaultValue={m.lyrics || ""}
					readOnly={!editing} placeholder={editing ? "" : (ts.lyricsFor ?? "当前小节歌词")}
					onBlur={e => patchMeasure(mi, x => ({ ...x, lyrics: e.target.value }))} />
				{editing ? <button className="cc-cell-menu-btn" title={ts.measureMenu ?? "小节操作"} onClick={e => { e.stopPropagation(); setCellMenu(cellMenu === mi ? null : mi); }}>⋯</button> : null}
				{cellMenu === mi ? (
					<div className="cc-mmenu" onClick={e => e.stopPropagation()}>
						<button onClick={() => { addMeasure(mi); setCellMenu(null); }}>＋ {ts.addMeasure ?? "后插小节"}</button>
						<button onClick={() => { duplicateMeasure(mi); setCellMenu(null); }}>⧉ {ts.dupMeasure ?? "复制小节"}</button>
						<button className="danger" onClick={() => { removeMeasure(mi); setCellMenu(null); }}>✕ {ts.delMeasure ?? "删除小节"}</button>
						<div className="cc-menu-sep" />
						<div className="cc-mmenu-label">{ts.barlineLabel ?? "小节线"}</div>
						<div className="cc-mmenu-row">
							{END_BARS.map(b => (
								<button key={b.v} className={m.endBar === b.v ? "on" : ""} title={b.name}
									onClick={() => patchMeasure(mi, x => ({ ...x, endBar: b.v }))}>
									{b.name ?? b.v}
								</button>
							))}
						</div>
						<div className="cc-mmenu-row">
							<button className={m.repeatStart ? "on" : ""} title={ts.repeatStart ?? "反复开始"}
								onClick={() => patchMeasure(mi, x => ({ ...x, repeatStart: !x.repeatStart }))}>‖: {ts.repeatStart ?? "反复开始"}</button>
						</div>
						<div className="cc-mmenu-label">{ts.houseLabel ?? "跳房子"}</div>
						<div className="cc-mmenu-row">
							{[0, 1, 2].map(h => (
								<button key={h} className={(m.house || 0) === h ? "on" : ""}
									onClick={() => patchMeasure(mi, x => ({ ...x, house: h === 0 ? null : h }))}>
									{h === 0 ? (ts.none ?? "无") : h + "."}
								</button>
							))}
						</div>
						<div className="cc-menu-sep" />
						<button onClick={() => { setCellMenu(null); promptSection(mi); }}>¶ {ts.sectionBtn ?? "段落标记"}</button>
					</div>
				) : null}
			</div>
		);
	};

	const rows = [];
	const per = song.rowsPerLine || 4;
	for (let i = 0; i < song.measures.length; i += per) rows.push(song.measures.slice(i, i + per));

	return (
		<div className="cc-page">
			<header className="cc-toolbar">
				<div className="cc-tabs-row">
					<nav className="cc-tooltabs">
						<button className={toolTab === "preview" ? "on" : ""} onClick={() => { stopPlayback(); setToolTab("preview"); }}>{ts.tabPreview ?? "预览"}</button>
						<button className={toolTab === "chord" ? "on" : ""} onClick={() => setToolTab("chord")}>{ts.tabChord ?? "和弦"}</button>
						<button className={toolTab === "measure" ? "on" : ""} onClick={() => setToolTab("measure")}>{ts.tabMeasure ?? "小节"}</button>
						<button className={toolTab === "note" ? "on" : ""} onClick={() => setToolTab("note")}>{ts.tabNote ?? "音符"}</button>
						<button className={toolTab === "melody" ? "on" : ""} onClick={() => setToolTab("melody")}>{ts.tabMelody ?? "旋律"}</button>
						<button className={toolTab === "text" ? "on" : ""} onClick={() => setToolTab("text")}>{ts.tabText ?? "文本"}</button>
						<button className={toolTab === "color" ? "on" : ""} onClick={() => setToolTab("color")}>{ts.tabColor ?? "着色"}</button>
					</nav>
					<span className="cc-flex" />
					{editing ? (
						<>
							<button className={`button sm play ${playing ? "on" : ""}`} onClick={() => (playing ? stopPlayback() : startPlayback())} title={ts.playFromCursor ?? "播放（空格）· 从光标小节起；Ctrl+Space 从头"}>{playing ? "⏹" : "▶"}</button>
							<select value={speed} onChange={e => onSpeedChange(Number(e.target.value))} title={ts.speedLabel ?? "速度"}>
								{[0.5, 0.75, 1, 1.25, 1.5].map(x => <option key={x} value={x}>{x}×</option>)}
							</select>
							<label className="cc-iconbtn" title={ts.metronome ?? "节拍器"}><input type="checkbox" checked={metronome} onChange={e => setMetronome(e.target.checked)} />🔔</label>
							<span className="cc-sep" />
							<button className="button sm" onClick={undo} title={ts.undo ?? "撤销 (Ctrl+Z)"}>↩</button>
							<button className="button sm" onClick={redo} title={ts.redo ?? "重做 (Ctrl+Shift+Z)"}>↪</button>
							<button className="button sm accent" onClick={makeClip} title={ts.makeClipTitle ?? "整曲生成指板动图"}>🎬 {ts.makeClip ?? "生成动图"}</button>
							<span className="cc-more-wrap">
								<button className="button sm" onClick={() => setMenuOpen(v => !v)} title={ts.more ?? "更多"}>⋯</button>
								{menuOpen ? (
									<div className="cc-menu" onClick={() => setMenuOpen(false)}>
										<label className="cc-menu-item">{ts.songList ?? "歌曲"}
											<select value={currentId || ""} onClick={e => e.stopPropagation()} onChange={e => { openChart(e.target.value); }}>
												{charts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
											</select>
										</label>
										<button className="cc-menu-item" onClick={() => {
											const base = ts.newSong ?? "新歌";
											const used = charts.filter(c => (c.name || "").startsWith(base)).length;
											const sn = createSong(used ? `${base} ${used + 1}` : base);
											const saved = saveChart(sn);
											clearHistory();
											setCharts(loadCharts());
											setSong(sn);
											setCurrentId(saved.id);
											setToolTab("chord");
										}}>＋ {ts.newSong ?? "新歌"}</button>
										<button className="cc-menu-item danger" onClick={() => {
											setMenuOpen(false);
											setDialog({
												type: "confirm",
												title: ts.delSong ?? "删除这首歌",
												text: ts.delConfirm ?? "删除这首歌？（不可撤销）",
												onOk: () => {
													clearHistory();
													deleteChart(song.id);
													const rest = loadCharts();
													setCharts(rest);
													setSong(rest[0] || createSong("第一首歌"));
													setCurrentId(rest[0]?.id ?? null);
												}
											});
										}}>✕ {ts.delSong ?? "删除这首歌"}</button>
										<div className="cc-menu-sep" />
										<button className={`cc-menu-item ${song.display === "name" ? "on" : ""}`} onClick={() => setSong(s0 => ({ ...s0, display: s0.display === "degree" ? "name" : "degree" }))}>
											{ts.displayToggle ?? "级数 ⇄ 音名"}：{song.display === "degree" ? "1/6m" : "C/Am"}
										</button>
										<label className="cc-menu-item">{ts.transpose ?? "移调看谱"}
											<select value={transposeRoot ?? song.key.root} onClick={e => e.stopPropagation()}
												onChange={e => setTransposeRoot(Number(e.target.value) === song.key.root ? null : Number(e.target.value))}>
												{PC_KEY.map((k, pc) => <option key={pc} value={pc}>{k}</option>)}
											</select>
										</label>
										<div className="cc-menu-sep" />
										<button className="cc-menu-item" onClick={() => fileRef.current?.click()}>⇪ XML {ts.importXml ?? "导入"}</button>
										<button className="cc-menu-item" onClick={doExportXml}>⇩ XML {ts.export ?? "导出"}</button>
									</div>
								) : null}
							</span>
							<input ref={fileRef} type="file" accept=".musicxml,.xml" style={{ display: "none" }} onChange={doImportXml} />
						</>
					) : null}
				</div>

				{editing ? (
				<div className="cc-tools-row">
					{toolTab === "chord" ? (
						<div className="cc-freqbar">
							{frequentChords.map((c, i) => {
								const parts = chordParts(c, "degree", viewKey);
								return (
									<button key={i} className="cc-freq-chord" title={formatName(c, viewKey)} onClick={() => {
										typeRef.current = { t: Date.now(), mode: "degree", sub: null, lastKind: "mod" };
										patchCurrentUnit({ kind: "chord", chord: { ...c } });
									}}>
										<span>{parts.main}</span>
										{parts.sub ? <small>{parts.sub}</small> : null}
									</button>
								);
							})}
							<button className="cc-freq-tool" title={ts.holdHint ?? "延音（-）"} onClick={() => { patchCurrentUnit({ kind: "hold" }); moveCursor(0, 1); }}>—</button>
							<button className="cc-freq-tool" title={ts.restHint ?? "休止（0）"} onClick={() => { patchCurrentUnit({ kind: "rest" }); moveCursor(0, 1); }}>0</button>
							<span className="cc-sep" />
							<button className="cc-freq-tool" title={ts.addRow ?? "新增一行"} onClick={addRow}>＋<small>{ts.rowLabel ?? "一行"}</small></button>
						</div>
					) : toolTab === "measure" ? (
						<div className="cc-measuretools">
							<span className="cc-tools-label">M{(song.measures[cursor.mi] ? cursor.mi + 1 : "-")}</span>
							<button className="button sm" onClick={() => addMeasure(cursor.mi)}>＋ {ts.addMeasure ?? "后插小节"}</button>
							<button className="button sm" onClick={() => duplicateMeasure(cursor.mi)}>⧉ {ts.dupMeasure ?? "复制"}</button>
							<button className="button sm danger" onClick={() => removeMeasure(cursor.mi)} disabled={song.measures.length <= 1}>✕ {ts.delMeasure ?? "删除"}</button>
							<span className="cc-sep" />
							<select value={song.measures[cursor.mi]?.endBar || "single"} onChange={e => patchMeasure(cursor.mi, x => ({ ...x, endBar: e.target.value }))} title={ts.barlineLabel ?? "小节线"}>
								{END_BARS.map(b => <option key={b.v} value={b.v}>{b.name}</option>)}
							</select>
							<label className="cc-iconbtn" title={ts.repeatStart ?? "反复开始"}>
								<input type="checkbox" checked={!!song.measures[cursor.mi]?.repeatStart} onChange={e => patchMeasure(cursor.mi, x => ({ ...x, repeatStart: e.target.checked }))} />‖:
							</label>
							<select value={song.measures[cursor.mi]?.house || "0"} onChange={e => patchMeasure(cursor.mi, x => ({ ...x, house: e.target.value === "0" ? null : Number(e.target.value) }))} title={ts.houseLabel ?? "跳房子"}>
								<option value="0">{ts.houseNone ?? "无房子"}</option>
								<option value="1">1.</option>
								<option value="2">2.</option>
							</select>
							<button className="button sm" onClick={() => promptSection(cursor.mi)}>¶ {ts.sectionBtn ?? "段落"}</button>
							<span className="cc-sep" />
							<label className="cc-field">{ts.keyChange ?? "转调"}
								<select value={song.measures[cursor.mi]?.keyRoot ?? ""} onChange={e => patchMeasure(cursor.mi, x => ({ ...x, keyRoot: e.target.value === "" ? null : Number(e.target.value), keyMinor: e.target.value === "" ? undefined : song.key.minor }))} title={ts.keyChangeTip ?? "从该小节起转调（播放/音名/按法随之换调）"}>
									<option value="">{ts.none ?? "无"}</option>
									{PC_KEY.map((k, pc) => <option key={pc} value={pc}>1 = {k}</option>)}
								</select>
							</label>
						</div>
					) : toolTab === "text" ? (
						<div className="cc-measuretools">
							<span className="cc-tools-label">M{(song.measures[cursor.mi] ? cursor.mi + 1 : "-")}</span>
							<button className="button sm" onClick={() => promptSection(cursor.mi)}>¶ {ts.sectionBtn ?? "段落标记"}</button>
							<input className="cc-tools-lyrics" value={song.measures[cursor.mi]?.lyrics || ""} key={`ly-${cursor.mi}`}
								placeholder={ts.lyricsPh ?? "歌词（空格对齐）"} title={ts.lyricsFor ?? "当前小节歌词"}
								onChange={e => patchMeasure(cursor.mi, x => ({ ...x, lyrics: e.target.value }))} />
						</div>
					) : toolTab === "color" ? (
						<div className="cc-measuretools">
							<span className="cc-tools-label">M{(song.measures[cursor.mi] ? cursor.mi + 1 : "-")}</span>
							<span className="cc-tools-label2">{ts.tintLabel ?? "小节标色"}</span>
							{Object.entries(TINTS).map(([k, v]) => (
								<button key={k} className={`cc-tint ${k} ${(song.measures[cursor.mi]?.tint || "") === k ? "on" : ""}`}
									title={v.name} onClick={() => patchMeasure(cursor.mi, x => ({ ...x, tint: k }))} />
							))}
							<button className="button sm" onClick={() => patchMeasure(cursor.mi, x => ({ ...x, tint: null }))}>{ts.tintClear ?? "清除"}</button>
						</div>
					) : (
						<div className="cc-tools-na">{ts.tabNA ?? "和弦谱无此类工具（8pu 的简谱/旋律功能页）"}</div>
					)}
				</div>
				) : null}
			</header>

			{!editing ? (
				<div className="cc-preview-bar">
					<nav className="cc-preview-tabs">
						<button className={viewTab === "text" ? "on" : ""} onClick={() => setViewTab("text")}>{ts.viewText ?? "文本谱"}</button>
						<button className={viewTab === "dynamic" ? "on" : ""} onClick={() => setViewTab("dynamic")}>{ts.viewDynamic ?? "动态谱"}</button>
					</nav>
					<span className="cc-flex" />
						<button className="button sm" onClick={async () => {
							try { await navigator.clipboard.writeText(exportMusicXml(song)); showToast(ts.shared ?? "乐谱 XML 已复制到剪贴板"); }
							catch (e) { doExportXml(); }
						}}>🔗 {ts.shareBtn ?? "分享"}</button>
					<button className="button sm" onClick={doExportXml}>⇩ {ts.exportBtn ?? "导出"}</button>
				</div>
			) : null}

			{!editing && viewTab === "dynamic" ? (
				<div className="cc-dynview">
					<div className="cc-dyn-stage">
						{stageSnapshot ? (
							<>
								<div className="cc-stage-label"><b>{stageSign}</b>
									<span className="cc-stage-pos">M{(stagePos.mi) + 1} · {(ts.beatLabel ?? "拍")}{(stagePos.si) + 1}</span>
								</div>
								<ScoreBoard snapshot={stageSnapshot} />
							</>
						) : <div className="cc-stage-empty">{ts.stageEmpty ?? "选中或播放和弦，这里显示指板按法"}</div>}
					</div>
					<div className="cc-dyn-controls">
						<button className={`button ${playing ? "on" : ""}`} onClick={() => (playing ? stopPlayback() : startPlayback())}>{playing ? "⏹ " + (ts.stop ?? "停止") : "▶ " + (ts.playAll ?? "播放")}</button>
						<select value={speed} onChange={e => onSpeedChange(Number(e.target.value))} title={ts.speedLabel ?? "速度"}>
							{[0.5, 0.75, 1, 1.25, 1.5].map(x => <option key={x} value={x}>{x}×</option>)}
						</select>
						<label className="cc-iconbtn" title={ts.metronome ?? "节拍器"}><input type="checkbox" checked={metronome} onChange={e => setMetronome(e.target.checked)} />🔔</label>
					</div>
					<div className="cc-dyn-strip">
						{song.measures.map((m, mi) => (m.slots || []).map((sl, si) => (sl.split || [sl]).map((u, h) => {
							if (u.kind !== "chord" || !u.chord) return null;
							const isCur = playing && playing.mi === mi && playing.si === si && (playing.half ?? null) === (sl.split ? h : null);
							return (
								<button key={`${mi}-${si}-${h}`} className={`cc-dyn-chord ${isCur ? "cur" : ""}`}
									onClick={() => { setCursor({ mi, si, half: sl.split ? h : null }); }}>
									{formatChordDyn(u.chord, mi)}
								</button>
							);
						})))}
					</div>
				</div>
			) : null}

			<div className="cc-body" style={!editing && viewTab === "dynamic" ? { display: "none" } : undefined}>
				<div className="cc-score" ref={scoreRef}>
					<div className="cc-score-head">
						<div className="cc-score-meta">
							<label className="cc-meta">1 =
								<select value={song.key.root} disabled={!editing} onChange={e => setSong(s => ({ ...s, key: { ...s.key, root: Number(e.target.value) } }))}>
									{PC_KEY.map((k, pc) => <option key={pc} value={pc}>{k}</option>)}
								</select>
								<input type="checkbox" checked={song.key.minor} disabled={!editing} onChange={e => setSong(s => ({ ...s, key: { ...s.key, minor: e.target.checked } }))} title={ts.minor ?? "小调"} />m
							</label>
							<label className="cc-meta">
								<select value={song.timeSig} disabled={!editing} onChange={e => setTimeSig(Number(e.target.value))}>
									{[2, 3, 4, 6].map(b => <option key={b} value={b}>{b}/4</option>)}
								</select>
							</label>
							<label className="cc-meta">♩=
								<input type="number" min="30" max="240" value={song.bpm} disabled={!editing} onChange={e => setSong(s => ({ ...s, bpm: Math.max(30, Math.min(240, Number(e.target.value) || 72)) }))} />
							</label>
						</div>
						<input className="cc-score-title" value={song.name} readOnly={!editing} onChange={e => setSong(s => ({ ...s, name: e.target.value }))} />
					</div>

					{editing && song.measures.every(m => m.slots.every(sl => sl.kind !== "chord" || (sl.split && sl.split.every(u => u.kind !== "chord")))) ? (
						<div className="cc-guide">{ts.guide ?? "点击任意拍格（虚线框）选中，再按 1-7 输入级数和弦（1=主 4=下属 5=属，6=小调感）；右侧面板可加 m/7/转位/节奏型"}</div>
					) : null}

					<div className="cc-lines">
						{rows.map((row, ri) => {
							const first = ri * per;
							return (
								<div className="cc-line" key={ri}>
									<div className="cc-line-head">
										<span className="cc-line-no">{first + 1}</span>
									</div>
									<div className="cc-line-cells">
										{row.map((m, k) => cellView(m, first + k))}
										{editing && ri === rows.length - 1 ? (
											<button className="cc-add-cell" title={ts.addRow ?? "新增一行"} onClick={addRow}>＋</button>
										) : null}
									</div>
								</div>
							);
						})}
					</div>

					{popupOpen && popupPos ? (
						<div className="cc-cp-wrap" ref={popupRef} style={popupPos.bottom != null ? { left: popupPos.left, bottom: popupPos.bottom } : { left: popupPos.left, top: popupPos.top }}>
							<ChordPopup song={song} viewKey={keyAt(cursor.mi)} unit={currentUnit} typedHint={typedHint}
								canSplit={canSplitCurrent} onPatchUnit={patchUnitFromPanel} onSetKind={onPanelSetKind}
								onToggleSplit={toggleSplit} onClose={() => setPopupOpen(false)} t={t}
								tab={cpTab} onTab={setCpTab} />
						</div>
					) : null}

					{editing ? (
						<div className="cc-score-foot">
							<button className="button sm" onClick={addRow}>＋ {ts.addRow ?? "新增一行"}</button>
							<span className="cc-hint">{ts.kbdHint ?? "1-7 级数 · 0 休止 · - 延音 · Enter 反拍拆分 · ⌫ 清除 · 方向键移动 · 空格播放"}</span>
						</div>
					) : null}
				</div>

			</div>

			<button className={`cc-stage-fab ${stageOpen ? "" : "collapsed"}`} onClick={() => setStageOpen(v => !v)}
				title={stageOpen ? (ts.stageHide ?? "收起配图") : (ts.stageShow ?? "配图")}>
				{stageOpen ? "▾" : "◂"} 🖼 {song.image ? (ts.imageLabel ?? "配图") : (ts.attachImage ?? "添加配图")}
			</button>
			{stageOpen ? (
				<div className="cc-stage-float cc-attach-slot">
					{song.image ? (
						<>
							<div className="cc-attach-view" onClick={() => { if (editing) setAttachOpen(true); }}>
								<AttachView song={song} viewKey={viewKey} />
							</div>
							{editing ? (
								<div className="cc-attach-tools">
									<button className="button sm" onClick={() => setAttachOpen(true)}>{ts.changeImage ?? "编辑"}</button>
									<button className="button sm danger" onClick={() => setSong(s0 => ({ ...s0, image: null }))}>{ts.removeImage ?? "移除"}</button>
								</div>
							) : null}
						</>
					) : (
						editing ? (
							<button className="cc-attach-add" onClick={() => setAttachOpen(true)}>
								＋ {ts.attachImage ?? "添加配图"}
								<small>{ts.imageHint ?? "静态和弦按法 / 指板堆动图"}</small>
							</button>
						) : (
							<div className="cc-stage-empty">{ts.noImage ?? "未设置配图"}</div>
						)
					)}
				</div>
			) : null}

			{attachOpen ? (
				<AttachPicker value={song.image}
					onPickStatic={() => {
						try { sessionStorage.setItem("fretboard-attach-edit", JSON.stringify({ songId: song.id, kind: "board", frame: song.image?.kind === "board" ? song.image.frame : null })); } catch (e) { /* 忽略 */ }
						window.location.hash = "#/";
					}}
					onPickClip={() => {
						const cid = song.image?.kind === "clip" ? song.image.id : null;
						try { sessionStorage.setItem("fretboard-attach-edit", JSON.stringify({ songId: song.id, kind: "clip", clipId: cid })); } catch (e) { /* 忽略 */ }
						window.location.hash = cid ? `#/dynamic?c=${cid}` : "#/dynamic";
					}}
					onRemove={() => { setSong(s0 => ({ ...s0, image: null })); setAttachOpen(false); }}
					onClose={() => setAttachOpen(false)} t={t} />
			) : null}

			<div className="cc-build-ver" title="界面版本（刷新后应为此版本）">v22</div>

			{editing ? <PianoBar onPickRoot={(name) => {
				const chord = chordFromNameToken(name, viewKey);
				if (chord) {
					typeRef.current = { t: Date.now(), mode: "degree", sub: null, lastKind: "mod" };
					setTypedHint("");
					patchCurrentUnit({ kind: "chord", chord: { ...chord, quality: "", bass: null } });
				}
			}} t={t} /> : null}

			{dialog ? (
				<div className="cc-modal-mask" onMouseDown={e => { if (e.target === e.currentTarget) setDialog(null); }}>
					<div className="cc-modal cc-dialog">
						<div className="cc-modal-head">
							<span className="cc-modal-title">{dialog.title}</span>
							<button className="cc-modal-x" onClick={() => setDialog(null)}>✕</button>
						</div>
						<div className="cc-modal-body">
							{dialog.type === "prompt" ? (
								<input ref={dialogInputRef} autoFocus className="cc-dialog-input" defaultValue={dialog.value || ""}
									placeholder={dialog.label}
									onKeyDown={e => {
										if (e.key === "Enter") {
											e.preventDefault(); e.stopPropagation();
											dialog.onOk?.(e.target.value);
											setDialog(null);
										}
										if (e.key === "Escape") { e.stopPropagation(); setDialog(null); }
									}} />
							) : <div className="cc-dialog-text">{dialog.text}</div>}
						</div>
						<div className="cc-modal-foot">
							{dialog.type !== "alert" ? <button className="button sm" onClick={() => setDialog(null)}>{ts.cancel ?? "取消"}</button> : null}
							<button className={`button sm ${dialog.type === "confirm" ? "danger" : "accent"}`}
								onClick={() => {
									dialog.onOk?.(dialog.type === "prompt" ? (dialogInputRef.current ? dialogInputRef.current.value : "") : undefined);
									setDialog(null);
								}}>
								{ts.ok ?? "确定"}
							</button>
						</div>
					</div>
				</div>
			) : null}
			{toast ? <Toast key={toast.key} message={toast.msg} onClose={() => setToast(null)} /> : null}
		</div>
	);
}
