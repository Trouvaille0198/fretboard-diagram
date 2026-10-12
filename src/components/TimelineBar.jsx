import React, { useState } from 'react';
import { ScoreBoard } from './ScorePieces';
import { chordDisplay } from '../utils/songStructure';

const TECHNIQUE_CYCLE = [null, 'sl', 'h', 'p'];

// 时间轴：钉在主编辑页指板下方（8pu 式），点帧回编辑、播放走主指板
export function TimelineBar({
  measures,
  meta,
  updateMeta,
  selectedFrameId,
  onSelectFrame,
  onAddFrame,
  onAddMeasure,
  onMoveFrame,
  onDeleteFrame,
  onCycleTechnique,
  playing,
  onTogglePlay,
  speed,
  onSpeedChange,
  isMinor,
  rootNote,
  enharmonic,
  timelineRef,
  t
}) {
  const ts = t?.score ?? {};
  const [editingChord, setEditingChord] = useState(null);
  const [openFields, setOpenFields] = useState(null);

  if (!measures.length) {
    return (
      <div className="tl-bar tl-empty">
        <span>{ts.emptyHint ?? 'Press Ctrl+S to save the first frame'}</span>
        <button className="tl-btn" onClick={onAddMeasure}>＋{ts.measureUnit ?? '小节'}</button>
      </div>
    );
  }

  return (
    <div className="tl-bar" ref={timelineRef}>
      <div className="tl-controls">
        <button className={`tl-btn tl-play ${playing ? 'on' : ''}`} onClick={onTogglePlay} title={ts.playAll ?? 'Play all'}>
          {playing ? '⏹' : '▶'}
        </button>
        <select className="tl-speed" value={speed} onChange={e => onSpeedChange(parseFloat(e.target.value))} title={ts.speedTitle ?? 'Speed'}>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
        </select>
      </div>

      <div className="tl-strip">
        {measures.map((measure, m) => {
          const m0 = meta[measure.id] || {};
          const chordInfo = chordDisplay(m0.chord, rootNote, isMinor, enharmonic);
          return (
            <div key={measure.id} className={`tl-measure ${openFields === measure.id ? 'fields-open' : ''}`}>
              <div className="tl-measure-head">
                <button
                  className={`tl-no ${selectedFrameId && measure.frames.some(f => f.id === selectedFrameId) ? 'current' : ''}`}
                  title={(ts.measureLabel ? ts.measureLabel(m + 1) : `Measure ${m + 1}`) + (m0.lyrics ? ` · ${m0.lyrics}` : '')}
                  onClick={() => setOpenFields(openFields === measure.id ? null : measure.id)}
                >
                  {m + 1}
                </button>
                {editingChord === measure.id ? (
                  <input
                    className="tl-chord-input"
                    autoFocus
                    defaultValue={m0.chord || ''}
                    placeholder="1/6m/Am"
                    onBlur={e => { updateMeta(measure.id, { chord: e.target.value.trim() }); setEditingChord(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                  />
                ) : (
                  <button className="tl-chord" title={ts.chordTitle ?? 'Chord'} onClick={() => setEditingChord(measure.id)}>
                    {chordInfo.text || '＋'}
                  </button>
                )}
                <button className="tl-add" title={ts.addFrameTitle ?? 'Append current editor state as a new frame'} onClick={() => onAddFrame(measure.id)}>＋{ts.frameUnit ?? '帧'}</button>
              </div>

              <div className="tl-frames">
                {measure.frames.map((frame, f) => (
                  <div
                    key={frame.id}
                    className={`score-mini ${selectedFrameId === frame.id ? 'active' : ''}`}
                    onClick={() => onSelectFrame(frame)}
                  >
                    <div className="score-mini-board">
                      <ScoreBoard snapshot={frame} />
                      <span className="score-mini-index">{f + 1}</span>
                      {f > 0 && (
                        <button
                          className={`score-mini-tech ${frame.enterTechnique ? 'on' : ''}`}
                          title={ts.techTitle ?? 'Technique: none/sl/h/p'}
                          onClick={e => { e.stopPropagation(); onCycleTechnique(frame); }}
                        >
                          {frame.enterTechnique || '·'}
                        </button>
                      )}
                    </div>
                    <div className="score-mini-bar" onClick={e => e.stopPropagation()}>
                      <button title={ts.moveEarlier ?? 'Earlier'} onClick={() => onMoveFrame(frame.id, -1)}>◀</button>
                      <button title={ts.moveLater ?? 'Later'} onClick={() => onMoveFrame(frame.id, 1)}>▶</button>
                      <button className="score-mini-del" title={ts.deleteFrame ?? 'Delete'} onClick={() => onDeleteFrame(frame.id)}>×</button>
                    </div>
                  </div>
                ))}
              </div>

              {openFields === measure.id && (
                <div className="tl-fields">
                  <input
                    className="tl-field"
                    defaultValue={m0.jianpu || ''}
                    placeholder={ts.jianpuPlaceholder ?? '简谱 1 2 3 5'}
                    onBlur={e => updateMeta(measure.id, { jianpu: e.target.value })}
                  />
                  <input
                    className="tl-field"
                    defaultValue={m0.lyrics || ''}
                    placeholder={ts.lyricsPlaceholder ?? '歌词'}
                    onBlur={e => updateMeta(measure.id, { lyrics: e.target.value })}
                  />
                </div>
              )}
            </div>
          );
        })}

        <button className="tl-new-measure" onClick={onAddMeasure} title={ts.addMeasureTitle ?? 'New measure'}>
          ＋{ts.measureUnit ?? '小节'}
        </button>
      </div>
    </div>
  );
}
