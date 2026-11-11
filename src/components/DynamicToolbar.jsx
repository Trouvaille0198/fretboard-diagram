import React, { useState } from 'react';
import { fmt, zh } from '../i18n';
import { getLevel1FillColor, CANVAS_COLORS } from '../colorConfig';

// 动态编辑模式工具条：模式开关、技法工具、定格、播放、节奏设置、导出
export function DynamicToolbar({
  dynamic,
  scheme,
  schemes = [],
  onSchemeChange,
  playing,
  loopPlay,
  cumulative,
  onToggleCumulative,
  transTool,
  onToggleTransTool,
  animSettings,
  displayOptions,
  onDisplayChange,
  exporting,
  canPlay,
  onTogglePlay,
  onToggleLoop,
  onCommit,
  onSettingsChange,
  onExport,
  t
}) {
  const td = t?.dynamic ?? zh.dynamic;
  const tm = t?.menu ?? zh.menu;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className={`dyn-toolbar ${dynamic.isDynamic ? 'on' : ''}`}>
      <button
        className={`dyn-btn dyn-mode ${dynamic.isDynamic ? 'on' : ''}`}
        onClick={dynamic.toggleQ}
        title={dynamic.isDynamic ? td.exitHint : td.enterHint}
      >
        {dynamic.isDynamic
          ? (dynamic.viewMode === 'preview' ? td.toEdit : td.toPreview)
          : td.enterMode}
      </button>

      {dynamic.isDynamic && (
        <button
          className="dyn-btn"
          onClick={dynamic.newClip}
          title={td.newClipTip}
        >
          {td.newClip}
        </button>
      )}

      {dynamic.isDynamic && schemes.length > 0 && (
        <>
          {schemes.map(name => (
            <button
              key={name}
              className={`dyn-btn dyn-scheme ${scheme === name ? 'on' : ''}`}
              onClick={() => onSchemeChange?.(name)}
              title={fmt(td.schemeTip, { name })}
            >
              <span className="dyn-scheme-dot" style={{ background: getLevel1FillColor(name) }} />
            </button>
          ))}
          <button
            className={`dyn-btn dyn-scheme ${transTool ? 'on' : ''}`}
            onClick={onToggleTransTool}
            title={td.transNoteTip}
          >
            <span className="dyn-scheme-dot" style={{ background: 'var(--background-color)', boxShadow: `inset 0 0 0 2px ${CANVAS_COLORS.ghostRing}` }} />
          </button>
          <span className="dyn-sep" />
        </>
      )}

      {dynamic.isDynamic && (
        <>

          {dynamic.viewMode === 'edit' && (
          <>
          <span className="dyn-sep" />
          <button
            className="dyn-btn dyn-commit"
            onClick={dynamic.persistClip}
            disabled={playing}
            title={td.saveKeyTip}
          >
            {td.saveKey}
          </button>
          </>
          )}
        </>
      )}

      <span className="dyn-sep" />
      <button
        className={`dyn-btn dyn-play ${playing ? 'on' : ''}`}
        onClick={onTogglePlay}
        disabled={!canPlay}
        title={td.playHint}
      >
        {playing ? '⏹' : '▶'}
      </button>
      <button
        className={`dyn-btn ${loopPlay ? 'on' : ''}`}
        onClick={onToggleLoop}
        title={td.loopHint}
      >
        ↻
      </button>
      <button
        className={`dyn-btn ${cumulative ? 'on' : ''}`}
        onClick={onToggleCumulative}
        title={td.cumulativeHint}
      >
        {td.traceShort}
      </button>

      <span className="dyn-sep" />
      <button className="dyn-btn dyn-right" onClick={() => setSettingsOpen(v => !v)} title={td.settingsHint}>
        ⚙
      </button>
      <div className="dyn-export-wrap" style={{ position: 'relative' }}>
        <button
          className="dyn-btn"
          disabled={!canPlay || exporting !== null}
          onClick={() => setExportOpen(v => !v)}
          title={td.exportTip}
        >
          {exporting !== null ? '…' : td.exportBtn}
        </button>
        {exportOpen && (
          <>
            <div className="dyn-export-veil" onClick={() => setExportOpen(false)} />
            <div className="dyn-export-menu">
              {[
                { id: 'gif', label: td.expGif, hint: td.expGifHint },
                { id: 'svganim', label: td.expSvg, hint: td.expSvgHint },
                ...(typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')
                  ? [{ id: 'mp4', label: td.expMp4, hint: td.expMp4Hint }] : []),
                { id: 'webm', label: td.expWebm, hint: td.expWebmHint },
                { id: 'json', label: td.expJson, hint: td.expJsonHint },
              ].map(item => (
                <button
                  key={item.id}
                  className="dyn-export-item"
                  disabled={!canPlay || exporting !== null}
                  onClick={() => { setExportOpen(false); onExport(item.id); }}
                >
                  <div className="dyn-export-item-label">{item.label}</div>
                  <div className="dyn-export-item-hint">{item.hint}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {settingsOpen && (
        <div className="dyn-settings">
          <label>
            {td.hold}
            <input type="text" inputMode="numeric"
              defaultValue={animSettings.holdMs}
              onBlur={e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) { onSettingsChange({ holdMs: Math.max(20, v) }); } else { e.target.value = animSettings.holdMs; } }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
            ms
          </label>
          <label>
            {td.trans}
            <input type="text" inputMode="numeric"
              defaultValue={animSettings.transMs}
              onBlur={e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) { onSettingsChange({ transMs: Math.max(20, v) }); } else { e.target.value = animSettings.transMs; } }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
            ms
          </label>
          <label>
            {td.fps}
            <input type="text" inputMode="numeric"
              defaultValue={animSettings.fps}
              onBlur={e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) { onSettingsChange({ fps: Math.min(60, Math.max(2, v)) }); } else { e.target.value = animSettings.fps; } }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
            fps
          </label>
          <label>
            {td.width}
            <input type="text" inputMode="numeric"
              defaultValue={animSettings.width}
              onBlur={e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) { onSettingsChange({ width: Math.min(4000, Math.max(160, v)) }); } else { e.target.value = animSettings.width; } }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
            px
          </label>
          <div className="dyn-settings-sep">{td.secMotion}</div>
          <div className="dyn-settings-checks">
            <label className="dyn-settings-check">
              <input type="checkbox" checked={!!animSettings.leadBlank} onChange={e => onSettingsChange({ leadBlank: e.target.checked })} />
              <span>{td.leadBlank}</span>
            </label>
          </div>
          <div className="dyn-settings-sep">{td.secExportDisplay}</div>
          <div className="dyn-settings-checks">
            {[
              ['includeMarkers', tm.includeMarkers],
              ['showNotes', tm.showNotes],
              ['horizontalCrop', tm.horizontalCrop],
              ['verticalCrop', tm.verticalCrop]
            ].map(([key, label]) => (
              <label key={key} className="dyn-settings-check">
                <input type="checkbox" checked={!!displayOptions?.[key]} onChange={e => onDisplayChange?.(key, e.target.checked)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
