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
  const [exportOpen, setExportOpen] = useState(false);

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
      <div className="dyn-export-wrap" style={{ position: 'relative' }}>
        <button
          className="dyn-btn"
          disabled={!canPlay || exporting !== null}
          onClick={() => setExportOpen(v => !v)}
          title="下载 / 导出（GIF · SVG · MP4 · WebM）"
        >
          {exporting !== null ? '…' : '⬇ 导出'}
        </button>
        {exportOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setExportOpen(false)} />
            <div className="dyn-export-menu" style={{
              position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 41,
              background: 'var(--background-color, #10161c)', border: '1px solid var(--border-color, #2a3542)',
              borderRadius: 8, minWidth: 220, padding: '4px 0', boxShadow: '0 8px 24px rgba(0,0,0,.45)'
            }}>
              {[
                { id: 'gif', label: 'GIF 动图', hint: '通用动图，任何地方能开' },
                { id: 'svganim', label: 'SVG 矢量动图', hint: '无限清晰体积小（浏览器打开/网页嵌入）' },
                ...(typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')
                  ? [{ id: 'mp4', label: 'MP4 视频', hint: '微信等聊天软件直接播放' }] : []),
                { id: 'webm', label: 'WebM 视频', hint: '视频格式，适合长序列' },
                { id: 'json', label: '数据 JSON', hint: '导出完整动图数据（排障/分析用）' },
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
