import { updateNote, inlineCSS } from '../utils';
import { LEVEL1_COLORS, LEVEL2_COLORS } from '../colorConfig';

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

export function reset(visibility, setData, setSelected, notesElementRef, data, updateNote) {
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
}

export function saveSVG(selected, setSelected, data, updateNote, connectionToolbarVisible, setConnectionToolbarVisible, svgElementRef, inlineCSS) {
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

  // 隐藏工具栏
  if (connectionToolbarVisible) {
    setConnectionToolbarVisible(false);
  }

  const svgCopy = inlineCSS(svgElementRef.current);
  const svgData = svgCopy.outerHTML;
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const link = document.createElement('a');
  link.href = svgUrl;
  link.download = 'fretboard-diagram.svg';
  link.click();
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
