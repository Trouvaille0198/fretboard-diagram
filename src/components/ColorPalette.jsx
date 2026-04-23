import React from 'react';
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

export function ColorPalette({ selectedColorLevel, selectedColor, onOpenTintPalette, onReplaceAllTintNotes }) {
  // 获取实际的颜色名称（处理自定义颜色对象）
  const actualColorName = selectedColor && typeof selectedColor === 'object' ? selectedColor.name : selectedColor;

  const handleContextMenu = (e, colorName) => {
    e.preventDefault();
    // 不包括透明色
    if (colorName === 'trans') return;

    // 显示确认对话框
    const confirmed = window.confirm(`是否替换成该颜色？\n\n这将把所有异色note替换为 ${colorName} 对应浓度的异色颜色。`);
    if (confirmed && onReplaceAllTintNotes) {
      onReplaceAllTintNotes(colorName);
    }
  };

  return (
    <div id="color-selector">
      <div className="color-palette-row">
        {LEVEL1_COLOR_ORDER.map(colorName => (
          <button
            key={colorName}
            title={LEVEL1_SHORTCUTS[colorName] ? `${colorName} (${LEVEL1_SHORTCUTS[colorName]})` : colorName}
            className={`color ${colorName} ${selectedColorLevel === 1 && actualColorName === colorName ? 'selected' : ''}`}
            onClick={() => onOpenTintPalette && onOpenTintPalette(1, colorName)}
            onContextMenu={(e) => handleContextMenu(e, colorName)}
          />
        ))}
      </div>
    </div>
  );
}
