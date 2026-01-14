import React from 'react';
import { CONSTS } from '../constants';
import PianoKeyboard from '../PianoKeyboard';
import { ColorPalette } from './ColorPalette';
import { FretRangeSlider } from './FretRangeSlider';
import { getLevel1FillColor, getLevel2Color, generateTintVariants } from '../colorConfig';

export function FretboardMenu({
  selectedColorLevel,
  selectedColor,
  inTintMode,
  onSelectColor,
  onDoubleClickColor,
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
  setShowNotes,
  horizontalCrop,
  setHorizontalCrop,
  verticalCrop,
  setVerticalCrop,
  onReplaceAllTintNotes
}) {
  // 如果选中的是第一层颜色且不是trans，生成淡色版本
  const colorName = selectedColor && typeof selectedColor === 'object' ? selectedColor.name : selectedColor;
  const showLevel1TintVariants = inTintMode && selectedColorLevel === 1 && colorName && colorName !== 'trans';
  const level1TintVariants = showLevel1TintVariants ? generateTintVariants(getLevel1FillColor(colorName)) : [];
  
  // 如果选中的是第二层颜色，生成淡色版本
  const showLevel2TintVariants = inTintMode && selectedColorLevel === 2 && colorName;
  const level2TintVariants = showLevel2TintVariants ? generateTintVariants(getLevel2Color(colorName)) : [];

  return (
    <div className="menu">
      {/* 左侧：颜色+两行工具栏 */}
      <div className="menu-left">
        {/* 淡色版本和调色板在同一区域 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', position: 'relative' }}>
          {/* 异色版本绝对定位在左侧，不占用布局空间 */}
          {(showLevel1TintVariants || showLevel2TintVariants) && (
            <div style={{ 
              position: 'absolute',
              left: '-48px',
              top: '0',
              display: 'flex', 
              flexDirection: 'column', 
              gap: '4px' 
            }}>
              {/* 第一层淡色版本显示在最左侧，纵向排列 */}
              {showLevel1TintVariants && level1TintVariants.map((color, index) => {
                const isSelected = selectedColorLevel === 1 && 
                                   typeof selectedColor === 'object' && 
                                   selectedColor.custom === color;
                return (
                  <button
                    key={index}
                    className={`color color-tint ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => onSelectColor(1, colorName, color)}
                    title={`异色版本 ${index + 1}`}
                  />
                );
              })}
              
              {/* 第二层淡色版本显示在最左侧，纵向排列 */}
              {showLevel2TintVariants && level2TintVariants.map((color, index) => {
                const isSelected = selectedColorLevel === 2 && 
                                   typeof selectedColor === 'object' && 
                                   selectedColor.custom === color;
                return (
                  <button
                    key={index}
                    className={`color color-tint level2 ${isSelected ? 'selected' : ''}`}
                    style={{ borderColor: color, borderWidth: '6px', borderStyle: 'solid' }}
                    onClick={() => onSelectColor(2, colorName, color)}
                    title={`异色版本 ${index + 1}`}
                  />
                );
              })}
            </div>
          )}
          
          <ColorPalette 
            selectedColorLevel={selectedColorLevel}
            selectedColor={selectedColor}
            onSelectColor={onSelectColor}
            onDoubleClickColor={onDoubleClickColor}
            onReplaceAllTintNotes={onReplaceAllTintNotes}
          />
        </div>
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
        {/* 下载区域 - 放在最底下，分两行显示 */}
        <div id="download-section" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', padding: '8px', marginTop: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={horizontalCrop}
                  onChange={(e) => setHorizontalCrop(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>水平截断</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={verticalCrop}
                  onChange={(e) => setVerticalCrop(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>垂直截断</span>
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
            </div>
          </div>
          <button 
            className="button" 
            onClick={onSaveSVG}
            title={copyOnly ? "复制到剪贴板" : "下载 SVG"}
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
