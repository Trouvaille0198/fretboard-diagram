import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { FretboardSVG } from './FretboardSVG';
import { UiSelect } from './UiSelect';
import { ConnectionPresetIcon } from './ConnectionPresetIcon';
import { FretWindowThumb } from './FretWindowThumb';
import { CONNECTION_PRESETS, useConnectionState } from '../hooks/useConnectionState';
import { generateNotes, computeNoteName, computeNoteIndex, generateFretPath, generateStringPath, generateMarkers, getNotePosition, boardGeometry } from '../utils/fretboardCalculations';
import { createNoteClickHandler, createNoteMouseDownHandler, createConnectionDragEndHandler } from '../handlers/noteHandlers';
import { createSvgClickHandler, createSvgMouseMoveHandler, createSvgMouseDownHandler, createSvgContextMenuHandler } from '../handlers/svgHandlers';
import { figSvg } from '../utils/chordFig';
import { CONSTS } from '../constants';
import { candidatesForChord, candidateToData, shapeFromBoard, builtinShapes, loadShapes, persistShapes } from '../utils/chordShapes';
import { QUALITIES } from '../utils/chordLib';

const noOp = () => { };

// 唱名（首调,相对当前调根音）:全半音表——小调自然音级(b3/b6/b7)自动落对,与小图"调内级数"体系同口径
const SOLFEGE_REL = { 0: '1', 1: '#1', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' };
const solfegeRelKey = (noteIndex, rootNote) => SOLFEGE_REL[((noteIndex - rootNote) % 12 + 12) % 12];

// 指法小图编辑器——和弦谱页内大弹窗里的"裁剪版普通编辑器"：
// 交互与普通编辑完全同源(点音亮灭/连线拖拽/长按刷染),但按小图场景裁剪：
// 音符恒为 mono 单色点(无色板)、工具区只有连线预设(无钢琴/下载/异色)。
// 编辑实时自动保存(数据变化即落盘到该拍 unit.fig,无需手动确认)；
// 顶条：形状库候选(该拍和弦匹配) / 存为形状 / 关闭。
export function FigBoardEditor({ initialData, chord, viewKey, onAutoSave, onClose, showToast, figOpts }) {
  const [data, setData] = useState(() => (initialData && Object.keys(initialData).length ? JSON.parse(JSON.stringify(initialData)) : {}));
  const dataRef = useRef(data);
  dataRef.current = data;

  // 品窗：按初始数据最低/最高按弦品收敛；空 = 0-5
  const [fretWin, setFretWin] = useState(() => {
    const pressed = Object.keys(initialData || {}).map(id => { const m = /^f(-?\d+)-s\d$/.exec(id); return m ? +m[1] + 1 : null; }).filter(v => v && v > 0);
    return pressed.length
      ? { start: Math.max(0, Math.min(...pressed) - 1), end: Math.min(22, Math.max(...pressed) + 2) }
      : { start: 0, end: 5 };
  });

  const svgElementRef = useRef(null);
  const [hoverNote, setHoverNote] = useState(null); // 退格熄灭用(与普通编辑同语义:点亮靠点,熄灭靠退格)
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
  useEffect(() => {
    // 挂载默认品窗：够宽 1-14，不够宽 = 能装下的最大品数；已有数据的高把位仍要覆盖
    const apply = () => {
      maxSpanRef.current = maxSpanOf();
      const defSpan = Math.min(14, maxSpanRef.current);
      setFretWin(prev => {
        if (prev.end - prev.start >= defSpan) return prev;
        const end = Math.min(22, Math.max(prev.start + defSpan, prev.end));
        const start = Math.max(0, Math.min(prev.start, end - defSpan));
        return { start, end };
      });
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [maxSpanOf]);

  // 拖块回调：跨度超过容量时不缩放，窗口右移（1-7 拖长变 3-9 语义）
  const applyFretWin = useCallback((w) => {
    setFretWin(prev => {
      let start = w.start ?? prev.start;
      let end = w.end ?? prev.end;
      const maxSpan = maxSpanRef.current;
      if (end - start > maxSpan) {
        // 宽度装不下更长的窗：不缩放，改为右滑——右缘顶到期望品，起点=末端-容量
        end = Math.min(22, end);
        start = Math.max(0, end - maxSpan);
        end = start + maxSpan;
      }
      return { start, end };
    });
  }, []);
  const vbX = geo.svgViewBoxX + vbTrimL;
  const vbW = Math.max(200, geo.svgViewBoxWidth - vbTrimL - vbTrimR);
  // 音符标签 = 当前调唱名（do-re-mi 相对调根音），与小图"调内级数"同口径
  const keyRoot = viewKey?.root ?? 0;
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
  // 退格/Delete 熄灭悬停音(普通编辑同款语义;连线随端点消失一并清理)
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Backspace' && e.code !== 'Delete') return;
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
  }, [hoverNote]);

  // 连线拖拽结束挂 window
  React.useEffect(() => {
    const onUp = (e) => handleConnDragEnd(e);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => { window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); };
  }, [handleConnDragEnd]);

  // —— 形状库 / 存形状 ——
  const [shapesOpen, setShapesOpen] = useState(false);
  const [saveForm, setSaveForm] = useState(null);
  const candidates = useMemo(() => (shapesOpen && chord
    ? candidatesForChord(chord, viewKey || { root: 0, minor: false }, [...builtinShapes(), ...loadShapes()])
    : []), [shapesOpen, chord, viewKey]);

  const applyCandidate = (c) => {
    const d = candidateToData(c);
    const pressed = Object.keys(d).map(id => { const m = /^f(-?\d+)-s\d$/.exec(id); return m ? +m[1] + 1 : null; }).filter(v => v && v > 0);
    setData(d);
    if (pressed.length) setFretWin({ start: Math.max(0, Math.min(...pressed) - 1), end: Math.min(22, Math.max(...pressed) + 2) });
    setShapesOpen(false);
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
  const autoSaveRef = useRef(false);
  React.useEffect(() => {
    if (!autoSaveRef.current) { autoSaveRef.current = true; return; }
    const t = setTimeout(() => {
      const out = {};
      Object.entries(data).forEach(([id, n]) => {
        if (id === 'connections') { if (Object.keys(n || {}).length) out.connections = n; return; }
        if (id.startsWith('conn-')) return;
        if (n && (n.visibility === 'visible' || n.visibility === 'selected')) out[id] = n;
      });
      onAutoSave && onAutoSave(Object.keys(out).some(k => k !== 'connections') ? out : null);
    }, 300);
    return () => clearTimeout(t);
  }, [data, onAutoSave]);

  return (
    <div className="figbe">
      <div className="figbe-top">
        <span className="figbe-title">指法图</span>
        {chord ? <button className="button sm" onClick={() => setShapesOpen(v => !v)}>形状库</button> : null}
        <button className="button sm" onClick={openSave}>存为形状</button>
        <button className="button sm danger" onClick={() => { onAutoSave && onAutoSave(null); onClose(); }}>删除</button>
        <button className="button sm accent" onClick={onClose}>完成</button>
      </div>

      <div className="figbe-body">
        <div className="figbe-board">
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
            setHoveredConnectionId={noOp}
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
          <div className="figbe-side-block">
            <div className="figbe-side-title">预览</div>
            <div className="figbe-preview" dangerouslySetInnerHTML={{
              __html: (() => {
                // 与 FigView 同口径:从 data 直推点集与品窗
                const pts = [];
                Object.entries(data).forEach(([id, n]) => {
                  if (id === 'connections' || id.startsWith('conn-')) return;
                  if (!n || (n.visibility !== 'visible' && n.visibility !== 'selected')) return;
                  const m = /^(?:o|f(-?\d+))-s(\d)$/.exec(id);
                  if (m) pts.push({ string: +m[2], fret: m[1] === undefined ? 0 : +m[1] + 1 });
                });
                const pressed = pts.filter(p => p.fret > 0).map(p => p.fret);
                const startFret = pressed.length ? Math.min(...pressed) : 1;
                const window = Math.max(4, Math.min(6, (pressed.length ? Math.max(...pressed) : startFret) - startFret + 1));
                const links = [];
                Object.values(data.connections || {}).forEach(c => {
                  const idOf = (nid) => { const m = /^(?:o|f(-?\d+))-s(\d)$/.exec(nid); return m ? { string: +m[2], fret: m[1] === undefined ? 0 : +m[1] + 1 } : null; };
                  const a = idOf(c.startNoteId), b = idOf(c.endNoteId);
                  if (a && b) links.push({ a, b });
                });
                return figSvg({ points: pts, links, startFret, window, rootPc: null, fail: !pts.length }, figOpts || { degMode: 'chord' });
              })(),
            }} />
          </div>
        </div>
      </div>

      {shapesOpen ? (
        <div className="figbe-shapes">
          <div className="figbe-shapes-title">{candidates.length ? `${candidates.length} 个候选 · 点击应用` : '暂无形状'}</div>
          <div className="figbe-shapes-list">
            {candidates.map((c, i) => (
              <button key={i} className="figbe-shape" onClick={() => applyCandidate(c)} title={`${c.shape.name} @${c.rootFret}品`}>
                <span dangerouslySetInnerHTML={{ __html: figSvg({ points: c.points.map(p => ({ string: p.string, fret: p.fret })), links: [], startFret: Math.min(...c.points.filter(p => p.fret > 0).map(p => p.fret), 13), window: 4, rootPc: c.rootPc, fail: false }, { degMode: 'none', size: 44 }) }} />
                <em>{c.rootFret === 0 ? '开放把' : c.rootFret + '品'}</em>
                <small>{c.shape.name}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {saveForm ? (
        <div className="figbe-shapes figbe-saveform">
          <div className="figbe-shapes-title">未识别质量 · 手动选择后存入</div>
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
