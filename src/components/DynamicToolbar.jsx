import React, { useState } from 'react';
import { getLevel1FillColor } from '../colorConfig';

// 动态编辑模式工具条：模式开关、技法工具、定格、播放、节奏设置、导出
export function DynamicToolbar({
  dynamic,
  scheme,
  schemes = [],
  onSchemeChange,
  playing,
  loopPlay,
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
  const td = t?.dynamic ?? {};
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className={`dyn-toolbar ${dynamic.isDynamic ? 'on' : ''}`}>
      <button
        className={`dyn-btn dyn-mode ${dynamic.isDynamic ? 'on' : ''}`}
        onClick={dynamic.toggleQ}
        title={dynamic.isDynamic ? (td.exitHint ?? '退出并保存动图（Q）') : (td.enterHint ?? '进入动态编辑模式（Q）')}
      >
        {dynamic.isDynamic
          ? (dynamic.viewMode === 'preview' ? (td.toEdit ?? '✎ 编辑') : (td.toPreview ?? '👁 预览'))
          : (td.enterMode ?? '🎬 动态编辑')}
      </button>

      {dynamic.isDynamic && (
        <button
          className="dyn-btn"
          onClick={dynamic.newClip}
          title="新建动图"
        >
          ＋新建
        </button>
      )}

      {dynamic.isDynamic && schemes.length > 0 && (
        <>
          {schemes.map(name => (
            <button
              key={name}
              className={`dyn-btn dyn-scheme ${scheme === name ? 'on' : ''}`}
              onClick={() => onSchemeChange?.(name)}
              title={`色系：${name}（切换整体配色）`}
            >
              <span className="dyn-scheme-dot" style={{ background: getLevel1FillColor(name) }} />
            </button>
          ))}
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
            title="保存/更新到动图堆（Ctrl+S）"
          >
            保存
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
        title={td.playHint ?? '播放当前动图'}
      >
        {playing ? '⏹' : '▶'}
      </button>
      <button
        className={`dyn-btn ${loopPlay ? 'on' : ''}`}
        onClick={onToggleLoop}
        title={td.loopHint ?? '循环播放'}
      >
        ↻
      </button>

      <span className="dyn-sep" />
      <button className="dyn-btn dyn-right" onClick={() => setSettingsOpen(v => !v)} title={td.settingsHint ?? '动效节奏设置'}>
        ⚙
      </button>
      <button className="dyn-btn" disabled={!canPlay || exporting !== null} onClick={() => onExport('gif')} title={td.exportGif ?? '导出 GIF 动图'}>
        {exporting === 'gif' ? '…' : 'GIF'}
      </button>
      <button className="dyn-btn" disabled={!canPlay || exporting !== null} onClick={() => onExport('svganim')} title="导出动画 SVG（矢量动图：无限清晰、体积极小）">
        {exporting === 'svganim' ? '…' : 'SVG'}
      </button>
      {typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E') && (
        <button className="dyn-btn" disabled={!canPlay || exporting !== null} onClick={() => onExport('mp4')} title="导出 MP4 视频（微信等聊天软件可直接播放）">
          {exporting === 'mp4' ? '…' : 'MP4'}
        </button>
      )}
      <button className="dyn-btn" disabled={!canPlay || exporting !== null} onClick={() => onExport('webm')} title={td.exportWebm ?? '导出 WebM 视频'}>
        {exporting === 'webm' ? '…' : 'WebM'}
      </button>

      {settingsOpen && (
        <div className="dyn-settings">
          <label>
            {td.hold ?? '帧停留'}
            <input type="text" inputMode="numeric"
              defaultValue={animSettings.holdMs}
              onBlur={e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) { onSettingsChange({ holdMs: Math.max(20, v) }); } else { e.target.value = animSettings.holdMs; } }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
            ms
          </label>
          <label>
            {td.trans ?? '过渡时长'}
            <input type="text" inputMode="numeric"
              defaultValue={animSettings.transMs}
              onBlur={e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) { onSettingsChange({ transMs: Math.max(20, v) }); } else { e.target.value = animSettings.transMs; } }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
            ms
          </label>
          <label>
            {td.fps ?? '导出帧率'}
            <input type="text" inputMode="numeric"
              defaultValue={animSettings.fps}
              onBlur={e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) { onSettingsChange({ fps: Math.min(60, Math.max(2, v)) }); } else { e.target.value = animSettings.fps; } }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
            fps
          </label>
          <label>
            {td.width ?? '导出宽度'}
            <input type="text" inputMode="numeric"
              defaultValue={animSettings.width}
              onBlur={e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) { onSettingsChange({ width: Math.min(4000, Math.max(160, v)) }); } else { e.target.value = animSettings.width; } }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
            px
          </label>
          <div className="dyn-settings-sep">导出显示（与普通模式共用）</div>
          <div className="dyn-settings-checks">
            {[
              ['includeMarkers', '包含品数'],
              ['showNotes', '显示音符'],
              ['horizontalCrop', '水平截断'],
              ['verticalCrop', '垂直截断']
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
