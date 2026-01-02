import { updateNote, inlineCSS } from '../utils';
import { LEVEL1_COLORS, LEVEL2_COLORS } from '../colorConfig';
import { CONSTS } from '../constants';

const LEVEL1_COLOR_ORDER = Object.keys(LEVEL1_COLORS);
const LEVEL2_COLOR_ORDER = Object.keys(LEVEL2_COLORS);

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

export function saveSVG(selected, setSelected, data, updateNote, connectionToolbarVisible, setConnectionToolbarVisible, svgElementRef, inlineCSS, displayMode, rootNote, enharmonic, startFret, endFret, includeMarkers = true, copyOnly = false, setToastMessage = null, setToastType = null) {
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

    // 保持原始的 Y 和高度，只调整 X 和宽度
    const newX = minX;
    const newY = originalY || 0;
    const newHeight = originalHeight || svgCopy.getAttribute('height') || 0;

    // 设置新的 viewBox（只调整左右）
    svgCopy.setAttribute('viewBox', `${newX} ${newY} ${newWidth} ${newHeight}`);
    svgCopy.setAttribute('width', newWidth);
    // 保持原始高度
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

  const svgData = svgCopy.outerHTML;

  // 如果仅复制，将 SVG 转换为图片并复制到剪贴板
  if (copyOnly) {
    // 获取 SVG 的尺寸
    const width = parseFloat(svgCopy.getAttribute('width')) || parseFloat(svgCopy.getAttribute('viewBox')?.split(' ')[2]) || 800;
    const height = parseFloat(svgCopy.getAttribute('height')) || parseFloat(svgCopy.getAttribute('viewBox')?.split(' ')[3]) || 400;

    // 将 SVG 转换为图片
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      // 创建 Canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

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

        // 使用 Clipboard API 复制图片
        if (navigator.clipboard && navigator.clipboard.write) {
          const clipboardItem = new ClipboardItem({ 'image/png': blob });
          navigator.clipboard.write([clipboardItem]).then(() => {
            if (setToastMessage) {
              setToastMessage('已复制图片到剪贴板！');
              setToastType('success');
            }
          }).catch(err => {
            console.error('复制图片失败:', err);
            if (setToastMessage) {
              setToastMessage('复制失败：' + err.message);
              setToastType('error');
            }
          });
        } else {
          // 降级方案：提示用户浏览器不支持
          if (setToastMessage) {
            setToastMessage('浏览器不支持复制图片，请使用下载功能');
            setToastType('error');
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
