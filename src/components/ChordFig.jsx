import React, { useMemo, useState, useRef } from 'react';
import { boardFigData, figSvg, figGeometry, figHitTest } from '../utils/chordFig';
import { candidatesForChord, candidateToData, shapeFromBoard, inferQuality, builtinShapes, loadShapes, persistShapes } from '../utils/chordShapes';
import { QUALITIES } from '../utils/chordLib';

// ============ 只读小图(谱面拍格内嵌/汇总行/导出) ============
export function FigView({ data, chord, viewKey, opts }) {
  const html = useMemo(() => figSvg(boardFigData(data || {}, chord, viewKey), opts || {}), [data, chord, viewKey, opts]);
  if (!data || !Object.keys(data).some(k => !k.startsWith('conn') && k !== 'connections' && (data[k] || {}).visibility === 'visible')) return null;
  return <span className="cc-figview" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ============ 编辑器(点格亮灭 / 连线 / 品窗 / 挑选形状 / 存形状) ============
// data = 普通图 data 体系(noteId→noteData + connections);空对象=空白
export function FigEditor({ initialData, chord, viewKey, opts, onSave, onClose, showToast }) {
  const [data, setData] = useState(initialData && Object.keys(initialData).length ? JSON.parse(JSON.stringify(initialData)) : {});
  const [linkMode, setLinkMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState(null);
  const [viewStart, setViewStart] = useState(null); // null=自动(最低按弦品);数字=手动锁定
  const [picker, setPicker] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const svgWrapRef = useRef(null);

  const fig = useMemo(() => {
    const f = boardFigData(data, chord, viewKey);
    // 空 data 时兜底为空网格(而不是"?"占位)——编辑器要有格子可点;品窗跟随 viewStart 或默认 1
    if (f.fail) return { points: [], links: [], startFret: viewStart ?? 1, window: 4, rootPc: null, fail: false };
    if (viewStart !== null) return { ...f, startFret: viewStart, window: 4 };
    return f;
  }, [data, chord, viewKey, viewStart]);
  const editOpts = useMemo(() => ({ ...opts, size: 128, editGrid: true }), [opts]); // 编辑大图;渲染与 hitTest 走同一套几何
  const geom = useMemo(() => figGeometry(fig, editOpts), [fig, editOpts]);
  const svgHtml = useMemo(() => figSvg(fig, editOpts), [fig, editOpts]);

  const noteIdOf = (hit) => hit.fret === 0 ? `o-s${hit.string}` : `f${hit.fret - 1}-s${hit.string}`;

  const onGridClick = (e) => {
    const svg = svgWrapRef.current?.querySelector('svg');
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (geom.W / r.width);
    const py = (e.clientY - r.top) * (geom.H / r.height);
    const hit = figHitTest(geom, px, py);
    if (!hit) return;
    const id = noteIdOf(hit);
    const lit = data[id] && (data[id].visibility === 'visible' || data[id].visibility === 'selected');
    if (linkMode) {
      if (!lit) return; // 连线只在点亮音之间
      if (!linkFrom) { setLinkFrom(id); return; }
      if (linkFrom === id) { setLinkFrom(null); return; }
      // 已连 → 删;未连 → 加
      const conns = { ...(data.connections || {}) };
      const exist = Object.keys(conns).find(k => {
        const c = conns[k];
        return (c.startNoteId === linkFrom && c.endNoteId === id) || (c.startNoteId === id && c.endNoteId === linkFrom);
      });
      if (exist) delete conns[exist];
      else conns[`conn-${Date.now()}`] = { startNoteId: linkFrom, endNoteId: id, type: 'arc', arrowDirection: 'none', strokeWidth: 2 };
      setData({ ...data, connections: conns });
      setLinkFrom(null);
      return;
    }
    const next = { ...data };
    if (lit) { delete next[id]; const conns = { ...(next.connections || {}) }; Object.keys(conns).forEach(k => { if (conns[k].startNoteId === id || conns[k].endNoteId === id) delete conns[k]; }); next.connections = conns; }
    else next[id] = { type: 'note', color: 'black', color2: null, visibility: 'visible' };
    if (next.connections && !Object.keys(next.connections).length) delete next.connections;
    setData(next);
  };

  const candidates = useMemo(() => (picker && chord ? candidatesForChord(chord, viewKey, [...builtinShapes(), ...loadShapes()]) : []), [picker, chord, viewKey]);
  const inferred = useMemo(() => (saveOpen ? shapeFromBoard(data) : null), [saveOpen, data]);

  return (
    <div className="cc-figeditor">
      <div className="cc-figeditor-main">
        <div className="cc-figeditor-stage" ref={svgWrapRef} onClick={onGridClick} dangerouslySetInnerHTML={{ __html: svgHtml }} />
        <div className="cc-figeditor-side">
          <div className="cc-figeditor-row">
            <button className={`cc-figbtn ${linkMode ? 'on' : ''}`} onClick={() => { setLinkMode(v => !v); setLinkFrom(null); }}>连线</button>
            <button className="cc-figbtn" onClick={() => setViewStart(v => (v === null ? (fig.startFret || 1) : Math.max(1, v - 1)))} title="品窗上移">◀</button>
            <span className="cc-figstart">{fig.startFret}品起</span>
            <button className="cc-figbtn" onClick={() => setViewStart(v => Math.min(11, (v === null ? (fig.startFret || 1) : v) + 1))} title="品窗下移">▶</button>
            <button className="cc-figbtn" onClick={() => setViewStart(null)} title="回到自动(最低按弦品)">自动</button>
          </div>
          <div className="cc-figeditor-row">
            <button className="cc-figbtn" onClick={() => setData({})}>清空</button>
            <button className="cc-figbtn" onClick={() => { if (!chord) { showToast && showToast('该拍没有和弦,无法挑选形状(先给拍格填和弦)', 'info'); return; } setPicker(v => !v); }}>{picker ? '收起形状' : '挑选形状'}</button>
            <button className="cc-figbtn" onClick={() => { if (!Object.keys(data).some(k => k !== 'connections' && data[k])) { showToast && showToast('先点几个音再存形状', 'info'); return; } setSaveOpen(v => !v); }}>存为形状</button>
          </div>
          <div className="cc-figeditor-row hint">
            {linkMode ? (linkFrom ? '再点一个点亮的音完成连线(同对再点=删)' : '点亮连线模式:点第一个点亮的音') : '点格子放点/去点;空弦位在琴枕外侧'}
          </div>
        </div>
      </div>

      {picker && (
        <div className="cc-figpicker">
          <div className="cc-figpicker-title">{candidates.length ? `${candidates.length} 个候选(按把位从低到高)` : '该质量的形状库里还没有候选——捏一个存进库就有了'}</div>
          <div className="cc-figpicker-list">
            {candidates.map((c, i) => (
              <button key={i} className="cc-figpick" title={`${c.shape.name} @${c.rootFret}品`}
                onClick={() => { setData(candidateToData(c)); setViewStart(c.rootFret); setPicker(false); }}>
                <span dangerouslySetInnerHTML={{ __html: figSvg({ points: c.points.map(p => ({ string: p.string, fret: p.fret })), links: [], startFret: Math.min(...c.points.filter(p => p.fret > 0).map(p => p.fret), 13), window: 4, rootPc: c.rootPc, fail: false }, { degMode: 'none', orientation: opts.orientation, size: 44 }) }} />
                <em>{c.rootFret === 0 ? '开放把' : c.rootFret + '品'}</em>
                <small>{c.shape.name}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {saveOpen && inferred && (
        <div className="cc-figsave">
          <div className="cc-figsave-row">
            <span>分类</span>
            <select defaultValue={inferred.quality ?? ''} id="cc-figsave-q">
              {inferred.quality
                ? <option value={inferred.quality}>{inferred.quality || '三和弦'}(自动)</option>
                : <option value="">— 手动选择 —</option>}
              {QUALITIES.map(q => <option key={q} value={q}>{q || '三和弦'}</option>)}
            </select>
            <span>名字</span>
            <input id="cc-figsave-name" placeholder="可空(自动按分类)" defaultValue="" />
          </div>
          <div className="cc-figsave-row">
            <span className="hint">音程 {inferred.intervals.join(',')} → {inferred.quality ? `识别为 ${inferred.quality || '三和弦'}` : '未识别,请手动分类'}</span>
            <button className="cc-figbtn primary" onClick={() => {
              const q = document.getElementById('cc-figsave-q').value;
              if (!q && q !== '') { /* 空串=三和弦 合法 */ }
              const name = document.getElementById('cc-figsave-name').value.trim();
              const shape = { ...inferred.shape, quality: q, name: name || (q || '三和弦') + ' 形状' };
              const all = loadShapes();
              all.push(shape);
              persistShapes(all);
              setSaveOpen(false);
              showToast && showToast(`已存入形状库:${shape.name}(分类 ${q || '三和弦'})`, 'success');
            }}>存入</button>
          </div>
        </div>
      )}

      <div className="cc-figeditor-foot">
        <button className="cc-figbtn" onClick={onClose}>取消</button>
        <button className="cc-figbtn primary" onClick={() => onSave(data)}>完成</button>
      </div>
    </div>
  );
}
