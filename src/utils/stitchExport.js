// 拼接图导出：离屏逐段 renderBoardImage → canvas 合成 PNG。
// StitchDock 的复制/下载按钮与普通模式 Ctrl+Shift+C 共用同一实现，保证所见即所得。
// unify（统一色系）= 渲染期重涂（unifyStitchState），条目快照数据不动。

import { renderBoardImage } from '../components/ScorePieces';
import { stitchLayout, stitchScale, withAlpha, unifyStitchState } from './stitchModel';
import { CANVAS_COLORS } from '../colorConfig';

const cssVar = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

// 拼接布局 → 一张 PNG canvas（k = 像素/SVG单位；段顺序=条目顺序，从左到右）
export async function composeStitchCanvas(items, layout, unify) {
  const k = stitchScale(layout);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(layout.w * k));
  canvas.height = Math.max(1, Math.round(layout.h * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = cssVar('--background-color', CANVAS_COLORS.bgFallback);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < items.length; i++) {
    const seg = layout.segs[i];
    const opts = items[i].opts || {};
    const state = unify ? unifyStitchState(items, i) : items[i].state;
    const img = await renderBoardImage(state, Math.max(1, Math.round(seg.vb.w * k)), {
      includeMarkers: opts.includeMarkers,
      showNotes: opts.showNotes,
      cropBox: seg.vb,
    });
    ctx.drawImage(img, Math.round(seg.x * k), Math.round(seg.y * k), Math.round(seg.vb.w * k), Math.round(seg.vb.h * k));
  }
  // 段间分割竖线（位于留白中央，主题文字色降透明度——深浅主题都清晰）
  ctx.strokeStyle = withAlpha(cssVar('--app-text', CANVAS_COLORS.textFallback), 0.5);
  ctx.lineWidth = Math.max(2, Math.round(k * 2));
  layout.dividers.forEach(dx => {
    const px = Math.round(dx * k) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
    ctx.stroke();
  });
  return canvas;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// 词条解析（与 StitchDock 的 L() 同式：t.stitch[key] 支持函数式带参）
function stitchToast(t, key, fallback, ...args) {
  const f = t?.stitch?.[key] ?? fallback;
  return typeof f === 'function' ? f(...args) : f;
}

// 拼接图 → 剪贴板 PNG；拼接区为空静默返回 false（无事发生，不弹任何提示）
export async function copyStitchImage(items, { unify = false, layout, t, showToast } = {}) {
  if (!items?.length) return false;
  try {
    const canvas = await composeStitchCanvas(items, layout ?? stitchLayout(items), unify);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('PNG 编码失败');
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast?.(stitchToast(t, 'toastCopied', `已复制拼接图（${items.length} 张）`, items.length), 'success');
    } else {
      downloadBlob(blob, `fretboard-stitch-${Date.now()}.png`);
      showToast?.(stitchToast(t, 'toastFallback', '剪贴板不可用（非安全上下文），已改为下载 PNG'), 'info');
    }
    return true;
  } catch (error) {
    showToast?.(`${stitchToast(t, 'toastCopyFail', '复制拼接图失败')}：${error.message}`, 'error');
    return false;
  }
}

// 拼接图 → 下载 PNG 文件；拼接区为空静默返回 false
export async function downloadStitchImage(items, { unify = false, layout, t, showToast } = {}) {
  if (!items?.length) return false;
  try {
    const canvas = await composeStitchCanvas(items, layout ?? stitchLayout(items), unify);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('PNG 编码失败');
    const name = `fretboard-stitch-${Date.now()}.png`;
    downloadBlob(blob, name);
    showToast?.(`${stitchToast(t, 'toastDownloaded', '已下载 PNG')}（${(blob.size / 1024).toFixed(0)} KB）`, 'success');
    return true;
  } catch (error) {
    showToast?.(`${stitchToast(t, 'toastSaveFail', '下载拼接图失败')}：${error.message}`, 'error');
    return false;
  }
}
