import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { FretboardSVG } from './FretboardSVG';
import { UiSelect } from './UiSelect';
import { ConnectionPresetIcon } from './ConnectionPresetIcon';
import { FretWindowThumb } from './FretWindowThumb';
import { CONNECTION_PRESETS, useConnectionState } from '../hooks/useConnectionState';
import { generateNotes, computeNoteName, computeNoteIndex, generateFretPath, generateStringPath, generateMarkers, getNotePosition, boardGeometry } from '../utils/fretboardCalculations';
import { createNoteClickHandler, createNoteMouseDownHandler, createConnectionDragEndHandler } from '../handlers/noteHandlers';
import { createSvgClickHandler, createSvgMouseMoveHandler, createSvgMouseDownHandler, createSvgContextMenuHandler } from '../handlers/svgHandlers';
import { figSvg, fitFretWindow, boardFigData } from '../utils/chordFig';
import { CONSTS } from '../constants';
import { candidatesForChord, candidateToData, shapeFromBoard, builtinShapes, loadShapes, persistShapes } from '../utils/chordShapes';
import { QUALITIES, formatName, degreePc } from '../utils/chordLib';

const noOp = () => { };

// 唱名（首调,相对当前调根音）:全半音表——小调自然音级(b3/b6/b7)自动落对,与小图"调内级数"体系同口径
const SOLFEGE_REL = { 0: '1', 1: '#1', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' };
const solfegeRelKey = (noteIndex, rootNote) => SOLFEGE_REL[((noteIndex - rootNote) % 12 + 12) % 12];

// 指法小图编辑器——和弦谱页内大弹窗里的"裁剪版普通编辑器"：
// 交互与普通编辑完全同源(点音亮灭/连线拖拽/长按刷染),但按小图场景裁剪：
// 音符恒为 mono 单色点(无色板)、工具区只有连线预设(无钢琴/下载/异色)。
// 编辑实时自动保存(数据变化即落盘到该拍 unit.fig,无需手动确认)；
// 顶条：形状库候选(该拍和弦匹配) / 存为形状 / 关闭。
export function FigBoardEditor({ initialData, chord, viewKey, onAutoSave, onClose, showToast, figOpts, recentFigs }) {
  const [data, setData] = useState(() => (initialData && Object.keys(initialData).length ? JSON.parse(JSON.stringify(initialData)) : {}));
  const dataRef = useRef(data);
  dataRef.current = data;
  // 打开时的原图快照：形状覆盖多少次,"还原"都回到这份（还原后仍可外部 Ctrl+Z 再退）
  const originalRef = useRef(JSON.parse(JSON.stringify(initialData || {})));
  const sameAsOriginal = (a, b) => {
    const canon = (d) => JSON.stringify(Object.keys(d || {}).sort().flatMap(k => [k, d[k]]));
    return canon(a) === canon(b);
  };

  // 品窗：按已点亮音居中铺窗(fitFretWindow,默认 14 品);挂载后按视口容量再铺一次
  const [fretWin, setFretWin] = useState(() => fitFretWindow(initialData));

  const svgElementRef = useRef(null);
  const [hoverNote, setHoverNote] = useState(null); // 退格熄灭用(与普通编辑同语义:点亮靠点,熄灭靠退格)
  const [hoveredConnectionId, setHoveredConnectionId] = useState(null); // 退格删连线用(普通编辑同语义:hover连线优先于音符)
  // 连线状态/预设(与普通编辑同一 hook)
  const conn = useConnectionState();
  const connectionDragActiveRef = useRef(false);
  const brushRef = useRef({ armed: false, dragged: false, lastPaintedNoteId: null });

  const geo = useMemo(() => boardGeometry(fretWin.start, fretWin.end), [fretWin]);
  // 收窄 viewBox 裁掉板左右的大片空白(offsetX 边距区):品窗含 0 品时左侧留出开放弦音符,否则裁到第一品音符旁;右侧裁到末品音符旁
  const vbTrimL = fretWin.start === 0 ? 18 : 78;
  const vbTrimR = 68;

  // 品窗容量：按渲染上限直接算（板 svg 的 CSS max-width = min(1180, 94vw) - 76）——
  // 不做 DOM 测量：.figbe-board 是弹性容器，宽度跟着侧栏/弹窗 fit-content 变，量它是移动靶
  const maxSpanOf = useCallback(() => {
    const avail = Math.min(1180, window.innerWidth * 0.94) - 76; // 板 svg 可用像素宽
    const worstTrim = 78 + 68; // viewBox 左右裁剪（按最保守）
    return Math.max(2, Math.min(22, Math.floor((avail + worstTrim - 120) / CONSTS.fretWidth)));
  }, []);
  const maxSpanRef = useRef(14);
  // 数据 → 品窗（挂载 / 应用形状 / 还原同一口径）：默认跨度 = 14 与视口容量取小，音符居中（见 fitFretWindow）
  const fitWindow = useCallback((d) => fitFretWindow(d, Math.min(14, maxSpanRef.current)), []);
  useEffect(() => {
    // 挂载：先按视口定容量，再按数据铺窗（有音符的部分居中）；resize 只刷新容量，不动用户已拖好的窗
    maxSpanRef.current = maxSpanOf();
    setFretWin(fitWindow(dataRef.current));
    const onResize = () => { maxSpanRef.current = maxSpanOf(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [maxSpanOf, fitWindow]);

  // 拖块回调：跨度超过容量时不缩放，窗口整体平移——
  //   右把手拉长(默认,锚右缘)：1-7 拖长变 3-9；左把手拉低(anchor='start',锚左缘)：9-16 往左拉变 5-12
  const applyFretWin = useCallback((w) => {
    setFretWin(prev => {
      let start = w.start ?? prev.start;
      let end = w.end ?? prev.end;
      const maxSpan = maxSpanRef.current;
      if (end - start > maxSpan) {
        if (w.anchor === 'start') {
          start = Math.max(0, start);
          end = start + maxSpan;
        } else {
          // 宽度装不下更长的窗：不缩放，改为右滑——右缘顶到期望品，起点=末端-容量
          end = Math.min(22, end);
          start = Math.max(0, end - maxSpan);
          end = start + maxSpan;
        }
      }
      return { start, end };
    });
  }, []);
  const vbX = geo.svgViewBoxX + vbTrimL;
  const vbW = Math.max(200, geo.svgViewBoxWidth - vbTrimL - vbTrimR);
  // 音符标签 = 相对"当前小节生效调"的级数（1 = 当前调的主音）——
  // 全局 1=B 时 B 是 1；小节有转调 1=E 时该段 1 就是 E（viewKey = keyAt(小节)，已跟随转调）。
  // 不跟和弦根音走（和弦是调内级数记法，音名体系只认调）。
  // 关键：generateNotes 的 rootNote 与 computeNoteIndex 必须同一坐标系。
  // computeNoteIndex 返回"音名表索引"——CONSTS.notes 以低音 E 开头（E=0、F=1、F#=2…B=7、C=8），
  // 即索引 = 真实音高(pc，C=0) - 4。直接传真实 pc 当 rootNote（旧实现）会让所有音名整体
  // 偏移 4 个半音（B 被当成 C，品1 F 标成 4、品7 B 标成 7）。
  const keyRoot = useMemo(() => (((viewKey?.root ?? 0) - 4) % 12 + 12) % 12, [viewKey]);
  const notes = useMemo(() => generateNotes(
    fretWin.start, fretWin.end, data, 'solfege', keyRoot, 1, 'transparent',
    (f, s) => computeNoteName(f, s, 1), computeNoteIndex, solfegeRelKey
  ), [fretWin, data, keyRoot]);
  const getNotePositionMemo = useCallback((id) => getNotePosition(id, notes), [notes]);

  // —— 与普通编辑同款 handler 工厂,只是选中色恒为 mono(点亮即单色点) ——
  const handleNoteClick = useMemo(() => createNoteClickHandler({
    data, setData, visibility: 'transparent', selected: null, setSelected: noOp,
    selectedColorLevel: 1, selectedColor: 'mono', setSelectedColorLevel: noOp, setSelectedColor: noOp,
    connectionMode: conn.connectionMode, consumePendingBrushClick: noOp, updateNote: noOp,
  }), [data, conn.connectionMode]);

  const handleNoteMouseDown = useMemo(() => createNoteMouseDownHandler({
    connectionMode: conn.connectionMode, data, visibility: 'transparent', notes,
    setConnectionStartNote: conn.setConnectionStartNote, setConnectionStartPosition: conn.setConnectionStartPosition, connectionDragActiveRef,
  }), [conn.connectionMode, data, notes, conn]);

  const handleConnDragEnd = useMemo(() => createConnectionDragEndHandler({
    connectionMode: conn.connectionMode, connectionStartNote: conn.connectionStartNote, notes, data, visibility: 'transparent',
    svgElementRef, connections: data.connections || {},
    connectionPreset: conn.connectionPreset, useColor2Level: conn.useColor2Level,
    setData, setConnectionStartNote: conn.setConnectionStartNote, setConnectionStartPosition: conn.setConnectionStartPosition,
    setMousePosition: conn.setMousePosition, setPreviewHoverNote: conn.setPreviewHoverNote, setUseColor2Level: conn.setUseColor2Level,
    connectionDragActiveRef,
  }), [conn, data, notes]);

  const handleSvgMove = useMemo(() => createSvgMouseMoveHandler({
    connectionMode: conn.connectionMode, connectionStartNote: conn.connectionStartNote, svgElementRef,
    setMousePosition: conn.setMousePosition, notes, data, visibility: 'transparent',
    setPreviewHoverNote: conn.setPreviewHoverNote, previewHoverNote: conn.previewHoverNote,
    shouldBrushPaint: (e) => brushRef.current.armed && (e.buttons & 1) === 1,
    applyBrushPaintToNote: (noteId) => {
      if (brushRef.current.lastPaintedNoteId === noteId) return;
      brushRef.current.lastPaintedNoteId = noteId;
      brushRef.current.dragged = true;
      setData(prev => ({ ...prev, [noteId]: { type: 'note', color: 'mono', color2: null, visibility: 'visible' } }));
    },
    markBrushDragging: noOp,
  }), [conn, data, notes]);

  const handleSvgDown = useMemo(() => createSvgMouseDownHandler({
    connectionMode: conn.connectionMode, startBrushPaint: (pt) => { brushRef.current = { armed: true, dragged: false, lastPaintedNoteId: null }; },
  }), [conn.connectionMode]);

  const handleSvgClick = useMemo(() => createSvgClickHandler({
    connectionMode: conn.connectionMode, connectionStartNote: conn.connectionStartNote,
    setConnectionStartNote: conn.setConnectionStartNote, setConnectionStartPosition: conn.setConnectionStartPosition,
    setMousePosition: conn.setMousePosition, setPreviewHoverNote: conn.setPreviewHoverNote, setUseColor2Level: conn.setUseColor2Level,
    selected: null, setSelected: noOp, data, setData, connectionToolbarVisible: false, setConnectionToolbarVisible: noOp, setToolbarDropdown: noOp, updateNote: noOp,
  }), [conn, data]);

  const handleSvgContext = useMemo(() => createSvgContextMenuHandler({
    connectionMode: conn.connectionMode, setConnectionMode: conn.setConnectionMode,
    setConnectionStartNote: conn.setConnectionStartNote, setConnectionStartPosition: conn.setConnectionStartPosition,
    setMousePosition: conn.setMousePosition, setPreviewHoverNote: conn.setPreviewHoverNote, setUseColor2Level: conn.setUseColor2Level,
  }), [conn]);

  const notesRef = useRef(null);
  const toolbarRef = useRef(null);
  // 拖染的松开收尾
  React.useEffect(() => {
    const stop = () => { brushRef.current.armed = false; brushRef.current.lastPaintedNoteId = null; };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); };
  }, []);
  // Ctrl+D = 清空画板（普通编辑器同键位=重置；数据走自动保存链路，外层撤销可回）
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.code === 'KeyD') {
        e.preventDefault();
        e.stopPropagation();
        setData({});
        return;
      }
      if (e.code !== 'Backspace' && e.code !== 'Delete') return;
      // hover 在连线上 → 只删该连线（普通编辑器同语义）；否则 hover 在音符上 → 删音符（连带其连线）
      if (hoveredConnectionId) {
        e.preventDefault();
        setData(prev => {
          if (!prev.connections || !prev.connections[hoveredConnectionId]) return prev;
          const connections = { ...prev.connections };
          delete connections[hoveredConnectionId];
          return { ...prev, connections };
        });
        return;
      }
      if (!hoverNote) return;
      const n = dataRef.current[hoverNote];
      if (!n || (n.visibility !== 'visible' && n.visibility !== 'selected')) return;
      e.preventDefault();
      setData(prev => {
        const next = { ...prev };
        delete next[hoverNote];
        if (next.connections) {
          const conns = { ...next.connections };
          Object.keys(conns).forEach(k => { if (conns[k].startNoteId === hoverNote || conns[k].endNoteId === hoverNote) delete conns[k]; });
          next.connections = conns;
        }
        return next;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hoverNote, hoveredConnectionId]);

  // 连线拖拽结束挂 window
  React.useEffect(() => {
    const onUp = (e) => handleConnDragEnd(e);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => { window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); };
  }, [handleConnDragEnd]);

  // —— 底部面板双页签：默认"最近同和弦"，形状库按钮切换 ——
  const [panelTab, setPanelTab] = useState('recent'); // 'recent' | 'shapes'
  const [saveForm, setSaveForm] = useState(null);
  const [shapesVer, setShapesVer] = useState(0); // 增删改名后 bump,候选列表重算
  const [candMenu, setCandMenu] = useState(null); // 右键候选菜单 {shape, x, y, confirmDelete}
  const [renameForm, setRenameForm] = useState(null); // 重命名表单 {id, name}
  const renameInputRef = useRef(null);
  const candidates = useMemo(() => (panelTab === 'shapes' && chord
    ? candidatesForChord(chord, viewKey || { root: 0, minor: false }, [...builtinShapes(), ...loadShapes()])
    : []), [panelTab, chord, viewKey, shapesVer]);
  // 候选面板开着时:点面板外/按 Esc 收菜单
  useEffect(() => {
    if (!candMenu) return;
    const close = (e) => { if (!e.target.closest('.figbe-cmenu')) setCandMenu(null); };
    const esc = (e) => { if (e.key === 'Escape') setCandMenu(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [candMenu]);

  // 最近一次应用的形状候选：换把位按钮的轮换基准（ref 供逻辑读，state 驱动按钮显隐）
  const lastCandRef = useRef(null);
  const [lastCand, setLastCand] = useState(null);
  // 应用候选：整板覆盖 + 品窗居中收敛到该形状
  const applyCand = useCallback((c) => {
    const d = candidateToData(c);
    setData(d);
    lastCandRef.current = c;
    setLastCand(c);
    setFretWin(fitWindow(d));
  }, [fitWindow]);
  const applyCandidate = (c) => {
    applyCand(c); // 面板保持打开:连续试多个候选不用反复点「形状库」,收起用顶栏按钮
  };

  // 应用"最近同和弦"的既有指法：整板覆盖 + 品窗居中（与形状候选同口径）；面板保持打开
  const applyRecent = (figData) => {
    const d = JSON.parse(JSON.stringify(figData || {}));
    setData(d);
    lastCandRef.current = null;
    setLastCand(null);
    setFretWin(fitWindow(d));
  };

  // 换把位 = 同一形状不变、整体升八度（根品 +12）：在该形状自己的各八度位间循环（到底回绕最低位）
  const positions = useMemo(() => {
    if (!lastCand || !chord) return null;
    const same = candidatesForChord(chord, viewKey || { root: 0, minor: false }, [...builtinShapes(), ...loadShapes()])
      .filter(c => c.shape.id === lastCand.shape.id)
      .sort((a, b) => a.rootFret - b.rootFret);
    return same.length >= 2 ? { same } : null;
  }, [lastCand, chord, viewKey]);
  const cyclePos = () => {
    if (!positions || !lastCandRef.current) return;
    const i = positions.same.findIndex(c => c.rootFret === lastCandRef.current.rootFret);
    const next = positions.same[(i + 1) % positions.same.length] ?? positions.same[0];
    const up = next.rootFret > (lastCandRef.current?.rootFret ?? 0);
    applyCand(next);
    showToast && up && showToast(`同一形状整体升高八度 → @${next.rootFret} 品`, 'info');
  };

  // 还原：回到打开本编辑器时的指法（形状覆盖多少次都回到最初）
  const restoreOriginal = () => {
    const d = JSON.parse(JSON.stringify(originalRef.current));
    setData(d);
    lastCandRef.current = null;
    setLastCand(null);
    setFretWin(fitWindow(d));
    // 还原是破坏性操作,当场落盘——不赌 300ms 防抖(计时器可能被随后的重渲染/关弹窗吞掉,还原就丢了)
    onAutoSave && onAutoSave(serializeBoard(d));
  };

  // —— 形状管理（右键候选：重命名 / 删除；内置形状只读）——
  const openCandMenu = (e, shape) => {
    e.preventDefault();
    setCandMenu({ shape, x: e.clientX, y: e.clientY, confirmDelete: false });
  };
  const doRename = () => {
    const v = (renameInputRef.current?.value || '').trim();
    setRenameForm(null);
    if (!v || !renameForm) return;
    persistShapes(loadShapes().map(s => (s.id === renameForm.id ? { ...s, name: v } : s)));
    setShapesVer(v => v + 1);
    showToast && showToast(`已重命名：${v}`, 'success');
  };
  const doDelete = (shape) => {
    persistShapes(loadShapes().filter(s => s.id !== shape.id));
    if (lastCandRef.current?.shape.id === shape.id) { lastCandRef.current = null; setLastCand(null); }
    setShapesVer(v => v + 1);
    setCandMenu(null);
    showToast && showToast(`已删除形状：${shape.name}`, 'success');
  };

  const openSave = () => {
    const got = shapeFromBoard(dataRef.current);
    if (!got.shape) { showToast && showToast('先点亮几个音再存形状', 'info'); return; }
    if (got.quality !== null) {
      const shape = { ...got.shape, name: (got.quality || '三和弦') + ' 形状' };
      const all = loadShapes(); all.push(shape); persistShapes(all);
      showToast && showToast(`已存入形状库：${shape.name}`, 'success');
    } else {
      setSaveForm({ quality: '', intervals: got.intervals, shape: got.shape });
    }
  };

  // —— 自动保存：数据一变（防抖 300ms）就落盘到该拍；首次挂载不触发 ——
  const serializeBoard = useCallback((d) => {
    const out = {};
    Object.entries(d || {}).forEach(([id, n]) => {
      if (id === 'connections') { if (Object.keys(n || {}).length) out.connections = n; return; }
      if (id.startsWith('conn-')) return;
      // 划音的幽灵起点（透明音、无实色）也要保留——它是连线端点，丢了整条划音就悬空消失（实测踩雷）
      const isGhostEndpoint = n && Object.values(d.connections || {}).some(c => c.startNoteId === id || c.endNoteId === id);
      if (n && (n.visibility === 'visible' || n.visibility === 'selected' || isGhostEndpoint)) out[id] = n;
    });
    return Object.keys(out).some(k => k !== 'connections') ? out : null;
  }, []);
  const autoSaveRef = useRef(false);
  React.useEffect(() => {
    if (!autoSaveRef.current) { autoSaveRef.current = true; return; }
    const t = setTimeout(() => { onAutoSave && onAutoSave(serializeBoard(dataRef.current)); }, 300);
    return () => clearTimeout(t);
  }, [data, onAutoSave, serializeBoard]);

  return (
    <div className="figbe">
      <div className="figbe-top">
        <span className="figbe-title">指法图{chord ? ` · ${formatName(chord, viewKey || { root: 0, minor: false })}` : ""}</span>
        <button className="button sm" onClick={openSave}>存为形状</button>
        {positions ? <button className="button sm" onClick={cyclePos}
          title={`形状不变，整体升高八度（当前 @${lastCand.rootFret} 品 → 下一个 @${(positions.same.find(c => c.rootFret > lastCand.rootFret) ?? positions.same[0]).rootFret} 品，到底回绕）`}>换把位</button> : null}
        {!sameAsOriginal(data, originalRef.current) ? <button className="button sm" onClick={restoreOriginal}
          title="还原为打开本编辑器时的指法——形状覆盖多少次都回到最初">还原</button> : null}
        <button className="button sm danger" onClick={() => { onAutoSave && onAutoSave(null); onClose(); }}>删除</button>
        <button className="button sm accent" onClick={onClose}>完成</button>
      </div>

      <div className="figbe-body">
        <div className="figbe-board">
          {/* 左把手：拉起点（往左拉出低把位）；右把手：拉终点（拖长/拖短）——两边都能伸 */}
          <FretWindowThumb edge="start" startFret={fretWin.start} endFret={fretWin.end}
            onFretWindowChange={applyFretWin} svgRef={svgElementRef} />
          <FretboardSVG
            svgElementRef={svgElementRef}
            svgWidth={geo.svgWidth}
            svgHeight={geo.svgHeight}
            svgViewBoxX={vbX}
            svgViewBoxY={geo.svgViewBoxY}
            svgViewBoxWidth={vbW}
            svgViewBoxHeight={geo.svgViewBoxHeight}
            handleSvgClick={handleSvgClick}
            handleSvgMouseMove={handleSvgMove}
            handleSvgMouseDown={handleSvgDown}
            handleSvgContextMenu={handleSvgContext}
            handleSvgWheel={noOp}
            fretPath={generateFretPath(fretWin.start, fretWin.end)}
            markers={generateMarkers(fretWin.start, fretWin.end)}
            generateStringPathMemo={(i) => generateStringPath(i, geo.fretboardWidth)}
            notes={notes}
            notesElementRef={notesRef}
            data={data}
            visibility="transparent"
            selected={null}
            connectionMode={conn.connectionMode}
            connectionStartNote={conn.connectionStartNote}
            previewHoverNote={conn.previewHoverNote}
            editingNote={null}
            handleNoteClick={handleNoteClick}
            handleNoteMouseDown={handleNoteMouseDown}
            setPreviewHoverNote={conn.setPreviewHoverNote}
            setUseColor2Level={conn.setUseColor2Level}
            setHoveredNoteId={setHoverNote}
            setHoveredConnectionId={setHoveredConnectionId}
            computeNoteNameMemo={(f, s) => computeNoteName(f, s, 1)}
            connections={data.connections || {}}
            getNotePositionMemo={getNotePositionMemo}
            handleConnectionClickMemo={noOp}
            handleConnectionContextMenuMemo={noOp}
            connectionStartPosition={conn.connectionStartPosition}
            mousePosition={conn.mousePosition}
            useColor2Level={false}
            editableDivVisible={false}
            editableDivX={0}
            editableDivY={0}
            editableDivRef={useRef(null)}
            editableText=""
            finishEditing={noOp}
            handleEditableKeyDown={noOp}
            handleEditableClick={noOp}
            setEditableText={noOp}
            connectionToolbarVisible={false}
            selectedConnection={null}
            connectionToolbarPosition={{ x: 0, y: 0 }}
            toolbarRef={toolbarRef}
            toolbarDropdown={null}
            toolbarDropdownDirection="down"
            setToolbarDropdown={noOp}
            setToolbarDropdownDirection={noOp}
            detectDropdownDirection={noOp}
            dataRef={dataRef}
            buttonClickRef={useRef({})}
            setData={setData}
            setConnectionToolbarVisible={noOp}
            setSelectedConnection={noOp}
            hideInactiveNotes={false}
            connectionPreset={conn.connectionPreset}
          />
          <FretWindowThumb startFret={fretWin.start} endFret={fretWin.end}
            onFretWindowChange={applyFretWin} svgRef={svgElementRef} />
        </div>

        <div className="figbe-side">
          <div className="figbe-side-block">
            <div className="figbe-side-title">连线</div>
            <div className="figbe-presets">
              {CONNECTION_PRESETS.map(p => (
                <button key={p.id} className={`button ${conn.connectionMode && conn.connectionPresetId === p.id ? 'selected' : ''}`}
                  onClick={() => conn.selectConnectionPreset(p.id)} title={p.id}>
                  <ConnectionPresetIcon presetId={p.id} />
                </button>
              ))}
              {conn.connectionMode ? <button className="button" onClick={() => conn.setConnectionMode(false)} title="退出连线（右键同）">✕</button> : null}
            </div>
          </div>
          <div className="figbe-side-block figbe-panel">
            <div className="figbe-side-head">
              <div className="figbe-side-title">和弦图</div>
              {chord ? <button className="button sm figbe-panel-toggle"
                onClick={() => setPanelTab(t => (t === 'recent' ? 'shapes' : 'recent'))}>{panelTab === 'recent' ? '形状库' : '最近同和弦'}</button> : null}
            </div>
            {panelTab === 'recent' ? (
              <div className="figbe-shapes-title">{(recentFigs || []).length ? `${recentFigs.length} 个同和弦指法` : '暂无同和弦指法'}</div>
            ) : (
              <div className="figbe-shapes-title">{candidates.length ? `${candidates.length} 个候选` : '暂无形状'}</div>
            )}
            <div className="figbe-shapes-list figbe-panel-list">
              {panelTab === 'recent'
                ? (recentFigs || []).map((item, i) => (
                  <button key={i} className="figbe-shape" onClick={() => applyRecent(item.fig)} title={`第${item.mi + 1}小节`}>
                    <span dangerouslySetInnerHTML={{ __html: figSvg(boardFigData(item.fig, chord, viewKey || { root: 0, minor: false }), { degMode: figOpts?.degMode ?? 'chord', orientation: figOpts?.orientation, size: figOpts?.size ?? 44, key: viewKey || { root: 0, minor: false } }) }} />
                    <em>{`第${item.mi + 1}小节`}</em>
                  </button>
                ))
                : candidates.map((c, i) => (
                  <button key={i} className="figbe-shape" onClick={() => applyCandidate(c)}
                    onContextMenu={e => openCandMenu(e, c.shape)} title={`${c.shape.name} @${c.rootFret}品`}>
                    <span dangerouslySetInnerHTML={{ __html: figSvg({ points: c.points.map(p => ({ string: p.string, fret: p.fret })), links: [], startFret: Math.min(...c.points.filter(p => p.fret > 0).map(p => p.fret), 13), window: 4, rootPc: c.rootPc, fail: false }, { degMode: 'none', size: 44 }) }} />
                    <em>{c.rootFret === 0 ? '开放把' : c.rootFret + '品'}</em>
                    <small>{c.shape.name}</small>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

      {candMenu ? (
        <div className="figbe-cmenu" style={{ left: Math.min(candMenu.x, window.innerWidth - 180), top: Math.min(candMenu.y, window.innerHeight - 110) }}>
          <button disabled={candMenu.shape.builtin} title={candMenu.shape.builtin ? '内置形状不可修改' : ''}
            onClick={() => { setRenameForm({ id: candMenu.shape.id, name: candMenu.shape.name }); setCandMenu(null); }}>重命名</button>
          {candMenu.confirmDelete ? (
            <button className="danger" onClick={() => doDelete(candMenu.shape)}>确认删除？</button>
          ) : (
            <button className="danger" disabled={candMenu.shape.builtin} title={candMenu.shape.builtin ? '内置形状不可删除' : ''}
              onClick={() => setCandMenu(m => ({ ...m, confirmDelete: true }))}>删除</button>
          )}
        </div>
      ) : null}

      {renameForm ? (
        <div className="figbe-shapes figbe-saveform">
          <div className="figbe-shapes-title">重命名形状</div>
          <div className="figbe-saveform-row">
            <input ref={renameInputRef} autoFocus className="cc-dialog-input" defaultValue={renameForm.name}
              onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenameForm(null); }} />
            <button className="button sm accent" onClick={doRename}>确定</button>
            <button className="button sm" onClick={() => setRenameForm(null)}>取消</button>
          </div>
        </div>
      ) : null}

      {saveForm ? (
        <div className="figbe-shapes figbe-saveform">
          <div className="figbe-shapes-title">未识别质量</div>
          <div className="figbe-saveform-row">
            <UiSelect value={saveForm.quality ?? ''} onChange={q => setSaveForm(f => ({ ...f, quality: q }))}
              options={[{ value: '', label: '— 选择质量 —' }, ...QUALITIES.map(q => ({ value: q, label: q || '三和弦' }))]} />
            <button className="button sm accent" disabled={!saveForm.quality} onClick={() => {
              const shape = { ...saveForm.shape, quality: saveForm.quality, name: (saveForm.quality || '三和弦') + ' 形状' };
              const all = loadShapes(); all.push(shape); persistShapes(all);
              setSaveForm(null);
              showToast && showToast(`已存入形状库：${shape.name}`, 'success');
            }}>存入</button>
            <button className="button sm" onClick={() => setSaveForm(null)}>不存了</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
