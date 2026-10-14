import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { CONSTS } from '../constants';
import { FretboardSVG } from './FretboardSVG';
import { generateNotes, computeNoteName, computeNoteIndex, generateFretPath, generateStringPath, generateMarkers, getNotePosition } from '../utils/fretboardCalculations';
import { inlineCSS, noteToSolfege } from '../utils';
import { resolveNoteVisualStyle } from '../colorConfig';
import { chordDisplay } from '../utils/songStructure';
import { describeTransition, sampleTransition, elsToSvgString } from '../utils/transitionAnimator';
import { LanguageProvider } from '../i18n';
import { createPortal } from 'react-dom';

const noOp = () => {};

// 与编辑区一致的指板几何
export function boardGeometry(startFret, endFret) {
  const numFrets = endFret - startFret;
  const fretboardWidth = CONSTS.fretWidth * numFrets;
  const leftOffset = CONSTS.offsetX + CONSTS.fretWidth / 2;
  const svgWidth = fretboardWidth + leftOffset + CONSTS.offsetX;
  const zeroFretLeftEdge = CONSTS.offsetX - CONSTS.fretWidth / 2 - CONSTS.circleRadius;
  const svgViewBoxX = zeroFretLeftEdge - 5;
  const svgViewBoxWidth = svgWidth - svgViewBoxX;
  const bottomMarkerY = CONSTS.offsetY + CONSTS.fretHeight + CONSTS.stringSpacing * 0.7;
  const topMarkerY = CONSTS.offsetY - CONSTS.stringSpacing * 0.5;
  const svgHeight = bottomMarkerY + 20;
  const svgViewBoxY = topMarkerY - 20;
  const svgViewBoxHeight = svgHeight - svgViewBoxY;
  return { fretboardWidth, svgWidth, svgHeight, svgViewBoxX, svgViewBoxY, svgViewBoxWidth, svgViewBoxHeight };
}

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
      showNotes={showNotes}
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
      handleConnectionContextMenuMemo={noOp}
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
      showNotes={s.showNotes}
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
    return () => cancelAnimationFrame(raf);
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
  // 轮询等待 SVG 真正渲染完成（React 18 createRoot 异步 commit；固定等待会有竞态导致空板）
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    const svg = host.querySelector('svg');
    if (svg && svg.querySelectorAll('g.note').length > 0) break;
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
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--background-color').trim() || '#10161c';
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

// ============ 导出整首一张图 ============

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// timelineEl: 时间轴容器 DOM；measures: deriveMeasures 结果；meta: 小节附加信息
export function exportSheetImage({ timelineEl, measures, meta, rootNote, isMinor, enharmonic, directoryName, t }) {
  const groups = [...(timelineEl?.querySelectorAll('.tl-measure') || [])];
  if (!groups.length) return;

  const thumbW = 190;
  const thumbH = 124;
  const rowPad = 16;
  const rowGap = 18;
  const numberColW = 120;
  const fieldsColW = 300;
  const headerH = 90;
  const pageW = 1560;

  const backgroundColor =
    getComputedStyle(document.documentElement).getPropertyValue('--background-color').trim() || 'black';
  const textColor = '#e8eef4';
  const mutedColor = '#9fb2c0';
  const accent = '#f3ba62';
  const fontStack = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  const rows = groups.map((group, index) => {
    const minis = [...group.querySelectorAll('.score-mini')].filter(el => el.querySelector('svg'));
    const measureInfo = measures[index] || {};
    const m = meta[measureInfo.id] || {};
    const chordText = chordDisplay(m.chord, rootNote, isMinor, enharmonic).text;
    const stripRows = Math.max(1, Math.ceil(minis.length / 6));
    const height = Math.max(stripRows * (thumbH + 10) + 10, 150) + rowPad * 2;
    return { group, minis, index, chordText, m, height };
  });

  const totalH = headerH + rows.reduce((sum, r) => sum + r.height + rowGap, 0);

  const parts = [];
  parts.push(`<rect x="0" y="0" width="${pageW}" height="${totalH}" fill="${backgroundColor}"/>`);
  parts.push(`<text x="${rowPad}" y="52" font-family="${fontStack}" font-size="30" font-weight="700" fill="${textColor}">${escapeXml(directoryName || t?.untitled || '')}</text>`);
  parts.push(`<text x="${rowPad}" y="80" font-family="${fontStack}" font-size="14" fill="${mutedColor}">${escapeXml(t?.sheetSubtitle ? t.sheetSubtitle(measures.length) : `${measures.length} measures`)}</text>`);

  let y = headerH;
  rows.forEach(({ minis, index, chordText, m, height }) => {
    parts.push(`<line x1="${rowPad}" y1="${y}" x2="${pageW - rowPad}" y2="${y}" stroke="rgba(230,237,242,0.14)" stroke-width="1"/>`);
    parts.push(`<text x="${rowPad + 6}" y="${y + 44}" font-family="${fontStack}" font-size="26" font-weight="700" fill="${accent}">${index + 1}</text>`);
    parts.push(`<text x="${rowPad + 6}" y="${y + 74}" font-family="${fontStack}" font-size="17" fill="${textColor}">${escapeXml(chordText)}</text>`);

    minis.forEach((miniEl, i) => {
      const miniSvg = miniEl.querySelector('svg');
      const clone = inlineCSS(miniSvg.cloneNode(true), miniSvg);
      clone.setAttribute('width', String(thumbW));
      clone.setAttribute('height', String(thumbH));
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      clone.setAttribute('x', String(numberColW + rowPad + (i % 6) * (thumbW + 10)));
      clone.setAttribute('y', String(y + rowPad + Math.floor(i / 6) * (thumbH + 10)));
      const serializer = new XMLSerializer();
      parts.push(serializer.serializeToString(clone));
      parts.push(`<text x="${numberColW + rowPad + (i % 6) * (thumbW + 10) + thumbW / 2}" y="${y + rowPad + Math.floor(i / 6) * (thumbH + 10) + thumbH + 12}" text-anchor="middle" font-family="${fontStack}" font-size="12" fill="${mutedColor}">${i + 1}</text>`);
    });

    const fx = pageW - fieldsColW;
    parts.push(`<text x="${fx}" y="${y + 40}" font-family="${fontStack}" font-size="17" fill="${textColor}">${escapeXml(m.jianpu || '')}</text>`);
    parts.push(`<text x="${fx}" y="${y + 74}" font-family="${fontStack}" font-size="15" fill="${mutedColor}">${escapeXml(m.lyrics || '')}</text>`);

    y += height + rowGap;
  });

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${totalH}" viewBox="0 0 ${pageW} ${totalH}">${parts.join('\n')}</svg>`;
  const baseName = (directoryName || 'fretboard-song').replace(/[\\/:*?"<>|]/g, '_');

  if (window.__exportFormat === 'svg') {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), `${baseName}.svg`);
    return;
  }

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = pageW * 2;
    canvas.height = totalH * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(pngBlob => {
      triggerDownload(URL.createObjectURL(pngBlob), `${baseName}.png`);
    }, 'image/png');
  };
  img.src = url;
}
