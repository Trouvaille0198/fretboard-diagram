import React, { useState } from 'react';
import { CONSTS } from '../constants';
import PianoKeyboard from '../PianoKeyboard';
import { ColorPalette } from './ColorPalette';
import { FretRangeSlider } from './FretRangeSlider';
import { ScaleDisplay } from './ScaleDisplay';
import { getLevel1FillColor, getLevel2Color, generateTintVariants } from '../colorConfig';

export function FretboardMenu({
  selectedColorLevel,
  selectedColor,
  inTintMode,
  onSelectColor,
  onOpenTintPalette,
  onCycleTintColor,
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
  onReplaceAllTintNotes,
  t,
}) {
  // 如果选中的是第一层颜色且不是trans，生成淡色版本
  const colorName = selectedColor && typeof selectedColor === 'object' ? selectedColor.name : selectedColor;
  const showLevel1TintVariants = inTintMode && selectedColorLevel === 1 && colorName && colorName !== 'trans';
  const level1TintVariants = showLevel1TintVariants ? generateTintVariants(getLevel1FillColor(colorName)) : [];

  // 如果选中的是第二层颜色，生成淡色版本
  const showLevel2TintVariants = inTintMode && selectedColorLevel === 2 && colorName;
  const level2TintVariants = showLevel2TintVariants ? generateTintVariants(getLevel2Color(colorName)) : [];

  // 小调状态
  const [isMinor, setIsMinor] = useState(false);

  const tm = t?.menu ?? {};

  return (
    <div className="menu">
      {/* 左侧：颜色+两行工具栏 */}
      <div className="menu-left">
        {/* 淡色版本和调色板在同一区域 */}
        <div className="menu-palette-shell">
          {/* 异色版本绝对定位在左侧，不占用布局空间 */}
          {(showLevel1TintVariants || showLevel2TintVariants) && (
            <div className="menu-tint-variants">
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
                    title={tm.tintVariantTitle ? tm.tintVariantTitle(index + 1) : `Tint ${index + 1}`}
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
                    title={tm.tintVariantTitle ? tm.tintVariantTitle(index + 1) : `Tint ${index + 1}`}
                  />
                );
              })}
            </div>
          )}

          <ColorPalette
            selectedColorLevel={selectedColorLevel}
            selectedColor={selectedColor}
            onSelectColor={onSelectColor}
            onOpenTintPalette={onOpenTintPalette}
            onReplaceAllTintNotes={onReplaceAllTintNotes}
            onCycleTintColor={onCycleTintColor}
            t={t}
          />
        </div>
        <div className="menu-global-actions">
          <button
            className="enharmonic-button"
            onClick={onToggleEnharmonic}
            title={tm.toggleAccidental ?? 'Toggle accidental'}
          >
            {CONSTS.sign[enharmonic]}
          </button>
          <button
            className="button"
            onClick={onToggleVisibility}
            title={tm.toggleTitle ?? 'Toggle (Z)'}
          >
            {tm.toggle ?? 'Toggle'}
          </button>
          {onSaveState && (
            <button
              className="button"
              onClick={onSaveState}
              title={tm.saveTitle ?? 'Save (Ctrl+S)'}
            >
              {tm.save ?? 'Save'}
            </button>
          )}
          <button
            className="button"
            onClick={onReset}
            title={tm.resetTitle ?? 'Reset (Ctrl+D)'}
          >
            {tm.reset ?? 'Reset'}
          </button>
          <button
            className="button menu-download-button"
            onClick={onSaveSVG}
            title={copyOnly ? (tm.copySvgTitle ?? 'Copy to clipboard') : (tm.downloadSvgTitle ?? 'Download SVG')}
          >
            {copyOnly ? (tm.copySvg ?? 'Copy SVG') : (tm.downloadSvg ?? 'Download SVG')}
          </button>
        </div>
        {/* 连线工具区域 */}
        <div className="menu-section-panel menu-connection-panel">
          <div className="menu-connection-actions">
            <button
              className={`button menu-control-button-primary ${connectionMode ? 'selected' : ''}`}
              onClick={onToggleConnectionMode}
              title={tm.connectTitle ?? 'Connection tool (S)'}
            >
              {tm.connect ?? 'Connect'}
            </button>
            <button
              className="button menu-control-button-compact"
              onClick={() => setConnectionType(connectionType === 'line' ? 'arc' : 'line')}
              disabled={!connectionMode}
              title={connectionType === 'line' ? (tm.lineTitle ?? 'Line') : (tm.arcTitle ?? 'Arc')}
            >
              {connectionType === 'line' ? (tm.line ?? 'Line') : (tm.arc ?? 'Arc')}
            </button>
            <button
              className="button menu-control-button-compact"
              onClick={() => {
                const directions = ['none', 'start', 'end', 'both'];
                const currentIndex = directions.indexOf(connectionArrowDirection);
                const nextIndex = (currentIndex + 1) % directions.length;
                setConnectionArrowDirection(directions[nextIndex]);
              }}
              disabled={!connectionMode}
              title={tm.arrowTitle ? tm.arrowTitle(connectionArrowDirection) : connectionArrowDirection}
            >
              {connectionArrowDirection === 'none' ? (tm.arrowNone ?? 'None') :
                connectionArrowDirection === 'start' ? (tm.arrowStart ?? '←') :
                  connectionArrowDirection === 'end' ? (tm.arrowEnd ?? '→') : (tm.arrowBoth ?? '⇄')}
            </button>
          </div>
        </div>
        {/* 下载区域 - 放在最底下，分两行显示 */}
        <div className="menu-section-panel menu-download-panel">
          <div className="menu-download-options">
            <div className="menu-download-row">
              <label className="menu-checkbox">
                <input
                  type="checkbox"
                  checked={includeMarkers}
                  onChange={(e) => setIncludeMarkers(e.target.checked)}
                />
                <span>{tm.includeMarkers ?? 'Fret markers'}</span>
              </label>
              <label className="menu-checkbox">
                <input
                  type="checkbox"
                  checked={showNotes}
                  onChange={(e) => setShowNotes(e.target.checked)}
                />
                <span>{tm.showNotes ?? 'Show notes'}</span>
              </label>
            </div>
            <div className="menu-download-row">
              <label className="menu-checkbox">
                <input
                  type="checkbox"
                  checked={horizontalCrop}
                  onChange={(e) => setHorizontalCrop(e.target.checked)}
                />
                <span>{tm.horizontalCrop ?? 'H-crop'}</span>
              </label>
              <label className="menu-checkbox">
                <input
                  type="checkbox"
                  checked={verticalCrop}
                  onChange={(e) => setVerticalCrop(e.target.checked)}
                />
                <span>{tm.verticalCrop ?? 'V-crop'}</span>
              </label>
              <label className="menu-checkbox">
                <input
                  type="checkbox"
                  checked={copyOnly}
                  onChange={(e) => setCopyOnly(e.target.checked)}
                />
                <span>{tm.copyOnly ?? 'Copy only'}</span>
              </label>
              <label className="menu-checkbox">
                <input
                  type="checkbox"
                  checked={isMinor}
                  onChange={(e) => setIsMinor(e.target.checked)}
                />
                <span>{tm.minor ?? 'Minor'}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      {/* 右侧：钢琴+指板slider */}
      <div className="menu-right">
        <div className="menu-piano-keyboard">
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

      <div className="menu-scale-bottom">
        <ScaleDisplay rootNote={rootNote} isMinor={isMinor} enharmonic={enharmonic} />
      </div>
    </div>
  );
}
