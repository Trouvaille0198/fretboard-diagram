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
import { generateTintVariants, getLevel1FillColor, getLevel2Color, tintAt, tintPosition } from './colorConfig';
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
import { expandTimeline } from './utils/timeline';
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
      const s = JSON.parse(localStorage.getItem('fretboard-anim-settings') || 'null') || { holdMs: 300, transMs: 200, fps: 20, width: 720 };
      if (!s.v3) { s.holdMs = 300; s.transMs = 200; s.v3 = 1; try { localStorage.setItem('fretboard-anim-settings', JSON.stringify(s)); } catch (e) { /* ignore */ } } // 回滚提速：300/200 观感合适
      return s;
    } catch {
      return { holdMs: 300, transMs: 200, fps: 20, width: 720 };
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

  // 动态页挂载：读取入口板面（或续编的动图）开 会话
  useEffect(() => {
    if (mode !== 'dynamic') return;
    let entry = null;
    try { entry = JSON.parse(sessionStorage.getItem('fretboard-dynamic-entry') || 'null'); sessionStorage.removeItem('fretboard-dynamic-entry'); } catch (e) { /* 忽略 */ }
    let clipId = null;
    try { clipId = sessionStorage.getItem('fretboard-dynamic-clip'); sessionStorage.removeItem('fretboard-dynamic-clip'); } catch (e) { /* 忽略 */ }
    if (!clipId) {
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

  // 动态页 Q 退出：保存（≥2帧）并回普通页
  const exitDynamic = useCallback(() => {
    dynamic.toggleQ();
    window.location.hash = '';
  }, [dynamic]);

  // 预览态换色：只改展示（内存），不落库；进入编辑时还原原始帧
  const previewSnapshotRef = useRef(null);
  useEffect(() => {
    if (dynamic.viewMode === 'preview' && !previewSnapshotRef.current && dynamic.frames.length) {
      previewSnapshotRef.current = JSON.parse(JSON.stringify(dynamic.frames));
    }
    if (dynamic.viewMode !== 'preview' && previewSnapshotRef.current) {
      previewSnapshotRef.current = null;
    }
  }, [dynamic.viewMode, dynamic.frames]);

  // 色系切换：编辑态=真实重刷并自动保存；预览态=仅展示
  const switchScheme = useCallback((name) => {
    if (!COLOR_SCHEMES.includes(name) || name === schemeName) return;
    const newTints = generateTintVariants(getLevel1FillColor(name));
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
    if (dynamic.viewMode === 'edit') {
      dynamic.mapFrames(restyleData);
      setSchemeName(name);
    } else {
      // 预览态：只改内存帧做展示，不落库；退出预览时由快照还原
      const snap = previewSnapshotRef.current || dynamic.frames;
      dynamic.applyPreviewFrames(snap.map(f => ({ ...f, data: restyleData(f.data) })));
      setSchemePreview(name);
    }
  }, [schemeName, dynamic, dataRef, setData]);

  // 退出预览 → 还原快照帧与板面（预览色不保存）
  useEffect(() => {
    if (dynamic.viewMode !== 'preview' && previewSnapshotRef.current) {
      const snap = previewSnapshotRef.current;
      previewSnapshotRef.current = null;
      setSchemePreview(null);
      dynamic.applyPreviewFrames(snap);
      dataRef.current = snap[0]?.data ?? {};
      setData(snap[0]?.data ?? {});
      applyClipBoardRef.current?.(snap[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamic.viewMode]);

  // 预览态色系（不保存）：进入编辑时还原真实色系与帧数据
  const [schemePreview, setSchemePreview] = useState(null);

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
  const playSteps = useMemo(() => {
    const hold = Number(animSettings.holdMs) > 0 ? Number(animSettings.holdMs) : 300;
    const trans = Number(animSettings.transMs) > 0 ? Number(animSettings.transMs) : 200;
    return expandTimeline(dynamic.frames, dynamic.transitions, hold, trans);
  }, [dynamic.frames, dynamic.transitions, animSettings.holdMs, animSettings.transMs]);
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
    if (dynamicRef.current.isDynamic && dynamicRef.current.beginSlideDrag(noteId)) return;
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
    const anchorId = dragInfo.activatedTo || dragInfo.from; // 激活后锚点=B：再拖时线从 B 出发
    const fromPos = getNotePositionMemo(anchorId) || getNotePositionMemo(dragInfo.from);
    if (!fromPos) return null;
    const cur = toSvg(dragPos.x, dragPos.y);
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

  const stopPlaying = useCallback(() => setPlayingIdx(null), []);

  const startPlaying = useCallback(() => {
    if (playStepsRef.current.states.length < 2) return;
    setPlayingIdx(0);
  }, []);

  // 播放推进：按展开步走；hp 子拍停留 = hold/3
  useEffect(() => {
    if (playingIdx === null) return;
    const steps = playStepsRef.current.states;
    const sub = playStepsRef.current.sub || [];
    const settings = animSettingsRef.current;
    const holdFull = Number(settings.holdMs) > 0 ? Number(settings.holdMs) : 300;
    const baseTrans = Number(settings.transMs) > 0 ? Number(settings.transMs) : 200;
    // 进入本步的特效时长（sl/rt 轨迹拉长、hp 子拍减半）——与导出同源
    const trans = playingIdx > 0 && steps[playingIdx - 1]?.transMs > 0 ? steps[playingIdx - 1].transMs : baseTrans;
    const isSub = sub[playingIdx] === true; // hp 子拍：整体提速
    const hold = isSub ? (steps[playingIdx]?.holdMs || Math.max(40, holdFull / 6)) : holdFull;
    const timer = setTimeout(() => {
      setPlayingIdx(prev => {
        if (prev === null) return null;
        const next = prev + 1;
        if (next < steps.length) return next;
        return loopRef.current ? 0 : null;
      });
    }, hold + trans);
    return () => clearTimeout(timer);
  }, [playingIdx, playSteps]);

  // 生成导出 blob（GIF/WebM）——下载与 Ctrl+C 复制共用；沿用普通模式的展示设置（品数/音名/水平垂直截断）
  const buildExportBlob = useCallback(async (format) => {
    const frames = framesRef.current;
    const specs = transitionsRef.current;
    if (frames.length < 2) throw new Error('至少需要 2 帧才能导出');
    const settings = animSettingsRef.current;
    let wStart = Infinity, wEnd = -Infinity;
    frames.forEach(f => {
      wStart = Math.min(wStart, f.startFret);
      wEnd = Math.max(wEnd, f.endFret);
    });
    if (wEnd - wStart > 16) wEnd = wStart + 16;
    const { states: exStates, specs: exSpecs } = expandTimeline(frames, specs, Number(settings.holdMs) > 0 ? Number(settings.holdMs) : 300, Number(settings.transMs) > 0 ? Number(settings.transMs) : 200);
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
    const boardImages = [];
    for (const frame of windowed) {
      boardImages.push(await renderBoardImage(frame, Number(settings.width) || 720, displayOpts));
    }
    const opts = {
      holdMs: Number(settings.holdMs) > 0 ? Number(settings.holdMs) : 300,
      transMs: Number(settings.transMs) > 0 ? Number(settings.transMs) : 200,
      fps: Number(settings.fps) > 0 ? Number(settings.fps) : 20,
      width: Number(settings.width) || 720,
      background: getComputedStyle(document.documentElement).getPropertyValue('--background-color').trim() || '#10161c',
      labelColor: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#dfe7ee',
      noteStyle: resolveNoteVisualStyle() || undefined
    };
    return format === 'gif'
      ? await exportGifAnimation({ states: windowed, specs: exSpecs, boardImages, viewBox, opts })
      : await exportWebmAnimation({ states: windowed, specs: exSpecs, boardImages, viewBox, opts });
  }, [includeMarkers, showNotes, horizontalCrop, verticalCrop]);

  // 导出动图素材（下载）
  const exportClip = useCallback(async (format) => {
    try {
      setExporting(format);
      const blob = await buildExportBlob(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fretboard-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast(`已导出 ${format.toUpperCase()}（${(blob.size / 1024).toFixed(0)} KB）`, 'success');
    } catch (error) {
      console.error('导出失败:', error);
      showToast(`导出失败: ${error.message}`, 'error');
    } finally {
      setExporting(null);
    }
  }, [showToast, buildExportBlob]);

  // Ctrl+C（动态模式）：复制 GIF 到剪贴板；剪贴板不支持 GIF 时回落首帧 PNG
  const copyGifToClipboard = useCallback(async () => {
    try {
      setExporting('gif');
      const blob = await buildExportBlob('gif');
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/gif': blob })]);
        showToast(`已复制 GIF（${(blob.size / 1024).toFixed(0)} KB）`, 'success');
      } catch (e) {
        const png = await new Promise(async (resolve) => {
          const bitmap = await createImageBitmap(blob);
          const cv = document.createElement('canvas');
          cv.width = bitmap.width; cv.height = bitmap.height;
          cv.getContext('2d').drawImage(bitmap, 0, 0);
          cv.toBlob(resolve, 'image/png');
        });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
        showToast('剪贴板不支持 GIF，已复制首帧 PNG（GIF 请用下载按钮）', 'info');
      }
    } catch (error) {
      showToast(`复制失败: ${error.message}`, 'error');
    } finally {
      setExporting(null);
    }
  }, [showToast, buildExportBlob]);

  // 键盘事件 - 使用 ref 保持最新值，避免频繁重新注册导致重复触发
  const handlerParamsRef = useRef();
  handlerParamsRef.current = {
    selected, deleteNote, selectColor: selectColorMemo, cycleLevel1Color: cycleLevel1ColorMemo,
    cycleLevel1ColorReverse: cycleLevel1ColorReverseMemo, cycleLevel2Color: cycleLevel2ColorMemo,
    cycleLevel2ColorReverse: cycleLevel2ColorReverseMemo, undo, redo, hoveredNoteId, hoveredConnectionId, data, setData, visibility,
    connectionMode, setConnectionMode, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level,
    toggleVisibility: toggleVisibilityMemo, reset: resetMemo, saveSVG: saveSVGMemo, copyGif: copyGifToClipboard,
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
      undoStep: dynamic.undoStep
    }
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
            <div className="dyn-badge" title={dynamic.sessionClip?.id ? `存档：${dynamic.sessionClip.name}` : '新动图（尚未定格）'}>
              <span className="dyn-badge-dot" />
              {(dynamic.sessionClip && (dynamic.persistedOnce || dynamic.viewMode === 'preview'))
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
        {playingIdx !== null && playingIdx > 0 && playSteps.states[playingIdx - 1] && playSteps.states[playingIdx] && (
          <TransitionFx
            key={playingIdx}
            prevState={playSteps.states[playingIdx - 1]}
            nextState={playSteps.states[playingIdx]}
            spec={playSteps.specs[playingIdx - 1] || { technique: null, pairs: [] }}
            durationMs={playSteps.states[playingIdx - 1]?.transMs || (Number(animSettings.transMs) > 0 ? Number(animSettings.transMs) : 200)}
            portalTo={svgElementRef.current}
          />
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
        dynamic={dynamic}
        scheme={schemeName}
        schemes={COLOR_SCHEMES}
        onSchemeChange={switchScheme}
        playing={playingIdx !== null}
        loopPlay={loopPlay}
        animSettings={animSettings}
        exporting={exporting}
        canPlay={dynamic.frames.length >= 2}
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
