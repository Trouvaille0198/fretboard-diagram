import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import './fretboard.css';
import { CONSTS } from './constants';
import { updateNote, inlineCSS, noteToSolfege, calculateConnectionColor, getColorName } from './utils';
import { initColorCSSVariables } from './colorConfig';
import { useFretboardState } from './hooks/useFretboardState';
import { useConnectionState } from './hooks/useConnectionState';
import { useHistory } from './hooks/useHistory';
import { useNoteEditing } from './hooks/useNoteEditing';
import { computeNoteIndex, computeNoteName, generateNotes, generateMarkers, generateFretPath, generateStringPath, getNotePosition } from './utils/fretboardCalculations';
import { detectDropdownDirection, openConnectionToolbar, handleConnectionContextMenu, handleConnectionClick, updateConnectionColors } from './utils/connectionUtils';
import { selectColor, cycleLevel1Color, cycleLevel2Color, toggleVisibility, toggleEnharmonic, reset, saveSVG, setFretWindow, replaceAllTintNotes } from './utils/fretboardActions';
import { generateTintVariants, getLevel1FillColor, getLevel2Color, tintAt, tintPosition, resolveNoteVisualStyle } from './colorConfig';
import { createNoteClickHandler, createNoteContextMenuHandler, createDeleteNoteHandler, createFinishEditingHandler, createNoteMouseDownHandler, createConnectionDragEndHandler } from './handlers/noteHandlers';
import { createSvgClickHandler, createSvgContextMenuHandler, createSvgMouseMoveHandler, createSvgMouseDownHandler, createSvgWheelHandler, createEditableKeyDownHandler, createEditableClickHandler } from './handlers/svgHandlers';
import { createKeyboardHandler } from './handlers/keyboardHandlers';
import { FretboardMenu } from './components/FretboardMenu';
import { FretboardDock } from './components/FretboardDock';
import { TransitionFx, ScoreBoard, boardGeometry, renderBoardImage, buildNotes } from './components/ScorePieces';
import { DynamicToolbar } from './components/DynamicToolbar';
import { useDynamicMode } from './hooks/useDynamicMode';
import { TECHNIQUES, loadClips, pullClips, deleteClip, renameClip } from './utils/clipModel';
import { isLoggedIn } from './utils/api';
import { exportGifAnimation, exportWebmAnimation } from './utils/animatedExport';
import { Toast } from './components/Toast';
import { createPortal } from 'react-dom';
import { expandTimeline, stateClock, END_PAUSE_MS, accumulateStates } from './utils/timeline';
import { FretboardSVG } from './components/FretboardSVG';
import { useLanguage } from './i18n';

const COLOR_SCHEMES = ['navy', 'crimson', 'green', 'blue', 'red', 'brown'];

function Fretboard({ mode = 'normal' }) {
  const { lang, toggleLang, t } = useLanguage();

  // 使用自定义hooks
  const fretboardState = useFretboardState();
  const connectionState = useConnectionState();
  const noteEditing = useNoteEditing();

  // 解构状态
  const {
    selected, setSelected,
    selectedColorLevel, setSelectedColorLevel,
    selectedColor, setSelectedColor,
    hoveredNoteId, setHoveredNoteId,
    hoveredConnectionId, setHoveredConnectionId,
    visibility, setVisibility,
    startFret, setStartFret,
    endFret, setEndFret,
    enharmonic, setEnharmonic,
    displayMode, setDisplayMode,
    rootNote, setRootNote,
    data, setData,
    errorMessage, setErrorMessage,
    toastMessage, setToastMessage,
    toastType, setToastType,
    includeMarkers, setIncludeMarkers,
    copyOnly, setCopyOnly,
    showNotes, setShowNotes,
    horizontalCrop, setHorizontalCrop,
    verticalCrop, setVerticalCrop,
    hideDock, setHideDock,
    currentDateTime,
    dataRef,
    selectedTimeoutRef
  } = fretboardState;

  const historySnapshot = useMemo(() => ({
    data,
    startFret,
    endFret,
    enharmonic,
    displayMode,
    rootNote,
    visibility
  }), [data, startFret, endFret, enharmonic, displayMode, rootNote, visibility]);

  const applyHistorySnapshot = useCallback((snapshot) => {
    setData(snapshot?.data || {});
    setStartFret(typeof snapshot?.startFret === 'number' ? snapshot.startFret : 0);
    setEndFret(typeof snapshot?.endFret === 'number' ? snapshot.endFret : 12);
    setEnharmonic(typeof snapshot?.enharmonic === 'number' ? snapshot.enharmonic : 1);
    setDisplayMode(snapshot?.displayMode || 'note');
    setRootNote(snapshot?.rootNote ?? null);
    setVisibility(snapshot?.visibility || 'transparent');
  }, [setData, setStartFret, setEndFret, setEnharmonic, setDisplayMode, setRootNote, setVisibility]);

  const { undo, redo, beginBatch, endBatch } = useHistory(historySnapshot, applyHistorySnapshot);

  const {
    connectionMode, setConnectionMode,
    connectionStartNote, setConnectionStartNote,
    connectionStartPosition, setConnectionStartPosition,
    mousePosition, setMousePosition,
    previewHoverNote, setPreviewHoverNote,
    useColor2Level, setUseColor2Level,
    selectedConnection, setSelectedConnection,
    connectionToolbarVisible, setConnectionToolbarVisible,
    connectionToolbarPosition, setConnectionToolbarPosition,
    toolbarDropdown, setToolbarDropdown,
    toolbarDropdownDirection, setToolbarDropdownDirection,
    connectionPresetId, connectionPreset, selectConnectionPreset
  } = connectionState;

  const {
    editableText, setEditableText,
    editingNote, setEditingNote,
    editableDivVisible, setEditableDivVisible,
    editableDivX, editableDivY,
    editableDivRef,
    editNoteLabel
  } = noteEditing;

  // 下载选项状态

  // 异色模式标记
  const [inTintMode, setInTintMode] = useState(false);

  // 动图播放器（主舞台）：playingIdx 指向正在展示的帧
  const [playingIdx, setPlayingIdx] = useState(null);
  const [loopPlay, setLoopPlay] = useState(true);
  const [animSettings, setAnimSettings] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('fretboard-anim-settings') || 'null') || { holdMs: 300, transMs: 200, fps: 30, width: 720 };
      if (!s.v4) { s.holdMs = 300; s.transMs = 200; s.fps = 30; s.v4 = 1; try { localStorage.setItem('fretboard-anim-settings', JSON.stringify(s)); } catch (e) { /* ignore */ } } // 回滚提速：300/200 观感合适
      return s;
    } catch {
      return { holdMs: 300, transMs: 200, fps: 30, width: 720 };
    }
  });
  const [exporting, setExporting] = useState(null); // 'gif' | 'webm' | null
  const animSettingsRef = useRef(animSettings);
  animSettingsRef.current = animSettings;

  const updateAnimSettings = useCallback((patch) => {
    setAnimSettings(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem('fretboard-anim-settings', JSON.stringify(next));
      return next;
    });
  }, []);

  // 指板堆（动图列表）
  const [clips, setClips] = useState(() => loadClips());
  const refreshClips = useCallback(() => setClips(loadClips()), []);

  // 动态编辑模式
  const captureBoard = useCallback((dataOverride) => ({
    data: dataOverride !== undefined ? dataOverride : dataRef.current,
    startFret,
    endFret,
    enharmonic,
    displayMode,
    rootNote,
    visibility
  }), [startFret, endFret, enharmonic, displayMode, rootNote, visibility, dataRef]);

  const showToast = useCallback((message, type) => {
    setToastMessage(message);
    setToastType(type || 'success');
  }, [setToastMessage, setToastType]);

  // 会话色系（动态页专用）：色系制，默认蓝；切换时整体重刷所有帧的着色音
  const [schemeName, setSchemeName] = useState('navy');

  // 进入动态编辑：帧1已点亮的音全部转成当前色系最浅档（pale），作为后续帧配色的底
  const prepareFrame1 = useCallback(() => {
    const colorName = mode === 'dynamic' ? schemeName : (getColorName(selectedColor) && getColorName(selectedColor) !== 'trans' ? getColorName(selectedColor) : 'blue');
    const pale = generateTintVariants(getLevel1FillColor(colorName))[0];
    const data = dataRef.current;
    const next = { ...data };
    Object.entries(data).forEach(([id, noteData]) => {
      if (id === 'connections' || id.startsWith('conn-') || !noteData || typeof noteData !== 'object') return;
      const vis = noteData.visibility || visibility;
      if (vis === 'visible' || vis === 'selected') {
        next[id] = { ...noteData, color: { name: colorName, custom: pale }, color2: null, visibility: 'visible', birth: 0 };
      }
    });
    dataRef.current = next;
    setData(next);
  }, [selectedColor, schemeName, visibility, dataRef, setData]);

  // 自动配色：强色档（vivid）动态页用色系状态；普通页用当前调色盘
  // 帧位置色：帧1=pale（t=0），末帧=deep（t=1），中间按 idx/(N-1) 在色阶上连续插值
  const frameColorAt = useCallback((idx, total) => {
    const name = mode === 'dynamic' ? schemeName : getColorName(selectedColor);
    const baseName = (!name || name === 'trans') ? 'blue' : name;
    const t = total > 1 ? idx / (total - 1) : 0;
    return { name: baseName, custom: tintAt(baseName, t) };
  }, [selectedColor, schemeName, mode]);

  // 动态模式取"当前帧位置色"（点音内容色）；普通模式仍是 vivid
  const getVividColorValue = useCallback(() => {
    if (mode === 'dynamic') {
      const d = dynamicRef.current;
      return frameColorAt(d?.editIdx ?? 0, d?.frames?.length ?? 1);
    }
    const name = getColorName(selectedColor);
    const baseName = (!name || name === 'trans') ? 'blue' : name;
    const vivid = generateTintVariants(getLevel1FillColor(baseName))[1];
    return { name: baseName, custom: vivid };
  }, [selectedColor, frameColorAt, mode]);

  // 提示色＝上一帧档位（更浅，反馈线/环/激活闪现看得清；末帧档太深会看不清提示）
  const getHintColorValue = useCallback(() => {
    if (mode === 'dynamic') {
      const d = dynamicRef.current;
      return frameColorAt(Math.max(0, (d?.editIdx ?? 1) - 1), d?.frames?.length ?? 1);
    }
    return getVividColorValue();
  }, [mode, frameColorAt, getVividColorValue]);

  const applyClipBoardRef = useRef(null);
  const applyBoardStable = useCallback((board) => {
    if (applyClipBoardRef.current) applyClipBoardRef.current(board);
  }, []);
  const dynamic = useDynamicMode({ dataRef, setData, visibility, captureBoard, toast: showToast, onEnter: prepareFrame1, getVividColor: getVividColorValue, applyBoard: applyBoardStable, frameColorAt });

  // ===== 路由：动态编辑独立页 =====
  // 普通页：Q 或菜单按钮 → 携当前板面跳 #/dynamic
  const gotoDynamic = useCallback(() => {
    try { sessionStorage.setItem('fretboard-dynamic-entry', JSON.stringify(captureBoard())); } catch (e) { /* 忽略 */ }
    window.location.hash = '#/dynamic';
  }, [captureBoard]);

  // 动态页挂载：读取入口板面（或续编的动图）开 会话；URL ?c=<id> 优先（刷新/分享恢复到正在编辑的那张）
  useEffect(() => {
    if (mode !== 'dynamic') return;
    let entry = null;
    try { entry = JSON.parse(sessionStorage.getItem('fretboard-dynamic-entry') || 'null'); sessionStorage.removeItem('fretboard-dynamic-entry'); } catch (e) { /* 忽略 */ }
    let clipId = null;
    try {
      const m = window.location.hash.match(/[?&]c=([^&]+)/);
      if (m) clipId = decodeURIComponent(m[1]);
    } catch (e) { /* 忽略 */ }
    if (!clipId) {
      try { clipId = sessionStorage.getItem('fretboard-dynamic-clip'); sessionStorage.removeItem('fretboard-dynamic-clip'); } catch (e) { /* 忽略 */ }
    }
    if (!clipId && !entry) {
      // 刷新恢复：回到最近编辑的动图（预览态）
      try { clipId = localStorage.getItem('fretboard-last-clip'); } catch (e) { /* 忽略 */ }
    }
    const clip = clipId ? loadClips().find(c => c.id === clipId) : null;
    if (clip) {
      handleLoadClipRef.current(clip);
      return;
    }
    if (entry) {
      applyClipBoard(entry);
      dataRef.current = entry.data;
      setData(entry.data);
    }
    dynamic.startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [badgeEditing, setBadgeEditing] = useState(false);

  // 会话动图身份同步进 URL：新建/载入/续编后地址栏立即反映当前动图，刷新不再看错图
  useEffect(() => {
    if (mode !== 'dynamic') return;
    const id = dynamic.sessionClip?.id;
    if (!id) return;
    const target = `#/dynamic?c=${encodeURIComponent(id)}`;
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
  }, [mode, dynamic.sessionClip]);

  // 动态页内直接改地址 ?c=<id>（或从外链进入另一张）：立即换载对应动图（URL 是动图身份）
  useEffect(() => {
    if (mode !== 'dynamic') return undefined;
    const onHash = () => {
      const m = window.location.hash.match(/[?&]c=([^&]+)/);
      if (!m) return;
      const id = decodeURIComponent(m[1]);
      if (id === dynamicRef.current?.sessionClip?.id) return;
      const clip = loadClips().find(c => c.id === id);
      if (clip) handleLoadClipRef.current(clip);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [mode]);

  // 动态页 Q 退出：保存（≥2帧）并回普通页
  const exitDynamic = useCallback(() => {
    dynamic.toggleQ();
    window.location.hash = '';
  }, [dynamic]);

  // 色系切换：一律真切换（编辑/预览同权）——重刷全部帧的着色音并更新会话色系。
  // 曾有"预览态试色不落库、退出预览快照还原"机制：用户预览里换了色系，回编辑全部弹回旧色，
  // 导出也全是旧色（"换了色系还是蓝色"的根因），反直觉，已拆除。
  // 再点当前色系＝强制重刷（自愈历史 bug 留在帧里的杂色音，不切色系）
  const switchScheme = useCallback((name) => {
    if (!COLOR_SCHEMES.includes(name)) return;
    const restyleData = (data) => {
      const next = { ...data };
      Object.entries(data).forEach(([id, noteData]) => {
        if (id === 'connections' || id.startsWith('conn-') || !noteData || typeof noteData !== 'object') return;
        const c = noteData.color;
        if (c && typeof c === 'object' && c.custom && c.name && COLOR_SCHEMES.includes(c.name)) {
          const total = Math.max(1, (dynamicRef.current?.frames?.length) || 1);
          let t = typeof noteData.birth === 'number' ? noteData.birth / Math.max(1, total - 1) : null;
          if (t === null) {
            const oldTints = generateTintVariants(getLevel1FillColor(c.name));
            t = tintPosition(oldTints, c.custom); // 旧数据无出生帧：按色阶位置反推
          }
          if (t !== null) next[id] = { ...noteData, color: { name, custom: tintAt(name, t) } };
        }
      });
      return next;
    };
    const nextData = restyleData(dataRef.current);
    dataRef.current = nextData;
    setData(nextData);
    dynamic.mapFrames(restyleData);
    if (name !== schemeName) setSchemeName(name);
  }, [schemeName, dynamic, dataRef, setData]);

  const dynamicRef = useRef(dynamic);
  dynamicRef.current = dynamic;
  // 主题
  const [theme, setTheme] = useState(() => localStorage.getItem('fretboard-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fretboard-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  // Refs
  const svgElementRef = useRef(null);
  const notesElementRef = useRef(null);
  const toolbarRef = useRef(null);
  const buttonClickRef = useRef({ preset: false, reverseCurvature: false, grayed: false });
  const prevNoteColorsRef = useRef({});
  const brushPaintStateRef = useRef({ armed: false, dragged: false, lastPaintedNoteId: null });
  const connectionDragActiveRef = useRef(false);
  const suppressBrushClickRef = useRef(false);

  // 预览态查看帧（点缩略图）：静态展示
  const [previewFrame, setPreviewFrame] = useState(null);
  const previewFrameRef = useRef(null);
  // 展开时间轴：hp（击勾）帧拆 3 子拍（须在 dynamic 声明后、playingBoard 使用前）
  // 累积式预览（"存在过的点不消失"）：激活过的音永不熄灭，随播放逐音铺满
  const [cumulativeView, setCumulativeView] = useState(false);
  const playSteps = useMemo(() => {
    const hold = Number(animSettings.holdMs) > 0 ? Number(animSettings.holdMs) : 300;
    const trans = Number(animSettings.transMs) > 0 ? Number(animSettings.transMs) : 200;
    const tl = expandTimeline(dynamic.frames, dynamic.transitions, hold, trans);
    if (!cumulativeView) return tl;
    return { ...tl, states: accumulateStates(tl.states) }; // 结构/时钟不变，仅板面态累积
  }, [dynamic.frames, dynamic.transitions, animSettings.holdMs, animSettings.transMs, cumulativeView]);
  const playStepsRef = useRef(playSteps);
  playStepsRef.current = playSteps;

  // 播放中：主指板展示动图的帧，而不是编辑器草稿
  const playingBoard = playingIdx !== null && playSteps.states[playingIdx] ? playSteps.states[playingIdx]
    : (dynamic.viewMode === 'preview' && previewFrame !== null && dynamic.frames[previewFrame] ? dynamic.frames[previewFrame] : null);
  const view = playingBoard
    ? {
      data: playingBoard.data,
      startFret: playingBoard.startFret,
      endFret: playingBoard.endFret,
      enharmonic: playingBoard.enharmonic,
      displayMode: playingBoard.displayMode,
      rootNote: playingBoard.rootNote,
      visibility: playingBoard.visibility
    }
    : { data, startFret, endFret, enharmonic, displayMode, rootNote, visibility };

  // 计算值
  const numFrets = view.endFret - view.startFret;
  const fretboardWidth = CONSTS.fretWidth * numFrets;
  const leftOffset = CONSTS.offsetX + CONSTS.fretWidth / 2;
  const svgWidth = fretboardWidth + leftOffset + CONSTS.offsetX;
  const zeroFretX = CONSTS.offsetX - CONSTS.fretWidth / 2;
  const zeroFretLeftEdge = zeroFretX - CONSTS.circleRadius;
  const svgViewBoxX = zeroFretLeftEdge - 5;
  const svgViewBoxWidth = svgWidth - svgViewBoxX;
  const bottomMarkerY = CONSTS.offsetY + CONSTS.fretHeight + CONSTS.stringSpacing * 0.7;
  const topMarkerY = CONSTS.offsetY - CONSTS.stringSpacing * 0.5;
  const svgHeight = bottomMarkerY + 20;
  const svgViewBoxY = topMarkerY - 20;
  const svgViewBoxHeight = svgHeight - svgViewBoxY;

  // 主板 SVG 宽度内联钉死：帧切换（含空板帧）时 CSS 内在尺寸计算会塌 0 或撑爆，
  // 导致整板消失/缩放跳动；宽度必须只由品窗决定
  useEffect(() => {
    if (svgElementRef.current) {
      svgElementRef.current.style.width = `${svgWidth}px`;
    }
  }, [svgWidth, playingIdx, data]);

  // 计算函数
  const computeNoteIndexMemo = useCallback((fret, string) => computeNoteIndex(fret, string), []);
  const computeNoteNameMemo = useCallback((fret, string) => computeNoteName(fret, string, view.enharmonic), [view.enharmonic]);

  // 生成数据
  const notes = useMemo(() =>
    generateNotes(view.startFret, view.endFret, view.data, view.displayMode, view.rootNote, view.enharmonic, view.visibility, computeNoteNameMemo, computeNoteIndexMemo, noteToSolfege),
    [view.startFret, view.endFret, view.data, view.displayMode, view.rootNote, view.enharmonic, view.visibility, computeNoteNameMemo, computeNoteIndexMemo]
  );
  const markers = useMemo(() => generateMarkers(view.startFret, view.endFret), [view.startFret, view.endFret]);
  const fretPath = useMemo(() => generateFretPath(view.startFret, view.endFret), [view.startFret, view.endFret]);
  const connections = useMemo(() => (view.data && view.data.connections) ? view.data.connections : {}, [view.data]);

  // 获取note位置
  const getNotePositionMemo = useCallback((noteId) => getNotePosition(noteId, notes), [notes]);

  // 初始化
  useEffect(() => {
    initColorCSSVariables();
  }, []);

  // 自动解除selected状态
  useEffect(() => {
    if (selectedTimeoutRef.current) {
      clearTimeout(selectedTimeoutRef.current);
      selectedTimeoutRef.current = null;
    }

    if (selected) {
      selectedTimeoutRef.current = setTimeout(() => {
        const noteElement = selected.element || document.getElementById(selected.id);
        if (noteElement) {
          updateNote(noteElement, data, { visibility: 'visible' });
          setData(prevData => {
            const newData = { ...prevData };
            if (selected.id in newData) {
              newData[selected.id] = { ...newData[selected.id], visibility: 'visible' };
            }
            return newData;
          });
        }
        setSelected(null);
        selectedTimeoutRef.current = null;
      }, 500);
    }

    return () => {
      if (selectedTimeoutRef.current) {
        clearTimeout(selectedTimeoutRef.current);
        selectedTimeoutRef.current = null;
      }
    };
  }, [selected, data, setData, setSelected]);

  // 连线颜色更新
  useEffect(() => {
    updateConnectionColors(data, setData, calculateConnectionColor);
  }, [data, setData]);

  // 初始化notes数据（播放中跳过：帧数据来自动图，不能往编辑器数据里补写）
  useEffect(() => {
    if (playingIdx !== null || (dynamic.viewMode === 'preview' && previewFrame !== null)) return;
    notes.forEach(note => {
      if (!(note.id in data)) {
        setData(prevData => ({
          ...prevData,
          [note.id]: { type: 'note', color: 'white', visibility: visibility }
        }));
      }
    });

    if (selected) {
      const noteIds = notes.map(n => n.id);
      if (!noteIds.includes(selected.id)) {
        setSelected(null);
      }
    }
  }, [notes, selected, data, visibility, setData, setSelected, playingIdx]);

  // 更新DOM中的note样式（播放中跳过：此 effect 按编辑器数据直接改 DOM，
  // 会覆盖 React 按当前帧渲染的 note 状态，导致播放时高亮消失、板面发黑）
  useEffect(() => {
    if (playingIdx !== null || (dynamic.viewMode === 'preview' && previewFrame !== null)) return;
    if (notesElementRef.current) {
      notes.forEach(note => {
        const noteElement = document.getElementById(note.id);
        if (noteElement) {
          const noteData = data[note.id] || { type: 'note', color: 'white', visibility: visibility };
          updateNote(noteElement, data, {
            type: noteData.type || 'note',
            color: noteData.color || 'white',
            color2: noteData.color2 || null,
            visibility: noteData.visibility || visibility
          });
        }
      });
    }
  }, [notes, data, visibility, playingIdx]);

  // 下拉菜单方向检测
  useEffect(() => {
    if (toolbarDropdown && toolbarRef.current) {
      setTimeout(() => {
        const buttonSelector = `.toolbar-icon-btn[title="${toolbarDropdown === 'type' ? '类型' : toolbarDropdown === 'arrow' ? '箭头' : toolbarDropdown === 'width' ? '粗细' : '弧度'}"]`;
        const button = toolbarRef.current?.querySelector(buttonSelector);
        if (button) {
          const direction = detectDropdownDirection(button, toolbarRef, svgElementRef);
          if (direction !== toolbarDropdownDirection) {
            setToolbarDropdownDirection(direction);
          }
        }
      }, 0);
    }
  }, [toolbarDropdown, toolbarDropdownDirection, setToolbarDropdownDirection]);

  useEffect(() => {
    const stopBrushPaint = () => {
      const wasBatching = brushPaintStateRef.current.armed;
      brushPaintStateRef.current.armed = false;
      brushPaintStateRef.current.lastPaintedNoteId = null;

      if (wasBatching) {
        endBatch();
      }
    };

    window.addEventListener('pointerup', stopBrushPaint);
    window.addEventListener('pointercancel', stopBrushPaint);
    window.addEventListener('blur', stopBrushPaint);

    return () => {
      window.removeEventListener('pointerup', stopBrushPaint);
      window.removeEventListener('pointercancel', stopBrushPaint);
      window.removeEventListener('blur', stopBrushPaint);
    };
  }, [endBatch]);

  const colorsMatch = useCallback((left, right) => {
    if (left === right) return true;
    if (!left || !right) return false;
    if (typeof left === 'object' && typeof right === 'object') {
      return left.name === right.name && left.custom === right.custom;
    }
    return false;
  }, []);

  const startBrushPaint = useCallback((pointerType) => {
    // 触屏不启用拖染：避免和页面滚动手势抢事件（点按着色仍可用）
    if (pointerType === 'touch') {
      brushPaintStateRef.current.armed = false;
      brushPaintStateRef.current.dragged = false;
      brushPaintStateRef.current.lastPaintedNoteId = null;
      return;
    }
    if (connectionMode || selectedColorLevel === null || selectedColor === null) {
      brushPaintStateRef.current.armed = false;
      brushPaintStateRef.current.dragged = false;
      brushPaintStateRef.current.lastPaintedNoteId = null;
      return;
    }

    brushPaintStateRef.current.armed = true;
    brushPaintStateRef.current.dragged = false;
    brushPaintStateRef.current.lastPaintedNoteId = null;
    beginBatch();
  }, [connectionMode, selectedColorLevel, selectedColor, beginBatch]);

  const shouldBrushPaint = useCallback((event) => {
    return brushPaintStateRef.current.armed && (event.buttons & 1) === 1 && selectedColorLevel !== null && selectedColor !== null;
  }, [selectedColorLevel, selectedColor]);

  const markBrushDragging = useCallback(() => {
    brushPaintStateRef.current.dragged = true;
  }, []);

  const applyBrushPaintToNote = useCallback((noteId) => {
    if (selectedColorLevel === null || !selectedColor || brushPaintStateRef.current.lastPaintedNoteId === noteId) {
      return;
    }

    const noteElement = document.getElementById(noteId);
    if (!noteElement) {
      return;
    }

    const noteData = dataRef.current[noteId] || { type: 'note', color: 'white', visibility };
    const currentColor = noteData.color || 'white';
    const currentColor2 = noteData.color2 || null;
    const currentVisibility = noteData.visibility || visibility;
    let nextUpdate;

    if (selectedColorLevel === 1) {
      const selectedIsSingleOnly = getColorName(selectedColor) === 'trans';
      const currentHasSingleOnlyColor = getColorName(currentColor) === 'trans' || getColorName(currentColor2) === 'trans';

      if (colorsMatch(currentColor, selectedColor) && currentColor2 === null && currentVisibility === 'visible') {
        nextUpdate = { visibility: 'visible' };
      } else if (selectedIsSingleOnly || currentHasSingleOnlyColor) {
        nextUpdate = { color: selectedColor, color2: null, visibility: 'visible' };
      } else {
        nextUpdate = { color: selectedColor, color2: null, visibility: 'visible' };
      }
    } else {
      nextUpdate = { color2: selectedColor, visibility: 'visible' };
    }

    const nextColor = 'color' in nextUpdate ? nextUpdate.color : currentColor;
    const nextColor2 = 'color2' in nextUpdate ? nextUpdate.color2 : currentColor2;
    const nextVisibility = nextUpdate.visibility || currentVisibility;

    if (colorsMatch(currentColor, nextColor) && colorsMatch(currentColor2, nextColor2) && currentVisibility === nextVisibility) {
      brushPaintStateRef.current.lastPaintedNoteId = noteId;
      return;
    }

    brushPaintStateRef.current.lastPaintedNoteId = noteId;
    suppressBrushClickRef.current = true;

    setData(prevData => {
      const newData = { ...prevData };
      if (!(noteId in newData)) {
        newData[noteId] = {};
      }
      newData[noteId] = { ...newData[noteId], ...nextUpdate };
      dataRef.current = newData;
      return newData;
    });
  }, [selectedColorLevel, selectedColor, visibility, colorsMatch, setData, dataRef]);

  const consumePendingBrushClick = useCallback(() => {
    if (!suppressBrushClickRef.current) {
      return false;
    }

    suppressBrushClickRef.current = false;
    return true;
  }, []);

  // 全局点击事件
  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (connectionToolbarVisible) {
        const toolbarElement = document.querySelector('.connection-toolbar');
        if (toolbarElement && !toolbarElement.contains(event.target)) {
          setConnectionToolbarVisible(false);
          setToolbarDropdown(null);
        }
      }
    };

    if (connectionToolbarVisible) {
      setTimeout(() => {
        document.addEventListener('click', handleDocumentClick);
      }, 0);
    }

    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [connectionToolbarVisible, setConnectionToolbarVisible, setToolbarDropdown]);

  // 全局右键事件
  useEffect(() => {
    const handleDocumentContextMenu = (event) => {
      if (connectionMode) {
        event.preventDefault();
        setConnectionMode(false);
        setConnectionStartNote(null);
        setConnectionStartPosition(null);
        setMousePosition(null);
        setPreviewHoverNote(null);
        setUseColor2Level(false);
      }
    };

    if (connectionMode) {
      document.addEventListener('contextmenu', handleDocumentContextMenu);
    }

    return () => {
      document.removeEventListener('contextmenu', handleDocumentContextMenu);
    };
  }, [connectionMode, setConnectionMode, setConnectionStartNote, setConnectionStartPosition, setMousePosition, setPreviewHoverNote, setUseColor2Level]);

  // 创建事件处理器（动态模式选中技法工具时，点击优先走技法标注）
  const baseNoteClick = useCallback(createNoteClickHandler({
    data, setData, visibility, selected, setSelected,
    selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor,
    connectionMode, consumePendingBrushClick, updateNote: updateNote
  }), [data, setData, visibility, selected, setSelected, selectedColorLevel, selectedColor,
    setSelectedColorLevel, setSelectedColor,
    connectionMode, consumePendingBrushClick]);

  const handleNoteClick = useCallback((event, noteId) => {
    const dyn = dynamicRef.current;
    if (dyn.isDynamic && dyn.viewMode !== 'edit') return; // 预览态只读
    // 动态模式：点击＝自动配色三态；拖拽生成的滑弦会引发 click，先吞掉
    if (dyn.isDynamic) {
      if (dyn.consumeDragClick()) return;
      const noteData = dataRef.current[noteId] || {};
      const vis = noteData.visibility || visibility;
      const active = (vis === 'visible' || vis === 'selected') && noteData.color && noteData.color !== 'white';
      if (!active) {
        dyn.paintNote(noteId, { color: getVividColorValue(), color2: null, visibility: 'visible' });
      } else {
        dyn.paintNote(noteId, { color: 'white', color2: null, visibility });
      }
      return;
    }
    baseNoteClick(event, noteId);
  }, [baseNoteClick, visibility, dataRef, getVividColorValue]);

  // 按下音符：动态模式优先进入滑弦拖拽（从亮着的音拖出）；否则走连线拖拽
  const baseNoteMouseDown = useCallback(createNoteMouseDownHandler({
    connectionMode, data, visibility, notes,
    setConnectionStartNote, setConnectionStartPosition, connectionDragActiveRef
  }), [connectionMode, data, visibility, notes, setConnectionStartNote, setConnectionStartPosition]);

  const handleNoteMouseDown = useCallback((event, noteId) => {
    if (dynamicRef.current.isDynamic) {
      if (playingIdx !== null) setPlayingIdx(null); // 播放中按下=停止播放（否则 playing 类挡住指针，手势全失效）
      if (dynamicRef.current.beginSlideDrag(noteId)) return;
    }
    baseNoteMouseDown(event, noteId);
  }, [baseNoteMouseDown]);

  // 动态模式：全局拖拽跟踪（移动即重置悬停；实时反馈动画），并屏蔽连线模式
  const [dragPos, setDragPos] = useState(null); // 拖拽中的指针位置（client 坐标，跟手反馈用）
  useEffect(() => {
    if (!dynamic.isDynamic) return;
    if (connectionMode) setConnectionMode(false);
    const noteAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const g = el?.closest?.('g.note');
      return g ? g.id : null;
    };
    const noteDist = (id, x, y) => {
      // 用 circle（不是 g 包围盒——g 含音名文字会让中心偏移）的屏幕圆心
      const c = svgElementRef.current?.querySelector('#' + id + ' circle') || svgElementRef.current?.querySelector('#' + id)?.querySelector('circle');
      if (!c) return Infinity;
      const r = c.getBoundingClientRect();
      return Math.hypot(r.x + r.width / 2 - x, r.y + r.height / 2 - y);
    };
    // A 侧区域判定：明显更近 A（按 A↔B 距离三分之一划界）即视为"在 A 上"——松手判 rt、悬停计击勾待命，同一区域
    const releaseTargetAt = (x, y) => {
      const base = noteAt(x, y);
      const d = dynamicRef.current.getDragInfo?.();
      if (!d || !d.activatedTo || d.activatedTo === d.from || base === d.from) return base;
      const dA = noteDist(d.from, x, y), dB = noteDist(d.activatedTo, x, y);
      if (!Number.isFinite(dA) || dA + dB === 0) return base;
      if (dA < dB && dA / (dA + dB) < 0.34) return d.from;
      return base;
    };
    const move = e => {
      if (!dynamicRef.current.isDragging()) return;
      dynamicRef.current.markDragMove();
      dynamicRef.current.hoverSlideTarget(releaseTargetAt(e.clientX, e.clientY));
      setDragPos({ x: e.clientX, y: e.clientY });
    };
    const up = e => {
      if (!dynamicRef.current.isDragging()) return;
      dynamicRef.current.endSlideDrag(releaseTargetAt(e.clientX, e.clientY));
      setDragPos(null);
    };
    const cancel = () => {
      if (dynamicRef.current.isDragging()) dynamicRef.current.endSlideDrag(null);
      setDragPos(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [dynamic.isDynamic, connectionMode, setConnectionMode]);

  // 拖拽实时反馈：源音到指针的连线 + 跟手光点（激活后目标音加高亮环），渲染进主板 svg 同坐标系
  // 拖拽期间心跳刷新：hpArmed 在 ref 里翻转（600ms 定时器）不会触发渲染，需周期性重读才能把待命环刷上屏
  useEffect(() => {
    if (!dragPos) return undefined;
    const t = setInterval(() => setDragPos(p => (p ? { ...p } : p)), 110);
    return () => clearInterval(t);
  }, [dragPos !== null]);

  const dragInfo = dynamic.isDynamic && dragPos ? dynamic.getDragInfo() : null;
  const dragFeedbackG = useMemo(() => {
    if (!dragInfo || !dragPos || !svgElementRef.current) return null;
    const svg = svgElementRef.current;
    const toSvg = (x, y) => {
      const pt = svg.createSVGPoint();
      pt.x = x; pt.y = y;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      return { x: +p.x.toFixed(1), y: +p.y.toFixed(1) };
    };
    const cur = toSvg(dragPos.x, dragPos.y); // 先算指针 svg 坐标（pre 分支也要用）
    if (dragInfo.mode === 'pre') {
      // 前置划弦反馈：金色虚线 B→光标；确认目标 A 后 B→A 实线
      const fromPos0 = getNotePositionMemo(dragInfo.from);
      if (!fromPos0) return null;
      const gold = 'var(--app-accent, #f3ba62)';
      const targetPos0 = dragInfo.preTo ? getNotePositionMemo(dragInfo.preTo) : null;
      return { fromPos: fromPos0, cur, vivid: gold, targetPos: targetPos0, armedPos: null, returnReadyPos: null };
    }
    const anchorId = dragInfo.activatedTo || dragInfo.from; // 激活后锚点=B：再拖时线从 B 出发
    const fromPos = getNotePositionMemo(anchorId) || getNotePositionMemo(dragInfo.from);
    if (!fromPos) return null;
    const vivid = getHintColorValue().custom; // 提示色=上一帧档（浅）
    const targetPos = dragInfo.activatedTo ? getNotePositionMemo(dragInfo.activatedTo) : null;
    const aPos = getNotePositionMemo(dragInfo.from);
    const armedPos = dragInfo.hpArmed ? aPos : null; // 击勾待命（A 区停满 0.6s）：A 呼吸虚线环
    // 回程进入 A 区（明显更近 A，松手即吸附判回 A=原位滑弦）：A 立即亮实线环，与待命虚线环区分
    let returnReadyPos = null;
    if (!armedPos && dragInfo.activatedTo && targetPos && aPos) {
      const dA = Math.hypot(cur.x - aPos.x, cur.y - aPos.y);
      const dB = Math.hypot(cur.x - targetPos.x, cur.y - targetPos.y);
      if (dA < dB && dA / (dA + dB) < 0.34) returnReadyPos = aPos;
    }
    return { fromPos, cur, vivid, targetPos, armedPos, returnReadyPos };
  }, [dragInfo, dragPos, getNotePositionMemo, getHintColorValue]);

  // 编辑态技法标记：当前帧的滑弦/原位/击勾/前置划弦在板面常驻可见、互相区分
  // 悬停某条标注线 + Backspace/Delete = 删除该标注（hoveredPair 同步 ref 供键盘取用）
  const [hoveredPair, setHoveredPair] = useState(null);
  const hoveredPairRef = useRef(null);
  hoveredPairRef.current = hoveredPair;
  const deleteHoveredPair = useCallback(() => {
    const m = hoveredPairRef.current;
    if (!m || !dynamicRef.current?.deletePair) return false;
    setHoveredPair(null);
    return dynamicRef.current.deletePair(m.from, m.to);
  }, []);
  const techMarksG = useMemo(() => {
    if (mode !== 'dynamic' || dynamic.viewMode !== 'edit' || !svgElementRef.current) return null;
    const idx = dynamic.editIdx;
    const marks = [];
    const posOf = id => getNotePositionMemo(id);
    const hint = getHintColorValue().custom;
    const gold = 'var(--app-accent, #f3ba62)';
    const pairs = (idx > 0 && dynamic.transitions[idx - 1]?.pairs) || [];
    pairs.forEach(p => {
      const a = posOf(p.from), b = posOf(p.to);
      if (!a || !b) return;
      marks.push({ tech: p.technique, a, b, from: p.from, to: p.to });
    });
    ((dynamic.frames[idx]?.preSlides) || []).forEach(s => {
      const a = posOf(s.from), b = posOf(s.to);
      if (!a || !b) return;
      marks.push({ tech: 'pre', a, b, from: s.from, to: s.to });
    });
    if (!marks.length) return null;
    return { marks, hint, gold };
  }, [mode, dynamic.viewMode, dynamic.editIdx, dynamic.transitions, dynamic.frames, getNotePositionMemo, getHintColorValue]);

  // Chrome 不认 SVG 元素上的 touch-action，触屏拖拽连线会被滚动手势打断；
  // 用非被动 touchmove 在拖拽进行时阻止默认滚动，其余情况照常滚屏
  useEffect(() => {
    const svg = svgElementRef.current;
    if (!svg) {
      return;
    }
    const guardTouchScroll = (event) => {
      if (connectionDragActiveRef.current) {
        event.preventDefault();
      }
    };
    svg.addEventListener('touchmove', guardTouchScroll, { passive: false });
    return () => svg.removeEventListener('touchmove', guardTouchScroll);
  }, []);

  // 拖拽连线松开：落在可见音符上生成连线，否则取消
  const handleConnectionDragEnd = useCallback(createConnectionDragEndHandler({
    connectionMode, connectionStartNote, notes, data, visibility, svgElementRef,
    connections, connectionPreset, useColor2Level, setData,
    setConnectionStartNote, setConnectionStartPosition, setMousePosition,
    setPreviewHoverNote, setUseColor2Level, connectionDragActiveRef
  }), [connectionMode, connectionStartNote, notes, data, visibility, svgElementRef,
    connections, connectionPreset, useColor2Level, setData,
    setConnectionStartNote, setConnectionStartPosition, setMousePosition,
    setPreviewHoverNote, setUseColor2Level]);

  // 拖拽期间监听 window 的 pointerup（触屏/鼠标统一），拖出指板松开也能正确收尾
  useEffect(() => {
    if (!connectionMode || !connectionStartNote) {
      return;
    }
    window.addEventListener('pointerup', handleConnectionDragEnd);
    window.addEventListener('pointercancel', handleConnectionDragEnd);
    return () => {
      window.removeEventListener('pointerup', handleConnectionDragEnd);
      window.removeEventListener('pointercancel', handleConnectionDragEnd);
    };
  }, [connectionMode, connectionStartNote, handleConnectionDragEnd]);

  const handleNoteContextMenu = useCallback(createNoteContextMenuHandler({
    selected, setSelected, data, setData, updateNote: updateNote
  }), [selected, setSelected, data, setData]);

  const deleteNote = useCallback(createDeleteNoteHandler({
    selected, setSelected, visibility, data, setData, updateNote: updateNote
  }), [selected, setSelected, visibility, data, setData]);

  const finishEditing = useCallback(createFinishEditingHandler({
    editingNote, setEditingNote, editableText, setEditableText, setEditableDivVisible, data, setData, updateNote: updateNote
  }), [editingNote, setEditingNote, editableText, setEditableText, setEditableDivVisible, data, setData]);

  const handleSvgClick = useCallback(createSvgClickHandler({
    connectionMode, connectionStartNote, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level, selected, setSelected,
    data, setData, connectionToolbarVisible, setConnectionToolbarVisible, setToolbarDropdown,
    updateNote: updateNote
  }), [connectionMode, connectionStartNote, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level, selected, setSelected,
    data, setData, connectionToolbarVisible, setConnectionToolbarVisible, setToolbarDropdown]);

  const handleSvgContextMenu = useCallback(createSvgContextMenuHandler({
    connectionMode, setConnectionMode, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level
  }), [connectionMode, setConnectionMode, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level]);

  const handleSvgMouseMove = useCallback(createSvgMouseMoveHandler({
    connectionMode, connectionStartNote, svgElementRef, setMousePosition,
    notes, data, visibility, setPreviewHoverNote, previewHoverNote,
    shouldBrushPaint, applyBrushPaintToNote, markBrushDragging
  }), [connectionMode, connectionStartNote, setMousePosition, notes, data, visibility, setPreviewHoverNote, previewHoverNote, shouldBrushPaint, applyBrushPaintToNote, markBrushDragging]);

  // svg 层按下：动态模式整体屏蔽（连线预览/拖染刷子让位给滑弦拖拽，防止路过音符被染色）
  const baseSvgMouseDown = useCallback(createSvgMouseDownHandler({
    connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level, setUseColor2Level, startBrushPaint
  }), [connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level, setUseColor2Level, startBrushPaint]);

  const handleSvgMouseDown = useCallback((event, ...rest) => {
    if (dynamicRef.current.isDynamic) return;
    baseSvgMouseDown(event, ...rest);
  }, [baseSvgMouseDown]);
  const handleSvgWheel = useCallback(createSvgWheelHandler({
    connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level, setUseColor2Level
  }), [connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level, setUseColor2Level]);

  const handleEditableKeyDown = useCallback(createEditableKeyDownHandler(), []);
  const handleEditableClick = useCallback(createEditableClickHandler(), []);

  // 连线相关处理器
  const openConnectionToolbarMemo = useCallback((connectionId) => {
    openConnectionToolbar(connectionId, connections, getNotePositionMemo,
      setConnectionToolbarPosition, setSelectedConnection, setConnectionToolbarVisible, setToolbarDropdown);
  }, [connections, getNotePositionMemo, setConnectionToolbarPosition, setSelectedConnection, setConnectionToolbarVisible, setToolbarDropdown]);

  const handleConnectionContextMenuMemo = useCallback((event, connectionId) => {
    handleConnectionContextMenu(event, connectionId, openConnectionToolbarMemo);
  }, [openConnectionToolbarMemo]);

  const handleConnectionClickMemo = useCallback((event, connectionId) => {
    handleConnectionClick(event, connectionId, openConnectionToolbarMemo);
  }, [openConnectionToolbarMemo]);

  // 工具函数
  const selectColorMemo = useCallback((level, color, customColor = null) => {
    selectColor(level, color, selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor, customColor);
    // 单击退出异色模式
    if (!customColor) {
      setInTintMode(false);
    }
  }, [selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor]);

  // 单击颜色：选中基色并展开异色版本面板
  const openTintPaletteMemo = useCallback((level, color) => {
    selectColor(level, color, selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor);
    setInTintMode(color !== 'trans');
  }, [selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor]);

  const cycleLevel1ColorMemo = useCallback(() => {
    cycleLevel1Color(selectedColorLevel, selectedColor, selectColorMemo, generateTintVariants, getLevel1FillColor, inTintMode, 1);
  }, [selectedColorLevel, selectedColor, selectColorMemo, inTintMode]);

  const cycleLevel1ColorReverseMemo = useCallback(() => {
    cycleLevel1Color(selectedColorLevel, selectedColor, selectColorMemo, generateTintVariants, getLevel1FillColor, inTintMode, -1);
  }, [selectedColorLevel, selectedColor, selectColorMemo, inTintMode]);

  const cycleLevel2ColorMemo = useCallback(() => {
    cycleLevel2Color(selectedColorLevel, selectedColor, selectColorMemo, generateTintVariants, getLevel2Color, inTintMode, 1);
  }, [selectedColorLevel, selectedColor, selectColorMemo, inTintMode]);

  const cycleLevel2ColorReverseMemo = useCallback(() => {
    cycleLevel2Color(selectedColorLevel, selectedColor, selectColorMemo, generateTintVariants, getLevel2Color, inTintMode, -1);
  }, [selectedColorLevel, selectedColor, selectColorMemo, inTintMode]);

  const cyclePaletteTintColorMemo = useCallback((colorName, direction = 1) => {
    const tintVariants = generateTintVariants(getLevel1FillColor(colorName));
    const actualColorName = selectedColor && typeof selectedColor === 'object' ? selectedColor.name : selectedColor;
    const currentCustom = selectedColor && typeof selectedColor === 'object' ? selectedColor.custom : null;
    const currentIndex = selectedColorLevel === 1 && actualColorName === colorName && currentCustom
      ? tintVariants.indexOf(currentCustom)
      : -1;
    const nextIndex = currentIndex === -1
      ? direction > 0 ? 0 : tintVariants.length - 1
      : (currentIndex + direction + tintVariants.length) % tintVariants.length;

    selectColorMemo(1, colorName, tintVariants[nextIndex]);
    setInTintMode(true);
  }, [selectedColorLevel, selectedColor, selectColorMemo, setInTintMode]);

  const toggleVisibilityMemo = useCallback(() => {
    toggleVisibility(visibility, setVisibility, notesElementRef, data, updateNote);
    setData(prevData => {
      const newData = { ...prevData };
      for (const [key, value] of Object.entries(newData)) {
        if (key.startsWith('conn-')) continue;
        if (value && typeof value === 'object' && value.visibility !== 'visible' && value.visibility !== 'selected') {
          newData[key] = { ...value, visibility: visibility === 'hidden' ? 'transparent' : 'hidden' };
        }
      }
      return newData;
    });
  }, [visibility, setVisibility, data, setData]);

  const toggleEnharmonicMemo = useCallback(() => {
    toggleEnharmonic(enharmonic, setEnharmonic);
  }, [enharmonic, setEnharmonic]);

  const replaceAllTintNotesMemo = useCallback((targetColorName) => {
    replaceAllTintNotes(targetColorName, data, setData, notesElementRef, updateNote, generateTintVariants, getLevel1FillColor, getLevel2Color);
  }, [data, setData, generateTintVariants, getLevel1FillColor, getLevel2Color]);

  const resetMemo = useCallback(() => {
    reset(visibility, setData, setSelected, notesElementRef, data, updateNote, setStartFret, setEndFret, setDisplayMode, setRootNote, setEnharmonic);
  }, [visibility, setData, setSelected, data, setStartFret, setEndFret, setDisplayMode, setRootNote, setEnharmonic]);

  const saveSVGMemo = useCallback(() => {
    saveSVG(selected, setSelected, data, updateNote, connectionToolbarVisible, setConnectionToolbarVisible, svgElementRef, inlineCSS, displayMode, rootNote, enharmonic, startFret, endFret, includeMarkers, copyOnly, showNotes, setToastMessage, setToastType, visibility, setVisibility, horizontalCrop, verticalCrop, t);
  }, [selected, setSelected, data, connectionToolbarVisible, setConnectionToolbarVisible, displayMode, rootNote, enharmonic, startFret, endFret, includeMarkers, copyOnly, showNotes, setToastMessage, setToastType, visibility, setVisibility, horizontalCrop, verticalCrop, t]);

  const setFretWindowMemo = useCallback((fretWindow) => {
    setFretWindow(fretWindow, startFret, endFret, selected, setSelected, data, setData, updateNote, setToastMessage, setStartFret, setEndFret);
  }, [startFret, endFret, selected, setSelected, data, setData, setToastMessage, setStartFret, setEndFret]);

  // 载入动图的最后一帧到板面（续编）
  const applyClipBoard = useCallback((board) => {
    setData(board.data || {});
    dataRef.current = board.data || {};
    if (typeof board.startFret === 'number') setStartFret(board.startFret);
    if (typeof board.endFret === 'number') setEndFret(board.endFret);
    if (typeof board.enharmonic === 'number') setEnharmonic(board.enharmonic);
    if (board.displayMode) setDisplayMode(board.displayMode);
    setRootNote(board.rootNote ?? null);
    if (board.visibility) setVisibility(board.visibility);
  }, [setData, dataRef, setStartFret, setEndFret, setEnharmonic, setDisplayMode, setRootNote, setVisibility]);

  // 指板堆 → 续编
  applyClipBoardRef.current = applyClipBoard;
  const handleLoadClipRef = useRef(null);

  const handleLoadClip = useCallback((clip) => {
    if (mode === 'normal') {
      // 普通页：带 clip id 跳动态页续编
      try { sessionStorage.setItem('fretboard-dynamic-clip', clip.id); } catch (e) { /* 忽略 */ }
      window.location.hash = '#/dynamic';
      return;
    }
    // 动态页：推导色系后原地续编
    const colored = clip.frames?.[0] && Object.values(clip.frames[0].data || {}).find(v => v && typeof v === 'object' && v.color && (typeof v.color === 'object' ? v.color.name : v.color) && (typeof v.color === 'object' ? v.color.name : v.color) !== 'white' && (typeof v.color === 'object' ? v.color.name : v.color) !== 'trans');
    const clipScheme = colored ? (typeof colored.color === 'object' ? colored.color.name : colored.color) : null;
    if (clipScheme && COLOR_SCHEMES.includes(clipScheme)) setSchemeName(clipScheme);
    dynamic.loadClip(clip, applyClipBoard);
  }, [dynamic, applyClipBoard, mode]);
  handleLoadClipRef.current = handleLoadClip;

  // 动图保存后刷新指板堆；sessionClip 一确立就记"最近动图"（刷新恢复用）
  useEffect(() => {
    if (dynamic.clipVersion > 0) refreshClips();
  }, [dynamic.clipVersion, refreshClips]);
  useEffect(() => {
    if (dynamic.sessionClip?.id) {
      try { localStorage.setItem('fretboard-last-clip', dynamic.sessionClip.id); } catch (e) { /* 忽略 */ }
    }
  }, [dynamic.sessionClip]);

  // 帧内自动保存：编辑态下板面任何改动（防抖 250ms）写入当前帧；Ctrl+S 才落堆
  const syncTimerRef = useRef(null);
  useEffect(() => {
    if (mode !== 'dynamic' || !dynamic.isDynamic || dynamic.viewMode !== 'edit') return;
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      dynamicRef.current.syncFrame(captureBoard());
    }, 250);
    return () => clearTimeout(syncTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, startFret, endFret, displayMode, rootNote, enharmonic, visibility, dynamic.isDynamic, dynamic.viewMode, dynamic.editIdx]);

  // 示例缺失即自动补齐（幂等：刷新示例、保留用户自己的动图；跨设备/误删自愈）
  useEffect(() => {
    import('./utils/exampleClips').then(({ ensureExampleClips }) => {
      setClips(ensureExampleClips());
    }).catch(() => {});
  }, []);

  // 登录状态下从云端拉动图（服务端优先合并）
  useEffect(() => {
    let cancelled = false;
    if (isLoggedIn()) {
      pullClips().then(merged => {
        if (!cancelled) setClips(merged);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, []);


  // 播放当前会话动图（主舞台逐帧 + 过渡特效）
  const framesRef = useRef([]);
  framesRef.current = dynamic.frames;
  const transitionsRef = useRef([]);
  transitionsRef.current = dynamic.transitions;
  const loopRef = useRef(loopPlay);
  loopRef.current = loopPlay;

  const playStartRef = useRef(0);
  const stopPlaying = useCallback(() => setPlayingIdx(null), []);

  // ＋新建必停播放：newClip 只重置帧序列/编辑指针，够不到这里的 playingIdx——
  // playing 类给整个 svg 挂 pointer-events:none，1 帧新档 + 循环播放会让播放器永远回环，
  // 板面从此吃不到任何指针（"新建后点不了任何东西，必须刷新"的根因）
  const handleNewClip = useCallback(() => {
    stopPlaying();
    dynamicRef.current.newClip();
  }, [stopPlaying]);

  // fx 轨道时钟：播放中周期 tick，驱动绝对时间光点层
  const [fxTick, setFxTick] = useState(0);
  useEffect(() => {
    if (playingIdx === null) return undefined;
    if (playingIdx === 0) playStartRef.current = performance.now(); // 回环重置时钟
    const t = setInterval(() => setFxTick(v => v + 1), 33);
    return () => clearInterval(t);
  }, [playingIdx]);

  const startPlaying = useCallback(() => {
    const ps = playStepsRef.current;
    if (ps.states.length < 2 && !(ps.fx || []).length) return; // 单帧纯前置划弦也可播（fx 驱动）
    setPlayingIdx(0);
  }, []);

  // 播放推进：绝对时钟调度（每步按 playStart 起算的累计时刻一次性 setTimeout，消除链式 setTimeout 级联漂移）
  useEffect(() => {
    if (playingIdx === null) return;
    const steps = playStepsRef.current.states;
    const settings = animSettingsRef.current;
    const holdFull = Number(settings.holdMs) > 0 ? Number(settings.holdMs) : 300;
    const baseTrans = Number(settings.transMs) > 0 ? Number(settings.transMs) : 200;
    // 与导出共用的唯一时钟（timeline.stateClock）：状态起点/时长严格同轴，GIF=预览按构造成立
    const clock = stateClock(steps, holdFull, baseTrans);
    const tAbs = clock.starts[playingIdx] || 0;
    const holdMsSelf = steps[playingIdx]?.holdMs;
    const hold = Number.isFinite(holdMsSelf) ? holdMsSelf : holdFull;
    const trans = clock.enterOf(playingIdx);
    const elapsed = performance.now() - playStartRef.current;
    const atEnd = playingIdx === steps.length - 1;
    // 末态多停一拍再回环（非循环则直接停）；导出侧 buildPlan 同步加同样的尾巴，两边观感一致
    const endPause = atEnd && loopRef.current ? END_PAUSE_MS : 0;
    const wait = Math.max(0, tAbs + hold + trans + endPause - elapsed);
    const timer = setTimeout(() => {
      setPlayingIdx(prev => {
        if (prev === null) return null;
        const next = prev + 1;
        if (next < steps.length) return next;
        return loopRef.current ? 0 : null;
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [playingIdx, playSteps]);

  // 生成导出 blob（GIF/WebM）——下载与 Ctrl+C 复制共用；沿用普通模式的展示设置（品数/音名/水平垂直截断）
  // opts.cumulative：累积式（激活过的音不熄灭，Ctrl+Shift+C 样式）
  const buildExportBlob = useCallback(async (format, opts = {}) => {
    const frames = framesRef.current;
    const specs = transitionsRef.current;
    const preCheck = expandTimeline(frames, specs, 300, 200);
    if (preCheck.states.length < 2 && !(preCheck.fx || []).length) throw new Error('需要至少 2 帧，或单帧内含技法/前置划弦标注');
    const settings = animSettingsRef.current;
    let wStart = Infinity, wEnd = -Infinity;
    frames.forEach(f => {
      wStart = Math.min(wStart, f.startFret);
      wEnd = Math.max(wEnd, f.endFret);
    });
    if (wEnd - wStart > 16) wEnd = wStart + 16;
    const tl = expandTimeline(frames, specs, Number(settings.holdMs) > 0 ? Number(settings.holdMs) : 300, Number(settings.transMs) > 0 ? Number(settings.transMs) : 200);
    const exStates = opts.cumulative ? accumulateStates(tl.states) : tl.states;
    const { specs: exSpecs, fx: exFx, frameOf: exFrameOf, sub: exSub } = tl;
    const windowed = exStates.map(f => ({ ...f, startFret: wStart, endFret: wEnd }));
    const geo = boardGeometry(wStart, wEnd);
    const fullVB = { x: geo.svgViewBoxX, y: geo.svgViewBoxY, w: geo.svgViewBoxWidth, h: geo.svgViewBoxHeight };
    // 截断：跨全部（展开后）状态的可见音符联合范围 → 统一裁剪框，各帧同视野不跳动
    let cropBox = null;
    if (horizontalCrop || verticalCrop) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      windowed.forEach(st => {
        const notes = buildNotes(st);
        Object.entries(st.data || {}).forEach(([id, n]) => {
          if (!n || (n.visibility !== 'visible' && n.visibility !== 'selected')) return;
          const p = getNotePosition(id, notes);
          if (!p) return;
          minX = Math.min(minX, p.x - CONSTS.circleRadius); maxX = Math.max(maxX, p.x + CONSTS.circleRadius);
          minY = Math.min(minY, p.y - CONSTS.circleRadius); maxY = Math.max(maxY, p.y + CONSTS.circleRadius);
        });
      });
      if (minX !== Infinity) {
        const padX = 14, padY = includeMarkers === false ? 8 : 30; // 上下品位标尺空间
        let cx = fullVB.x, cy = fullVB.y, cw = fullVB.w, ch = fullVB.h;
        if (horizontalCrop) {
          const x1 = Math.max(fullVB.x, minX - padX), x2 = Math.min(fullVB.x + fullVB.w, maxX + padX);
          cx = x1; cw = Math.max(120, x2 - x1);
        }
        if (verticalCrop) {
          const y1 = Math.max(fullVB.y, minY - padY), y2 = Math.min(fullVB.y + fullVB.h, maxY + padY);
          cy = y1; ch = Math.max(80, y2 - y1);
        }
        cropBox = { x: cx, y: cy, w: cw, h: ch };
      }
    }
    const viewBox = cropBox ? `${cropBox.x} ${cropBox.y} ${cropBox.w} ${cropBox.h}` : `${fullVB.x} ${fullVB.y} ${fullVB.w} ${fullVB.h}`;
    const displayOpts = { includeMarkers, showNotes, horizontalCrop, verticalCrop, cropBox };
    const encOpts = {
      holdMs: Number(settings.holdMs) > 0 ? Number(settings.holdMs) : 300,
      transMs: Number(settings.transMs) > 0 ? Number(settings.transMs) : 200,
      fps: Number(settings.fps) > 0 ? Number(settings.fps) : 30,
      width: Number(settings.width) || 720,
      background: getComputedStyle(document.documentElement).getPropertyValue('--background-color').trim() || '#10161c',
      labelColor: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#dfe7ee',
      noteStyle: resolveNoteVisualStyle() || undefined
    };
    if (format === 'mp4') {
      const outMp4 = await buildExportBlob('webm-mp4');
      return outMp4;
    }
    if (format === 'svganim') {
      // 动画 SVG（SMIL）：矢量自包含动图——无限清晰、体积极小；与播放器同源时钟
      // 只要 buildAnimatedSvg 内对联合板面的一次矢量渲染，不需要逐状态光栅帧
      const { buildAnimatedSvg } = await import('./utils/animatedSvg');
      const svgStr = await buildAnimatedSvg({
        states: exStates, fx: exFx || [], frameOf: exFrameOf, sub: exSub,
        labelColor: encOpts.labelColor,
        renderSvg: async (state) => renderBoardImage({ ...state, startFret: wStart, endFret: wEnd }, Number(settings.width) || 720, { ...displayOpts, svgOnly: true }),
      });
      return new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    }
    // GIF/WebM 才需要逐状态光栅帧（每帧一次离屏渲染；svganim 跳过——Ctrl+C 导出慢的元凶）
    const boardImages = [];
    for (const frame of windowed) {
        boardImages.push(await renderBoardImage(frame, Number(settings.width) || 720, displayOpts));
    }
    const out = format === 'gif'
      ? await exportGifAnimation({ states: windowed, specs: exSpecs, boardImages, viewBox, opts: { ...encOpts, fx: exFx || [], frameOf: exFrameOf, sub: exSub } })
      : await exportWebmAnimation({ states: windowed, specs: exSpecs, boardImages, viewBox, opts: { ...encOpts, fx: exFx || [], frameOf: exFrameOf, sub: exSub, preferMp4: format === 'webm-mp4' } });
    return out;
  }, [includeMarkers, showNotes, horizontalCrop, verticalCrop]);

  // 导出动图素材（下载）
  const exportClip = useCallback(async (format) => {
    try {
      setExporting(format);
      let blob;
      if (format === 'json') {
        // 数据导出：完整动图数据（帧/过渡/前置划弦/节奏设置）——排障与导入分析用
        const settings = animSettingsRef.current;
        blob = new Blob([JSON.stringify({
          format: 'fretboard-clip-data',
          version: 1,
          clip: { id: dynamic.sessionClip?.id, name: dynamic.sessionClip?.name, frames: framesRef.current, transitions: transitionsRef.current },
          animSettings: { holdMs: settings.holdMs, transMs: settings.transMs, fps: settings.fps, width: settings.width },
          exportedAt: new Date().toISOString(),
        }, null, 2)], { type: 'application/json;charset=utf-8' });
      } else {
        blob = await buildExportBlob(format);
      }
      const ext = format === 'svganim' ? 'svg' : (format === 'webm-mp4' ? 'mp4' : format);
      const name = `fretboard-${Date.now()}.${ext}`;
      // 记忆式保存：首次弹一次目录选择，之后直接写入该目录（不再每次问路径）
      const { saveToRememberedDir, rememberedDirSupported } = await import('./utils/saveFile');
      let savedTo = null;
      if (rememberedDirSupported()) savedTo = await saveToRememberedDir(name, blob);
      if (savedTo) {
        showToast(`已保存到「${savedTo}」/${name}（${(blob.size / 1024).toFixed(0)} KB）`, 'success');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast(`已导出 ${ext.toUpperCase()}（${(blob.size / 1024).toFixed(0)} KB）`, 'success');
      }
    } catch (error) {
      console.error('导出失败:', error);
      showToast(`导出失败: ${error.message}`, 'error');
    } finally {
      setExporting(null);
    }
  }, [showToast, buildExportBlob]);

  // 动画 SVG 落盘共用（Ctrl+C / Ctrl+Shift+C）：记忆目录优先，回落普通下载
  const saveSvgBlobToDisk = useCallback(async (buildFn) => {
    try {
      setExporting('svganim');
      const svgBlob = await buildFn();
      const name = `fretboard-${Date.now()}.svg`;
      const { saveToRememberedDir, rememberedDirSupported } = await import('./utils/saveFile');
      let savedTo = null;
      if (rememberedDirSupported()) savedTo = await saveToRememberedDir(name, svgBlob); // 与⬇导出同逻辑：有缓存目录直接用，没有弹一次记住
      if (savedTo) {
        showToast(`已保存「${savedTo}」/${name}（${(svgBlob.size / 1024).toFixed(0)} KB）`, 'success');
      } else {
        const url = URL.createObjectURL(svgBlob);
        const a = document.createElement('a'); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast(`已下载 SVG（${(svgBlob.size / 1024).toFixed(0)} KB）`, 'success');
      }
    } catch (error) {
      showToast(`保存失败: ${error.message}`, 'error');
    } finally {
      setExporting(null);
    }
  }, [showToast]);

  // Ctrl+C（动态模式）：纯保存 SVG 到磁盘，不碰剪贴板——发送/分享用 ⚡分享按钮更直接
  const copyGifToClipboard = useCallback(async () => {
    await saveSvgBlobToDisk(() => buildExportBlob('svganim'));
  }, [saveSvgBlobToDisk, buildExportBlob]);

  // Ctrl+Shift+C：导出累积式动图 SVG（激活过的音永不熄灭，"存在过的点不消失"样式）
  const copyCumulativeSvg = useCallback(async () => {
    await saveSvgBlobToDisk(() => buildExportBlob('svganim', { cumulative: true }));
  }, [saveSvgBlobToDisk, buildExportBlob]);

  // 键盘事件 - 使用 ref 保持最新值，避免频繁重新注册导致重复触发
  const handlerParamsRef = useRef();
  handlerParamsRef.current = {
    selected, deleteNote, selectColor: selectColorMemo, cycleLevel1Color: cycleLevel1ColorMemo,
    cycleLevel1ColorReverse: cycleLevel1ColorReverseMemo, cycleLevel2Color: cycleLevel2ColorMemo,
    cycleLevel2ColorReverse: cycleLevel2ColorReverseMemo, undo, redo, hoveredNoteId, hoveredConnectionId, data, setData, visibility,
    connectionMode, setConnectionMode, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level,
    toggleVisibility: toggleVisibilityMemo, reset: resetMemo, saveSVG: saveSVGMemo, copyGif: copyGifToClipboard,
    copyCumulativeSvg,
    selectedColorLevel, selectConnectionPreset,
    dynamic: {
      isDynamic: dynamic.isDynamic,
      frameCount: dynamic.frames.length,
      technique: dynamic.technique,
      pendingFrom: dynamic.pendingFrom,
      hasPairs: dynamic.pairs.length > 0,
      editIdx: dynamic.editIdx,
      gotoFrame: dynamic.gotoFrame,
      newClip: dynamic.newClip,
      revertToPrevFrame: dynamic.revertToPrevFrame,
      viewMode: dynamic.viewMode,
      persistClip: dynamic.persistClip,
      toggleQ: mode === 'dynamic' ? dynamic.toggleQ : gotoDynamic,
      commitFrame: dynamic.commitFrame,
      cancelMarking: dynamic.cancelMarking,
	      undoStep: dynamic.undoStep, redoStep: dynamic.redoStep,
	      extinguishNote: dynamic.extinguishNote
    },
    deleteHoveredPair
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      // 检查是否在输入框中
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
        return;
      }

      const handler = createKeyboardHandler(handlerParamsRef.current);
      handler(event);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // 空依赖数组，只注册一次

  // 生成字符串路径
  const generateStringPathMemo = useCallback((stringIndex) => generateStringPath(stringIndex, fretboardWidth), [fretboardWidth]);

  // 键盘事件 - 使用 ref 保持最新值，避免频繁重新注册导致重复触发

  return (
    <>
      <button
        className={`theme-switch${theme === 'light' ? ' theme-switch--light' : ''}`}
        onClick={toggleTheme}
        title={theme === 'dark' ? t.fretboard.themeLight : t.fretboard.themeDark}
        aria-label="Toggle theme"
      >
        <span className="theme-switch__track">
          <span className="theme-switch__thumb">
            <span className="theme-switch__icon">{theme === 'dark' ? '☾' : '☀'}</span>
          </span>
        </span>
      </button>
      <button
        className="lang-switch"
        onClick={toggleLang}
        title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
        aria-label="Toggle language"
      >
        {t.fretboard.langSwitch}
      </button>
      <div className="title-header">
        <div className="title-header-inner">
          <h1>
            Fretboard Diagram Generator
          </h1>
          <div className="datetime">{currentDateTime}</div>
          {dynamic.isDynamic && (
            <div
              className="dyn-badge"
              style={dynamic.sessionClip?.id ? { cursor: 'text' } : undefined}
              onClick={() => { if (dynamic.sessionClip?.id) setBadgeEditing(true); }}
              title={dynamic.sessionClip?.id ? '点击改名' : '新动图（尚未定格）'}>
              <span className="dyn-badge-dot" />
              {badgeEditing
                ? <input
                    autoFocus
                    defaultValue={dynamic.sessionClip?.name || ''}
                    onBlur={e => { dynamic.renameClip(e.target.value); setBadgeEditing(false); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { dynamic.renameClip(e.currentTarget.value); setBadgeEditing(false); }
                      if (e.key === 'Escape') setBadgeEditing(false);
                      e.stopPropagation();
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    style={{ width: 110, background: 'transparent', border: 'none', outline: 'none', color: 'inherit', font: 'inherit', padding: 0 }}
                  />
                : (dynamic.sessionClip && (dynamic.persistedOnce || dynamic.viewMode === 'preview'))
                  ? (dynamic.sessionClip.name.length > 10 ? dynamic.sessionClip.name.slice(0, 10) + '…' : dynamic.sessionClip.name)
                  : '新动图'}
              <span className="dyn-badge-sep">|</span>
              {dynamic.viewMode === 'preview'
                ? `${dynamic.frames.length} 帧`
                : `编辑 ${dynamic.editIdx + 1}/${dynamic.frames.length}`}
            </div>
          )}
        </div>
      </div>
      <>
      <div className={`fretboard-stage-wrap ${playingIdx !== null ? 'playing' : ''}`}>
      <figure className="fretboard-stage">
        <FretboardSVG
          svgElementRef={svgElementRef}
          svgWidth={svgWidth}
          svgHeight={svgHeight}
          svgViewBoxX={svgViewBoxX}
          svgViewBoxY={svgViewBoxY}
          svgViewBoxWidth={svgViewBoxWidth}
          svgViewBoxHeight={svgViewBoxHeight}
          handleSvgClick={handleSvgClick}
          handleSvgMouseMove={handleSvgMouseMove}
          handleSvgMouseDown={handleSvgMouseDown}
          handleSvgContextMenu={handleSvgContextMenu}
          handleSvgWheel={handleSvgWheel}
          fretPath={fretPath}
          markers={markers}
          generateStringPathMemo={generateStringPathMemo}
          notes={notes}
          notesElementRef={notesElementRef}
          data={view.data}
          visibility={view.visibility}
          selected={selected}
          connectionMode={connectionMode}
          connectionStartNote={connectionStartNote}
          previewHoverNote={previewHoverNote}
          editingNote={editingNote}
          handleNoteClick={handleNoteClick}
          handleNoteMouseDown={handleNoteMouseDown}
          setPreviewHoverNote={setPreviewHoverNote}
          setUseColor2Level={setUseColor2Level}
          setHoveredNoteId={setHoveredNoteId}
          setHoveredConnectionId={setHoveredConnectionId}
          computeNoteNameMemo={computeNoteNameMemo}
          connections={dynamic.isDynamic ? {} : connections}
          getNotePositionMemo={getNotePositionMemo}
          handleConnectionClickMemo={handleConnectionClickMemo}
          handleConnectionContextMenuMemo={handleConnectionContextMenuMemo}
          connectionStartPosition={connectionStartPosition}
          mousePosition={mousePosition}
          useColor2Level={useColor2Level}
          editableDivVisible={editableDivVisible}
          editableDivX={editableDivX}
          editableDivY={editableDivY}
          editableDivRef={editableDivRef}
          editableText={editableText}
          finishEditing={finishEditing}
          handleEditableKeyDown={handleEditableKeyDown}
          handleEditableClick={handleEditableClick}
          setEditableText={setEditableText}
          connectionToolbarVisible={connectionToolbarVisible}
          selectedConnection={selectedConnection}
          connectionToolbarPosition={connectionToolbarPosition}
          toolbarRef={toolbarRef}
          toolbarDropdown={toolbarDropdown}
          toolbarDropdownDirection={toolbarDropdownDirection}
          setToolbarDropdown={setToolbarDropdown}
          setToolbarDropdownDirection={setToolbarDropdownDirection}
          detectDropdownDirection={detectDropdownDirection}
          dataRef={dataRef}
          buttonClickRef={buttonClickRef}
          setData={setData}
          setConnectionToolbarVisible={setConnectionToolbarVisible}
          setSelectedConnection={setSelectedConnection}
          showNotes={showNotes}
        />
        {playingIdx !== null && (playSteps.fx || []).map((fxi, k) => {
          const el = performance.now() - playStartRef.current;
          if (el < fxi.t0 || el > fxi.t0 + fxi.dur) return null;
          const frameStates = playSteps.states.filter((_, si) => playSteps.frameOf[si] === fxi.frame);
          const hintState = frameStates[frameStates.length - 1] || playSteps.states[playingIdx];
          return (
            <TransitionFx
              key={"fxtrack-" + k}
              prevState={hintState}
              nextState={hintState}
              spec={fxi.spec}
              durationMs={fxi.dur}
              portalTo={svgElementRef.current}
            />
          );
        })}
        {playingIdx !== null && playingIdx > 0 && playSteps.states[playingIdx - 1] && playSteps.states[playingIdx] && !playSteps.sub?.[playingIdx] && (
          <TransitionFx
            key={playingIdx}
            prevState={playSteps.states[playingIdx - 1]}
            nextState={playSteps.states[playingIdx]}
            spec={playSteps.specs[playingIdx - 1] || { technique: null, pairs: [] }}
            durationMs={playSteps.states[playingIdx - 1]?.transMs || (Number(animSettings.transMs) > 0 ? Number(animSettings.transMs) : 200)}
            portalTo={svgElementRef.current}
          />
        )}
        {techMarksG && svgElementRef.current && createPortal(
          <g className="drag-fx-layer tech-marks">
            {techMarksG.marks.map((m, i) => {
              const dx = m.b.x - m.a.x, dy = m.b.y - m.a.y;
              const len = Math.hypot(dx, dy) || 1;
              const r = 24;
              const x1 = m.a.x + dx / len * r, y1 = m.a.y + dy / len * r;
              const x2 = m.b.x - dx / len * r, y2 = m.b.y - dy / len * r;
              const stroke = m.tech === 'pre' ? techMarksG.gold : techMarksG.hint;
              const dash = m.tech === 'hp' ? '2 4' : (m.tech === 'rt' ? '8 4' : undefined);
              const hot = hoveredPair && hoveredPair.from === m.from && hoveredPair.to === m.to;
              return (
                <g key={i} opacity={hot ? 1 : 0.85}>
                  <title>{hot ? '按退格/Delete 删除该标注' : '悬停后按退格/Delete 删除'}</title>
                  {/* 命中层：只做悬停，不拦截点击（拖拽手势/点音不受影响） */}
                  <line className="tech-hit" x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} style={{ pointerEvents: 'stroke' }}
                    onMouseEnter={() => setHoveredPair({ from: m.from, to: m.to })}
                    onMouseLeave={() => setHoveredPair(h => (h && h.from === m.from && h.to === m.to ? null : h))} />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={hot ? 'var(--app-accent, #f3ba62)' : stroke} strokeWidth={hot ? 4 : 2.5} strokeLinecap="round" strokeDasharray={dash} style={{ pointerEvents: 'none' }} />
                  {m.tech !== 'pre' && <circle cx={x2} cy={y2} r={4} fill={stroke} style={{ pointerEvents: 'none' }} />}
                  {m.tech === 'rt' && <circle cx={x1} cy={y1} r={4} fill={stroke} style={{ pointerEvents: 'none' }} />}
                  {m.tech === 'hp' && <circle cx={x1} cy={y1} r={4} fill="none" stroke={stroke} strokeWidth={2} style={{ pointerEvents: 'none' }} />}
                  {m.tech === 'pre' && <circle cx={x1} cy={y1} r={5} fill="none" stroke={stroke} strokeWidth={2} style={{ pointerEvents: 'none' }} />}
                </g>
              );
            })}
          </g>,
          svgElementRef.current
        )}
        {dragFeedbackG && svgElementRef.current && createPortal(
          <g className="drag-fx-layer" pointerEvents="none">
            <line
              x1={dragFeedbackG.fromPos.x} y1={dragFeedbackG.fromPos.y}
              x2={dragFeedbackG.cur.x} y2={dragFeedbackG.cur.y}
              stroke={dragFeedbackG.vivid} strokeWidth={3} strokeLinecap="round"
              strokeDasharray={dragFeedbackG.targetPos ? undefined : '8 6'} opacity={0.85}
            />
            <circle cx={dragFeedbackG.cur.x} cy={dragFeedbackG.cur.y} r={7} fill={dragFeedbackG.vivid} />
            {dragFeedbackG.targetPos && (
              <circle
                cx={dragFeedbackG.targetPos.x} cy={dragFeedbackG.targetPos.y} r={CONSTS.circleRadius + 6}
                fill="none" stroke={dragFeedbackG.vivid} strokeWidth={3} opacity={0.9}
              />
            )}
            {dragFeedbackG.returnReadyPos && (
              <circle
                cx={dragFeedbackG.returnReadyPos.x} cy={dragFeedbackG.returnReadyPos.y} r={CONSTS.circleRadius + 6}
                fill="none" stroke={dragFeedbackG.vivid} strokeWidth={3} opacity={0.75}
              />
            )}
            {dragFeedbackG.armedPos && (
              <circle
                cx={dragFeedbackG.armedPos.x} cy={dragFeedbackG.armedPos.y} r={CONSTS.circleRadius + 6}
                fill="none" stroke={dragFeedbackG.vivid} strokeWidth={3} opacity={0.9}
                strokeDasharray="6 4"
              />
            )}
          </g>,
          svgElementRef.current
        )}
      </figure>
      </div>

      {mode === 'dynamic' && dynamic.frames.length > 0 && (
        <div className="dyn-frames-strip" data-mode={dynamic.viewMode}>
          {dynamic.frames.map((frame, i) => (
            <div
              key={i}
              className={`dyn-frame-thumb ${i === (dynamic.viewMode === 'edit' ? dynamic.editIdx : (playingIdx !== null ? (playSteps.frameOf[playingIdx] ?? 0) : (previewFrame ?? 0))) ? 'active' : ''}`}
              onClick={() => {
                if (dynamic.viewMode === 'edit') {
                  dynamic.gotoFrame(i);
                } else {
                  // 预览态：点击 = 板面切到该帧静态查看（不播放，▶ 才播）
                  previewFrameRef.current = i;
                  setPreviewFrame(i);
                  if (playingIdx !== null) setPlayingIdx(null);
                }
              }}
              title={dynamic.viewMode === 'edit' ? `第 ${i + 1} 帧` : `查看第 ${i + 1} 帧`}
            >
              <ScoreBoard snapshot={{ state: frame }} />
              <span className="dyn-frame-no">{i + 1}</span>
              {dynamic.viewMode === 'edit' && (
                <button
                  className="dyn-thumb-del"
                  onClick={e => { e.stopPropagation(); dynamic.deleteFrame(i); }}
                  disabled={playingIdx !== null || dynamic.frames.length <= 1}
                  title={`删除第 ${i + 1} 帧`}
                >×</button>
              )}
            </div>
          ))}
          {dynamic.viewMode === 'edit' && (
            <button
              className="dyn-thumb-add"
              onClick={() => dynamic.addFrame(dynamic.frames.length - 1)}
              disabled={playingIdx !== null}
              title="追加新帧（复制末帧板面）"
            >＋</button>
          )}
        </div>
      )}

      {false && (

        <div className="dyn-frames-strip">
          {dynamic.frames.map((frame, i) => (
            <div
              key={i}
              className={`dyn-frame-thumb ${i === dynamic.editIdx ? 'active' : ''}`}
              onClick={() => dynamic.gotoFrame(i)}
              title={`第 ${i + 1} 帧`}
            >
              <ScoreBoard snapshot={{ state: frame }} />
              <span className="dyn-frame-no">{i + 1}</span>
            </div>
          ))}
        </div>
      )}

      {mode === 'normal' ? (
        <button className="button goto-dynamic" onClick={gotoDynamic} title="把当前指板带进动态编辑（Q）">
          🎬 动态编辑
        </button>
      ) : (
      <DynamicToolbar
        dynamic={{ ...dynamic, newClip: handleNewClip }}
        scheme={schemeName}
        schemes={COLOR_SCHEMES}
        onSchemeChange={switchScheme}
        playing={playingIdx !== null}
        loopPlay={loopPlay}
        cumulative={cumulativeView}
        onToggleCumulative={() => setCumulativeView(v => !v)}
        animSettings={animSettings}
        exporting={exporting}
        canPlay={playSteps.states.length >= 2 || (playSteps.fx || []).length > 0}
        displayOptions={{ includeMarkers, showNotes, horizontalCrop, verticalCrop }}
        onDisplayChange={(key, value) => {
          if (key === 'includeMarkers') setIncludeMarkers(value);
          else if (key === 'showNotes') setShowNotes(value);
          else if (key === 'horizontalCrop') setHorizontalCrop(value);
          else if (key === 'verticalCrop') setVerticalCrop(value);
        }}
        onTogglePlay={() => { playingIdx === null ? startPlaying() : stopPlaying(); }}
        onToggleLoop={() => setLoopPlay(v => !v)}
        onCommit={dynamic.commitFrame}
        onSettingsChange={updateAnimSettings}
        onExport={exportClip}

        t={t}
      />
      )}

      {mode === 'dynamic' && (
        <div className="dynamic-right-panel">
          <FretboardMenu
            selectedColorLevel={selectedColorLevel}
            selectedColor={selectedColor}
            inTintMode={inTintMode}
            onSelectColor={selectColorMemo}
            onOpenTintPalette={openTintPaletteMemo}
            onCycleTintColor={cyclePaletteTintColorMemo}
            onReplaceAllTintNotes={replaceAllTintNotesMemo}
            enharmonic={enharmonic}
            onToggleEnharmonic={toggleEnharmonicMemo}
            onToggleVisibility={toggleVisibilityMemo}
            connectionMode={connectionMode}
            connectionPresetId={connectionPresetId}
            onSelectConnectionPreset={selectConnectionPreset}
            onSaveSVG={saveSVGMemo}
            includeMarkers={includeMarkers}
            setIncludeMarkers={setIncludeMarkers}
            copyOnly={copyOnly}
            setCopyOnly={setCopyOnly}
            showNotes={showNotes}
            setShowNotes={setShowNotes}
            horizontalCrop={horizontalCrop}
            hideDock={hideDock}
            setHideDock={setHideDock}
            setHorizontalCrop={setHorizontalCrop}
            verticalCrop={verticalCrop}
            setVerticalCrop={setVerticalCrop}
            onReset={resetMemo}
            rootNote={rootNote}
            onRootNoteSelect={setRootNote}
            displayMode={displayMode}
            setDisplayMode={setDisplayMode}
            startFret={startFret}
            endFret={endFret}
            onFretWindowChange={setFretWindowMemo}
            t={t}
          />
        </div>
      )}

      {mode === 'normal' && (
      <FretboardMenu
        selectedColorLevel={selectedColorLevel}
        selectedColor={selectedColor}
        inTintMode={inTintMode}
        onSelectColor={selectColorMemo}
        onOpenTintPalette={openTintPaletteMemo}
        onCycleTintColor={cyclePaletteTintColorMemo}
        onReplaceAllTintNotes={replaceAllTintNotesMemo}
        enharmonic={enharmonic}
        onToggleEnharmonic={toggleEnharmonicMemo}
        onToggleVisibility={toggleVisibilityMemo}
        connectionMode={connectionMode}
        connectionPresetId={connectionPresetId}
        onSelectConnectionPreset={selectConnectionPreset}
        onSaveSVG={saveSVGMemo}
        includeMarkers={includeMarkers}
        setIncludeMarkers={setIncludeMarkers}
        copyOnly={copyOnly}
        setCopyOnly={setCopyOnly}
        showNotes={showNotes}
        setShowNotes={setShowNotes}
        horizontalCrop={horizontalCrop}
        hideDock={hideDock}
        setHideDock={setHideDock}
        setHorizontalCrop={setHorizontalCrop}
        verticalCrop={verticalCrop}
        setVerticalCrop={setVerticalCrop}
        onReset={resetMemo}
        rootNote={rootNote}
        onRootNoteSelect={setRootNote}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        startFret={startFret}
        endFret={endFret}
        onFretWindowChange={setFretWindowMemo}
        t={t}
      />
      )}

      <FretboardDock
        hidden={hideDock || mode !== 'dynamic'}
        clips={clips}
        clipVersion={dynamic.clipVersion}
        currentId={dynamic.sessionClip?.id}
        onLoad={handleLoadClip}
        onDelete={(clipId) => {
          deleteClip(clipId);
          refreshClips();
          setToastMessage(t.fretboard.toastDeleted);
          setToastType('success');
        }}
        onClear={() => {
          if (!clips.length) return;
          if (!window.confirm(t.fretboard.confirmClearDock)) return;
          clips.forEach(c => deleteClip(c.id));
          try { localStorage.setItem('fretboard-examples-cleared', '1'); } catch (e) { /* ignore */ }
          refreshClips();
          setToastMessage(t.fretboard.toastCleared);
          setToastType('success');
        }}
        onRenamed={refreshClips}
        onExamples={() => {
          import('./utils/exampleClips').then(({ ensureExampleClips }) => {
            setClips(ensureExampleClips(true)); // 显式要求：清掉"已清空"标记并补回示例
            showToast('已载入 6 张示例动图', 'success');
          });
        }}
        t={t}
      />
      </>

      <Toast
        message={toastMessage}
        type={toastType}
        duration={toastType === 'error' ? 3000 : 2000}
        onClose={() => setToastMessage('')}
      />
    </>
  );
}

export default Fretboard;
