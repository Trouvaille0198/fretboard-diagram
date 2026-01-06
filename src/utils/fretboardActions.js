import { updateNote, inlineCSS } from '../utils';
import { LEVEL1_COLORS, LEVEL2_COLORS } from '../colorConfig';
import { CONSTS } from '../constants';

const LEVEL1_COLOR_ORDER = Object.keys(LEVEL1_COLORS);
const LEVEL2_COLOR_ORDER = Object.keys(LEVEL2_COLORS);

// 显示图片让用户手动复制的辅助函数
function showImageForManualCopy(img, dataUrl, setToastMessage, setToastType) {
  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  `;

  // 创建图片容器
  const imgContainer = document.createElement('div');
  imgContainer.style.cssText = `
    position: relative;
    background: white;
    padding: 20px;
    border-radius: 8px;
    max-width: 90%;
    max-height: 90%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
  `;

  // 创建提示文字
  const hint = document.createElement('div');
  hint.style.cssText = `
    color: #333;
    font-size: 14px;
    text-align: center;
    padding: 10px;
  `;
  hint.textContent = '右键点击图片，选择"复制图片"，然后点击任意位置关闭';

  // 克隆图片
  const displayImg = img.cloneNode(true);
  displayImg.style.cssText = 'max-width: 100%; max-height: 70vh; height: auto; cursor: pointer;';

  imgContainer.appendChild(displayImg);
  imgContainer.appendChild(hint);
  overlay.appendChild(imgContainer);
  document.body.appendChild(overlay);

  // 点击关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  // 图片右键复制提示
  displayImg.addEventListener('contextmenu', (e) => {
    e.stopPropagation();
  });

  if (setToastMessage) {
    setToastMessage('请右键点击图片，选择"复制图片"');
    setToastType('info');
  }
}

export function selectColor(level, color, selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor) {
  // 如果点击的是当前已选中的颜色和层级，则取消选中
  if (selectedColorLevel === level && selectedColor === color) {
    setSelectedColorLevel(null);
    setSelectedColor(null);
  } else {
    setSelectedColorLevel(level);
    setSelectedColor(color);
  }
}

export function cycleLevel1Color(selectedColorLevel, selectedColor, selectColor) {
  if (selectedColorLevel === 1 && selectedColor) {
    // 如果当前已选中第一层级颜色，找到下一个
    const currentIndex = LEVEL1_COLOR_ORDER.indexOf(selectedColor);
    const nextIndex = (currentIndex + 1) % LEVEL1_COLOR_ORDER.length;
    selectColor(1, LEVEL1_COLOR_ORDER[nextIndex]);
  } else {
    // 如果未选中或选中其他层级，选择第一个颜色
    selectColor(1, LEVEL1_COLOR_ORDER[0]);
  }
}

export function cycleLevel2Color(selectedColorLevel, selectedColor, selectColor) {
  if (selectedColorLevel === 2 && selectedColor) {
    // 如果当前已选中第二层级颜色，找到下一个
    const currentIndex = LEVEL2_COLOR_ORDER.indexOf(selectedColor);
    const nextIndex = (currentIndex + 1) % LEVEL2_COLOR_ORDER.length;
    selectColor(2, LEVEL2_COLOR_ORDER[nextIndex]);
  } else {
    // 如果未选中或选中其他层级，选择第一个颜色
    selectColor(2, LEVEL2_COLOR_ORDER[0]);
  }
}

export function toggleVisibility(visibility, setVisibility, notesElementRef, data, updateNote) {
  const newVisibility = visibility === 'hidden' ? 'transparent' : 'hidden';
  setVisibility(newVisibility);

  if (notesElementRef.current) {
    for (const note of notesElementRef.current.children) {
      const noteId = note.id;
      const noteData = data[noteId] || {};
      const currentVisibility = noteData.visibility;

      // 只更新非visible和selected的note
      if (currentVisibility !== 'visible' && currentVisibility !== 'selected') {
        updateNote(note, data, { visibility: newVisibility });
      }
    }
  }

  // 更新data中的visibility
  // 注意：这里需要返回新的data，但为了保持函数签名一致，我们通过setData在外部处理
}

export function toggleEnharmonic(enharmonic, setEnharmonic) {
  setEnharmonic(prev => (prev + 1) % 2);
}

export function reset(visibility, setData, setSelected, notesElementRef, data, updateNote, setStartFret, setEndFret, setDisplayMode, setRootNote, setEnharmonic) {
  // 只重置点的颜色和visibility，保留音名（noteText）
  setData(prevData => {
    const newData = {};
    // 保留所有note的noteText，但重置其他属性
    Object.keys(prevData).forEach(key => {
      if (key.startsWith('conn-')) {
        // 删除所有连线
        return;
      }
      const noteData = prevData[key];
      if (noteData && noteData.type === 'note') {
        // 只保留noteText，重置其他属性
        newData[key] = {
          type: 'note',
          color: 'white',
          color2: null,
          visibility: visibility,
          ...(noteData.noteText ? { noteText: noteData.noteText } : {})
        };
      }
    });
    return newData;
  });

  // 更新DOM中的note样式
  if (notesElementRef.current) {
    for (const note of notesElementRef.current.children) {
      updateNote(note, data, { type: 'note', color: 'white', color2: null, visibility: visibility });
    }
  }
  setSelected(null);

  // 还原指板长度到默认值
  if (setStartFret) {
    setStartFret(0);
  }
  if (setEndFret) {
    // 还原为默认值 15
    setEndFret(15);
  }

  // 还原为默认的音名模式
  if (setDisplayMode) {
    setDisplayMode('note');
  }
  if (setRootNote) {
    setRootNote(null);
  }
  if (setEnharmonic) {
    setEnharmonic(1);
  }
}

export function saveSVG(selected, setSelected, data, updateNote, connectionToolbarVisible, setConnectionToolbarVisible, svgElementRef, inlineCSS, displayMode, rootNote, enharmonic, startFret, endFret, includeMarkers = true, copyOnly = false, showNotes = true, setToastMessage = null, setToastType = null, currentVisibility = 'transparent', setVisibility = null) {
  // 直接导出，不再在这里处理 visibility 切换
  // 切换逻辑已经在 Fretboard.jsx 的 saveSVGMemo 中处理
  // 克隆 SVG 并移除不需要的元素
  const svgClone = svgElementRef.current.cloneNode(true);

  // 移除工具栏和编辑框
  const foreignObjects = svgClone.querySelectorAll('foreignObject');
  foreignObjects.forEach(fo => {
    const toolbar = fo.querySelector('.connection-toolbar-container, .connection-toolbar');
    const editableDiv = fo.querySelector('#editable-div');
    if (toolbar || editableDiv) {
      fo.remove();
    }
  });

  // 如果选中了 note，在克隆的 SVG 中将其设置为可见
  if (selected) {
    const selectedElement = svgClone.getElementById(selected.id);
    if (selectedElement) {
      selectedElement.classList.remove('hidden', 'transparent');
      selectedElement.classList.add('visible');
      const circle = selectedElement.querySelector('circle');
      if (circle) {
        circle.style.opacity = '1';
      }
    }
  }

  // 先调用 inlineCSS，确保样式正确内联
  const svgCopy = inlineCSS(svgClone);

  // 如果不显示音符，对所有 note 执行 toggle 操作（hidden ↔ transparent）
  // 只影响非 visible/selected 的 note
  if (!showNotes) {
    const notes = svgCopy.querySelectorAll('g.note');
    notes.forEach(note => {
      // 检查 note 是否是 visible 或 selected，如果是则跳过
      if (note.classList.contains('visible') || note.classList.contains('selected')) {
        return;
      }

      // Toggle: hidden <-> transparent
      if (note.classList.contains('hidden')) {
        // hidden -> transparent: 显示圆圈，不显示文本
        const text = note.querySelector('text');
        if (text) {
          text.style.opacity = '0';
        }
        note.style.opacity = '1';
      } else {
        // transparent -> hidden: 都不显示
        note.style.opacity = '0';
      }
    });
  }

  // 如果不包含品数，移除 markers（上下方的品数标记，如 3、5、7 等）
  // 注意：必须在 inlineCSS 之后移除，避免索引错位
  if (!includeMarkers) {
    // 查找并移除 markers 组
    const markersGroup = svgCopy.querySelector('g.markers');
    if (markersGroup) {
      markersGroup.remove();
    }
    // 也尝试通过类名查找，以防万一
    const markersByClass = svgCopy.querySelectorAll('.marker');
    markersByClass.forEach(marker => marker.remove());
  }

  // 获取原始的 viewBox 和尺寸（用于保持上下不变）
  const originalViewBox = svgCopy.getAttribute('viewBox');
  let originalY = 0;
  let originalHeight = 0;
  if (originalViewBox) {
    const parts = originalViewBox.split(' ');
    if (parts.length === 4) {
      originalY = parseFloat(parts[1]);
      originalHeight = parseFloat(parts[3]);
    }
  }

  // 以品丝为边界进行裁剪
  let minFret = Infinity;
  let maxFret = -Infinity;
  let hasColoredNotes = false;

  // 查找所有有颜色的 note，提取品丝编号
  const noteElements = svgCopy.querySelectorAll('g.note');
  noteElements.forEach(noteElement => {
    const noteId = noteElement.getAttribute('id');
    if (!noteId) return;

    const noteData = data[noteId];
    if (!noteData) return;

    // 检查是否有颜色（visibility 是 visible 或 selected）
    const hasColor = noteData.color &&
      (noteData.visibility === 'visible' || noteData.visibility === 'selected');

    // 或者有 color2
    const hasColor2 = noteData.color2 && noteData.color2 !== null;

    if (hasColor || hasColor2) {
      // 从 noteId 提取品丝编号
      // 格式：f{i}-s{j} 或 o-s{j}（0品/开放弦）
      let fret;
      if (noteId.startsWith('o-')) {
        fret = 0; // 开放弦（0品）
      } else {
        const match = noteId.match(/^f(\d+)-s/);
        if (match) {
          fret = parseInt(match[1], 10);
        }
      }

      if (fret !== undefined && !isNaN(fret)) {
        minFret = Math.min(minFret, fret);
        maxFret = Math.max(maxFret, fret);
        hasColoredNotes = true;
      }
    }
  });

  // 查找所有连线，也考虑它们跨越的品丝范围
  // 从 data.connections 获取连线信息
  if (data && data.connections) {
    Object.values(data.connections).forEach(conn => {
      if (conn.startNoteId) {
        let fret;
        if (conn.startNoteId.startsWith('o-')) {
          fret = 0;
        } else {
          const match = conn.startNoteId.match(/^f(\d+)-s/);
          if (match) {
            fret = parseInt(match[1], 10);
          }
        }
        if (fret !== undefined && !isNaN(fret)) {
          minFret = Math.min(minFret, fret);
          maxFret = Math.max(maxFret, fret);
          hasColoredNotes = true;
        }
      }

      if (conn.endNoteId) {
        let fret;
        if (conn.endNoteId.startsWith('o-')) {
          fret = 0;
        } else {
          const match = conn.endNoteId.match(/^f(\d+)-s/);
          if (match) {
            fret = parseInt(match[1], 10);
          }
        }
        if (fret !== undefined && !isNaN(fret)) {
          minFret = Math.min(minFret, fret);
          maxFret = Math.max(maxFret, fret);
          hasColoredNotes = true;
        }
      }
    });
  }

  // 如果找到了有颜色的 note，以品丝边界进行裁剪
  if (hasColoredNotes && minFret !== Infinity && maxFret !== -Infinity) {
    // 计算品丝边界位置
    // 第0品丝（开放弦的左边界）：CONSTS.offsetX
    // 第i品丝：CONSTS.offsetX + CONSTS.fretWidth * (i - startFret)

    let minX, maxX;

    // 左边界：最小品丝的左边界
    if (minFret === 0) {
      // 0品：左边界需要包含0品note的位置（CONSTS.offsetX - CONSTS.fretWidth / 2）
      // 留出一些padding确保note完全可见
      minX = CONSTS.offsetX - CONSTS.fretWidth / 2 - CONSTS.circleRadius;
    } else {
      // 其他品：左边界是该品丝的位置
      minX = CONSTS.offsetX + CONSTS.fretWidth * (minFret - (startFret || 0));
    }

    // 右边界：最大品丝的右边界（下一品丝的位置）
    maxX = CONSTS.offsetX + CONSTS.fretWidth * (maxFret + 1 - (startFret || 0));

    // 计算新的宽度
    const newWidth = maxX - minX;

    // 计算上下边界
    let newY = originalY || 0;
    let newHeight = originalHeight || svgCopy.getAttribute('height') || 0;

    // 如果不包含品数标记，计算实际内容的上下边界
    if (!includeMarkers) {
      let minStringIndex = Infinity;
      let maxStringIndex = -Infinity;
      let hasValidNotes = false;

      // 查找所有有颜色的note，提取string索引
      noteElements.forEach(noteElement => {
        const noteId = noteElement.getAttribute('id');
        if (!noteId) return;

        const noteData = data[noteId];
        if (!noteData) return;

        const hasColor = noteData.color &&
          (noteData.visibility === 'visible' || noteData.visibility === 'selected');
        const hasColor2 = noteData.color2 && noteData.color2 !== null;

        if (hasColor || hasColor2) {
          // 从noteId提取string索引
          // 格式：f{i}-s{j} 或 o-s{j}
          let stringIndex;
          if (noteId.startsWith('o-s')) {
            stringIndex = parseInt(noteId.substring(3), 10);
          } else {
            const match = noteId.match(/-s(\d+)$/);
            if (match) {
              stringIndex = parseInt(match[1], 10);
            }
          }

          if (stringIndex !== undefined && !isNaN(stringIndex)) {
            minStringIndex = Math.min(minStringIndex, stringIndex);
            maxStringIndex = Math.max(maxStringIndex, stringIndex);
            hasValidNotes = true;
          }
        }
      });

      // 如果找到了有效的note，计算Y坐标范围
      if (hasValidNotes && minStringIndex !== Infinity && maxStringIndex !== -Infinity) {
        // 根据string索引计算Y坐标
        const minY = CONSTS.offsetY + CONSTS.stringSpacing * minStringIndex - CONSTS.circleRadius;
        const maxY = CONSTS.offsetY + CONSTS.stringSpacing * maxStringIndex + CONSTS.circleRadius;

        const padding = 15; // 上下各留15px的padding
        newY = minY - padding;
        newHeight = maxY - minY + padding * 2;
      }
    }

    // 设置新的 viewBox
    svgCopy.setAttribute('viewBox', `${minX} ${newY} ${newWidth} ${newHeight}`);
    svgCopy.setAttribute('width', newWidth);
    // 设置高度
    if (newHeight > 0) {
      svgCopy.setAttribute('height', newHeight);
    }
  }

  // 设置 SVG 背景色（从 CSS 变量获取）
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);
  const backgroundColor = computedStyle.getPropertyValue('--background-color').trim() || 'black';
  svgCopy.setAttribute('style', `background-color: ${backgroundColor};`);

  // 在 SVG 中添加元数据（保存显示模式信息）
  svgCopy.setAttribute('data-display-mode', displayMode || 'note');
  if (rootNote !== null && rootNote !== undefined) {
    svgCopy.setAttribute('data-root-note', String(rootNote));
  }
  svgCopy.setAttribute('data-enharmonic', String(enharmonic || 1));

  // 先保存下载用的SVG数据（不包含背景矩形，因为SVG的style背景色在浏览器中会正确显示）
  const svgData = svgCopy.outerHTML;

  // 如果仅复制，需要在SVG中添加背景矩形（因为SVG转图片时style背景色可能不生效）
  let svgDataForCopy = svgData;
  if (copyOnly) {
    // 克隆SVG以避免修改原始数据
    const svgForCopy = svgCopy.cloneNode(true);

    // 获取 SVG 的尺寸和viewBox
    const width = parseFloat(svgForCopy.getAttribute('width')) || parseFloat(svgForCopy.getAttribute('viewBox')?.split(' ')[2]) || 800;
    const height = parseFloat(svgForCopy.getAttribute('height')) || parseFloat(svgForCopy.getAttribute('viewBox')?.split(' ')[3]) || 400;
    const viewBox = svgForCopy.getAttribute('viewBox');

    // 计算背景矩形的位置和尺寸
    let bgX = 0, bgY = 0, bgWidth = width, bgHeight = height;
    if (viewBox) {
      const parts = viewBox.split(' ');
      bgX = parseFloat(parts[0]) || 0;
      bgY = parseFloat(parts[1]) || 0;
      bgWidth = parseFloat(parts[2]) || width;
      bgHeight = parseFloat(parts[3]) || height;
    }

    // 创建背景矩形，插入到SVG的最前面
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', bgX);
    bgRect.setAttribute('y', bgY);
    bgRect.setAttribute('width', bgWidth);
    bgRect.setAttribute('height', bgHeight);
    bgRect.setAttribute('fill', backgroundColor);
    svgForCopy.insertBefore(bgRect, svgForCopy.firstChild);

    // 使用包含背景矩形的SVG
    svgDataForCopy = svgForCopy.outerHTML;
  }

  // 如果仅复制，将 SVG 转换为图片并复制到剪贴板
  if (copyOnly) {
    // 获取 SVG 的尺寸
    const width = parseFloat(svgCopy.getAttribute('width')) || parseFloat(svgCopy.getAttribute('viewBox')?.split(' ')[2]) || 800;
    const height = parseFloat(svgCopy.getAttribute('height')) || parseFloat(svgCopy.getAttribute('viewBox')?.split(' ')[3]) || 400;

    // 将 SVG 转换为图片（使用包含背景矩形的SVG）
    const img = new Image();
    const svgBlob = new Blob([svgDataForCopy], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      // 创建 Canvas，使用高分辨率提高清晰度
      const scale = 3; // 使用3倍分辨率确保清晰
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');

      // 缩放上下文以匹配高分辨率
      ctx.scale(scale, scale);

      // 先填充背景色（确保背景正确，与下载的SVG一致）
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // 绘制图片到 Canvas
      ctx.drawImage(img, 0, 0, width, height);

      // 转换为 Blob (PNG)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);

        if (!blob) {
          if (setToastMessage) {
            setToastMessage('转换图片失败');
            setToastType('error');
          }
          return;
        }

        // 检查是否在安全上下文中（HTTPS或localhost）
        const isSecureContext = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

        // 使用 Clipboard API 复制图片
        if (isSecureContext && navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
          const clipboardItem = new ClipboardItem({ 'image/png': blob });
          navigator.clipboard.write([clipboardItem]).then(() => {
            if (setToastMessage) {
              setToastMessage('已复制图片到剪贴板！');
              setToastType('success');
            }
          }).catch(err => {
            console.error('复制图片失败:', err);
            if (setToastMessage) {
              // 如果是权限错误，给出更明确的提示
              if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
                setToastMessage('复制失败：需要剪贴板权限。请允许浏览器访问剪贴板');
              } else {
                setToastMessage('复制失败：' + err.message);
              }
              setToastType('error');
            }
          });
        } else {
          // 降级方案：HTTP环境下，创建临时图片元素让用户手动复制
          if (!isSecureContext) {
            // 将blob转换为DataURL
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result;

              // 创建临时容器
              const container = document.createElement('div');
              container.style.cssText = 'position: fixed; top: -9999px; left: -9999px; opacity: 0; pointer-events: none;';

              // 创建img元素
              const img = document.createElement('img');
              img.src = dataUrl;
              img.style.cssText = 'max-width: 100%; height: auto;';
              img.onload = () => {
                container.appendChild(img);
                document.body.appendChild(container);

                // 选中图片
                const range = document.createRange();
                range.selectNodeContents(container);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);

                // 尝试使用execCommand复制（虽然通常只对文本有效，但某些浏览器可能支持）
                try {
                  const successful = document.execCommand('copy');
                  if (successful) {
                    if (setToastMessage) {
                      setToastMessage('已复制图片到剪贴板！');
                      setToastType('success');
                    }
                  } else {
                    // 如果execCommand失败，显示图片让用户手动复制
                    showImageForManualCopy(img, dataUrl, setToastMessage, setToastType);
                  }
                } catch (err) {
                  // execCommand失败，显示图片让用户手动复制
                  showImageForManualCopy(img, dataUrl, setToastMessage, setToastType);
                }

                // 清理
                setTimeout(() => {
                  selection.removeAllRanges();
                  document.body.removeChild(container);
                }, 100);
              };
            };
            reader.readAsDataURL(blob);
          } else {
            // HTTPS但浏览器不支持
            if (setToastMessage) {
              setToastMessage('浏览器不支持复制图片，请使用下载功能');
              setToastType('error');
            }
          }
        }
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      console.error('加载 SVG 图片失败');
      if (setToastMessage) {
        setToastMessage('转换图片失败');
        setToastType('error');
      }
    };

    img.src = url;
    return;
  }

  // 否则下载文件
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const link = document.createElement('a');
  link.href = svgUrl;
  link.download = 'fretboard-diagram.svg';
  link.click();
  URL.revokeObjectURL(svgUrl);
}

export function setFretWindow(fretWindow, startFret, endFret, selected, setSelected, data, setData, updateNote, setErrorMessage, setStartFret, setEndFret) {
  const start = fretWindow.start !== undefined ? fretWindow.start : startFret;
  const end = fretWindow.end !== undefined ? fretWindow.end : endFret;

  if (selected) {
    const noteElement = selected.element || document.getElementById(selected.id);
    if (noteElement) {
      updateNote(noteElement, data, { visibility: 'visible' });
      setData(prevData => {
        const newData = { ...prevData };
        if (selected.id in newData) {
          newData[selected.id] = { ...newData[selected.id], visibility: 'visible' };
        }
        return newData;
      });
    }
    setSelected(null);
  }

  setErrorMessage('');

  if (isNaN(start) || isNaN(end)) {
    return;
  }

  if (start < 0 || start > 22 || end < 1 || end > 22) {
    setErrorMessage("Invalid fret value(s)!");
    setStartFret(start);
    setEndFret(end);
    return;
  }
  if (end <= start) {
    setErrorMessage("End fret must not be smaller than start fret!");
    setStartFret(start);
    setEndFret(end);
    return;
  }
  if (end - start > 16) {
    setErrorMessage("Maximal number of displayable frets is 16, e.g., 1st to 16th or 4th to 19th!");
    setStartFret(start);
    setEndFret(end);
    return;
  }

  setStartFret(start);
  setEndFret(end);
}
