// 动态编辑模式状态机：
// 普通模式画图 = 帧1 → Q 进入 → 技法工具点两点标注（板面即时预览结果状态）→ Ctrl+S 定格为下一帧
// → 继续 → Q 退出，帧序列+过渡规格 = 动图，自动存入指板堆
// 技法语义决定结果帧：rt（原位滑弦）源活目标灭（B 瞬时），sl 目标活源灭；
// 新增/删除音不标技法，帧间 diff 自动出环亮/淡出动画

import { useCallback, useEffect, useRef, useState } from "react";
import { stringOfNote, saveClip, loadClips } from "../utils/clipModel";
import { generateTintVariants, getLevel1FillColor, tintPosition, frameTintFromData } from "../colorConfig";

// 音符是否"正在发声"（可见且有颜色）——标注源音的要求
function isNoteActive(noteData, globalVisibility) {
	if (!noteData || typeof noteData !== "object") return false;
	const vis = noteData.visibility || globalVisibility;
	if (vis !== "visible" && vis !== "selected") return false;
	return !!(noteData.color && noteData.color !== "white") || !!noteData.color2;
}

// 就地改一音，返回新的 data 对象（不经过 setState，调用方决定何时提交）
function patchNote(data, noteId, patch) {
	const next = { ...data };
	const current = next[noteId] || {};
	const updated = { ...current, ...patch };
	Object.keys(updated).forEach(k => {
		if (updated[k] === undefined) delete updated[k];
	});
	next[noteId] = updated;
	return next;
}

export function useDynamicMode({ dataRef, setData, visibility, captureBoard, toast, onEnter, getVividColor, getHintColor, applyBoard, frameColorAt }) {
	const [isDynamic, setIsDynamic] = useState(false);
	const [frames, setFrames] = useState([]);
	const [transitions, setTransitions] = useState([]);
	const [technique, setTechnique] = useState(null); // 'sl'（滑弦）| 'rt'（原位滑弦）| null
	const [pairs, setPairs] = useState([]); // 本步已标注 [{from, to, technique}]
	const [pendingFrom, setPendingFrom] = useState(null);
	const [sessionClip, setSessionClip] = useState(null); // 续编中的动图 {id, name, createdAt}
	const [clipVersion, setClipVersion] = useState(0); // 指板堆刷新信号
	const [editIdx, setEditIdx] = useState(0); // 正在编辑的帧（末帧=追加模式，其余=覆盖模式）
	const [viewMode, setViewMode] = useState("edit"); // 'preview'（只读预览）| 'edit'（编辑）
	const [persistedOnce, setPersistedOnce] = useState(false); // 本会话是否已落过堆（徽标区分新草稿/存档）

	const stepStartRef = useRef(null); // 本步起点板面（撤销本步用）
	const framesRef = useRef([]);
	const transitionsRef = useRef([]);
	const sessionClipRef = useRef(null);
	const editIdxRef = useRef(0);
	framesRef.current = frames;
	transitionsRef.current = transitions;
	sessionClipRef.current = sessionClip;
	editIdxRef.current = editIdx;

	// 本步起点（Ctrl+Z 回滚点）：在结构边界（跳帧/加删帧/开会话/载入/拖拽成弦后）手动设置

	const commitData = useCallback((nextData) => {
		dataRef.current = nextData;
		setData(nextData);
	}, [dataRef, setData]);

	// 冲刷：把当前板面即时合入帧序列与过渡（不经过 250ms 防抖），供落盘/跳帧前强制一致
	// （同步写回 framesRef/transitionsRef——setState 异步，调用方立刻读 ref 必须拿到新值）
	const flushBoard = useCallback(() => {
		if (viewMode !== "edit") return { frames: framesRef.current, transitions: transitionsRef.current };
		const idx = editIdxRef.current;
		const board = captureBoard();
		const oldData = framesRef.current[idx]?.data || {};
		const frames = propagateForward(framesRef.current.map((f, i) => (i === idx ? { ...f, ...board } : f)), idx, board, oldData); // {...f,...board}：保留 preSlides 等帧级标注（board 快照不带它们）
		const activeIds = st => {
			const frameData = st && st.data ? st.data : st || {};
			const globalVis = st && st.visibility ? st.visibility : "transparent";
			return new Set(Object.keys(frameData).filter(id => isNoteActive(frameData[id], globalVis)));
		};
		let transitions = transitionsRef.current;
		if (idx > 0) {
			const prevActive = activeIds(framesRef.current[idx - 1]);
			const nowActive = activeIds(board);
			transitions = transitions.map((t, i) => {
				if (i !== idx - 1 || !t || !t.pairs || !t.pairs.length) return t;
				const kept = t.pairs.filter(p => {
					if (!prevActive.has(p.from)) return false;
					return p.technique === "sl" ? nowActive.has(p.to) : nowActive.has(p.from);
				});
				return kept.length === t.pairs.length ? t : { ...t, pairs: kept };
			});
		}
		framesRef.current = frames;
		transitionsRef.current = transitions;
		setFrames(frames);
		setTransitions(transitions);
		return { frames, transitions };
	}, [viewMode, captureBoard]);

	// 逐帧跳转：板面切到第 i 帧，进入覆盖编辑模式
	const gotoFrame = useCallback((i) => {
		if (viewMode !== "edit") return;
		const fs = framesRef.current;
		if (i < 0 || i >= fs.length || i === editIdxRef.current) return;
		// 先冲刷当前帧的待写入板面（防抖 250ms 内跳帧会丢最后一笔编辑）
		flushBoard();
		const frames = framesRef.current; // 冲刷写回 ref 后取最新（flushBoard 内同步更新）
		const frame = frames[i] || fs[i];
		if (applyBoard) applyBoard(frame);
		commitData(frame.data);
		setEditIdx(i);
		setPairs([]);
		setPendingFrom(null);
		setTechnique(null);
		stepStartRef.current = frame.data;
	}, [applyBoard, commitData, viewMode, flushBoard]);


	// Q 键：预览 ⇄ 编辑 切换（编辑态 Q 回预览；预览态 Q 进编辑并停在第 1 帧）
	const toggleQ = useCallback(() => {
		if (!isDynamic) {
			if (onEnter) onEnter(); // 帧1底色处理（如全部点亮音转当前色系最浅档），同步改 dataRef 后再定格
			const first = captureBoard();
			setFrames([first]);
			setTransitions([]);
			setPairs([]);
			setPendingFrom(null);
			setTechnique(null);
			setSessionClip({ id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: freshClipName(), createdAt: Date.now() });
			setEditIdx(0);
			setViewMode("edit");
			setIsDynamic(true);
			return;
		}
		if (viewMode === "preview") {
			// 预览 → 编辑：停在第 1 帧
			const fs = framesRef.current;
			if (fs.length) {
				commitData(fs[0].data);
				if (applyBoard) applyBoard(fs[0]);
			}
			setEditIdx(0);
			setPairs([]);
			setPendingFrom(null);
			setTechnique(null);
			setViewMode("edit");
			return;
		}
		// 编辑态 Q → 回预览态（整图落堆防丢；板面切回第 1 帧展示）
	if (sessionClipRef.current && framesRef.current.length) {
		saveClip({ ...sessionClipRef.current, frames: framesRef.current, transitions: transitionsRef.current });
		setClipVersion(v => v + 1);
		setPersistedOnce(true);
	}
	const fs = framesRef.current;
	if (fs.length) {
		commitData(fs[0].data);
		if (applyBoard) applyBoard(fs[0]);
	}
	setEditIdx(0);
	setPairs([]);
	setPendingFrom(null);
	setTechnique(null);
	setViewMode("preview");
	}, [isDynamic, viewMode, captureBoard, toast, onEnter, commitData, applyBoard]);

	// 指板堆续编：载入已有动图，板面切到最后一帧
	const loadClip = useCallback((clip, applyBoard) => {
		setFrames(clip.frames);
		setTransitions(clip.transitions || []);
		setPairs([]);
		setPendingFrom(null);
		setTechnique(null);
		setSessionClip({ id: clip.id, name: clip.name, createdAt: clip.createdAt });
		setEditIdx(0);
		setViewMode("preview"); // 从堆里点进来先预览：只读＋播放
		setPersistedOnce(true);
		setIsDynamic(true);
		if (applyBoard && clip.frames.length) {
			applyBoard(clip.frames[0]);
		}
	}, []);

	// 动图命名：YYMMDDHHMM（如 2610131056），重名自动加 (2)(3)…
	function freshClipName() {
		const d = new Date();
		const p = n => String(n).padStart(2, "0");
		const base = `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
		const names = new Set(loadClips().map(c => c.name));
		if (!names.has(base)) return base;
		for (let i = 2; ; i++) {
			const cand = `${base}(${i})`;
			if (!names.has(cand)) return cand;
		}
	}

	// Ctrl+N 新建动图：丢弃当前会话，开空板新档（音符全灭，连线保留；品窗等展示设置沿用当前板面）
	const newClip = useCallback(() => {
		if (onEnter) onEnter();
		const board = captureBoard();
		const emptyData = {};
		Object.entries(board.data || {}).forEach(([id, noteData]) => {
			if (id === "connections" || id.startsWith("conn-")) emptyData[id] = noteData;
			else emptyData[id] = { type: "note", color: "white", color2: null, visibility };
		});
		const emptyBoard = { ...board, data: emptyData };
		commitData(emptyData);
		if (applyBoard) applyBoard(emptyBoard);
		setFrames([emptyBoard]);
		setTransitions([]);
		setPairs([]);
		setPendingFrom(null);
		setTechnique(null);
		setSessionClip({ id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: freshClipName(), createdAt: Date.now() });
		setEditIdx(0);
		setViewMode("edit");
		setPersistedOnce(false);
	}, [captureBoard, onEnter, commitData, applyBoard, visibility]);

	// 路由进入动态页时直接开会话（板面已由外部就位）——同时建立新动图身份
	const startSession = useCallback(() => {
		if (onEnter) onEnter();
		setFrames([captureBoard()]);
		setTransitions([]);
		setPairs([]);
		setPendingFrom(null);
		setTechnique(null);
		setSessionClip({ id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: freshClipName(), createdAt: Date.now() });
		setEditIdx(0);
		setIsDynamic(true);
	}, [captureBoard, onEnter]);

	// 帧内自动保存：板面改动由 Fretboard 侧防抖调 syncFrame 写入当前帧（不落堆）
	// Ctrl+S / 切换模式时才把整图落堆（persistClip）

	// 色系切换：重写所有帧里着色音的颜色档（pale→新pale，vivid→新vivid）
	const mapFrames = useCallback((mapper) => {
		setFrames(prev => prev.map(f => ({ ...f, data: mapper(f.data) })));
	}, []);

	const mapTransitions = useCallback((mapper) => {
		setTransitions(prev => prev.map(mapper));
	}, []);

	// 前向传播：当前帧板面相对旧帧数据有变化的音符，同步写入其后所有帧（新加→后面全加；删/熄→后面全删；颜色一致）
	const propagateForward = useCallback((frames, idx, board, oldData) => {
		if (idx >= frames.length - 1) return frames;
		const boardData = board && board.data ? board.data : board || {}; // board 可能是完整板对象或纯 data
		oldData = oldData || {};
		const diffs = [];
		Object.keys(boardData).forEach(id => {
			if (id === 'connections' || id.startsWith('conn-')) return;
			if (JSON.stringify(boardData[id]) !== JSON.stringify(oldData[id])) diffs.push(id);
		});
		if (!diffs.length) return frames;
		return frames.map((f, i) => {
			if (i <= idx) return f;
			let changed = false;
			const data = { ...f.data };
			diffs.forEach(id => { data[id] = boardData[id] ? JSON.parse(JSON.stringify(boardData[id])) : undefined; if (data[id] === undefined) delete data[id]; changed = true; });
			return changed ? { ...f, data } : f;
		});
	}, []);

	// 帧内自动保存：把当前板面写入正在编辑的帧；同时清理失效滑弦 pair
	// （源音必须在上一帧亮着；sl 的目标音必须在本帧亮着；rt/hp 的源音必须在本帧亮着）
	const syncFrame = useCallback((board) => {
		if (viewMode !== "edit") return;
		setFrames(prev => {
			const idx = editIdxRef.current;
			const oldData = prev[idx]?.data || {};
			return propagateForward(prev.map((f, i) => (i === idx ? { ...f, ...board } : f)), idx, board, oldData);
		});
		const idx = editIdxRef.current;
		if (idx > 0) {
			const activeIds = st => {
				const frameData = st && st.data ? st.data : st || {};
				const globalVis = st && st.visibility ? st.visibility : "transparent";
				return new Set(Object.keys(frameData).filter(id => isNoteActive(frameData[id], globalVis)));
			};
			const prevActive = activeIds(framesRef.current[idx - 1]);
			const nowActive = activeIds(board);
			setTransitions(prev => prev.map((t, i) => {
				if (i !== idx - 1 || !t || !t.pairs || !t.pairs.length) return t;
				const kept = t.pairs.filter(p => {
					if (!prevActive.has(p.from)) return false;
					return p.technique === "sl" ? nowActive.has(p.to) : nowActive.has(p.from);
				});
				return kept.length === t.pairs.length ? t : { ...t, pairs: kept };
			}));
		}
	}, [viewMode]);


	// 按出生帧重落色：每帧里各音显示 tint(birth, N)——出生帧在当前结构里的档位
	// （加删帧后 N 变化，档位表拉伸/收缩，老音符跟随自己出生帧的新档位；相对深浅不变）
	const repaintBirthColors = useCallback((fs) => {
		if (!frameColorAt) return fs;
		return fs.map(f => {
			let changed = false;
			const data = { ...f.data };
			Object.entries(data).forEach(([id, n]) => {
				if (id === "connections" || id.startsWith("conn-") || !n || typeof n !== "object") return;
				const vis = n.visibility || f.visibility;
				if ((vis !== "visible" && vis !== "selected") || !n.color || typeof n.color !== "object" || !n.color.custom) return;
				let birth = typeof n.birth === "number" ? n.birth : null;
				if (birth === null) {
					// 兼容旧数据：按色阶位置反推出生帧
					const tints = generateTintVariants(getLevel1FillColor(n.color.name || "navy"));
					const t = tintPosition(tints, n.color.custom);
					birth = t === null ? 0 : Math.round(t * Math.max(1, fs.length - 1));
				}
				const clamped = Math.min(Math.max(0, birth), fs.length - 1);
				const target = frameColorAt(clamped, fs.length);
				if (n.color.custom !== target.custom || n.birth !== clamped) {
					data[id] = { ...n, color: { ...target }, color2: null, birth: clamped };
					changed = true;
				}
			});
			return changed ? { ...f, data } : f;
		});
	}, [frameColorAt]);

	// 加帧：当前帧之后插入一份当前板面的拷贝，编辑指针跟过去
	// （颜色语义=出生帧档案：已落色的音一律不动，新帧里新点的音才用新档位）
	const addFrame = useCallback((afterIdx) => {
		if (viewMode !== "edit") return;
		const fs = framesRef.current;
		// afterIdx = -1 表示插到最前（复制第 1 帧板面）；默认当前帧之后
		let src, at;
		if (typeof afterIdx === "number") {
			if (afterIdx < 0) { src = 0; at = 0; }
			else { src = Math.min(afterIdx, fs.length - 1); at = src + 1; }
		} else { src = editIdxRef.current; at = src + 1; }
		const cur = fs[src];
		const copy = JSON.parse(JSON.stringify(cur || {}));
		const withCopy = fs.slice();
		withCopy.splice(at, 0, copy);
		// 插入点之后的帧里，出生帧 ≥ 插入点的音符出生帧右移一位
		const shifted = withCopy.map((f, i) => {
			if (i < at) return f;
			let changed = false;
			const data = { ...f.data };
			Object.entries(data).forEach(([id, n]) => {
				if (n && typeof n === "object" && typeof n.birth === "number" && n.birth >= at) {
					data[id] = { ...n, birth: n.birth + 1 };
					changed = true;
				}
			});
			return changed ? { ...f, data } : f;
		});
		const repainted = repaintBirthColors(shifted);
		const applied = repainted[at] || copy;
		setFrames(repainted);
		setTransitions(prev => {
			const next = prev.slice();
			next.splice(Math.max(0, at - 1), 0, { technique: null, pairs: [] });
			return next;
		});
		setEditIdx(at);
		// 板面切到新帧（重落色后）
		commitData(applied.data);
		if (applyBoard) applyBoard(applied);
		stepStartRef.current = applied.data;
	}, [viewMode, repaintBirthColors, commitData, applyBoard]);

	// 删帧：删除当前编辑帧（最后一帧不可删），指针停到前一帧（删第 1 帧则停到原第 2 帧）
	const deleteFrame = useCallback((idx) => {
		if (viewMode !== "edit") return;
		const fs = framesRef.current;
		if (fs.length <= 1) return;
		const i = typeof idx === "number" ? Math.min(Math.max(0, idx), fs.length - 1) : editIdxRef.current;
		// 出生帧修正：>i 左移一位；==i（出生帧被删，音符尚存于后续帧）挂到前一帧
		const shifted = fs.filter((_, k) => k !== i).map(f => {
			let changed = false;
			const data = { ...f.data };
			Object.entries(data).forEach(([id, n]) => {
				if (n && typeof n === "object" && typeof n.birth === "number") {
					const nb = n.birth > i ? n.birth - 1 : (n.birth === i ? Math.max(0, i - 1) : n.birth);
					if (nb !== n.birth) { data[id] = { ...n, birth: nb }; changed = true; }
				}
			});
			return changed ? { ...f, data } : f;
		});
		const repainted = repaintBirthColors(shifted);
		setFrames(repainted);
		setTransitions(prev => {
			const next = prev.slice();
			const at = i > 0 ? i - 1 : 0;
			next.splice(at, 1);
			// 合并边（删中间帧时前后帧直接相邻）的过渡重置为纯 diff：
			// 旧 pairs 引用的音在删除后可能对不上，diff 会自动生成正确的亮灭动画
			if (i > 0 && at < next.length) next[at] = { technique: null, pairs: [] };
			return next;
		});
		const nextIdx = i > 0 ? i - 1 : 0;
		setEditIdx(nextIdx);
		// 板面 = 删除后停驻的那一帧（删中间帧→前一帧；删第 1 帧→原第 2 帧，绝不能显示被删帧）
		const srcIdx = i > 0 ? i - 1 : 1;
		const board = repainted[srcIdx];
		if (board) {
			commitData(board.data);
			if (applyBoard) applyBoard(board);
			stepStartRef.current = board.data;
		}
	}, [viewMode, commitData, applyBoard, repaintBirthColors]);

	// Ctrl+S：整图保存/更新到动图堆（带通知）
	const persistClip = useCallback(() => {
		if (!isDynamic || !sessionClip || framesRef.current.length === 0) return false;
		// 先冲刷：板面→帧是 250ms 防抖，落盘前强制合入当前板面，避免"手势后立刻 Ctrl+S"存进旧板面
		const { frames, transitions } = flushBoard();
		// 每帧烙"帧档色"（加载/dock 预览直接取用，动画色与板面严格一致）
		const stamped = frames.map((f, i) => {
			const ft = frameTintFromData(f.data, i, frames.length);
			return ft ? { ...f, frameTint: ft } : f;
		});
		saveClip({ ...sessionClip, frames: stamped, transitions });
		setClipVersion(v => v + 1);
		setPersistedOnce(true);
		toast?.(`已保存到动图堆（${frames.length} 帧）`, "success");
		return true;
	}, [isDynamic, sessionClip, toast, flushBoard]);

	// 预览态整包换帧（展示用，不落库）；也用于退出预览时还原快照
	const applyPreviewFrames = useCallback((frames) => {
		setFrames(frames);
	}, []);

	// 技法标注：第一下点源音（必须亮着），第二下点目标（限同弦）；返回 true 表示已消费点击
	const markNote = useCallback((noteId) => {
		if (!technique) return false;
		const data = dataRef.current;
		if (!pendingFrom) {
			if (!isNoteActive(data[noteId], visibility)) {
				toast?.("源音必须是当前亮着的音", "error");
				return true;
			}
			setPendingFrom(noteId);
			return true;
		}
		if (noteId === pendingFrom) {
			setPendingFrom(null);
			return true;
		}
		if (stringOfNote(noteId) !== stringOfNote(pendingFrom)) {
			toast?.("目标必须与源音同弦", "error");
			return true;
		}

		const fromData = data[pendingFrom] || {};
		let next = data;
		if (technique === "rt") {
			// 原位滑弦：源音保持亮，目标闪现为瞬时音（透明色）
			next = patchNote(next, noteId, { color: "trans", color2: null, visibility: "visible", noteText: fromData.noteText });
		} else {
			// sl：源音熄灭；目标自动上强色（vivid），不要求用户配色
			const vivid = getVividColor ? getVividColor() : null;
			next = patchNote(next, pendingFrom, { color: "white", color2: null, visibility, noteText: undefined });
			next = patchNote(next, noteId, {
				color: vivid || (fromData.color && fromData.color !== "white" ? fromData.color : "white"),
				color2: null,
				visibility: "visible",
				noteText: fromData.noteText
			});
		}
		commitData(next);
		setPairs(prev => [...prev.filter(p => p.from !== pendingFrom && p.to !== noteId), { from: pendingFrom, to: noteId }]);
		setPendingFrom(null);
		return true;
	}, [technique, pendingFrom, dataRef, visibility, commitData, toast]);

	// ===== 拖拽标注滑弦 =====
	// 从亮着的音拖出：移动即重置悬停计时（路过的音绝不激活）；
	// 在同弦目标上停住 ~350ms → 目标点亮强色 = 滑弦激活完成；
	// 激活后松手 = 滑弦（A 灭 B 亮）；激活后拖回 A 松手 = 原位滑弦（A 亮 B 瞬时）；
	// 未激活就松手 = 取消，板面不动
	const dragRef = useRef(null); // { from, hoverId, activatedTo, timer, moved }
	const suppressClickRef = useRef(false);

	const isDragging = useCallback(() => dragRef.current !== null, []);

	const getDragInfo = useCallback(() => {
		const d = dragRef.current;
		const info = d ? { mode: d.mode, from: d.from, hoverId: d.hoverId, activatedTo: d.activatedTo, preTo: d.preTo || null, hpArmed: !!d.hpArmed, moved: !!d.moved } : null;
		if (typeof window !== "undefined") window.__dragInfo = info; // 调试口
		return info;
	}, []);

	const beginSlideDrag = useCallback((noteId) => {
		suppressClickRef.current = false; // 清残留：上一拖拽的吞击标记不该误吞本次点击（须在点亮守卫之前——点未点亮音也走这里）
		if (viewMode !== "edit") return false;
		if (!isNoteActive(dataRef.current[noteId], visibility)) {
			// 前置划弦：从未激活音 B 起拖（激活音 A 为终点）——第一帧也可用
			dragRef.current = { mode: "pre", from: noteId, hoverId: null, activatedTo: null, preTo: null, timer: null, moved: false };
			return true;
		}
		dragRef.current = { mode: "slide", from: noteId, hoverId: null, activatedTo: null, timer: null, moved: false };
		return true;
	}, [dataRef, visibility, viewMode]);

	const markDragMove = useCallback(() => {
		const d = dragRef.current;
		if (d) d.moved = true;
	}, []);

	const startDwell = (d, noteId) => {
		if (!noteId) return;
		// 前置划弦：目标是已激活音（同弦），停 200ms 确认为 preTo；目标熄灭则取消
		if (d.mode === "pre") {
			if (noteId === d.from) return;
			if (stringOfNote(noteId) !== stringOfNote(d.from)) return;
			d.timer = setTimeout(() => {
				if (isNoteActive(dataRef.current[noteId], visibility)) d.preTo = noteId;
			}, 200);
			return;
		}
		// 拖回 A 区悬停：立刻松=原位滑弦 rt；停满 600ms（实线环变呼吸虚线环）=击勾 hp 待命
		if (noteId === d.from) {
			if (!d.activatedTo || d.hpArmed) return;
			d.timer = setTimeout(() => { d.hpArmed = true; }, 600);
			return;
		}
		if (stringOfNote(noteId) !== stringOfNote(d.from)) return;
		d.timer = setTimeout(() => {
			// 停住达标：换目标悬停 = 换激活（旧的还原为激活前状态），松手才定稿
			if (d.activatedTo && d.activatedTo !== noteId) {
				commitData(patchNote(dataRef.current, d.activatedTo, d.activatedOrig || { color: "white", color2: null, visibility }));
			}
			const orig = dataRef.current[noteId];
			d.activatedOrig = orig && orig.color ? { color: orig.color, color2: orig.color2 ?? null, visibility: orig.visibility } : null;
			d.activatedTo = noteId;
			const hint = getVividColor ? getVividColor() : null; // 激活闪现=当前帧内容色（与动画 B 闪现完全一致）
			if (hint) commitData(patchNote(dataRef.current, noteId, { color: hint, color2: null, visibility: "visible" }));
		}, 200);
	};

	const hoverSlideTarget = useCallback((noteId) => {
		const d = dragRef.current;
		if (!d) return;
		if (noteId === d.hoverId) return; // 同一音符上微动（人手抖动）：不重置计时，悬停照样激活
		clearTimeout(d.timer); // 换了目标音符才重置
		if (d.hpArmed && noteId !== d.from) d.hpArmed = false; // 离开 A 区=取消击勾待命（反馈环随之消失）
		d.hoverId = noteId;
		startDwell(d, noteId);
	}, [commitData, dataRef, getVividColor]);

	const endSlideDrag = useCallback((targetId) => {
		const d = dragRef.current;
		dragRef.current = null;
		if (!d) return false;
		clearTimeout(d.timer);
		if (d.moved) suppressClickRef.current = true; // 真拖过：吞掉引发的 click（防误切换源音/落点音）
		// 前置划弦：B→A 记到当前帧 preSlides（任何帧可用，含第 1 帧）；板面保持不变
		if (d.mode === "pre") {
			if (!d.preTo || !isNoteActive(dataRef.current[d.preTo], visibility)) return false;
			const idx = editIdxRef.current;
			setFrames(prev => prev.map((f, i) => {
				if (i !== idx) return f;
				const slides = (f.preSlides || []).filter(s => !(s.from === d.from && s.to === d.preTo));
				return { ...f, preSlides: [...slides, { from: d.from, to: d.preTo }] };
			}));
			toast?.("已设前置划弦（B 闪现滑到 A）", "success");
			return true;
		}
		if (!d.activatedTo) return false; // 未激活就松手：取消，什么都不改

		const from = d.from;
		const to = d.activatedTo; // 激活时已点亮强色
		// 触发：A 区停满 600ms 待命（hpArmed）＝击勾；否则按位置——回 A（含吸附）＝原位滑弦，其余＝滑弦
		const tech = d.hpArmed ? "hp" : (targetId === from ? "rt" : "sl");
				if (tech === "sl") {
			// 滑弦：A 熄灭；B 落定为当前帧内容色（激活时用的是浅提示色）
			const content = getVividColor ? getVividColor() : null;
			commitData(patchNote(patchNote(dataRef.current, from, { color: "white", color2: null, visibility }), to, content ? { color: content, birth: editIdxRef.current } : {}));
		} else {
			// 原位滑弦 / 击勾：A 保持亮；B 是瞬时音，板面还原（不落帧）
			commitData(patchNote(dataRef.current, to, { color: "white", color2: null, visibility, noteText: undefined }));
		}
		// 直接写入「进入当前帧」的过渡：同 from 覆盖
		const idx = editIdxRef.current;
		if (idx > 0) {
			setTransitions(prev => prev.map((t, i) => {
				if (i !== idx - 1) return t;
				const spec = t || { technique: null, pairs: [] };
				const pairs = (spec.pairs || []).filter(p => !(p.from === from && p.to === to)); // 仅同 from+to 覆盖；同源不同目标可共存（如 rt + hp）
				pairs.push({ from, to, technique: tech });
				return { ...spec, pairs };
			}));
		}
		stepStartRef.current = dataRef.current;
		return true;
	}, [commitData, dataRef, visibility]);

	// 拖拽结束后的 pointerup 会引发一次 click：吞掉，避免把刚配好的音又切换掉
	const consumeDragClick = useCallback(() => {
		const s = suppressClickRef.current;
		suppressClickRef.current = false;
		return s;
	}, []);

	const commitFrame = persistClip;

	// Esc：清空本步全部标注
	const cancelMarking = useCallback(() => {
		setPairs([]);
	}, []);

	// Ctrl+D：第 1 帧＝清空板面；其余帧＝板面还原为上一帧状态（帧内自动保存会跟进写入）
	const revertToPrevFrame = useCallback(() => {
		if (viewMode !== "edit") return;
		if (editIdxRef.current <= 0) {
			// 第 1 帧：清空所有音符（连线保留）
			const data = dataRef.current;
			const next = {};
			Object.entries(data).forEach(([id, noteData]) => {
				if (id === "connections" || id.startsWith("conn-")) next[id] = noteData;
				else next[id] = { type: "note", color: "white", color2: null, visibility };
			});
			commitData(next);
			return;
		}
		const prev = framesRef.current[editIdxRef.current - 1];
		if (!prev) return;
		commitData(prev.data);
		if (applyBoard) applyBoard(prev);
	}, [viewMode, commitData, applyBoard, visibility]);

	// 撤销本步：板面回到本步起点（最新帧定格时的状态）
	const undoStep = useCallback(() => {
		if (!isDynamic || !stepStartRef.current) return false;
		commitData(stepStartRef.current);
		setPairs([]);
		setPendingFrom(null);
		return true;
	}, [isDynamic, commitData]);

	// 动态模式普通点击：外部直接给某音写状态（自动配色用）
	// 写色对象时记出生帧 birth：颜色语义=音符永远显示其出生帧的档位色
	const paintNote = useCallback((noteId, patch) => {
		const withBirth = (patch && typeof patch.color === "object" && patch.color && viewMode === "edit")
			? { ...patch, birth: editIdxRef.current }
			: patch;
		commitData(patchNote(dataRef.current, noteId, withBirth));
	}, [commitData, dataRef, viewMode]);

	return {
		isDynamic, frames, transitions, technique, pairs, pendingFrom,
		sessionClip, clipVersion,
		toggleQ, loadClip, setTechnique,
		markNote, commitFrame, cancelMarking, undoStep, paintNote,
		beginSlideDrag, hoverSlideTarget, endSlideDrag, isDragging, consumeDragClick, markDragMove, getDragInfo,
		editIdx, gotoFrame, startSession, mapFrames, mapTransitions, viewMode, applyPreviewFrames, newClip, revertToPrevFrame,
		syncFrame, addFrame, deleteFrame, persistClip, persistedOnce
	};
}
