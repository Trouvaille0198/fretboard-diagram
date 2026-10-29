import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n";
import { ScoreBoard } from "./ScorePieces";
import { ChordPopup } from "./ChordPopup";
import { FigView } from "./ChordFig.jsx";
import { FigBoardEditor } from "./FigBoardEditor.jsx";
import { Toast } from "./Toast";
import audioService from "../services/audioService";

// 指法小图尺寸档位（汇总行可切）
const FIG_SIZES = [112, 144, 176];
import { chordParts, formatInline, formatName, formatDegree, resolvedQuality, diatonicSeventh, chordFromNameToken } from "../utils/chordLib";
import { ChordSign } from "./ChordSign";
import {
	loadCharts, saveChart, deleteChart, createSong, createMeasure, resizeMeasure, insertBeatInSong, deleteBeatInSong
} from "../utils/chordChartModel";
import { buildPlayPlan } from "../utils/chartPlayback";
import { remoteIsNewer } from "../utils/syncEngine";
import { buildSongClip, stageFrame } from "../utils/chartFrames";
import { exportMusicXml, importMusicXml } from "../utils/musicxmlChart";
import { packChart, unpackChartBundle, chartShareCode, isChartPack } from "../utils/chartPack";
import { saveClip } from "../utils/clipModel";

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

// 主音选择：按钮 + 应用内 12 音网格（原生 select 的弹出列表走浏览器默认白底，不跟深色主题；
// 网格竖排在按钮下方、不走绝对定位——小节工具行是 overflow-x 容器，绝对弹层会被裁）
function KeyRootPicker({ cur, minor, ts, onPick }) {
	const [open, setOpen] = useState(false);
	const boxRef = useRef(null);
	useEffect(() => {
		if (!open) return;
		const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
		const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
	}, [open]);
	return (
		<span className="cc-key-picker" ref={boxRef}>
			<button type="button" className={`cc-key-root-btn${open ? " on" : ""}`}
				title={ts.keyRootTip ?? "主音：点开选 12 个音（♭/♯ 相对升降）"}
				onClick={() => setOpen(v => !v)}>
				<span>1 =</span><b>{PC_KEY[cur]}{minor ? "m" : ""}</b><i>▾</i>
			</button>
			{open ? (
				<span className="cc-key-menu" role="listbox">
					{PC_KEY.map((k, pc) => (
						<button key={pc} type="button" role="option" aria-selected={pc === cur} className={pc === cur ? "on" : ""}
							onClick={() => { onPick(pc); setOpen(false); }}>{k}</button>
					))}
				</span>
			) : null}
		</span>
	);
}

// 和弦谱页（8pu 式和弦谱复刻）：格子谱面 + 键盘编辑 + 播放 + 移调 + MusicXML + 一键动图
export function ChordChartView({ songId }) {
	const { t } = useLanguage();
	const ts = t?.chords ?? {};

	const routedId = songId || null;
	const [charts, setCharts] = useState(() => loadCharts());
	const [currentId, setCurrentId] = useState(() => routedId ?? (loadCharts()[0] || {}).id ?? null);
	const [song, setSong] = useState(() => {
		const list = loadCharts();
		return (routedId && list.find(c => c.id === routedId)) || list[0] || createSong(ts.firstSong ?? "第一首歌");
	});
	// 路由 id 不存在（被删/链错）：退回曲目列表页
	useEffect(() => {
		if (routedId && !loadCharts().some(c => c.id === routedId)) window.location.replace('#/chords');
	}, [routedId]);
	const [cursor, setCursor] = useState({ mi: 0, si: 0, half: null });
	const [playing, setPlaying] = useState(null); // { mi, si, half } 当前发声槽
	const [metronome, setMetronome] = useState(true);
	const [speed, setSpeed] = useState(1);
	const [menuOpen, setMenuOpen] = useState(false); // 工具行「更多」菜单
	const [settingsOpen, setSettingsOpen] = useState(false); // 谱头「设置」面板
	// 菜单（⚙设置 / ⋯更多 / 小节右键）：点击任何菜单外区域即关闭
	useEffect(() => {
		const onDocDown = (e) => {
			if (e.target.closest(".cc-settings, .cc-settings-btn")) return;
			if (e.target.closest(".cc-menu, .cc-more-btn")) return;
			if (e.target.closest(".cc-mmenu")) return;
			setSettingsOpen(false); setMenuOpen(false); setCellMenu(null);
		};
		document.addEventListener("mousedown", onDocDown);
		return () => document.removeEventListener("mousedown", onDocDown);
	}, []);
	const [toolTab, setToolTab] = useState("chord"); // 工具栏页签：和弦 | 小节
	const [viewTab, setViewTab] = useState("text"); // 查看：文本谱 | 动态谱
	// 预览记谱形式（编辑态恒为数字功能谱）：number=1-7 | roman=I/vi | name=Am/Dmaj7
	const [previewDisplay, setPreviewDisplay] = useState(song.display === "name" ? "name" : "number");
	// Q 复制模式：选相邻小节段 → Ctrl+C 复制 → Ctrl+V 整段插入到光标小节之后
	const [copyMode, setCopyMode] = useState(false);
	const [sel, setSel] = useState({ anchor: null, end: null }); // 选区（小节索引；end=null 表示还没成段）
	const [copiedCount, setCopiedCount] = useState(0);
	const [cpTab, setCpTab] = useState("chord"); // 弹层页签（C/B/R 切换）
	const [cellMenu, setCellMenu] = useState(null);
	// 菜单防截屏：任何下拉（⚙/⋯/小节菜单）打开后钳回视口内——
	// 移动端工具栏可能横向溢出，菜单 right:0 对齐的是溢出祖先的右缘而非屏幕
	useLayoutEffect(() => {
		const el = document.querySelector(".cc-menu, .cc-mmenu, .cc-settings");
		if (!el) { return; }
		el.style.transform = "";
		const r = el.getBoundingClientRect();
		let dx = 0, dy = 0;
		if (r.right > innerWidth - 4) dx = innerWidth - 4 - r.right;
		if (r.left + dx < 4) dx = 4 - r.left;
		if (r.bottom > innerHeight - 4) dy = innerHeight - 4 - r.bottom;
		if (r.top + dy < 4) dy = 4 - r.top;
		if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`;
	}, [menuOpen, cellMenu, settingsOpen]);

 // 打开的小节菜单 mi
	const [popupOpen, setPopupOpen] = useState(false); // 就地和弦面板
	const [popupPos, setPopupPos] = useState(null);
	const [typedHint, setTypedHint] = useState(""); // 键盘输入中的和弦串（面板头显示）
	const [toast, setToast] = useState(null); // { msg, key } 应用内轻提示（替代 alert）
	// 应用内对话框（替代原生 prompt/confirm/alert）：{ type:'prompt'|'confirm'|'alert', title, label?, value?, text?, onOk }
	const [dialog, setDialog] = useState(null);

	const dialogInputRef = useRef(null);
	const showToast = (msg) => setToast({ msg, key: Date.now() });
	const clipRef = useRef(null); // Ctrl+C/V 剪贴板：{type:'chord',chord} | {type:'measure',slots}
	const dragRef = useRef(false); // 复制模式拖选中
	const hoverBeatRef = useRef(null); // 鼠标悬停的拍子：hover + Backspace 直接清那个拍，不必先点选它
	const typeRef = useRef({ t: 0, mode: null, sub: null }); // 键入状态：mode='degree'|'name'，sub='bass'

	useEffect(() => {
		if (!popupOpen) return;
		const close = (e) => { if (!e.target.closest(".cc-cp, .cc-beat, .cc-mmenu")) setPopupOpen(false); };
		document.addEventListener("mousedown", close);
		return () => document.removeEventListener("mousedown", close);
	}, [popupOpen]);

	// 就地面板定位：以视口为准先算弹层顶边，再换算回谱面坐标（弹层 absolute 于谱面，随内容滚动）。
	// 下方放得下朝下，上方放得下才朝上；两边都放不下选空间大的一边并贴边钳制——绝不开出屏幕。
	useEffect(() => {
		const place = () => {
			if (!popupOpen) { setPopupPos(null); return; }
			const score = scoreRef.current;
			const el = document.querySelector(".cc-beat.cur");
			if (!score || !el) { setPopupPos(null); return; }
			const sr = score.getBoundingClientRect();
			const r = el.getBoundingClientRect();
			const ph = popupRef.current ? popupRef.current.offsetHeight : 320;
			const pw = popupRef.current ? popupRef.current.offsetWidth : 404;
			const topInset = 60; // 应用顶栏高度：弹层不许钻到它底下
			const gap = 8;
			const spaceBelow = window.innerHeight - gap - r.bottom;
			const spaceAbove = r.top - topInset - gap;
			const openUp = spaceBelow >= ph ? false : (spaceAbove >= ph ? true : spaceAbove > spaceBelow);
			const left = Math.max(4, Math.min(r.left - sr.left, sr.width - pw - 8));
			let vpTop = openUp ? Math.max(topInset + gap, r.top - gap - ph)
				: Math.min(r.bottom + gap, window.innerHeight - gap - ph);
			vpTop = Math.max(topInset + gap, Math.min(vpTop, window.innerHeight - gap - ph));
			const top = Math.round(vpTop - sr.top);
			setPopupPos(prev => (prev && prev.left === left && prev.top === top) ? prev : { left, top });
		};
		place();
		const id = requestAnimationFrame(place);
		return () => cancelAnimationFrame(id);
	}, [popupOpen, cursor]); // 故意不依赖 song：编辑内容时菜单位置冻结，点了什么都不要动

	// 复制模式：松手结束拖选
	useEffect(() => {
		if (!copyMode) return;
		const up = () => { dragRef.current = false; };
		window.addEventListener("mouseup", up);
		return () => window.removeEventListener("mouseup", up);
	}, [copyMode]);

	useEffect(() => {
		if (cellMenu === null) return;
		const close = (e) => { if (!e.target.closest(".cc-mmenu")) setCellMenu(null); };
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

	// 指法小图(黑点格)全局展示设置:方向/度数/尺寸/模式;localStorage 持久化
	// 尺寸档位 112/144/176；旧档(88/104/128)读入时升级到最近的新档
	// 模式默认"悬浮"（谱面紧凑，hover 拍看大图；内嵌会把整行谱面撑高）。
	// figV 2：一次性把 v48 时代默认的 inline 迁到 hover，之后用户自己选的 inline 不再覆盖
	const [figOpts, setFigOpts] = useState(() => {
		try {
			const v = JSON.parse(localStorage.getItem("fretboard-figopts") || "null");
			if (v && v.orientation) {
				if (!FIG_SIZES.includes(v.size)) v.size = v.size <= 88 ? FIG_SIZES[0] : (v.size <= 104 ? FIG_SIZES[1] : FIG_SIZES[2]);
				if (v.figV !== 2) { v.mode = "hover"; v.figV = 2; }
				else if (v.mode !== "inline" && v.mode !== "hover") v.mode = "hover";
				return v;
			}
		} catch (e) { /* 忽略 */ }
		return { orientation: "v", degMode: "chord", size: 144, mode: "hover", figV: 2 };
	});
	useEffect(() => { try { localStorage.setItem("fretboard-figopts", JSON.stringify(figOpts)); } catch (e) { /* 忽略 */ } }, [figOpts]);

	const typeTimerRef = useRef(null);
	const scoreRef = useRef(null);

	// 每行小节数自适应谱面宽度：按拍数估小节最小宽，宽屏多放几节、窄屏少放——而不是把固定 4 节拉到失真
	const [autoPer, setAutoPer] = useState(song.rowsPerLine || 4);
	useEffect(() => {
		const el = scoreRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const calc = () => {
			const slotsPer = (songRef.current.timeSig || 4) * 2; // 每小节拍格数（半拍制）
			const minMeasure = slotsPer * 40 + 40; // 单小节最小宽（拍格 ~40px + 小节呼吸位）
			const per = Math.max(2, Math.min(8, Math.floor(el.clientWidth / minMeasure)));
			setAutoPer(p => (p === per ? p : per));
		};
		calc();
		const ro = new ResizeObserver(calc);
		ro.observe(el);
		return () => ro.disconnect();
	}, [song.timeSig]);
	const popupRef = useRef(null);
	const timersRef = useRef([]);
	const saveTimerRef = useRef(null);

	const editing = toolTab !== "preview"; // 预览页签 = 查看态；其余页签 = 编辑（tab 栏永远不变）
	const viewKey = { root: song.key?.root ?? 0, minor: !!song.key?.minor };
	// 生效调：小节级转调标记（keyRoot）覆盖到该小节起；全局移调叠加 —— 播放/按法/音名显示都用它
	const keyAt = (mi) => {
		let key = { root: song.key?.root ?? 0, minor: !!song.key?.minor };
		for (let i = 0; i <= mi && song.measures.length; i++) {
			const m = song.measures[i];
			if (m && m.keyRoot != null) key = { root: m.keyRoot, minor: !!m.keyMinor };
		}
		return key;
	};
	const keyAtFn = (mi) => keyAt(typeof mi === "number" ? mi : cursor.mi);
	const songRef = useRef(song);
	songRef.current = song;
	// 落盘基线：savedAtRef = 本地最后一次落盘/采纳的版本号（updatedAt）；dirtyRef = 内存里有未落盘的编辑。
	// song 里的 updatedAt 只在 loadCharts 时来自磁盘，本地保存不会回写它——拿它当"谁更新"的判据会误判：
	// 保存过一次之后磁盘版本号永远比内存新，卸载冲刷会以为"远端更新过"而丢掉最后 800ms 的编辑。
	const savedAtRef = useRef(song.updatedAt || 0);
	const dirtyRef = useRef(false);
	// 立即落盘（并同步落盘基线）：改名等"就该瞬间生效"的改动走这里
	const persistNow = () => {
		const saved = saveChart(songRef.current);
		dirtyRef.current = false;
		savedAtRef.current = saved.updatedAt || Date.now();
		return saved;
	};

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
		const onSynced = () => {
			setCharts(loadCharts());
			// 实时跟进：存储里的版本比内存新（别的浏览器改了这首）且本页没有未落盘编辑 → 采纳远端
			if (dirtyRef.current) return;
			const latest = loadCharts().find(c => c.id === songRef.current.id);
			if (remoteIsNewer(latest, songRef.current)) {
				suppressHistoryRef.current = true; // 采纳远端不算一步撤销
				adoptedRef.current = latest; // 这版是云端来的，别原样回存
				dirtyRef.current = false;
				setSong(latest);
				clearHistory(); // 远端结构与本地撤销栈不再对应
			}
		};
		window.addEventListener("fretboard:charts-synced", onSynced);
		return () => window.removeEventListener("fretboard:charts-synced", onSynced);
	}, []);

	// 正在编辑的曲被远端删除：退出到列表，并禁止卸载冲刷把它存回来（否则删除被本地复活）
	const deletedByRemoteRef = useRef(false);
	useEffect(() => {
		const onDeleted = (e) => {
			const d = e.detail || {};
			if (d.id && d.id === songRef.current.id) {
				deletedByRemoteRef.current = true;
				clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
				dirtyRef.current = false; // 远端已删：内存里的版本不再算"待保存"
				window.location.hash = "#/chords";
			}
		};
		window.addEventListener("fretboard:charts-deleted", onDeleted);
		return () => window.removeEventListener("fretboard:charts-deleted", onDeleted);
	}, []);

	useEffect(() => {
		const onStorage = (e) => {
			if (e.key !== "fretboard-chordcharts") return;
			if (dirtyRef.current) return; // 本页还有未落盘的编辑：先让本地保存赢，下次再对齐远端
			try {
				const latest = loadCharts().find(c => c.id === songRef.current.id);
				if (remoteIsNewer(latest, songRef.current)) {
					adoptedRef.current = latest; // 采纳来的版本别再原样回存
					clearHistory(); // 采纳远端后旧撤销栈失效
					setSong(latest);
				}
			} catch (err) { /* 忽略 */ }
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	// 下发确认（cloud-ack）后把新版本号领回内存 song。不领的话内存 rev 停在旧值，
	// 下一次保存带过期 baseRev —— 服务端判"基于旧版本修改"给 409，同页连续编辑
	// 全部自己跟自己冲突，炸出一串"冲突副本"（内容其实只有自己一个人在改）。
	useEffect(() => {
		const onAck = (e) => {
			const d = e.detail || {};
			if (d.table !== "charts" || !d.item || d.item.id !== songRef.current.id) return;
			const nr = Number(d.item.rev) || 0;
			if (nr <= (Number(songRef.current.rev) || 0)) return;
			const next = { ...songRef.current, rev: nr };
			adoptedRef.current = next;      // 只是版本号前进，不算编辑：不触发自动保存
			suppressHistoryRef.current = true; // 也不进撤销栈
			setSong(next);
		};
		window.addEventListener("fretboard:cloud-ack", onAck);
		return () => window.removeEventListener("fretboard:cloud-ack", onAck);
	}, []);

	// 谱尾自动留空位：最后一小节里有和弦图就自动补一个空小节——输入到谱尾永远有地方继续。
	// 刚发生过"小节数变少"的这一次变化不补（用户删掉谱尾空小节/删除一拍缩掉末节的意图要尊重，
	// 不能转眼又长回来）；之后任何新编辑落进末小节，空位照常补出。
	const prevMCountRef = useRef(song.measures.length);
	useEffect(() => {
		const n = song.measures.length;
		const shrank = n < prevMCountRef.current;
		prevMCountRef.current = n;
		if (shrank || !editing) return;
		const last = song.measures[n - 1];
		if (!last) return;
		const hasFig = last.slots.some(sl => sl.split ? sl.split.some(u => u && u.kind === "chord") : sl.kind === "chord");
		if (!hasFig) return;
		setSong(s => ({ ...s, measures: [...s.measures, createMeasure(s.timeSig || last.slots.length || 4)] }));
	}, [song, editing]);

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

	// 采纳远端版本时跳过保存：比对对象（StrictMode 双跑 effect 时一次性标志会被吃掉，
	// 第二跑照常保存→广播→采纳→保存…形成无限 PUT 回环；对象比对两次都命中）
	const adoptedRef = useRef(null);
	// 自动保存（防抖）；卸载时冲刷最后 800ms 内的编辑
	useEffect(() => {
		if (song === adoptedRef.current) return;
		dirtyRef.current = true; // 有未落盘的编辑
		clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(() => {
			saveTimerRef.current = null;
			const saved = persistNow();
			setCharts(loadCharts());
			setCurrentId(saved.id);
		}, 800);
		return () => clearTimeout(saveTimerRef.current);
	}, [song]);

	// 防抖窗口防丢：刷新 / 切后台 / 关页前立刻落盘（否则最后 0.8s 的编辑在重开后"被改回"）
	useEffect(() => {
		const flush = () => {
			if (!dirtyRef.current || deletedByRemoteRef.current) return;
			clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
			try { persistNow(); } catch (e) { /* 尽力而为 */ }
		};
		const onVis = () => { if (document.visibilityState === "hidden") flush(); };
		// 换路由（浏览器返回 / 顶栏切换 / 一键动图）时立刻落盘：hash 事件是同步的，
		// 赶在 React 重渲染、目标页读取 localStorage 之前把改动写下去（否则列表读到的是旧值）
		const onHash = () => flush();
		window.addEventListener("beforeunload", flush);
		window.addEventListener("pagehide", flush);
		window.addEventListener("hashchange", onHash);
		document.addEventListener("visibilitychange", onVis);
		return () => {
			window.removeEventListener("beforeunload", flush);
			window.removeEventListener("pagehide", flush);
			window.removeEventListener("hashchange", onHash);
			document.removeEventListener("visibilitychange", onVis);
		};
	}, []);

	useEffect(() => () => {
		timersRef.current.forEach(id => clearTimeout(id));
		audioService.stopAll?.();
		try {
			if (deletedByRemoteRef.current) return; // 远端已删：卸载冲刷不得复活它
			// 有未落盘的编辑 → 必须存（哪怕磁盘版本号更大：那可能是本页自己上次保存留下的，
			// 内存里的 updatedAt 不会跟着刷新，拿它当"远端更新过"的判据会把这批编辑丢掉）
			if (dirtyRef.current) { persistNow(); return; }
			const stored = loadCharts().find(c => c.id === songRef.current.id);
			if (!stored) return; // 磁盘上已被删（别的标签页删的）：不复活
			if (stored.updatedAt >= (savedAtRef.current || 0)) return; // 磁盘已是最新/更新：不用再写一遍
			saveChart(songRef.current);
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
			rememberQuality(patch.chord);
		}
		patchCurrentUnit(patch);
	};

	// 转调步进器：主音下拉 + 大调/小调 + ♭/♯ 相对升降半音 + 清除（回原调）；mi 为空用光标小节
	// 调回到与歌曲原调相同时自动清掉标记，不留"1 = C"这种冗余的同调转调
	const keyStepper = (mi) => {
		const target = mi != null ? mi : cursor.mi;
		const m = song.measures[target] || {};
		const cur = m.keyRoot ?? (song.key?.root ?? 0);
		const minor = m.keyRoot != null ? !!m.keyMinor : !!song.key?.minor;
		const setKey = (root, m2) => patchMeasure(target, x => {
			const sameAsSong = root === (song.key?.root ?? 0) && !!m2 === !!song.key?.minor;
			return { ...x, keyRoot: sameAsSong ? null : root, keyMinor: sameAsSong ? undefined : m2 };
		});
		const setMode = (m2) => { if (!!m2 !== minor) setKey(cur, m2); }; // 点当前调式 = 无操作（不产生空的撤销步）
		return (
			<span className="cc-key-stepper">
				<KeyRootPicker cur={cur} minor={minor} ts={ts} onPick={pc => setKey(pc, minor)} />
				<span className="cc-key-mode" role="group" title={ts.keyModeTip ?? "调式：大调 / 小调（调内和弦与音名随之改变）"}>
					<button type="button" className={!minor ? "on" : ""} onClick={() => setMode(false)}>{ts.keyMajor ?? "大调"}</button>
					<button type="button" className={minor ? "on" : ""} onClick={() => setMode(true)}>{ts.keyMinor ?? "小调"}</button>
				</span>
				<button type="button" title={ts.keyDownSemi ?? "降半音（降调）"} onClick={() => setKey((cur + 11) % 12, minor)}>♭</button>
				<button type="button" title={ts.keyUpSemi ?? "升半音（升调）"} onClick={() => setKey((cur + 1) % 12, minor)}>♯</button>
				{m.keyRoot != null ? (
					<button type="button" className="cc-key-clear" title={ts.keyClear ?? "清除转调（回原调）"} onClick={() => patchMeasure(target, x => ({ ...x, keyRoot: null, keyMinor: undefined }))}>×</button>
				) : null}
			</span>
		);
	};

	// 段落标记（应用内对话框，替代原生 prompt）
	const promptSection = (mi) => setDialog({
		type: "prompt",
		title: ts.sectionBtn ?? "段落标记",
		label: ts.sectionPrompt ?? "段落名（如 主歌1）",
		value: song.measures[mi]?.section || "",
		onOk: (v) => patchMeasure(mi, x => ({ ...x, section: String(v ?? "").trim() || null })),
		onDelete: song.measures[mi]?.section ? () => patchMeasure(mi, x => ({ ...x, section: null })) : null,
	});

	// ============ Q 复制模式（拖选小节段：复制 / 插入 / 删除） ============
	// 选区：按下锚定 → 滑过扩展 → 松手定段；undo 缩短小节后按剩余长度钳制
	const selRange = (() => {
		if (!copyMode || sel.anchor == null) return null;
		const last = song.measures.length - 1;
		const a = Math.min(sel.anchor, sel.end ?? sel.anchor);
		const b = Math.max(sel.anchor, sel.end ?? sel.anchor);
		if (a > last) return null;
		return [a, Math.min(b, last)];
	})();
	const enterCopyMode = () => { setPopupOpen(false); setCellMenu(null); setCopyMode(true); setCopiedCount(0); dragRef.current = false; setSel({ anchor: null, end: null }); };
	const exitCopyMode = () => { setCopyMode(false); dragRef.current = false; setSel({ anchor: null, end: null }); };
	const beginSelDrag = (mi) => { dragRef.current = true; setSel({ anchor: mi, end: null }); };
	const extendSelDrag = (mi) => { if (dragRef.current) setSel(s => (s.anchor == null || s.end === mi) ? s : { ...s, end: mi }); };
	// 删除选区（全删时留一个空小节保底；Ctrl+Z 一步撤销）
	const deleteSelection = () => {
		if (selRange == null) return;
		const [a, b] = selRange;
		const n = b - a + 1;
		setSong(s => (n >= s.measures.length
			? { ...s, measures: [createMeasure(s.timeSig)] }
			: { ...s, measures: s.measures.filter((_, i) => i < a || i > b) }));
		setSel({ anchor: null, end: null });
		setCopiedCount(0);
		setCursor(c => ({ mi: Math.max(0, Math.min(c.mi, song.measures.length - 1 - n)), si: c.si, half: null }));
		showToast((ts.deletedToast ?? "已删除 {n} 小节（Ctrl+Z 可撤销）").replace("{n}", String(n)));
	};
	const copySelection = () => {
		if (sel.anchor == null) return;
		const a = Math.min(sel.anchor, sel.end ?? sel.anchor), b = Math.max(sel.anchor, sel.end ?? sel.anchor);
		clipRef.current = { type: "measures", measures: JSON.parse(JSON.stringify(song.measures.slice(a, b + 1))) };
		setCopiedCount(b - a + 1);
		showToast((ts.copiedToast ?? "已复制 {n} 小节 —— 退出后 Ctrl+V 插入到光标小节之后").replace("{n}", String(b - a + 1)));
	};
	// 整段插入：复制的小节 splice 到光标小节之后（新 id；和弦剪贴板仍写入当前槽）
	const pasteClip = () => {
		const clip = clipRef.current;
		if (!clip) return;
		if (clip.type === "chord") { patchCurrentUnit({ kind: "chord", chord: JSON.parse(JSON.stringify(clip.chord)) }); return; }
		const src = clip.type === "measures" ? clip.measures : [{ ...createMeasure(song.timeSig), slots: clip.slots || [] }];
		const fresh = JSON.parse(JSON.stringify(src)).map(m => ({ ...m, id: createMeasure(song.timeSig).id }));
		setSong(s => { const ms = s.measures.slice(); ms.splice(Math.max(0, cursor.mi) + 1, 0, ...fresh); return { ...s, measures: ms }; });
		if (copyMode) setSel({ anchor: null, end: null }); // 不退出模式：可连续粘贴；清选区防索引漂移
	};

	// ============ 键盘直接键入 ============
	// 度数模式：1-7 起手立即成和弦；900ms 内跟打 m/7/M/6/9/s/d/a 质量、b/# 变音、/低音
	// 音名模式：Shift+A-G 起手，跟打小写/数字补全（如 Am、G7、Bb），超时或落键提交
	const QUALITY_KEYS = { m: "m", 7: "7", M: "maj7", 6: "6", "9": "9", s: "sus4", d: "dim", a: "aug" };

	// 级数默认质量：同度数上次用的质量优先（qualityMemory），否则调内七和弦（默认 7 和弦而非 3 和弦）
	const defaultQualityFor = (degree, mi) => song.qualityMemory?.[String(degree)] ?? diatonicSeventh(degree, 0, keyAt(mi ?? cursor.mi));
	const rememberQuality = (chord, mi) => {
		if (!chord) return;
		const q = chord.quality || resolvedQuality(chord, keyAt(mi ?? cursor.mi));
		setSong(s => (s.qualityMemory?.[String(chord.degree)] === q ? s : { ...s, qualityMemory: { ...(s.qualityMemory || {}), [String(chord.degree)]: q } }));
	};
	const applyTyped = (chord) => {
		if (!chord) return;
		patchCurrentUnit({ kind: "chord", chord });
		rememberQuality(chord);
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

		// 度数起手（立即成和弦，可继续跟打修饰）——默认带调内七和弦/上次记忆的质量
		if (/^[1-7]$/.test(k)) {
			e.preventDefault();
			touch({ mode: "degree", sub: null, lastKind: "start" });
			const degree = parseInt(k, 10);
			applyTyped({ degree, acc: 0, quality: defaultQualityFor(degree), bass: null });
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
		const per = autoPer;
		const pad = (per - (measures.length % per)) % per;
		for (let i = 0; i < pad + per; i++) measures.push(createMeasure(s.timeSig));
		return { ...s, measures };
	});

	// 插入一拍：光标处插入空拍并停在那里；从该拍起全曲的拍整体后移（跨小节流动），内容一个不丢
	const insertBeat = (mi = cursor.mi, si = cursor.si) => {
		const m = song.measures[mi];
		if (!m) return;
		const at = Math.max(0, Math.min(m.slots.length - 1, si));
		commitTyped();
		setSong(s => insertBeatInSong(s, mi, at));
		setCursor({ mi, si: at, half: null });
		showToast(ts.insertBeatToast ?? "已插入一拍，后面的拍整体后移");
	};

	// 删除一拍：插入一拍的逆操作——光标处的拍移除，后面的拍整体前移（跨小节流动），末尾补空拍
	const removeBeat = (mi = cursor.mi, si = cursor.si) => {
		const m = song.measures[mi];
		if (!m) return;
		const at = Math.max(0, Math.min(m.slots.length - 1, si));
		commitTyped();
		const next = deleteBeatInSong(songRef.current, mi, at);
		setSong(next);
		// 末小节可能被自动缩掉：光标钳回仍存在的小节
		setCursor({ mi: Math.min(mi, next.measures.length - 1), si: at, half: null });
		showToast(ts.delBeatToast ?? "已删除一拍，后面的拍整体前移");
	};

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
	// withLead：是否带一小节节拍器预备拍（调速重播不带，衔接不断拍）
	const startPlayback = async (fromMi = null, withLead = true) => {
		if (!song.measures.length) return;
		stopPlayback();
		try { await audioService.init(); } catch (e) { /* 静音也能走 */ }
		const start = fromMi != null
			? Math.max(0, Math.min(fromMi, song.measures.length - 1))
			: (Number.isInteger(cursor.mi) && cursor.mi > 0 && song.measures[cursor.mi] ? cursor.mi : 0);
		const plan = buildPlayPlan(song, keyAtFn, start);
		if (!plan.items.length) return;
		const leadBeats = metronome && withLead ? song.timeSig : 0; // 预备拍：一小节节拍器领起
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
				{
					const playingCls = 'playing';
					document.querySelectorAll('.cc-beat.' + playingCls).forEach(function (el) { el.classList.remove(playingCls); });
					document.querySelectorAll('.cc-beat').forEach(function (el) {
						var dMi = el.getAttribute('data-mi');
						var dSi = el.getAttribute('data-si');
						if (String(dMi) === String(item.mi) && String(dSi) === String(item.si)) el.classList.add(playingCls);
					});
				}
				if (item.chord && item.plan) {
					item.plan.forEach(f => schedule(f.delayMs / speed, () => {
						audioService.playFretNote(f.idx, f.string, f.durMs / 1000 / speed);
					}));
				}
			});
		});
		schedule(t0 + plan.totalMs / speed + 150, () => stopPlayback());
	};

	// 播放中调速：定时器已按旧速度排死，从当前发声小节重排（跳过预备拍，不断拍）
	const onSpeedChange = (v) => {
		setSpeed(v);
		if (playing) {
			const mi = playing.mi;
			stopPlayback();
			startPlayback(mi, false);
		}
	};

	// ============ 键盘 ============

	useEffect(() => {
		const onKey = (e) => {
			if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable) return;
			if (dialog) { if (e.key === "Escape") { e.preventDefault(); setDialog(null); } return; }
			if (!editing) {
				if (e.key === "Escape" && playing) stopPlayback();
				return;
			}
			if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
				e.preventDefault();
				if (e.shiftKey) redo(); else undo();
				return;
			}
			if (copyMode) {
				// 模式内只认：Q/Esc 退出、拖选后的 ←/→ 微调、Ctrl+C 复制、Ctrl+V 插入、Backspace 删除、Ctrl+Z 撤销
				if (e.key === "q" || e.key === "Q" || e.key === "Escape") { e.preventDefault(); exitCopyMode(); return; }
				if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) { e.preventDefault(); copySelection(); return; }
				if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) { e.preventDefault(); pasteClip(); return; }
				if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
				if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); deleteSelection(); return; }
				if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
					e.preventDefault();
					setSel(st => st.anchor == null
						? { anchor: cursor.mi, end: cursor.mi }
						: { ...st, end: Math.max(0, Math.min(song.measures.length - 1, (st.end ?? st.anchor) + (e.key === "ArrowRight" ? 1 : -1))) });
					return;
				}
				if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "Tab" || e.key === " " || e.key === "Enter" || /^[1-7]$/.test(e.key))) { e.preventDefault(); }
				return;
			}
			if ((e.key === "q" || e.key === "Q") && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				enterCopyMode();
				return;
			}
			if (e.key === "Escape") { e.preventDefault(); if (popupOpen) setPopupOpen(false); else if (playing) stopPlayback(); return; }
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
			if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
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
				// 模式外：光标在和弦上 → 复制该和弦；否则复制光标所在小节（整节，含歌词/标色/小节线）
				const u = unitOf(cursor.mi, cursor.si, cursor.half);
				if (u && u.kind === "chord" && u.chord) clipRef.current = { type: "chord", chord: u.chord };
				else if (song.measures[cursor.mi]) {
					clipRef.current = { type: "measures", measures: [JSON.parse(JSON.stringify(song.measures[cursor.mi]))] };
					showToast(ts.copiedToast?.replace("{n}", "1") ?? "已复制 1 小节 —— Ctrl+V 插入到光标小节之后");
				}
				return;
			}
			if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
				e.preventDefault();
				pasteClip();
				return;
			}
			if (e.altKey && (e.key === "a" || e.key === "A")) {
				e.preventDefault();
				promptSection(cursor.mi);
				return;
			}
			if (e.key === "Insert" || (e.key === "Enter" && e.shiftKey)) {
				// 插入一拍：与 Enter（拆分当前拍）成对；Shift+Enter 是给没有 Insert 键的笔记本用的
				e.preventDefault();
				insertBeat(cursor.mi, cursor.si);
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
				case "b": e.preventDefault(); if (currentUnit?.kind === "chord" && currentUnit.chord) patchCurrentUnit({ chord: { ...currentUnit.chord, acc: -1 } }); break;
				case "#": e.preventDefault(); if (currentUnit?.kind === "chord" && currentUnit.chord) patchCurrentUnit({ chord: { ...currentUnit.chord, acc: 1 } }); break;
				case "Backspace": {
					e.preventDefault();
					const h = hoverBeatRef.current;
					if (h && h !== null && !(h.mi === cursor.mi && h.si === cursor.si && h.half == null)) {
						// 悬停清除：光标原地不动，直接清悬停的那个拍（整拍，含拆分）
						const target = h;
						patchMeasure(target.mi, m => {
							if (target.si < 0 || target.si >= m.slots.length) return m;
							const slots = m.slots.slice();
							slots[target.si] = { kind: "empty" };
							return { ...m, slots };
						});
						break;
					}
					patchCurrentUnit({ kind: "empty", chord: undefined, split: undefined });
					break;
				}
				default: break;
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	// ============ 导入导出 / 动图 ============

	// 落盘：直接走浏览器下载（进系统下载目录），不弹目录选择
	const downloadText = async (text, name, mime) => {
		const blob = new Blob([text], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = name;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
	};

	// 工程文件（.fbchart）：无损、体积约 MusicXML 的 1/18 —— 主导出通道
	const doExportChart = async () => {
		await downloadText(packChart(song), `${song.name || "chord-chart"}.fbchart`, "text/plain;charset=utf-8");
		showToast(ts.exportedPack ?? "已导出工程文件（含配图、标色等全部内容）");
	};

	// MusicXML：给 MuseScore 这类通用记谱软件用的交换格式，
	// 记谱形式/等音/每行小节数/动图色系/标色/休止延音/节奏型/配图 它装不下，会丢——导出后提示用户
	const doExportXml = async () => {
		await downloadText(exportMusicXml(song, keyAtFn), `${song.name || "chord-chart"}.musicxml`, "application/xml;charset=utf-8");
		showToast(ts.xmlLossy ?? "已导出 MusicXML：配图/标色/节奏型等应用私有内容不会包含");
	};

	const shareChart = async () => {
		try {
			await navigator.clipboard.writeText(chartShareCode(song));
			showToast(ts.sharedCode ?? "分享码已复制（对方在和弦谱页「从分享码导入」即可 100% 还原）");
		} catch (e) {
			showToast(ts.shareFail ?? "复制失败，请改用「导出工程文件」");
		}
	};

	// 换上一首导入的谱子
	const adoptImported = (imported) => {
		clearHistory();
		setSong(imported);
		setTransposeRoot(null);
		setCursor({ mi: 0, si: 0, half: null });
		const saved = saveChart(imported);
		setCharts(loadCharts());
		setCurrentId(saved.id);
		if (window.location.hash !== '#/chords?id=' + saved.id) {
			window.location.hash = '#/chords?id=' + saved.id; // 深链直达这首
		}
	};

	// 工程文件载入：谱里带的 id 若已存在，让用户决定覆盖还是另存（不静默改掉现有曲目）
	// clips = 文件里内嵌的动图（含帧数据）：先落回本机，谱里的 clip 引用才能解析
	const handlePackImport = (imported, clips) => {
		const restoreClips = () => (clips || []).forEach(c => saveClip(c));
		const clash = charts.find(c => c.id === imported.id);
		if (!clash) { restoreClips(); adoptImported(imported); showToast(ts.importedPack ?? "已导入工程文件"); return; }
		setDialog({
			type: "choose",
			title: ts.importConflict ?? "同名曲目已存在",
			text: (ts.importConflictText ?? "工程文件里的曲目「{n}」在这台机器上已存在。").replace("{n}", clash.name || imported.name),
			options: [
				{ label: ts.overwrite ?? "覆盖现有曲目", danger: true, onPick: () => { restoreClips(); saveChart({ ...imported, id: clash.id }); adoptImported({ ...imported, id: clash.id }); showToast(ts.overwrote ?? "已覆盖"); } },
				{ label: ts.importAsNew ?? "作为新曲目导入", onPick: () => { restoreClips(); adoptImported(imported); showToast(ts.importedPack ?? "已导入工程文件"); } }
			]
		});
	};

	// 一个入口吃两种格式：本应用工程文件 / MusicXML（按内容自动分流）
	const doImportFile = (e) => {
		const file = e.target.files && e.target.files[0];
		e.target.value = "";
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = String(reader.result);
			try {
				if (isChartPack(text)) { const { song: packed, clips } = unpackChartBundle(text); handlePackImport(packed, clips); return; }
				const imported = importMusicXml(text, file.name.replace(/\.musicxml$|\.xml$/i, ""));
				if (!imported) {
					setDialog({ type: "alert", title: ts.importTitle ?? "导入", text: ts.importFail ?? "没解析出和弦骨架（工程文件或带 harmony 的 MusicXML）" });
					return;
				}
				adoptImported(imported);
				setDialog({ type: "alert", title: ts.importTitle ?? "导入", text: ts.importXmlWarn ?? "已导入 MusicXML。注意：配图、小节标色、节奏型、记谱形式等应用私有内容 MusicXML 装不下，需要它们请改用工程文件（.fbchart）。" });
			} catch (err) {
				console.error(err);
				setDialog({ type: "alert", title: ts.importTitle ?? "导入", text: (ts.importFailShort ?? "导入失败") + "：" + err.message });
			}
		};
		reader.readAsText(file);
	};

	// 从分享码导入（贴一段码即可）
	const promptImportCode = () => setDialog({
		type: "prompt", multiline: true,
		title: ts.importCode ?? "从分享码导入",
		label: ts.importCodePh ?? "粘贴分享码（fg… 或 fretboard-chart:1:…）",
		value: "",
		onOk: (v) => {
			const code = String(v || "").trim();
			if (!code) return;
			try { const { song: packed, clips } = unpackChartBundle(code); handlePackImport(packed, clips); }
			catch (err) { setDialog({ type: "alert", title: ts.importCode ?? "从分享码导入", text: err.message }); }
		}
	});

	// ============ 曲目管理（曲目面板 + 菜单共用） ============

	const switchTo = (next) => {
		clearHistory();
		setSong(next);
		setCurrentId(next.id);
		setTransposeRoot(null);
		setCursor({ mi: 0, si: 0, half: null });
	};

	// 回曲目列表页：先冲刷防抖中的保存，列表那边看到的就是最新内容
	const goSongList = () => {
		clearTimeout(saveTimerRef.current);
		saveTimerRef.current = null;
		persistNow();
		window.location.hash = '#/chords';
	};

	const newSong = () => {
		const base = ts.newSong ?? "新歌";
		const used = charts.filter(c => (c.name || "").startsWith(base)).length;
		const sn = createSong(used ? `${base} ${used + 1}` : base);
		saveChart(sn);
		window.location.hash = '#/chords?id=' + sn.id; // 进新歌的编辑页
	};

	const duplicateChart = (id) => {
		const src = charts.find(c => c.id === id);
		if (!src) return;
		const copy = { ...JSON.parse(JSON.stringify(src)), id: undefined };
		const sn = createSong(`${src.name || "未命名"} ${ts.copySuffix ?? "副本"}`);
		const saved = saveChart({ ...copy, id: sn.id, createdAt: Date.now() });
		setCharts(loadCharts());
		showToast((ts.duplicated ?? "已复制为「{n}」").replace("{n}", saved.name));
	};

	const renameChart = (id, name) => {
		const src = charts.find(c => c.id === id);
		if (!src) return;
		const saved = saveChart({ ...src, name });
		setCharts(loadCharts());
		if (saved.id === currentId) setSong(s => ({ ...s, name }));
	};

	// 删除任意曲目（当前正在编辑的那首删掉后，落到剩下的第一首）
	const removeChartById = (id, skipConfirm) => {
		const target = charts.find(c => c.id === id);
		if (!target) return;
		const doDelete = () => {
			clearHistory();
			deleteChart(id);
			const rest = loadCharts();
			setCharts(rest);
			if (id === currentId) { window.location.hash = '#/chords'; return; } // 删的就是这首 → 回列表
			setCharts(loadCharts());
			showToast((ts.deleted ?? "已删除「{n}」").replace("{n}", target.name || ""));
		};
		if (skipConfirm) { doDelete(); return; }
		setDialog({
			type: "confirm",
			title: ts.delSong ?? "删除这首歌",
			text: (ts.delConfirmOne ?? "删除「{n}」？（不可撤销）").replace("{n}", target.name || ""),
			onOk: doDelete
		});
	};

	// 导出指定曲目（不切歌也能导出）
	const exportChartById = async (id) => {
		const target = charts.find(c => c.id === id);
		if (!target) return;
		await downloadText(packChart(target), `${target.name || "chord-chart"}.fbchart`, "text/plain;charset=utf-8");
		showToast((ts.exportedOne ?? "已导出「{n}」").replace("{n}", target.name || ""));
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
	// 配图体系：一个和弦（拍格实例）一张指法图——unit.image；复制/复制小节随槽位一起带走
	const unitAt = (mi, si, half) => {
		const slot = song.measures[mi]?.slots[si];
		if (!slot) return null;
		return slot.split ? (slot.split[half || 0] || null) : slot;
	};
	// 弹窗编辑该拍的指法小图(裁剪版普通编辑器:点音亮灭/连线/品数滑块,无色板钢琴)
	const [figTarget, setFigTarget] = useState(null); // { mi, si, half }
	const editFig = (mi, si, half) => {
		setPopupOpen(false);
		setFigTarget({ mi, si, half });
	};

	// 指法图一览：谱内所有带小图的和弦槽位（M 位置 + 和弦 + 图）；编辑态点卡片可改
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
		// 空歌兜底：当前调的七个调内三和弦（裸级数，显示时按调性出 1M/6m 或 1m/5m）——
		// 不再给固定 1645 进行，新歌不会被误认成上一首的残留历史
		return [1, 2, 3, 4, 5, 6, 7].map(d => ({ degree: d, acc: 0, quality: "", bass: null }));
	}, [song]);


	// ============ 渲染（8pu 式格子谱） ============

	const stageChord = playing
		? (unitOf(playing.mi, playing.si, playing.half)?.chord || null)
		: (currentUnit && currentUnit.kind === "chord" ? currentUnit.chord : null);
	const stageSnapshot = useMemo(() => {
		const frame = stageChord ? stageFrame(stageChord, song, keyAt(playing ? playing.mi : cursor.mi)) : null;
		return frame ? { state: frame } : null;
	}, [stageChord, song.colorScheme, song.key?.root, song.enharmonic, cursor.mi, playing]);
	const stagePos = playing || { mi: cursor.mi, si: cursor.si };
	const stageSign = stageChord
		? `${chordParts(stageChord, "degree", keyAt(playing ? playing.mi : cursor.mi)).main.replace(/M$/, "")} · ${formatName(stageChord, keyAt(playing ? playing.mi : cursor.mi))}`
		: "";

	// 拍格内容（和弦竖排记号 / 休止 / 延音 / 空）——编辑恒数字级数，预览按三态选择
	const scoreDisplay = editing ? "degree" : previewDisplay;
	const beatContent = (u, compact, mi, si, half) => {
		if (u.kind === "chord" && u.chord) {
			// 8pu 式单行内联：1M / 6m / 4M7 / 57 / 5M/7;手画指法小图(黑点格)放在记号上方
			return (
				<>
					{/* hover 模式：图挂在拍上（CSS 默认隐藏，悬停浮动显示）；内嵌模式：图在独立图行 */}
					{u.fig && figOpts.mode === "hover" ? <FigView data={u.fig} chord={u.chord} viewKey={keyAt(mi)} opts={{ ...figOpts, compact, size: compact ? 56 : figOpts.size }}
						onClick={e => { e.stopPropagation(); if (editing) editFig(mi, si, half); }} /> : null}
					<ChordSign chord={u.chord} display={scoreDisplay} viewKey={keyAt(mi)} compact={compact} />
				</>
			);
		}
		if (u.kind === "rest") return <span className="cc-glyph rest">0</span>;
		if (u.kind === "hold") return (
			<>
				{/* 延音拍也可配指法图（同 chord 拍：图上记号下） */}
				{u.fig && figOpts.mode === "hover" ? <FigView data={u.fig} chord={u.chord || null} viewKey={keyAt(mi)} opts={{ ...figOpts, compact, size: compact ? 56 : figOpts.size }}
					onDoubleClick={e => { e.stopPropagation(); if (editing) editFig(mi, si, half); }} /> : null}
				<span className="cc-glyph hold">—</span>
			</>
		);
		return null; // 空拍留白（8pu 同款）：任何占位符都会破坏拍格对齐
	};

	const slotView = (mi, si) => {
		const slot = song.measures[mi].slots[si];
		const units = slot.split ? slot.split : [slot];
		// 光标高亮只在编辑态出现：预览是拿出来给人看的，不该带编辑光标
		const isCur = editing && cursor.mi === mi && cursor.si === si;
		return (
			<div
				key={si}
				className={`cc-beat ${isCur ? "cur" : ""} ${playing && playing.mi === mi && playing.si === si ? "playing" : ""}`}
				data-mi={mi}
				data-si={si}
				onMouseEnter={() => { hoverBeatRef.current = { mi, si, half: null }; }}
				onMouseLeave={() => { const h = hoverBeatRef.current; if (h && h.mi === mi && h.si === si) hoverBeatRef.current = null; }}
				onClick={e => { if (!editing || copyMode) return; e.stopPropagation(); setCursor({ mi, si, half: null }); setPopupOpen(true); }}
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
								onClick={e => { if (!editing || copyMode) return; e.stopPropagation(); setCursor({ mi, si, half: slot.split ? h : null }); setPopupOpen(true); }}
							>
								{beatContent(u, !!slot.split, mi, si, slot.split ? h : null)}
								{u.rhythm ? <span className="cc-rhythm-mark">{u.rhythm === "ballad" ? "∼" : u.rhythm === "block" ? "▮" : u.rhythm === "waltz" ? "③" : ""}</span> : null}
							</div>
						);
					})}
				</div>
			</div>
		);
	};

	const cellView = (m, mi, rowHasFig) => {
		const inSel = selRange != null && mi >= selRange[0] && mi <= selRange[1];
		return (
			<div key={m.id} className={`cc-cell end-${m.endBar} ${m.repeatStart ? "rep-start" : ""} ${editing && cursor.mi === mi ? "cur" : ""} ${inSel ? "sel" : ""} ${selRange != null && mi === selRange[0] ? "sel-first" : ""} ${selRange != null && mi === selRange[1] ? "sel-last" : ""}`}
				style={!copyMode && m.tint && TINTS[m.tint] ? { background: TINTS[m.tint].bg } : undefined}
				onMouseDown={e => { if (copyMode) { e.preventDefault(); beginSelDrag(mi); } }}
				onMouseOver={() => { if (copyMode) extendSelDrag(mi); }}
				onContextMenu={e => {
					// 右键小节 = 打开小节设置（替代原来那个悬浮 ⋯ 小按钮）；菜单内右键不劫持
					if (!editing || copyMode) return;
					if (e.target.closest(".cc-mmenu")) return;
					e.preventDefault();
					const firstEmpty = m.slots.findIndex(sl => (sl.split ? sl.split.every(u => u.kind !== "chord") : sl.kind !== "chord"));
					setCursor({ mi, si: cursor.mi === mi ? Math.min(cursor.si, m.slots.length - 1) : (firstEmpty === -1 ? 0 : firstEmpty), half: null });
					setPopupOpen(false);
					setCellMenu(cellMenu === mi ? null : mi);
				}}
				onClick={e => {
					if (copyMode || !editing) return;
					if (e.target.closest(".cc-beat, .cc-cell-lyrics, .cc-mmenu")) return;
					const firstEmpty = m.slots.findIndex(sl => (sl.split ? sl.split.every(u => u.kind !== "chord") : sl.kind !== "chord"));
					const si = firstEmpty === -1 ? 0 : firstEmpty;
					setCursor({ mi, si, half: null });
					setPopupOpen(true);
				}}
				title={editing ? (ts.cellRightClickTip ?? "右键小节：插入 / 复制 / 删除 / 转调 / 标色") : undefined}>
				{/* 小节级角标（8pu 式，一律在本小节开头）：跳房子 / 段落标记 / 转调 */}
				{(m.house || m.section || m.keyRoot != null) ? (
					<div className="cc-cell-tags">
						{m.house ? <span className="cc-house">{m.house}.</span> : null}
						{m.section ? (
							<span className="cc-sectionmark"
								title={ts.sectionEditTip ?? "点击编辑段落标记"}
								onClick={e => { e.stopPropagation(); promptSection(mi); }}>
								{m.section}
							</span>
						) : null}
						{m.keyRoot != null ? <span className="cc-keymark">1 = {PC_KEY[m.keyRoot]}{m.keyMinor ? "m" : ""}</span> : null}
					</div>
				) : null}
				{m.repeatStart ? <span className="cc-bardots start" /> : null}
				{m.endBar === "repeatEnd" ? <span className="cc-bardots end" /> : null}
				{/* 内嵌模式的独立图行：小节各拍的指法小图横排（拍格上方，拍格自身不受图影响，记号永远同线） */}
				{figOpts.mode === "inline" ? (
					<div className={`cc-cell-figs${rowHasFig ? " pad" : ""}`}>
						{m.slots.map((sl, si) => {
							const us = sl.split || [sl];
							return (
								<div className="cc-cell-figslot" key={si}>
									{us.map((u, h) => (((u.kind === "chord" && u.chord) || u.kind === "hold") && u.fig ? (
										<FigView key={h} data={u.fig} chord={u.chord} viewKey={keyAt(mi)}
											opts={{ ...figOpts, compact: !!sl.split, size: sl.split ? 44 : 64 }}
											onClick={e => { e.stopPropagation(); if (editing) editFig(mi, si, sl.split ? h : null); }} />
									) : null))}
								</div>
							);
						})}
					</div>
				) : null}
				<div className="cc-cell-slots">{m.slots.map((_, si) => slotView(mi, si))}</div>
				<input key={`cl-${m.id}-${m.lyrics || ""}`} className={`cc-cell-lyrics ${m.lyrics ? "has" : ""}`} defaultValue={m.lyrics || ""}
					readOnly={!editing} placeholder={editing ? "" : (ts.lyricsFor ?? "当前小节歌词")}
					onBlur={e => patchMeasure(mi, x => ({ ...x, lyrics: e.target.value }))} />
				{cellMenu === mi ? (
					<div className="cc-mmenu" onClick={e => e.stopPropagation()}>
						<button onClick={() => { addMeasure(mi); setCellMenu(null); }}>＋ {ts.addMeasure ?? "插入小节"}</button>
						<button className="danger" onClick={() => { removeMeasure(mi); setCellMenu(null); }}>✕ {ts.delMeasure ?? "删除小节"}</button>
						<button onClick={() => { insertBeat(mi, cursor.mi === mi ? cursor.si : 0); setCellMenu(null); }} title={ts.insertBeatTip ?? "在光标处插入一拍：后面的拍整体后移、内容不丢（Insert / Shift+Enter）"}>⇥ {ts.insertBeat ?? "插入一拍"}</button>
						<button className="danger" onClick={() => { removeBeat(mi, cursor.mi === mi ? cursor.si : 0); setCellMenu(null); }} title={ts.delBeatTip ?? "删除光标处的拍：后面的拍整体前移（跨小节流动），末尾补空拍；末小节被掏空自动缩掉"}>⇤ {ts.delBeat ?? "删除一拍"}</button>
						<button onClick={() => { setCellMenu(null); promptSection(mi); }}>¶ {ts.sectionBtn ?? "段落标记"}</button>
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
						<div className="cc-mmenu-label">{ts.keyChange ?? "转调"}（{ts.keyChangeFrom ?? "本小节起"}）</div>
						<div className="cc-mmenu-row">{keyStepper(mi)}</div>
						<div className="cc-mmenu-label">{ts.tintLabel ?? "小节标色"}</div>
						<div className="cc-mmenu-row">
							{Object.entries(TINTS).map(([k, v]) => (
								<button key={k} className={`cc-tint ${k} ${(m.tint || "") === k ? "on" : ""}`}
									title={v.name} onClick={() => patchMeasure(mi, x => ({ ...x, tint: k }))} />
							))}
							<button onClick={() => patchMeasure(mi, x => ({ ...x, tint: null }))}>{ts.tintClear ?? "清除"}</button>
						</div>
					</div>
				) : null}
			</div>
		);
	};

	const rows = [];
	const per = autoPer; // 响应式：视谱面宽度而定（rowsPerLine 仅作初值）
	for (let i = 0; i < song.measures.length; i += per) rows.push(song.measures.slice(i, i + per));

	return (
		<div className={`cc-page${copyMode ? " cc-copying" : ""}${figOpts.mode === "hover" ? " figmode-hover" : ""}`}>
			<header className="cc-toolbar">
				<div className="cc-tabs-row">
					<nav className="cc-tooltabs">
						<button className="cc-songs-btn cc-songs-icon" onClick={goSongList} title={ts.songsTip ?? "回曲目列表"}>←</button>
						<button className={toolTab === "preview" ? "on" : ""} onClick={() => { stopPlayback(); setToolTab("preview"); }}>{ts.tabPreview ?? "预览"}</button>
						<button className={toolTab === "chord" ? "on" : ""} onClick={() => setToolTab("chord")}>{ts.tabChord ?? "和弦"}</button>
						<button className={toolTab === "measure" ? "on" : ""} onClick={() => setToolTab("measure")}>{ts.tabMeasure ?? "小节"}</button>
					</nav>
					<span className="cc-flex" />
					{editing ? (
						<>
							<button className={`button sm play ${playing ? "on" : ""}`} onClick={() => (playing ? stopPlayback() : startPlayback())} title={ts.playFromCursor ?? "播放 · 从光标小节起；Ctrl+Space 从头"}>{playing ? "⏹" : "▶"}</button>
							<select value={speed} onChange={e => onSpeedChange(Number(e.target.value))} title={ts.speedLabel ?? "速度"}>
								{[0.5, 0.75, 1, 1.25, 1.5].map(x => <option key={x} value={x}>{x}×</option>)}
							</select>
							<label className="cc-iconbtn" title={ts.metronome ?? "节拍器"}><input type="checkbox" checked={metronome} onChange={e => setMetronome(e.target.checked)} />{ts.metronome ?? "节拍器"}</label>
							<span className="cc-more-wrap">
								<button className="button sm cc-more-btn" onClick={() => setMenuOpen(v => !v)} title={ts.more ?? "更多"}>⋯</button>
								{menuOpen ? (
									<div className="cc-menu" onClick={() => setMenuOpen(false)}>
										<button className="cc-menu-item" onClick={() => { setMenuOpen(false); makeClip(); }}>🎬 {ts.makeClip ?? "生成动图"}</button>
										<button className="cc-menu-item" onClick={goSongList}>{ts.songsTitle ?? "曲目"}…</button>
										<button className="cc-menu-item" onClick={newSong}>＋ {ts.newSong ?? "新歌"}</button>
										<button className="cc-menu-item danger" onClick={() => { setMenuOpen(false); removeChartById(song.id); }}>✕ {ts.delSong ?? "删除这首歌"}</button>
										<div className="cc-menu-sep" />
										<button className="cc-menu-item" onClick={doExportChart}>⇩ {ts.exportPack ?? "导出工程文件"}<small>.fbchart</small></button>
										<button className="cc-menu-item" onClick={() => fileRef.current?.click()}>⇪ {ts.importBtn ?? "导入文件"}<small>.fbchart / .musicxml</small></button>
										<button className="cc-menu-item" onClick={promptImportCode}>{ts.importCode ?? "从分享码导入"}</button>
										<div className="cc-menu-sep" />
										<button className="cc-menu-item" onClick={shareChart}>{ts.copyCode ?? "复制分享码"}</button>
										<button className="cc-menu-item" onClick={doExportXml}>⇩ {ts.exportXml ?? "导出 MusicXML"}<small className="cc-menu-warn">{ts.lossyWarn ?? "配图/标色不带"}</small></button>
									</div>
								) : null}
							</span>
							<input ref={fileRef} type="file" accept=".fbchart,.musicxml,.xml,.txt" style={{ display: "none" }} onChange={doImportFile} />
						</>
					) : null}
				</div>

				{editing ? (
					<div className="cc-tools-row">
						{toolTab === "chord" ? (
							<div className="cc-freqbar">
								{frequentChords.map((c, i) => {
									const localKey = keyAt(cursor.mi); // 常用和弦音名提示跟随光标处生效调（谱中转调后不误导）
									return (
										<button key={i} className="cc-freq-chord" title={formatName(c, localKey)} onClick={() => {
											typeRef.current = { t: Date.now(), mode: "degree", sub: null, lastKind: "mod" };
											patchCurrentUnit({ kind: "chord", chord: { ...c } });
											rememberQuality(c);
										}}>
											<ChordSign chord={c} display="degree" viewKey={localKey} />
										</button>
									);
								})}
								<button className="cc-freq-tool" title={ts.addRow ?? "新增一行"} onClick={addRow}>＋<small>{ts.rowLabel ?? "一行"}</small></button>
							</div>
						) : toolTab === "measure" ? (
							<div className="cc-measuretools">
								<span className="cc-tools-label">M{(song.measures[cursor.mi] ? cursor.mi + 1 : "-")}</span>
								<button className="button sm" onClick={() => addMeasure(cursor.mi)}>＋ {ts.addMeasure ?? "后插小节"}</button>
								<button className="button sm" onClick={() => duplicateMeasure(cursor.mi)}>⧉ {ts.dupMeasure ?? "复制"}</button>
								<button className="button sm danger" onClick={() => removeMeasure(cursor.mi)} disabled={song.measures.length <= 1}>✕ {ts.delMeasure ?? "删除"}</button>
								<button className="button sm" onClick={() => insertBeat(cursor.mi, cursor.si)}
									title={ts.insertBeatTip ?? "在光标处插入一拍：后面的拍整体后移、内容不丢（Insert / Shift+Enter）"}>
									⇥ {ts.insertBeat ?? "插入一拍"} <kbd>Ins</kbd>
								</button>
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
								<label className="cc-field">{ts.keyChange ?? "转调"}（{ts.keyChangeFrom ?? "本小节起"}）</label>
								{keyStepper()}
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
					<nav className="cc-preview-tabs cc-display-seg" title={ts.displayFormTip ?? "记谱形式（只在预览生效；编辑恒为数字级数）"}>
						<button className={previewDisplay === "number" ? "on" : ""} onClick={() => setPreviewDisplay("number")}>{ts.dispNumber ?? "数字"}</button>
						<button className={previewDisplay === "roman" ? "on" : ""} onClick={() => setPreviewDisplay("roman")}>{ts.dispRoman ?? "罗马"}</button>
						<button className={previewDisplay === "name" ? "on" : ""} onClick={() => setPreviewDisplay("name")}>{ts.dispName ?? "音名"}</button>
					</nav>
					<span className="cc-flex" />
					<button className="button sm" onClick={shareChart} title={ts.shareCodeTip ?? "复制分享码：对方粘贴即可 100% 还原整首谱"} >{ts.shareBtn ?? "分享"}</button>
					<button className="button sm accent" onClick={doExportChart} title={ts.exportPackTip ?? "工程文件：体积最小且 100% 还原（含配图/标色/节奏型）"}>⇩ {ts.exportBtn ?? "导出"}</button>
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
						<label className="cc-iconbtn" title={ts.metronome ?? "节拍器"}><input type="checkbox" checked={metronome} onChange={e => setMetronome(e.target.checked)} />{ts.metronome ?? "节拍器"}</label>
					</div>
					<div className="cc-dyn-strip">
						{song.measures.map((m, mi) => (m.slots || []).map((sl, si) => (sl.split || [sl]).map((u, h) => {
							if (u.kind !== "chord" || !u.chord) return null;
							const isCur = playing && playing.mi === mi && playing.si === si && (playing.half ?? null) === (sl.split ? h : null);
							return (
								<button key={`${mi}-${si}-${h}`} className={`cc-dyn-chord ${isCur ? "cur" : ""}`}
									onClick={() => { setCursor({ mi, si, half: sl.split ? h : null }); }}>
									<ChordSign chord={u.chord} display={previewDisplay} viewKey={keyAt(mi)} compact={!!sl.split} />
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
							{/* 所有设置统一收纳：⚙ 按钮开面板（曲谱:调/拍号/BPM + 和弦图:方向/度数/尺寸/展示） */}
							<button className={`cc-settings-btn${settingsOpen ? " on" : ""}`} title={ts.settingsTip ?? "设置：调 / 拍号 / 速度 / 和弦图"}
								onClick={() => setSettingsOpen(v => !v)}>
								⚙ 1 = {PC_KEY[song.key?.root ?? 0]}{song.key?.minor ? "m" : ""} · {song.timeSig ?? 4}/4 · ♩={song.bpm ?? 72}
							</button>
							{/* 生效调：谱中转调真正起作用时才出现，避免"改了却看不出" */}
							{(() => {
								const ek = keyAt(cursor.mi);
								const deviates = ek.root !== (song.key?.root ?? 0) || !!ek.minor !== !!song.key?.minor;
								if (!deviates) return null;
								return <span className="cc-effective" title={ts.effectiveTip ?? "当前光标处实际生效的调（谱中转调后）"}>⇒ 1 = {PC_KEY[ek.root]}{ek.minor ? "m" : ""}</span>;
							})()}
							{settingsOpen ? (
								<div className="cc-settings" onClick={e => e.stopPropagation()}>
									<div className="cc-settings-group">
										<div className="cc-settings-label">{ts.gSong ?? "曲谱"}</div>
										<div className="cc-settings-row"><span className="cc-settings-k">{ts.keyLabel ?? "调"}</span>
											<span className="cc-settings-v">1 =
												<select value={song.key?.root ?? 0} disabled={!editing} onChange={e => setSong(s => ({ ...s, key: { root: Number(e.target.value), minor: !!s.key?.minor } }))}>
													{PC_KEY.map((k, pc) => <option key={pc} value={pc}>{k}</option>)}
												</select>
												<label className="cc-iconbtn" title={ts.minor ?? "小调"}><input type="checkbox" checked={!!song.key?.minor} disabled={!editing} onChange={e => setSong(s => ({ ...s, key: { root: s.key?.root ?? 0, minor: e.target.checked } }))} />m</label>
											</span>
										</div>
										<div className="cc-settings-row"><span className="cc-settings-k">{ts.timeSigLabel ?? "拍号"}</span>
											<span className="cc-settings-v">
												<select value={song.timeSig} disabled={!editing} onChange={e => setTimeSig(Number(e.target.value))}>
													{[2, 3, 4, 6].map(b => <option key={b} value={b}>{b}/4</option>)}
												</select>
											</span>
										</div>
										<div className="cc-settings-row"><span className="cc-settings-k">{ts.bpmLabel ?? "速度"}</span>
											<span className="cc-settings-v">♩=
												<input type="number" min="30" max="240" value={song.bpm} disabled={!editing} onChange={e => setSong(s => ({ ...s, bpm: Math.max(30, Math.min(240, Number(e.target.value) || 72)) }))} />
											</span>
										</div>
										{editing ? <button className="cc-settings-rowbtn" onClick={() => { addRow(); setSettingsOpen(false); }}>＋ {ts.addRow ?? "新增一行"}</button> : null}
									</div>
									<div className="cc-settings-group">
										<div className="cc-settings-label">{ts.gFigures ?? "和弦图"}</div>
										<div className="cc-settings-row"><span className="cc-settings-k">{ts.figDir ?? "方向"}</span>
											<span className="cc-settings-seg">
												<button className={figOpts.orientation === "v" ? "on" : ""} onClick={() => setFigOpts(o => ({ ...o, orientation: "v" }))}>↕ 竖</button>
												<button className={figOpts.orientation === "h" ? "on" : ""} onClick={() => setFigOpts(o => ({ ...o, orientation: "h" }))}>↔ 横</button>
											</span>
										</div>
										<div className="cc-settings-row"><span className="cc-settings-k">{ts.figDeg ?? "度数标注"}</span>
											<span className="cc-settings-seg">
												<button className={figOpts.degMode === "chord" ? "on" : ""} onClick={() => setFigOpts(o => ({ ...o, degMode: "chord" }))}>{ts.degChord ?? "和弦内"}</button>
												<button className={figOpts.degMode === "scale" ? "on" : ""} onClick={() => setFigOpts(o => ({ ...o, degMode: "scale" }))}>{ts.degScale ?? "调内"}</button>
												<button className={figOpts.degMode === "none" ? "on" : ""} onClick={() => setFigOpts(o => ({ ...o, degMode: "none" }))}>{ts.degNone ?? "无"}</button>
											</span>
										</div>
										<div className="cc-settings-row"><span className="cc-settings-k">{ts.figSize ?? "尺寸"}</span>
											<span className="cc-settings-seg">
												{FIG_SIZES.map(s2 => <button key={s2} className={figOpts.size === s2 ? "on" : ""} onClick={() => setFigOpts(o => ({ ...o, size: s2 }))}>{s2}</button>)}
											</span>
										</div>
										<div className="cc-settings-row"><span className="cc-settings-k">{ts.figMode ?? "展示"}</span>
											<span className="cc-settings-seg">
												<button className={figOpts.mode === "inline" ? "on" : ""} title={ts.inlineTip ?? "图行显示在拍格上方（同行占位，记号同线）"} onClick={() => setFigOpts(o => ({ ...o, mode: "inline" }))}>{ts.modeInline ?? "内嵌"}</button>
												<button className={figOpts.mode === "hover" ? "on" : ""} title={ts.hoverTip ?? "默认隐藏，悬停该拍浮出大图（谱面紧凑）"} onClick={() => setFigOpts(o => ({ ...o, mode: "hover" }))}>{ts.modeHover ?? "悬浮"}</button>
											</span>
										</div>
									</div>
								</div>
							) : null}
						</div>
						<input className="cc-score-title" value={song.name} readOnly={!editing}
							onChange={e => setSong(s => ({ ...s, name: e.target.value }))}
							onBlur={() => { if (dirtyRef.current) persistNow(); }} // 改名瞬间落盘：点"回列表"时先失焦，立刻存住
							onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); persistNow(); e.target.blur(); } }} />
					</div>

					{copyMode ? (
						<div className="cc-copybar">
							<b>⧉ {ts.copyTitle ?? "复制模式"}</b>
							<span className="cc-copybar-state">
								{selRange == null
									? (ts.copyHint ?? "按住小节拖动选择，←/→ 微调选区")
									: (copiedCount > 0
										? (ts.copyDone ?? "已复制 {n} 小节 · 光标移到目标小节，Ctrl+V 插入其后").replace("{n}", String(copiedCount))
										: (ts.copySel ?? "已选 M{a}–M{b}（{n} 小节）· Ctrl+C 复制 · Backspace 删除").replace("{a}", String(selRange[0] + 1)).replace("{b}", String(selRange[1] + 1)).replace("{n}", String(selRange[1] - selRange[0] + 1)))}
							</span>
							<span className="cc-flex" />
							<button className="button sm accent" onClick={copySelection}>⧉ {ts.copyBtn ?? "复制"} <kbd>Ctrl+C</kbd></button>
							<button className="button sm" onClick={exitCopyMode}>{ts.copyExit ?? "退出"} <kbd>Q</kbd></button>
						</div>
					) : null}

					<div className="cc-lines">
						{rows.map((row, ri) => {
							const first = ri * per;
							// 同行任一小节有图：全行图行占位（无图小节空占位带），保证全行记号同一条线
							const rowHasFig = row.some(mm => mm.slots.some(sl => (sl.split || [sl]).some(u => u && u.fig)));
							return (
								<div className="cc-line" key={ri}>
									{/* 行号：叠在行首小节格左上角小字，不占独立列 */}
									<span className="cc-line-no cc-line-no-float">{first + 1}</span>
									{/* 网格轨道按行内小节数固定：末行不满时列宽仍与他行像素级一致（加行入口在谱面底部按钮，不占格） */}
									<div className="cc-line-cells" style={{ gridTemplateColumns: `repeat(${per}, 1fr)` }}>
										{row.map((m, k) => cellView(m, first + k, rowHasFig))}
									</div>
								</div>
							);
						})}
					</div>

					{popupOpen && popupPos ? (
						<div className="cc-cp-wrap" ref={popupRef} style={{ left: popupPos.left, top: popupPos.top }}>
							<ChordPopup song={song} viewKey={keyAt(cursor.mi)} unit={currentUnit} typedHint={typedHint}
								defaultQuality={(d) => defaultQualityFor(d)}
								hasAttach={!!(currentUnit?.kind === "chord" && currentUnit.fig)}
								onAttach={(currentUnit?.kind === "chord" || currentUnit?.kind === "hold") ? () => editFig(cursor.mi, cursor.si, cursor.half) : null}
								canSplit={canSplitCurrent} onPatchUnit={patchUnitFromPanel} onSetKind={onPanelSetKind}
								onToggleSplit={toggleSplit} onClose={() => setPopupOpen(false)} t={t}
								keyHere={editing ? keyStepper(cursor.mi) : null}
								tab={cpTab} onTab={setCpTab} />
						</div>
					) : null}



				</div>

			</div>



			{figTarget != null ? (() => {
				const u = unitAt(figTarget.mi, figTarget.si, figTarget.half);
				return (
					<div className="figbe-mask" onMouseDown={e => { if (e.target === e.currentTarget) setFigTarget(null); }}>
						<div className="figbe-box">
							<FigBoardEditor
								initialData={u?.fig}
								chord={u?.chord}
								viewKey={keyAt(figTarget.mi)}
								figOpts={figOpts}
								showToast={showToast}
								onAutoSave={figData => patchUnit(figTarget.mi, figTarget.si, figTarget.half, { fig: figData || undefined })}
								onClose={() => setFigTarget(null)} />
						</div>
					</div>
				);
			})() : null}

			<div className="cc-build-ver" title="界面版本（刷新后应为此版本）">v1.0.1</div>


			{dialog ? (
				<div className="cc-modal-mask" onMouseDown={e => { if (e.target === e.currentTarget) setDialog(null); }}>
					<div className="cc-modal cc-dialog">
						<div className="cc-modal-head">
							<span className="cc-modal-title">{dialog.title}</span>
							<button className="cc-modal-x" onClick={() => setDialog(null)}>✕</button>
						</div>
						<div className="cc-modal-body">
							{dialog.type === "prompt" ? (
								dialog.multiline ? (
									<textarea ref={dialogInputRef} autoFocus className="cc-dialog-input cc-dialog-area" defaultValue={dialog.value || ""}
										rows={4} placeholder={dialog.label}
										onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setDialog(null); } }} />
								) : (
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
								)
							) : dialog.type === "choose" ? (
								<div className="cc-dialog-choices">
									{(dialog.options || []).map((o, i) => (
										<button key={i} className={`button ${o.danger ? "danger" : "accent"}`}
											onClick={() => { setDialog(null); o.onPick?.(); }}>{o.label}</button>
									))}
								</div>
							) : <div className="cc-dialog-text">{dialog.text}</div>}
						</div>
						<div className="cc-modal-foot">
							{dialog.type === "prompt" && dialog.onDelete ? (
								<button className="button sm danger" style={{ marginRight: "auto" }}
									onClick={() => { const d = dialog; d.onDelete?.(); setDialog(cur => (cur === d ? null : cur)); }}>{ts.deleteMark ?? "删除标记"}</button>
							) : null}
							{dialog.type !== "alert" ? <button className="button sm" onClick={() => setDialog(null)}>{ts.cancel ?? "取消"}</button> : null}
							{dialog.type === "choose" ? null : (
								<button className={`button sm ${dialog.type === "confirm" ? "danger" : "accent"}`}
									onClick={() => {
										const d = dialog;
										d.onOk?.(d.type === "prompt" ? (dialogInputRef.current ? dialogInputRef.current.value : "") : undefined);
										// onOk 里可能开了新弹层（如导入冲突选择、错误提示），那种情况不能顺手关掉
										setDialog(cur => (cur === d ? null : cur));
									}}>
									{ts.ok ?? "确定"}
								</button>
							)}
						</div>
					</div>
				</div>
			) : null}
			{toast ? <Toast key={toast.key} message={toast.msg} onClose={() => setToast(null)} /> : null}
		</div>
	);
}
