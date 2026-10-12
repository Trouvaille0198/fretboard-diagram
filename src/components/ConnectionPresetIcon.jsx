import React from 'react';

// 连线预设图标：把预设的形状直接画出来，避免用文字描述方向
export function ConnectionPresetIcon({ presetId, width = 30, height = 16 }) {
  const viewBox = '0 0 30 16';
  const strokeProps = {
    stroke: 'currentColor',
    strokeWidth: 1.6,
    fill: 'none',
    strokeLinecap: 'round'
  };

  if (presetId === 'line-arrow') {
    return (
      <svg width={width} height={height} viewBox={viewBox} aria-hidden="true" focusable="false">
        <path d="M2 8 H25" {...strokeProps} />
        <path d="M19.5 4.2 L25.5 8 L19.5 11.8 z" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (presetId === 'arc-arrow') {
    return (
      <svg width={width} height={height} viewBox={viewBox} aria-hidden="true" focusable="false">
        <path d="M2 12 Q 15 0 26 9.2" {...strokeProps} />
        <path d="M20.4 6.6 L26.4 9.6 L20.9 13.2 z" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg width={width} height={height} viewBox={viewBox} aria-hidden="true" focusable="false">
      <path d="M2 8 H27" {...strokeProps} />
    </svg>
  );
}