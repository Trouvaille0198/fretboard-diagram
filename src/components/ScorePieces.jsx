import React, { useMemo, useRef, useCallback } from 'react';
import { CONSTS } from '../constants';
import { FretboardSVG } from './FretboardSVG';
import { generateNotes, computeNoteName, computeNoteIndex, generateFretPath, generateStringPath, generateMarkers, getNotePosition } from '../utils/fretboardCalculations';
import { calculateArcPath, inlineCSS, noteToSolfege } from '../utils';
import { activeNoteIdsOf, chordDisplay } from '../utils/songStructure';

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
export function ScoreBoard({ snapshot }) {
  const s = snapshot.state;
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
      markers={generateMarkers(s.startFret, s.endFret)}
      generateStringPathMemo={generateStringPathMemo}
      notes={notes}
      notesElementRef={notesRef}
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
}

// 帧间转移特效：退出的音淡出、进入的音扩散环、同弦转移画滑线 + 光点 + 技法字母
export function TransitionFx({ prevState, nextState, technique, durationMs, className }) {
  const geo = boardGeometry(nextState.startFret, nextState.endFret);
  const prevNotes = buildNotes(prevState);
  const nextNotes = buildNotes(nextState);
  const exited = [];
  const entered = [];
  const pairs = [];

  // 只比较"正在发声"的音符（可见且有颜色），而不是整块指板
  const prevActive = activeNoteIdsOf(prevState);
  const nextActive = activeNoteIdsOf(nextState);
  const removedList = prevNotes.filter(n => prevActive.has(n.id) && !nextActive.has(n.id));
  const addedList = nextNotes.filter(n => nextActive.has(n.id) && !prevActive.has(n.id));
  const used = new Set();
  removedList.forEach(from => {
    const to = addedList.find(n => !used.has(n.id) && n.y === from.y);
    if (to) { used.add(n.id); pairs.push({ from, to }); }
  });
  addedList.forEach(n => { if (!used.has(n.id)) entered.push(n); });
  removedList.forEach(n => { if (!pairs.some(p => p.from.id === n.id)) exited.push(n); });

  const key = `${prevState.timestamp}-${nextState.timestamp}`;

  return (
    <svg
      key={key}
      className={className || 'score-fx'}
      viewBox={`${geo.svgViewBoxX} ${geo.svgViewBoxY} ${geo.svgViewBoxWidth} ${geo.svgViewBoxHeight}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {exited.map(n => (
        <circle key={`out-${n.id}`} className="fx-out" cx={n.x} cy={n.y} r={CONSTS.circleRadius} />
      ))}
      {entered.map(n => (
        <circle key={`in-${n.id}`} className="fx-in" cx={n.x} cy={n.y} r={CONSTS.circleRadius} />
      ))}
      {pairs.map(({ from, to }) => {
        const path = calculateArcPath(from.x, from.y, to.x, to.y, 0.4);
        const mid = {
          x: 0.25 * from.x + 0.5 * ((from.x + to.x) / 2) + 0.25 * to.x,
          y: 0.25 * from.y + 0.5 * ((from.y + to.y) / 2 - Math.abs(to.x - from.x) * 0.12) + 0.25 * to.y
        };
        return (
          <g key={`pair-${from.id}-${to.id}`}>
            <path className="fx-line" d={path} />
            <circle className="fx-dot" r="7" cx={from.x} cy={from.y}>
              <animateMotion dur={`${durationMs}ms`} fill="freeze" path={path} />
            </circle>
            {technique && (
              <text className="fx-letter" x={mid.x} y={mid.y - 12} textAnchor="middle">{technique}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
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
      const clone = inlineCSS(miniEl.querySelector('svg').cloneNode(true));
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
