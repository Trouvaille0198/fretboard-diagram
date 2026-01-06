import React from 'react';
import { LEVEL1_COLORS, LEVEL2_COLORS, getLevel1FillColor, generateTintVariants } from '../colorConfig';

const LEVEL1_COLOR_ORDER = Object.keys(LEVEL1_COLORS);
const LEVEL2_COLOR_ORDER = Object.keys(LEVEL2_COLORS);

// 第一层颜色的快捷键映射
const LEVEL1_SHORTCUTS = {
  blue: 'B',
  green: 'G',
  red: 'R',
  white: 'W',
  black: 'D'
};

export function ColorPalette({ selectedColorLevel, selectedColor, onSelectColor, onDoubleClickColor, onReplaceAllTintNotes }) {
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
            onClick={() => onSelectColor(1, colorName)}
            onDoubleClick={() => onDoubleClickColor && onDoubleClickColor(1, colorName)}
            onContextMenu={(e) => handleContextMenu(e, colorName)}
          />
        ))}
      </div>
      
      <div className="color-palette-row">
        {LEVEL2_COLOR_ORDER.map(colorName => (
          <button
            key={colorName}
            title={`${colorName} (A/D)`}
            className={`color ${colorName} level2 ${selectedColorLevel === 2 && actualColorName === colorName ? 'selected' : ''}`}
            onClick={() => onSelectColor(2, colorName)}
            onDoubleClick={() => onDoubleClickColor && onDoubleClickColor(2, colorName)}
          />
        ))}
      </div>
    </div>
  );
}
