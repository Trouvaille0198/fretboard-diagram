import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { FretboardSVG } from './FretboardSVG';
import { generateNotes, computeNoteName, computeNoteIndex, generateFretPath, generateStringPath, generateMarkers, getNotePosition, boardGeometry } from '../utils/fretboardCalculations';
import { inlineCSS, noteToSolfege } from '../utils';
import { resolveNoteVisualStyle, CANVAS_COLORS } from '../colorConfig';
import { chordDisplay } from '../utils/songStructure';
import { describeTransition, sampleTransition, elsToSvgString } from '../utils/transitionAnimator';
import { LanguageProvider } from '../i18n';
import { createPortal } from 'react-dom';

const noOp = () => {};

// 几何已下沉到纯 JS 模块（拼接区等非组件代码共用）；此处转发保持既有引用不变
export { boardGeometry };

export function buildNotes(state) {
  return generateNotes(
    state.startFret,
    state.endFret,
    state.data,
    state.displayMode,
    state.rootNote,
    state.enharmonic,
    state.visibility,
    (fret, string) => computeNoteName(fret, string, state.enharmonic),
    computeNoteIndex,
    noteToSolfege
  );
}

// 用一张快照渲染一块"哑"指板（复用完整渲染逻辑，交互全部置空）
// memo：按 state 引用比较——帧数据不变就跳过重渲（拖拽/播放时帧条不重算）
export const ScoreBoard = React.memo(function ScoreBoard({ snapshot, options }) {
  const s = snapshot.state;
  // 展示设置（导出用）：品数标记 / 音名显示
  const includeMarkers = options ? options.includeMarkers !== false : true;
  const showNotes = options ? options.showNotes !== false : true;
  const geo = useMemo(() => boardGeometry(s.startFret, s.endFret), [s.startFret, s.endFret]);
  const notes = useMemo(
    () => buildNotes(s),
    [s.startFret, s.endFret, s.data, s.displayMode, s.rootNote, s.enharmonic, s.visibility]
  );
  const svgRef = useRef(null);
  const notesRef = useRef(null);
  const toolbarRef = useRef(null);
  const editableDivRef = useRef(null);
  const dataRef = useRef(s.data);
  const buttonClickRef = useRef({});
  const computeNoteNameMemo = useCallback((fret, string) => computeNoteName(fret, string, s.enharmonic), [s.enharmonic]);
  const generateStringPathMemo = useCallback((i) => generateStringPath(i, geo.fretboardWidth), [geo.fretboardWidth]);
  const getNotePositionMemo = useCallback((id) => getNotePosition(id, notes), [notes]);

  return (
    <FretboardSVG
      svgElementRef={svgRef}
      svgWidth={geo.svgWidth}
      svgHeight={geo.svgHeight}
      svgViewBoxX={geo.svgViewBoxX}
      svgViewBoxY={geo.svgViewBoxY}
      svgViewBoxWidth={geo.svgViewBoxWidth}
      svgViewBoxHeight={geo.svgViewBoxHeight}
      handleSvgClick={noOp}
      handleSvgMouseMove={noOp}
      handleSvgMouseDown={noOp}
      handleSvgContextMenu={noOp}
      handleSvgWheel={noOp}
      fretPath={generateFretPath(s.startFret, s.endFret)}
      markers={includeMarkers ? generateMarkers(s.startFret, s.endFret) : []}
      generateStringPathMemo={generateStringPathMemo}
      notes={notes}
      notesElementRef={notesRef}
      hideInactiveNotes={!showNotes} /* "显示音符"=导出/复制开关：关(默认)=只带激活音；开=带暗圆网格。网页查看/编辑永远全显 */
      data={s.data}
      visibility={s.visibility}
      selected={null}
      connectionMode={false}
      connectionStartNote={null}
      previewHoverNote={null}
      editingNote={null}
      handleNoteClick={noOp}
      handleNoteMouseDown={noOp}
      setPreviewHoverNote={noOp}
      setUseColor2Level={noOp}
      setHoveredNoteId={noOp}
      setHoveredConnectionId={noOp}
      computeNoteNameMemo={computeNoteNameMemo}
      connections={s.data?.connections || {}}
      getNotePositionMemo={getNotePositionMemo}
      handleConnectionClickMemo={noOp}
      connectionStartPosition={null}
      mousePosition={null}
      useColor2Level={false}
      editableDivVisible={false}
      editableDivX={0}
      editableDivY={0}
      editableDivRef={editableDivRef}
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
      buttonClickRef={buttonClickRef}
      setData={noOp}
      setConnectionToolbarVisible={noOp}
      setSelectedConnection={noOp}
    />
  );
}, (prev, next) => prev.snapshot?.state === next.snapshot?.state
	&& prev.options?.includeMarkers === next.options?.includeMarkers
	&& prev.options?.showNotes === next.options?.showNotes);

// 帧间转移特效：退出的音淡出、进入的音扩散环（可琶音错开）、同弦转移光点移动
// sl 画滑线，h/p 急促缓动 + 字母，hp 往返 + 瞬时音闪环；与导出动图共用 transitionAnimator 内核
export function TransitionFx({ prevState, nextState, spec, durationMs = 300, width, height, className, portalTo }) {
  const geo = boardGeometry(nextState.startFret, nextState.endFret);
  const desc = useMemo(
    () => describeTransition(prevState, nextState, spec || { technique: null, pairs: [] }),
    [prevState, nextState, spec]
  );
  const [t, setT] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    startRef.current = null;
    setT(0);
    let raf = 0;
    const dur = Math.max(1, durationMs);
    const tick = now => {
      if (startRef.current === null) startRef.current = now;
      const p = Math.min(1, (now - startRef.current) / dur);
      setT(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // 硬性寿命兜底：rAF 可能被同刻状态切换的 remount 取消在半途（冻结涟漪的根因），
    // 到期定时器强制 t=1（完成态=空元素），任何 fx 都不允许超过自己的时长存活
    const kill = setTimeout(() => { cancelAnimationFrame(raf); setT(1); }, dur + 80);
    return () => { cancelAnimationFrame(raf); clearTimeout(kill); };
  }, [desc, durationMs]);

  const els = useMemo(() => sampleTransition(desc, t, durationMs), [desc, t, durationMs]);
  const body = useMemo(
    () => elsToSvgString(els, `${geo.svgViewBoxX} ${geo.svgViewBoxY} ${geo.svgViewBoxWidth} ${geo.svgViewBoxHeight}`, { noteStyle: resolveNoteVisualStyle() }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''),
    [els, geo]
  );

  // portal 模式：直接渲染进主板 <svg> 内部，与板同坐标系，天然零偏移
  if (portalTo) {
    return createPortal(
      <g className="stage-fx-layer" dangerouslySetInnerHTML={{ __html: body }} />,
      portalTo
    );
  }

  return (
    <svg
      className={className || 'score-fx'}
      width={width}
      height={height}
      viewBox={`${geo.svgViewBoxX} ${geo.svgViewBoxY} ${geo.svgViewBoxWidth} ${geo.svgViewBoxHeight}`}
      preserveAspectRatio="xMidYMid meet"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

// 离屏渲染一帧板面 → 独立样式的 HTMLImageElement（动图导出用）
export async function renderBoardImage(state, width, options = {}) {
  const { createRoot } = await import('react-dom/client');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:600px;';
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<LanguageProvider><ScoreBoard snapshot={{ state }} options={options} /></LanguageProvider>);
  // 轮询等待 SVG 真正渲染完成（React 18 createRoot 异步 commit；固定等待会有竞态导致空板）。
  // 空板（showNotes 关=无暗圆网格且 0 激活音）没有 g.note 可等：计数连续稳定即视为落定，
  // 否则每张空板都会白等满 2000ms 上限（动图导出慢的元凶之一）
  const t0 = Date.now();
  let lastCount = -1, stableTicks = 0;
  while (Date.now() - t0 < 2000) {
    const svg = host.querySelector('svg');
    if (svg) {
      const count = svg.querySelectorAll('g.note').length;
      if (count > 0) break;
      if (count === lastCount) { if (++stableTicks >= 2) break; }
      else { stableTicks = 0; lastCount = count; }
    }
    await new Promise(r => setTimeout(r, 25));
  }

  const svgEl = host.querySelector('svg');
  if (!svgEl) {
    root.unmount();
    host.remove();
    throw new Error('板面渲染失败');
  }
  const clone = inlineCSS(svgEl.cloneNode(true), svgEl); // 原始树=本离屏 svg（此前误抄主舞台，导出帧全同）
  const vbStr = clone.getAttribute('viewBox') || '0 0 800 400';
  const vb = vbStr.split(/\s+/).map(Number);
  // 水平/垂直截断：由调用方统一计算的裁剪框（跨全部帧联合范围，保证动画各帧同视野不跳动）
  let [vx, vy, vw, vh] = vb;
  if (options.cropBox && options.cropBox.w > 0) {
    vx = options.cropBox.x; vy = options.cropBox.y; vw = options.cropBox.w; vh = options.cropBox.h;
    clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  }
  const height = Math.round(width * vh / vw);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--background-color').trim() || CANVAS_COLORS.bgFallback;
  clone.setAttribute('style', `background-color:${bg};`);

  const svgString = new XMLSerializer().serializeToString(clone);
  if (options.svgOnly) {
    root.unmount();
    host.remove();
    return svgString;
  }
  const img = await new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('板面 SVG 解码失败')); };
    image.src = url;
  });
  root.unmount();
  host.remove();
  return img;
}

