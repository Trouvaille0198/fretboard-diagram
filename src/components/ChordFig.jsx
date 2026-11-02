import React, { useMemo } from 'react';
import { boardFigData, figSvg } from '../utils/chordFig';

// 指法小图(黑点格)只读渲染——谱面拍格内嵌/汇总行/整谱导出。
// 编辑不在这里:点"指法图"跳普通指板编辑器(全套交互),画完自动转竖式小图展示。
export function FigView({ data, chord, viewKey, opts, onClick }) {
  const has = data && Object.keys(data).some(k => !k.startsWith('conn') && k !== 'connections' && (data[k] || {}).visibility === 'visible');
  // 调内度数(degMode='scale')要靠 opts.key 算相对谱面调的 1-7;viewKey = keyAt(小节) 已含转调,
  // 直接透传给 figSvg——否则 figSvg 拿不到 key,调内模式一个度数都不出(只剩素点)
  const html = useMemo(() => (has ? figSvg(boardFigData(data, chord, viewKey), { ...(opts || {}), key: viewKey }) : ''), [has, data, chord, viewKey, opts]);
  if (!has) return null;
  return <span className="cc-figview" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
