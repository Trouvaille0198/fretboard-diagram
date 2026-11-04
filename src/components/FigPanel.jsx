import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { figSvg, boardFigData } from '../utils/chordFig';
import { candidatesForChord, candidateToData, builtinShapes, loadShapes, persistShapes } from '../utils/chordShapes';
import { degreePc } from '../utils/chordLib';
import { collectSameChordFigs } from '../utils/chordChartModel';

// 套和弦图面板（v229 起从 figbe 弹窗底部迁到原预览槽位）：
// 最近同和弦 ↔ 形状库 双页签，点击缩略图直接应用到光标拍格（换算口径与弹窗一致）。
// 形状管理（右键重命名/删除）一并迁来；弹窗只留编辑板本体。
export function FigPanel({ measures, cursor, unitAt, keyAt, patchUnit, figOpts, showToast }) {
  const [panelTab, setPanelTab] = useState('recent'); // 'recent' | 'shapes'
  const [shapesVer, setShapesVer] = useState(0); // 增删改名后 bump，候选列表重算
  const [candMenu, setCandMenu] = useState(null); // 右键候选菜单 {shape, x, y, confirmDelete}
  const [renameForm, setRenameForm] = useState(null); // 重命名表单 {id, name}
  const renameInputRef = useRef(null);

  const chord = unitAt(cursor.mi, cursor.si, cursor.half)?.chord ?? null;
  const viewKey = keyAt(cursor.mi);

  const recentFigs = useMemo(() => (chord
    ? collectSameChordFigs(measures, degreePc(chord.degree, chord.acc || 0, viewKey), chord.quality === 'M' ? '' : (chord.quality || ''), keyAt)
    : []), [measures, chord, viewKey, keyAt]);

  const candidates = useMemo(() => (panelTab === 'shapes' && chord
    ? candidatesForChord(chord, viewKey || { root: 0, minor: false }, [...builtinShapes(), ...loadShapes()])
    : []), [panelTab, chord, viewKey, shapesVer]);

  // 右键候选菜单开着时：点菜单外 / Esc 收起
  useEffect(() => {
    if (!candMenu) return;
    const close = (e) => { if (!e.target.closest('.cc-figbar-cmenu')) setCandMenu(null); };
    const esc = (e) => { if (e.key === 'Escape') setCandMenu(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [candMenu]);

  // 应用到光标拍格：面板常驻，连续点多个候选即时换图
  const applyRecent = (figData) => {
    const d = JSON.parse(JSON.stringify(figData || {}));
    patchUnit(cursor.mi, cursor.si, cursor.half, { fig: d });
    showToast && showToast(`已应用第${(recentFigs.find(f => f.fig === figData)?.mi ?? cursor.mi) + 1}小节的指法`, 'success');
  };
  const applyCandidate = useCallback((c) => {
    patchUnit(cursor.mi, cursor.si, cursor.half, { fig: candidateToData(c) });
  }, [patchUnit, cursor]);

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
    setShapesVer(v => v + 1);
    setCandMenu(null);
    showToast && showToast(`已删除形状：${shape.name}`, 'success');
  };

  const boardArgs = chord ? [chord, viewKey || { root: 0, minor: false }] : [null, { root: 0, minor: false }];

  return (
    <div className="cc-figbar">
      <div className="cc-figbar-head">
        <button className="cc-figbar-toggle" title="最近同和弦 ↔ 形状库"
          onClick={() => setPanelTab(t => (t === 'recent' ? 'shapes' : 'recent'))}>{panelTab === 'recent' ? '形状库' : '最近同和弦'}</button>
        <span className="cc-figbar-title">
          {!chord
            ? '把光标放到和弦拍上（空拍/休止没有参考图）'
            : panelTab === 'recent'
              ? (recentFigs.length ? `${recentFigs.length} 个同和弦指法 · 点击应用到光标拍（按当前和弦的 Root 换算）` : '本曲暂无相同和弦的指法图（先在别处配个图，或切「形状库」挑一个）')
              : (candidates.length ? `${candidates.length} 个候选 · 点击应用，右键重命名/删除` : '暂无形状')}
        </span>
        <span className="cc-flex" />
        <span className="cc-figbar-hint">{chord ? `光标：第${cursor.mi + 1}小节` : null}</span>
      </div>

      {chord && panelTab === 'recent' && recentFigs.length ? (
        <div className="cc-figbar-list">
          {recentFigs.map((item, i) => (
            <button key={i} className="cc-figbar-thumb" onClick={() => applyRecent(item.fig)} title={`第${item.mi + 1}小节（点击应用到光标拍）`}>
              <span dangerouslySetInnerHTML={{ __html: figSvg(boardFigData(item.fig, ...boardArgs), { degMode: figOpts?.degMode ?? 'chord', orientation: figOpts?.orientation, size: 44, key: boardArgs[1] }) }} />
              <em>{`第${item.mi + 1}小节`}</em>
            </button>
          ))}
        </div>
      ) : null}

      {chord && panelTab === 'shapes' && candidates.length ? (
        <div className="cc-figbar-list">
          {candidates.map((c, i) => (
            <button key={i} className="cc-figbar-thumb" onClick={() => applyCandidate(c)}
              onContextMenu={e => openCandMenu(e, c.shape)} title={`${c.shape.name} @${c.rootFret}品（点击应用到光标拍）`}>
              <span dangerouslySetInnerHTML={{ __html: figSvg({ points: c.points.map(p => ({ string: p.string, fret: p.fret })), links: [], startFret: Math.min(...c.points.filter(p => p.fret > 0).map(p => p.fret), 13), window: 4, rootPc: c.rootPc, fail: false }, { degMode: 'none', size: 44 }) }} />
              <em>{c.rootFret === 0 ? '开放把' : c.rootFret + '品'}</em>
              <small>{c.shape.name}</small>
            </button>
          ))}
        </div>
      ) : null}

      {candMenu ? (
        <div className="cc-figbar-cmenu" style={{ left: Math.min(candMenu.x, window.innerWidth - 180), top: Math.min(candMenu.y, window.innerHeight - 110) }}>
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
        <div className="cc-figbar-rename">
          <span>重命名形状</span>
          <input ref={renameInputRef} autoFocus className="cc-dialog-input" defaultValue={renameForm.name}
            onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenameForm(null); }} />
          <button className="button sm accent" onClick={doRename}>确定</button>
          <button className="button sm" onClick={() => setRenameForm(null)}>取消</button>
        </div>
      ) : null}
    </div>
  );
}
