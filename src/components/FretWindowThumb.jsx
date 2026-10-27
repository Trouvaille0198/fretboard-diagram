import React, { useRef, useState, useCallback } from 'react';

// 品窗拖块——替代旧的双头品窗滑块：板旁一条不起眼的窄竖轨 + 小把手，
// 左右拖动改变品窗长短（往右拖长=多显几品，往左拖短），起点不变。
// props: startFret/endFret(当前品窗), onFretWindowChange({start,end}), svgRef(板 SVG,量每品px)
export function FretWindowThumb({ startFret, endFret, onFretWindowChange, svgRef }) {
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
    dragRef.current = { x: e.clientX, baseStart: startFret, baseSpan: endFret - startFret, pxPerFret };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [startFret, endFret, svgRef]);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    setNudge(Math.max(-14, Math.min(14, dx * 0.15)));
    // 往右拖长、往左拖短：跨度按拖动距离换算品数，起点不动
    const grow = Math.round(dx / d.pxPerFret);
    const newSpan = Math.max(2, Math.min(22 - d.baseStart, d.baseSpan + grow));
    const newEnd = d.baseStart + newSpan;
    if (newEnd !== endFret) onFretWindowChange({ start: d.baseStart, end: newEnd });
  }, [endFret, onFretWindowChange]);

  const endDrag = useCallback((e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setNudge(0);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { /* 已释放 */ }
  }, []);

  return (
    <div className={`fwt ${dragging ? 'dragging' : ''}`} title="左右拖动 · 拖长/拖短品窗">
      <div className="fwt-rail" />
      <div className="fwt-knob"
        style={{ transform: `translateX(${nudge}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}>
        <span className="fwt-grip" />
      </div>
      <span className="fwt-label">{startFret + 1}–{endFret}</span>
    </div>
  );
}
