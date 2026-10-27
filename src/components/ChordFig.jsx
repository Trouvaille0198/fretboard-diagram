import React, { useMemo } from 'react';
import { boardFigData, figSvg } from '../utils/chordFig';

// 指法小图(黑点格)只读渲染——谱面拍格内嵌/汇总行/整谱导出。
// 编辑不在这里:点"指法图"跳普通指板编辑器(全套交互),画完自动转竖式小图展示。
export function FigView({ data, chord, viewKey, opts, onDoubleClick }) {
  const has = data && Object.keys(data).some(k => !k.startsWith('conn') && k !== 'connections' && (data[k] || {}).visibility === 'visible');
  const html = useMemo(() => (has ? figSvg(boardFigData(data, chord, viewKey), opts || {}) : ''), [has, data, chord, viewKey, opts]);
  if (!has) return null;
  return <span className="cc-figview" onDoubleClick={onDoubleClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
