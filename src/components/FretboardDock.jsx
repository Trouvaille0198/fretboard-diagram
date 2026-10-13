import React from 'react';
import { ScoreBoard, TransitionFx } from './ScorePieces';
import { renameClip } from '../utils/clipModel';
import './FretboardDock.css';
import { tintAt, frameTintFromData } from '../colorConfig';

// 动图卡片上的迷你播放器：仅悬停时循环播放；不悬停=静态首帧，零动画开销
const frameTintValue = (name, i, total) => tintAt(name, total > 1 ? i / (total - 1) : 0);

function ClipPreview({ clip, play }) {
  const [idx, setIdx] = React.useState(0);
  const timerRef = React.useRef(null);

  React.useEffect(() => {
    if (!play || clip.frames.length < 2) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      setIdx(0);
      return;
    }
    const speed = (() => {
      try { const cfg = JSON.parse(localStorage.getItem('fretboard-anim-settings') || '{}'); return (Number(cfg.holdMs) > 0 ? Number(cfg.holdMs) : 300) + (Number(cfg.transMs) > 0 ? Number(cfg.transMs) : 200); } catch (e) { return 500; }
    })();
    const step = (i) => {
      timerRef.current = setTimeout(() => {
        const next = (i + 1) % clip.frames.length;
        setIdx(next);
        step(next);
      }, speed);
    };
    step(0);
    return () => {
      clearTimeout(timerRef.current);
    };
  }, [play, clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const frame = clip.frames[Math.min(idx, clip.frames.length - 1)];
  const prevFrame = idx > 0 ? clip.frames[idx - 1] : null;
  // 帧档色：与板面/主播放同源同公式（dock 预览不再走近似色）
  const tintOf = (f, i) => {
    if (!f) return f;
    if (f.frameTint && f.frameTint.custom) return { ...f, frameTint: f.frameTint };
    const ft = frameTintFromData(f.data, i, clip.frames.length);
    return ft ? { ...f, frameTint: ft } : f;
  };

  return (
    <div className="clip-preview">
      <ScoreBoard snapshot={{ state: frame }} />
      {play && prevFrame && (
        <TransitionFx
          className="clip-preview-fx"
          key={idx}
          prevState={tintOf(prevFrame, idx - 1)}
          nextState={tintOf(frame, Math.min(idx, clip.frames.length - 1))}
          spec={clip.transitions?.[idx - 1] || { technique: null, pairs: [] }}
          durationMs={200}
        />
      )}
    </div>
  );
}

// 指板堆：只存动图。悬停预览播放，点击续编，双击重命名，× 删除
export function FretboardDock({
  clips = [],
  clipVersion = 0,
  hidden = false,
  onLoad,
  onDelete,
  onClear,
  onExamples,
  onRenamed,
  currentId,
  t,
}) {
  const td = t?.dock ?? {};

  const [isExpanded, setIsExpanded] = React.useState(false);
  const [hoveredId, setHoveredId] = React.useState(null);
  const [renamingId, setRenamingId] = React.useState(null);
  const collapseTimerRef = React.useRef(null);

  const openDock = React.useCallback(() => {
    clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
    setIsExpanded(true);
  }, []);

  const scheduleCloseDock = React.useCallback(() => {
    clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      setIsExpanded(false);
      setHoveredId(null);
    }, 200);
  }, []);

  React.useEffect(() => () => {
    clearTimeout(collapseTimerRef.current);
  }, []);

  if (hidden) {
    return null;
  }

  const countLabel = clips.length > 99 ? '99+' : String(clips.length);

  return (
    <div
      className={`fretboard-dock ${isExpanded ? 'expanded' : ''}`}
      onMouseEnter={openDock}
      onMouseLeave={scheduleCloseDock}
    >
      <div className="dock-tabs">
        <span className="dock-label">{td.clipsTitle ?? '动图堆'}</span>
        <span className="dock-count">{countLabel}</span>
        <button
          className="dock-examples"
          title={td.examplesHint ?? '载入六种技法/样式的示例动图（重复点击会刷新示例，不影响你自己的动图）'}
          onClick={onExamples}
        >
          {td.examples ?? '示例'}
        </button>
      </div>

      {isExpanded && (
        <div className="dock-content">
          {clips.length === 0 && (
            <div className="dock-empty">{td.emptyHint ?? '还没有动图：画好一帧按 Q 进入动态编辑，Ctrl+S 逐帧定格'}</div>
          )}
          {clips.map(clip => (
            <div
              key={`${clip.id}-${clipVersion}`}
              className={`dock-clip ${hoveredId === clip.id ? 'hovered' : ''} ${currentId === clip.id ? 'current' : ''}`}
              onMouseEnter={() => setHoveredId(clip.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="dock-clip-board" onClick={() => onLoad?.(clip)} title={td.loadHint ?? '载入续编（追加帧）'}>
                <ClipPreview clip={clip} play={hoveredId === clip.id} />
              </div>
              <div className="dock-clip-info">
                {renamingId === clip.id ? (
                  <input
                    className="dock-clip-name-input"
                    autoFocus
                    defaultValue={clip.name}
                    onBlur={e => {
                      const name = e.target.value.trim();
                      if (name && name !== clip.name) {
                        renameClip(clip.id, name);
                        onRenamed?.();
                      }
                      setRenamingId(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') e.target.blur();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                ) : (
                  <span
                    className="dock-clip-name"
                    title={td.renameHint ?? '双击重命名'}
                    onDoubleClick={() => setRenamingId(clip.id)}
                  >
                    {clip.name}
                  </span>
                )}
                <span className="dock-clip-frames">{clip.frames.length}f</span>
                <button
                  className="dock-clip-del"
                  title={td.deleteHint ?? '删除'}
                  onClick={e => {
                    e.stopPropagation();
                    onDelete?.(clip.id);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {clips.length > 0 && (
            <button className="dock-clear" onClick={onClear}>{td.clear ?? '清空'}</button>
          )}
        </div>
      )}
    </div>
  );
}
