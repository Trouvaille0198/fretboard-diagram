import React, { useEffect, useRef } from 'react';
import { LEVEL1_COLORS } from '../colorConfig';

const LEVEL1_COLOR_ORDER = Object.keys(LEVEL1_COLORS);

// 第一层颜色的快捷键映射
const LEVEL1_SHORTCUTS = {
  blue: 'B',
  green: 'G',
  red: 'R',
  white: 'W',
  black: 'D'
};

export function ColorPalette({ selectedColorLevel, selectedColor, onOpenTintPalette, onReplaceAllTintNotes, onCycleTintColor, t }) {
  const tp = t?.palette ?? {};
  const paletteRef = useRef(null);

  // 获取实际的颜色名称（处理自定义颜色对象）
  const actualColorName = selectedColor && typeof selectedColor === 'object' ? selectedColor.name : selectedColor;

  useEffect(() => {
    const paletteElement = paletteRef.current;
    if (!paletteElement || !onCycleTintColor) return undefined;

    const handleNativeWheel = (event) => {
      const colorButton = event.target instanceof Element ? event.target.closest('button.color') : null;
      if (!colorButton) return;

      const colorClasses = Array.from(colorButton.classList).filter(className =>
        className !== 'color' && className !== 'selected'
      );
      const colorName = colorClasses[0];
      if (!colorName || colorName === 'trans' || event.deltaY === 0) return;

      event.preventDefault();
      event.stopPropagation();
      onCycleTintColor(colorName, event.deltaY > 0 ? 1 : -1);
    };

    paletteElement.addEventListener('wheel', handleNativeWheel, { passive: false });

    return () => {
      paletteElement.removeEventListener('wheel', handleNativeWheel);
    };
  }, [onCycleTintColor]);

  const handleContextMenu = (e, colorName) => {
    e.preventDefault();
    // 不包括透明色
    if (colorName === 'trans') return;

    // 显示确认对话框
    const confirmed = window.confirm(tp.replaceConfirm ? tp.replaceConfirm(colorName) : `Replace with this color?\n\nThis will replace all tint notes with ${colorName} tint.`);
    if (confirmed && onReplaceAllTintNotes) {
      onReplaceAllTintNotes(colorName);
    }
  };

  return (
    <div className="color-selector" ref={paletteRef}>
      <div className="color-palette-row">
        {LEVEL1_COLOR_ORDER.map(colorName => (
          <button
            key={colorName}
            title={tp.tintTitle ? tp.tintTitle(colorName, LEVEL1_SHORTCUTS[colorName]) : (LEVEL1_SHORTCUTS[colorName] ? `${colorName} (${LEVEL1_SHORTCUTS[colorName]})` : colorName)}
            className={`color ${colorName} ${selectedColorLevel === 1 && actualColorName === colorName ? 'selected' : ''}`}
            onClick={() => onOpenTintPalette && onOpenTintPalette(1, colorName)}
            onContextMenu={(e) => handleContextMenu(e, colorName)}
          />
        ))}
      </div>
    </div>
  );
}
