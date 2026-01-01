import React from 'react';
import { LEVEL1_COLORS, LEVEL2_COLORS } from '../colorConfig';

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

export function ColorPalette({ selectedColorLevel, selectedColor, onSelectColor }) {
  return (
    <div id="color-selector">
      <div className="color-palette-row">
        {LEVEL1_COLOR_ORDER.map(colorName => (
          <button
            key={colorName}
            title={LEVEL1_SHORTCUTS[colorName] ? `${colorName} (${LEVEL1_SHORTCUTS[colorName]})` : colorName}
            className={`color ${colorName} ${selectedColorLevel === 1 && selectedColor === colorName ? 'selected' : ''}`}
            onClick={() => onSelectColor(1, colorName)}
          />
        ))}
      </div>
      <div className="color-palette-row">
        {LEVEL2_COLOR_ORDER.map(colorName => (
          <button
            key={colorName}
            title={`${colorName} (A/D)`}
            className={`color ${colorName} level2 ${selectedColorLevel === 2 && selectedColor === colorName ? 'selected' : ''}`}
            onClick={() => onSelectColor(2, colorName)}
          />
        ))}
      </div>
    </div>
  );
}
