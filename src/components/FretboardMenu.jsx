import React from 'react';
import { CONSTS } from '../constants';
import PianoKeyboard from '../PianoKeyboard';
import { ColorPalette } from './ColorPalette';
import { FretRangeSlider } from './FretRangeSlider';

export function FretboardMenu({
  selectedColorLevel,
  selectedColor,
  onSelectColor,
  enharmonic,
  onToggleEnharmonic,
  onToggleVisibility,
  connectionMode,
  connectionType,
  setConnectionType,
  connectionArrowDirection,
  setConnectionArrowDirection,
  onToggleConnectionMode,
  onSaveSVG,
  onSaveState,
  onReset,
  rootNote,
  onRootNoteSelect,
  displayMode,
  setDisplayMode,
  startFret,
  endFret,
  onFretWindowChange,
  includeMarkers,
  setIncludeMarkers,
  copyOnly,
  setCopyOnly,
  showNotes,
  setShowNotes
}) {
  return (
    <div className="menu">
      {/* 左侧：颜色+两行工具栏 */}
      <div className="menu-left">
        <ColorPalette 
          selectedColorLevel={selectedColorLevel}
          selectedColor={selectedColor}
          onSelectColor={onSelectColor}
        />
        <div id="global-actions">
          <button
            id="enharmonic"
            style={{ width: '25px', textAlign: 'center' }}
            onClick={onToggleEnharmonic}
            title="切换升降号"
          >
            {CONSTS.sign[enharmonic]}
          </button>
          <button 
            className="button" 
            onClick={onToggleVisibility}
            title="Toggle (Z)"
          >
            Toggle
          </button>
          {onSaveState && (
            <button 
              className="button" 
              onClick={onSaveState} 
              title="Save current fretboard state (Ctrl+S)"
            >
              Save
            </button>
          )}
          <button 
            className="button" 
            onClick={onReset}
            title="Reset (Ctrl+D)"
          >
            Reset
          </button>
        </div>
        {/* 连线工具区域 */}
        <div id="connection-tool-section" style={{ padding: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px'}}>
            <button 
              className={`button ${connectionMode ? 'selected' : ''}`} 
              onClick={onToggleConnectionMode}
              title="Connection Tool (S)"
              style={{ marginRight: 'auto' }}
            >
              Connect
            </button>
            <button
              className="button"
              onClick={() => setConnectionType(connectionType === 'line' ? 'arc' : 'line')}
              disabled={!connectionMode}
              title={connectionType === 'line' ? '直线' : '弧线'}
              style={{ padding: '4px 8px' }}
            >
              {connectionType === 'line' ? 'Line' : 'Arc'}
            </button>
            <button
              className="button"
              onClick={() => {
                const directions = ['none', 'start', 'end', 'both'];
                const currentIndex = directions.indexOf(connectionArrowDirection);
                const nextIndex = (currentIndex + 1) % directions.length;
                setConnectionArrowDirection(directions[nextIndex]);
              }}
              disabled={!connectionMode}
              title={`箭头：${connectionArrowDirection === 'none' ? '无' : connectionArrowDirection === 'start' ? '起点' : connectionArrowDirection === 'end' ? '终点' : '双向'}`}
              style={{ padding: '4px 8px' }}
            >
              {connectionArrowDirection === 'none' ? '无' : 
               connectionArrowDirection === 'start' ? '←' : 
               connectionArrowDirection === 'end' ? '→' : '⇄'}
            </button>
          </div>
        </div>
        {/* 下载区域 - 放在最底下，一行显示 */}
        <div id="download-section" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', marginTop: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={includeMarkers}
              onChange={(e) => setIncludeMarkers(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>包含品数</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={showNotes}
              onChange={(e) => setShowNotes(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>显示音符</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={copyOnly}
              onChange={(e) => setCopyOnly(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>仅复制</span>
          </label>
          <button 
            className="button" 
            onClick={onSaveSVG}
            title={copyOnly ? "复制到剪贴板" : "下载 SVG"}
            style={{ marginLeft: 'auto' }}
          >
            {copyOnly ? 'CopyCopy' : 'Download'}
          </button>
        </div>
      </div>
      {/* 右侧：钢琴+指板slider */}
      <div className="menu-right">
        <div id="piano-keyboard-container">
          <PianoKeyboard
            enharmonic={enharmonic}
            selectedNote={rootNote}
            onNoteSelect={(noteIndex) => {
              onRootNoteSelect(noteIndex);
              if (noteIndex === null) {
                setDisplayMode('note');
              } else {
                setDisplayMode('solfege');
              }
            }}
          />
        </div>
        <FretRangeSlider 
          startFret={startFret}
          endFret={endFret}
          onFretWindowChange={onFretWindowChange}
        />
      </div>
    </div>
  );
}
