import React, { useEffect, useRef, useState } from 'react';
import { CONSTS } from '../constants';
import PianoKeyboard from '../PianoKeyboard';
import { ColorPalette } from './ColorPalette';
import { ConnectionPresetIcon } from './ConnectionPresetIcon';
import { CONNECTION_PRESETS } from '../hooks/useConnectionState';
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
  connectionPresetId,
  onSelectConnectionPreset,
  onSaveSVG,
  onSaveState,
  onReset,
  rootNote,
  onRootNoteSelect,
  displayMode,
  setDisplayMode,
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
  stitchUnify,
  setStitchUnify,
  stitchUnifyVisible,
  setHideDock,
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

  // 窄屏（≤640px）：淡色变体不常驻占位，点色块才在其正下方弹出气泡菜单（桌面端仍常驻调色盘左侧）
  const shellRef = useRef(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 800px)').matches);
  const [tintMenuOpen, setTintMenuOpen] = useState(false);
  const [tintAnchorX, setTintAnchorX] = useState(null); // 弹出菜单中心相对 palette-shell 的 x（px）

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 800px)');
    const fn = e => { setNarrow(e.matches); if (!e.matches) setTintMenuOpen(false); };
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // 弹出打开时：点面板外/滚动色块行 → 关闭
  useEffect(() => {
    if (!narrow || !tintMenuOpen) return undefined;
    const onDown = e => { if (!e.target.closest('.menu-tint-variants, .color-palette-row')) setTintMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    const row = shellRef.current?.querySelector('.color-palette-row');
    const close = () => setTintMenuOpen(false);
    row?.addEventListener('scroll', close);
    return () => { document.removeEventListener('mousedown', onDown); row?.removeEventListener('scroll', close); };
  }, [narrow, tintMenuOpen]);

  // 点调色盘色块：选中基色；窄屏下弹出/收起该色的淡色档位菜单（点已选中的同色块 = 开关）
  const handlePaletteTintOpen = (level, color, btnEl) => {
    const wasSelected = selectedColorLevel === level &&
      (typeof selectedColor === 'object' ? selectedColor.name === color : selectedColor === color);
    onOpenTintPalette(level, color);
    if (!narrow) return;
    if (color === 'trans') { setTintMenuOpen(false); return; }
    const willOpen = !(wasSelected && tintMenuOpen);
    setTintMenuOpen(willOpen);
    if (willOpen && btnEl && shellRef.current) {
      const sr = shellRef.current.getBoundingClientRect();
      const br = btnEl.getBoundingClientRect();
      const x = br.left + br.width / 2 - sr.left;
      setTintAnchorX(Math.max(95, Math.min(sr.width - 95, x))); // 菜单宽约 178px（半宽 89），钳在壳内不出屏
    }
  };

  const pickVariant = (level, color) => {
    onSelectColor(level, colorName, color);
    if (narrow) setTintMenuOpen(false);
  };

  // 小调状态
  const [isMinor, setIsMinor] = useState(false);

  const tm = t?.menu ?? {};
  const tc = t?.connection ?? {};

  return (
    <div className="menu">
      {/* 左侧：颜色+两行工具栏 */}
      <div className="menu-left">
        {/* 淡色版本和调色板在同一区域 */}
        <div className="menu-palette-shell" ref={shellRef}>
          {/* 桌面：异色版本绝对定位在左侧，不占用布局空间；
              窄屏：不常驻，点色块后在当前色块正下方弹出（mobile-popup，锚点由 JS 算） */}
          {(showLevel1TintVariants || showLevel2TintVariants) && (!narrow || tintMenuOpen) && (
            <div
              className={`menu-tint-variants${narrow ? ' mobile-popup' : ''}`}
              style={narrow ? { left: (tintAnchorX ?? '50%') + 'px' } : undefined}
            >
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
                    onClick={() => pickVariant(1, color)}
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
                    onClick={() => pickVariant(2, color)}
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
            onOpenTintPalette={handlePaletteTintOpen}
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
        {/* 连线工具区域：点预设即进入连线模式，再点当前的预设退出 */}
        <div className="menu-section-panel menu-connection-panel">
          <div className="menu-connection-presets" role="group">
            {CONNECTION_PRESETS.map(preset => (
              <button
                key={preset.id}
                className={`button menu-preset-button ${connectionMode && connectionPresetId === preset.id ? 'selected' : ''}`}
                onClick={() => onSelectConnectionPreset(preset.id)}
                title={tc.presetTitles?.[preset.id] ?? preset.id}
              >
                <ConnectionPresetIcon presetId={preset.id} />
                <span>{tc.presetLabels?.[preset.id] ?? preset.id}</span>
              </button>
            ))}
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
              {stitchUnifyVisible && (
                <label className="menu-checkbox" title={tm.stitchUnifyHint ?? '仅对拼接图有效：每张图按第一张图的色系统一涂色，第 1 张最浅、往后逐张加深；第一张图含多种色系（透明色不算）时不生效'}>
                  <input
                    type="checkbox"
                    checked={!!stitchUnify}
                    onChange={(e) => setStitchUnify?.(e.target.checked)}
                  />
                  <span>{tm.stitchUnify ?? '统一色系'}</span>
                </label>
              )}
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
      </div>

      <div className="menu-scale-bottom">
        <ScaleDisplay rootNote={rootNote} isMinor={isMinor} enharmonic={enharmonic} />
      </div>
    </div>
  );
}
