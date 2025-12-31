import React from 'react';
import { LEVEL1_COLORS, LEVEL2_COLORS } from '../colorConfig';

const LEVEL1_COLOR_ORDER = Object.keys(LEVEL1_COLORS);
const LEVEL2_COLOR_ORDER = Object.keys(LEVEL2_COLORS);

export function ColorPalette({ selectedColorLevel, selectedColor, onSelectColor }) {
  return (
    <div id="color-selector">
      <div className="color-palette-row">
        <span className="palette-label">第一层:</span>
        {LEVEL1_COLOR_ORDER.map(colorName => (
          <button
            key={colorName}
            title={colorName}
            className={`color ${colorName} ${selectedColorLevel === 1 && selectedColor === colorName ? 'selected' : ''}`}
            onClick={() => onSelectColor(1, colorName)}
          />
        ))}
      </div>
      <div className="color-palette-row">
        <span className="palette-label">第二层:</span>
        {LEVEL2_COLOR_ORDER.map(colorName => (
          <button
            key={colorName}
            title={colorName}
            className={`color ${colorName} level2 ${selectedColorLevel === 2 && selectedColor === colorName ? 'selected' : ''}`}
            onClick={() => onSelectColor(2, colorName)}
          />
        ))}
      </div>
    </div>
  );
}
