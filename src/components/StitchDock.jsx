import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { ScoreBoard, renderBoardImage } from './ScorePieces';
import { stitchLayout, stitchScale, withAlpha, unifyStitchState } from '../utils/stitchModel';

// 拼接区悬浮舱（普通图片模式）：右上角 FAB，hover 展开实时拼接预览
// 预览 = DOM 版拼接画布（各段按指板坐标上下对齐、段间分割线），
// 复制/下载 = 离屏逐段 renderBoardImage → canvas 合成 PNG（与预览同一套布局数据，所见即所得）
// unify（统一色系）= 渲染期重涂（unifyStitchState），条目快照数据不动，勾/取消即时切换

const cssVar = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

// 拼接布局 → 一张 PNG canvas（k = 像素/SVG单位；段顺序=条目顺序，从左到右）
async function composeStitchCanvas(items, layout, unify) {
  const k = stitchScale(layout);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(layout.w * k));
  canvas.height = Math.max(1, Math.round(layout.h * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = cssVar('--background-color', '#10161c');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < items.length; i++) {
    const seg = layout.segs[i];
    const opts = items[i].opts || {};
    const state = unify ? unifyStitchState(items, i) : items[i].state;
    const img = await renderBoardImage(state, Math.max(1, Math.round(seg.vb.w * k)), {
      includeMarkers: opts.includeMarkers,
      showNotes: opts.showNotes,
      cropBox: seg.vb,
    });
    ctx.drawImage(img, Math.round(seg.x * k), Math.round(seg.y * k), Math.round(seg.vb.w * k), Math.round(seg.vb.h * k));
  }
  // 段间分割竖线（位于留白中央，主题文字色降透明度——深浅主题都清晰）
  ctx.strokeStyle = withAlpha(cssVar('--app-text', '#dfe7ee'), 0.5);
  ctx.lineWidth = Math.max(2, Math.round(k * 2));
  layout.dividers.forEach(dx => {
    const px = Math.round(dx * k) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
    ctx.stroke();
  });
  return canvas;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// 单段预览：外框=裁剪后的窗口（vb），内嵌整板 svg 按偏移推移——
// CSS 宽高与 viewBox 严格同比，映射 1:1，无 letterbox，多段间像素级对齐。
// draggable：整段可拖到另一段上换位（HTML5 DnD，onReorder 由外部落库）
function StitchSegment({ state, opts, seg, onRemove, removeTitle, dnd, removeId, onDoubleClick }) {
  const { vb, full } = seg;
  const pct = (a, b) => `${(a / b * 100).toFixed(4)}%`;
  return (
    <div
      className={`stitch-seg${dnd.dragging ? ' dragging' : ''}${dnd.dragOver ? ' drag-over' : ''}`}
      style={{ left: pct(seg.x, seg.w0), top: pct(seg.y, seg.h0), width: pct(seg.w, seg.w0), height: pct(seg.h, seg.h0) }}
      draggable
      onDragStart={dnd.onDragStart}
      onDragEnd={dnd.onDragEnd}
      onDragOver={dnd.onDragOver}
      onDragLeave={dnd.onDragLeave}
      onDrop={dnd.onDrop}
      onDoubleClick={onDoubleClick}
      title={dnd.title}
    >
      <div className="stitch-seg-clip">
        {/* 偏移用 top/left 百分比（各按包含块高/宽解析）；不能用 margin 百分比——
            margin-top 也按宽度解析，垂直截断段会错位 */}
        <div
          className="stitch-seg-svg"
          style={{
            left: pct(-(vb.x - full.x), vb.w),
            top: pct(-(vb.y - full.y), vb.h),
            width: pct(full.w, vb.w),
            height: pct(full.h, vb.h),
          }}
        >
          <ScoreBoard snapshot={{ state }} options={{ includeMarkers: opts?.includeMarkers, showNotes: opts?.showNotes }} />
        </div>
      </div>
      <button className="stitch-seg-x" title={removeTitle} onClick={e => { e.stopPropagation(); onRemove(removeId); }} onDoubleClick={e => e.stopPropagation()}>×</button>
    </div>
  );
}

export function StitchDock({ items, onRemove, onClear, onReorder, onRestore, unify, showToast, t }) {
  const ts = t?.stitch ?? {};
  // 词条支持函数式（带参）：L('count', n => `${n} 张`, items.length)
  const L = (key, fallback, ...args) => {
    const f = ts[key] ?? fallback;
    return typeof f === 'function' ? f(...args) : f;
  };

  const [open, setOpen] = useState(false);        // hover 展开
  const [pinned, setPinned] = useState(false);    // 点击 FAB 钉住（触屏/精细操作）
  const [busy, setBusy] = useState(null);         // 'copy' | 'download'
  const [dragIdx, setDragIdx] = useState(null);   // 拖动换位：源段下标
  const [overIdx, setOverIdx] = useState(null);   // 拖动换位：悬停目标段下标
  const closeTimer = useRef(null);
  const rootRef = useRef(null);

  const layout = useMemo(() => stitchLayout(items), [items]);
  // 统一色系的重涂态（勾选时预览用；memo 缓存防 hover/拖拽重渲时反复重涂丢 ScoreBoard 缓存）
  const renderStates = useMemo(
    () => items.map((_, i) => (unify ? unifyStitchState(items, i) : items[i].state)),
    [items, unify]
  );

  const scheduleClose = useCallback(() => {
    clearTimeout(closeTimer.current);
    if (pinned) return;
    closeTimer.current = setTimeout(() => {
      // 删段等 DOM 变更会让指针下的节点消失、短暂误报 mouseleave；
      // 收起前用 :hover 复核指针是否真的离开了整个悬浮舱
      if (rootRef.current && rootRef.current.matches(':hover')) return;
      setOpen(false);
    }, 260);
  }, [pinned]);
  const cancelClose = useCallback(() => {
    clearTimeout(closeTimer.current);
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // 钉住时点击外部/Esc 收起
  useEffect(() => {
    if (!pinned) return undefined;
    const onDoc = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setPinned(false);
    };
    const onKey = e => { if (e.key === 'Escape') setPinned(false); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  // 面板宽度钳制：fixed 定位的 %/vw 都按"含滚动条"的视口算，窄屏会向左溢出；
  // 以 clientWidth（真实可用宽）为准收一刀，窗口缩放时跟着收
  const showPanel = open || pinned;
  const panelRef = useRef(null);
  useEffect(() => {
    if (!showPanel) return undefined;
    const clamp = () => {
      const el = panelRef.current;
      if (!el) return;
      const avail = document.documentElement.clientWidth;
      el.style.width = `${Math.min(372, avail - 28)}px`;
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [showPanel]);

  // 不缓存合成画布：主题色（背景/分割线）随时会变，每次现合成保证所见即所得
  const onCopy = async () => {
    if (!items.length || busy) return;
    setBusy('copy');
    try {
      const canvas = await composeStitchCanvas(items, layout, unify);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('PNG 编码失败');
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast(L('toastCopied', `已复制拼接图（${items.length} 张）`, items.length), 'success');
      } else {
        downloadBlob(blob, `fretboard-stitch-${Date.now()}.png`);
        showToast(L('toastFallback', '剪贴板不可用（非安全上下文），已改为下载 PNG'), 'info');
      }
    } catch (error) {
      showToast(`${L('toastCopyFail', '复制拼接图失败')}：${error.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const onDownload = async () => {
    if (!items.length || busy) return;
    setBusy('download');
    try {
      const canvas = await composeStitchCanvas(items, layout, unify);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('PNG 编码失败');
      const name = `fretboard-stitch-${Date.now()}.png`;
      const { saveToRememberedDir, rememberedDirSupported } = await import('../utils/saveFile');
      let savedTo = null;
      if (rememberedDirSupported()) savedTo = await saveToRememberedDir(name, blob);
      if (savedTo) {
        showToast(`${L('toastSaved', '已保存到')}「${savedTo}」/${name}`, 'success');
      } else {
        downloadBlob(blob, name);
        showToast(`${L('toastDownloaded', '已下载 PNG')}（${(blob.size / 1024).toFixed(0)} KB）`, 'success');
      }
    } catch (error) {
      showToast(`${L('toastSaveFail', '下载拼接图失败')}：${error.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const hasItems = items.length > 0;

  return (
    <div
      className="stitch-dock"
      ref={rootRef}
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        className={`stitch-fab ${hasItems ? '' : 'empty'} ${pinned ? 'pinned' : ''}`}
        onClick={() => setPinned(p => !p)}
        title={L('fabTitle', '拼接区：Ctrl+S 把当前板面加进来，横向拼接成一张长图')}
        aria-expanded={showPanel}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          <rect x="2" y="4" width="6.5" height="16" rx="1.6" />
          <rect x="10.5" y="4" width="6.5" height="16" rx="1.6" opacity="0.66" />
          <rect x="19" y="4" width="3" height="16" rx="1.2" opacity="0.38" />
        </svg>
        <span className="stitch-fab-label">{L('label', '拼接区')}</span>
        {hasItems && <span className="stitch-fab-badge">{items.length}</span>}
      </button>

      {showPanel && (
        <div className="stitch-panel" ref={panelRef} role="dialog" aria-label={L('label', '拼接区')}>
          <div className="stitch-panel-head">
            <span className="stitch-panel-title">
              {L('label', '拼接区')}
              {hasItems && <em>{L('count', n => `${n} 张`, items.length)}</em>}
            </span>
            <div className="stitch-panel-actions">
              <button className="stitch-btn primary" disabled={!hasItems || !!busy} onClick={onCopy}>
                {busy === 'copy' ? L('working', '生成中…') : L('copy', '复制拼接图')}
              </button>
              <button className="stitch-btn" disabled={!hasItems || !!busy} onClick={onDownload} title={L('downloadTitle', '下载 PNG')}>
                {busy === 'download' ? L('working', '生成中…') : 'PNG'}
              </button>
              <button
                className="stitch-btn danger"
                disabled={!hasItems}
                onClick={() => {
                  if (!window.confirm(L('clearConfirm', '清空拼接区？'))) return;
                  onClear();
                }}
                title={L('clearTitle', '移除全部')}
              >
                {L('clear', '清空')}
              </button>
            </div>
          </div>

          {hasItems ? (
            <div className="stitch-preview">
              <div
                className="stitch-canvas"
                style={{
                  aspectRatio: `${layout.w} / ${layout.h}`,
                  background: cssVarSafe('--background-color', '#10161c'),
                }}
              >
                {items.map((item, i) => {
                  const seg = { ...layout.segs[i], w0: layout.w, h0: layout.h };
                  const clearDnd = () => { setDragIdx(null); setOverIdx(null); };
                  const dnd = {
                    dragging: dragIdx === i,
                    dragOver: overIdx === i && dragIdx !== null && dragIdx !== i,
                    title: `${L('dragTitle', '拖动可调换拼接顺序')}；${L('restoreTitle', '双击还原到编辑板面')}`,
                    onDragStart: e => {
                      setDragIdx(i);
                      if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move';
                        try { e.dataTransfer.setData('text/plain', item.id); } catch (err) { /* dataTransfer 只读环境忽略 */ }
                      }
                    },
                    onDragEnd: clearDnd,
                    onDragOver: e => {
                      if (dragIdx === null || dragIdx === i) return;
                      e.preventDefault(); // 允许 drop
                      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                      setOverIdx(oi => (oi === i ? oi : i));
                    },
                    onDragLeave: () => setOverIdx(oi => (oi === i ? null : oi)),
                    onDrop: e => {
                      e.preventDefault();
                      if (dragIdx !== null && dragIdx !== i && onReorder) onReorder(dragIdx, i);
                      clearDnd();
                    },
                  };
                  return <StitchSegment key={item.id} state={renderStates[i]} opts={item.opts} seg={seg} onRemove={onRemove} removeTitle={L('removeTitle', '移除这张')} dnd={dnd} removeId={item.id} onDoubleClick={() => onRestore?.(item.id)} />;
                })}
                {layout.dividers.map((dx, i) => (
                  <div key={'div' + i} className="stitch-divider" style={{ left: `${(dx / layout.w * 100).toFixed(4)}%` }} />
                ))}
              </div>
            </div>
          ) : (
            <div className="stitch-empty">
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <rect x="2" y="4" width="6.5" height="16" rx="1.6" />
                <rect x="10.5" y="4" width="6.5" height="16" rx="1.6" opacity="0.66" />
                <rect x="19" y="4" width="3" height="16" rx="1.2" opacity="0.38" />
              </svg>
              <p>{L('empty', '拼接区还是空的')}</p>
              <p className="stitch-empty-sub">{L('hint', '画好一张图后按 Ctrl+S 加入；多张会从左到右横向拼接，指板上下对齐')}</p>
            </div>
          )}

          {hasItems && <div className="stitch-panel-foot">{L('hint', '画好一张图后按 Ctrl+S 加入；多张会从左到右横向拼接，指板上下对齐')}</div>}
        </div>
      )}
    </div>
  );
}

// 渲染期安全取 CSS 变量（SSR/极早期渲染时给兜底色）
function cssVarSafe(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) {
    return fallback;
  }
}
