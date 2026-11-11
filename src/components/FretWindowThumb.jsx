import React, { useRef, useState, useCallback } from 'react';
import { useLanguage, zh } from '../i18n';

// 品窗拖块——板旁一条不起眼的窄竖轨 + 小把手：
//   edge='end'(默认,板右侧)：左右拖动改品窗长短（往右拖长=多显几品，往左拖短），起点不变；
//   edge='start'(板左侧)：   左右拖动改起点（往左拉出低把位，往右收窄），终点不变——
//                            居中铺窗后高把位的窗起点常在品1右侧，没有它低品音就永远点不到。
// props: startFret/endFret(当前品窗), onFretWindowChange({start,end,anchor}), svgRef(板 SVG,量每品px), edge
export function FretWindowThumb({ startFret, endFret, onFretWindowChange, svgRef, edge = 'end' }) {
  const { t } = useLanguage();
  const tf = t?.fretboard ?? zh.fretboard;
  const [dragging, setDragging] = useState(false);
  const [nudge, setNudge] = useState(0); // 拖动中把手跟随的轻微位移(松手回位)
  const dragRef = useRef(null);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // 每品渲染宽度:板 SVG 宽 / 品窗品数;拿不到时退回 36px
    let pxPerFret = 36;
    try {
      const svg = svgRef && svgRef.current;
      if (svg) {
        const w = svg.getBoundingClientRect().width;
        if (w > 0 && endFret > startFret) pxPerFret = w / (endFret - startFret);
      }
    } catch (err) { /* 保持 fallback */ }
    dragRef.current = { x: e.clientX, baseStart: startFret, baseEnd: endFret, baseSpan: endFret - startFret, pxPerFret, edge };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [startFret, endFret, svgRef, edge]);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    setNudge(Math.max(-14, Math.min(14, dx * 0.15)));
    if (d.edge === 'start') {
      // 往左拉出低把位、往右收窄：起点按拖动距离换算品数，终点不动
      const shift = Math.round(dx / d.pxPerFret);
      const newStart = Math.max(0, Math.min(d.baseEnd - 2, d.baseStart + shift));
      if (newStart !== startFret) onFretWindowChange({ start: newStart, end: d.baseEnd, anchor: 'start' });
      return;
    }
    // 往右拖长、往左拖短：跨度按拖动距离换算品数，起点不动
    const grow = Math.round(dx / d.pxPerFret);
    const newSpan = Math.max(2, Math.min(22 - d.baseStart, d.baseSpan + grow));
    const newEnd = d.baseStart + newSpan;
    if (newEnd !== endFret) onFretWindowChange({ start: d.baseStart, end: newEnd });
  }, [startFret, endFret, onFretWindowChange]);

  const endDrag = useCallback((e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setNudge(0);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { /* 已释放 */ }
  }, []);

  return (
    <div className={`fwt${edge === 'start' ? ' fwt-start' : ''}${dragging ? ' dragging' : ''}`}
      title={edge === 'start' ? tf.fretStartDrag : tf.fretEndDrag}>
      <div className="fwt-rail" />
      <div className="fwt-knob"
        style={{ transform: `translateX(${nudge}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}>
        <span className="fwt-grip" />
      </div>
      {edge !== 'start' && <span className="fwt-label">{startFret + 1}–{endFret}</span>}
    </div>
  );
}
