import React, { useState, useEffect, useRef, useCallback } from 'react';
import './fretboard.css';
import { CONSTS } from './constants';
import { updateNote, inlineCSS, noteToSolfege, getLevel2Color, calculateConnectionColor, reduceColorSaturation, detectNoteAtPosition, calculateArcPath, getPointOnNoteEdge, getPointOnPathAtDistance } from './utils';
import { initColorCSSVariables, LEVEL1_COLORS, LEVEL2_COLORS, getLevel1FillColor } from './colorConfig';
import PianoKeyboard from './PianoKeyboard';

// 第一层级颜色顺序（从 colorConfig.js 中 LEVEL1_COLORS 自动获取）
const LEVEL1_COLOR_ORDER = Object.keys(LEVEL1_COLORS);

// 第二层级颜色顺序（从 colorConfig.js 中 LEVEL2_COLORS 自动获取）
const LEVEL2_COLOR_ORDER = Object.keys(LEVEL2_COLORS);

function Fretboard() {
  const [selected, setSelected] = useState(null);
  const [selectedColorLevel, setSelectedColorLevel] = useState(null); // 1 | 2 | null
  const [selectedColor, setSelectedColor] = useState(null); // 当前选中的调色盘颜色名称
  const [hoveredNoteId, setHoveredNoteId] = useState(null); // 当前hover的note ID（用于x键删除）
  const [visibility, setVisibility] = useState('transparent');
  const [startFret, setStartFret] = useState(0);
  const [endFret, setEndFret] = useState(15);
  const [enharmonic, setEnharmonic] = useState(1); // 默认降号
  const [displayMode, setDisplayMode] = useState('note'); // 默认音名模式
  const [rootNote, setRootNote] = useState(null); // 默认不选中任何琴键
  const [data, setData] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [editableText, setEditableText] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [editableDivVisible, setEditableDivVisible] = useState(false);
  const [editableDivX, setEditableDivX] = useState(0);
  const [editableDivY, setEditableDivY] = useState(0);
  const [currentDateTime, setCurrentDateTime] = useState('');
  
  // 连线相关state
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionStartNote, setConnectionStartNote] = useState(null);
  const [connectionStartPosition, setConnectionStartPosition] = useState(null);
  const [mousePosition, setMousePosition] = useState(null);
  const [previewHoverNote, setPreviewHoverNote] = useState(null);
  const [useColor2Level, setUseColor2Level] = useState(false); // 全局颜色层级：true表示使用color2，false表示使用color1
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [connectionToolbarVisible, setConnectionToolbarVisible] = useState(false);
  const [connectionToolbarPosition, setConnectionToolbarPosition] = useState({ x: 0, y: 0 });
  const [toolbarDropdown, setToolbarDropdown] = useState(null); // 'type' | 'arrow' | 'width' | 'curvature' | null
  const [toolbarDropdownDirection, setToolbarDropdownDirection] = useState('down'); // 'up' | 'down'
  
  // 撤销/重做历史记录
  const historyRef = useRef([]); // 历史记录数组
  const historyIndexRef = useRef(-1); // 当前历史记录索引
  const isUndoingRef = useRef(false); // 是否正在执行撤销操作
  
  // 撤销/重做历史记录
  const [history, setHistory] = useState([]); // 历史记录数组
  const [historyIndex, setHistoryIndex] = useState(-1); // 当前历史记录索引
  const toolbarRef = useRef(null);
  const buttonClickRef = useRef({ type: false, arrow: false }); // 防止按钮重复点击
  const dataRef = useRef(data); // 存储最新的 data 状态，避免闭包问题
  
  const svgElementRef = useRef(null);
  const notesElementRef = useRef(null);
  const editableDivRef = useRef(null);
  const selectedTimeoutRef = useRef(null);

  const numFrets = endFret - startFret;
  const fretboardWidth = CONSTS.fretWidth * numFrets;
  // 0品需要额外的空间：CONSTS.fretWidth / 2，所以左边距需要增加
  const leftOffset = CONSTS.offsetX + CONSTS.fretWidth / 2;
  const svgWidth = fretboardWidth + leftOffset + CONSTS.offsetX;
  
  // 计算SVG的viewBox，让0品可见（0品的x坐标是CONSTS.offsetX - CONSTS.fretWidth / 2）
  // 0品的左边缘是 x - circleRadius，需要确保viewBox包含这个位置
  const zeroFretX = CONSTS.offsetX - CONSTS.fretWidth / 2; // 0品的x坐标
  const zeroFretLeftEdge = zeroFretX - CONSTS.circleRadius; // 0品的左边缘
  const svgViewBoxX = zeroFretLeftEdge - 5; // 额外5px边距，确保0品完全可见
  const svgViewBoxWidth = svgWidth - svgViewBoxX;
  
  // 计算SVG高度，确保包含顶部和底部的marker（品数）
  // 底部marker的y坐标是：CONSTS.offsetY + CONSTS.fretHeight + CONSTS.stringSpacing
  // 顶部marker的y坐标是：CONSTS.offsetY - CONSTS.stringSpacing * 0.7
  const bottomMarkerY = CONSTS.offsetY + CONSTS.fretHeight + CONSTS.stringSpacing;
  const topMarkerY = CONSTS.offsetY - CONSTS.stringSpacing * 0.7;
  const svgHeight = bottomMarkerY + 20; // 底部marker下方额外20px边距
  const svgViewBoxY = topMarkerY - 20; // 顶部marker上方额外20px边距
  const svgViewBoxHeight = svgHeight - svgViewBoxY;

  // 初始化颜色CSS变量
  useEffect(() => {
    initColorCSSVariables();
  }, []);
  
  // 同步 dataRef
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const initialEndFret = Math.min(
      Math.floor((window.innerWidth - 2 * CONSTS.offsetX) / CONSTS.fretWidth),
      15
    );
    setEndFret(initialEndFret);
  }, []);

  // 更新当前日期时间
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const year = String(now.getFullYear()).slice(-2);
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setCurrentDateTime(`${year}-${month}-${day} ${hours}:${minutes}:${seconds}`);
    };
    
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // 自动解除selected状态（0.5秒后）
  useEffect(() => {
    // 清除之前的定时器
    if (selectedTimeoutRef.current) {
      clearTimeout(selectedTimeoutRef.current);
      selectedTimeoutRef.current = null;
    }
    
    // 如果selected不为null，设置0.5秒后自动解除
    if (selected) {
      selectedTimeoutRef.current = setTimeout(() => {
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
        selectedTimeoutRef.current = null;
      }, 500);
    }
    
    // 清理函数
    return () => {
      if (selectedTimeoutRef.current) {
        clearTimeout(selectedTimeoutRef.current);
        selectedTimeoutRef.current = null;
      }
    };
  }, [selected, data]);

  const computeNoteIndex = useCallback((fret, string) => {
    const interval = CONSTS.stringIntervals[string] + fret + 1;
    return interval % 12;
  }, []);

  const computeNoteName = useCallback((fret, string) => {
    const noteIndex = computeNoteIndex(fret, string);
    return CONSTS.notes[enharmonic][noteIndex];
  }, [enharmonic, computeNoteIndex]);

  const setFretWindow = useCallback((fretWindow) => {
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
  }, [startFret, endFret, selected, data]);

  const generateNotes = useCallback(() => {
    const notes = [];
    
    for (let j = 0; j < CONSTS.numStrings; j++) {
      const noteId = `o-s${j}`;
      // 调整0品位置，使其与相邻品位的间隔相同
      // 第一个品位的x坐标是：CONSTS.offsetX + CONSTS.fretWidth / 2
      // 为了让0品和第一个品位之间的距离等于相邻品位之间的距离（CONSTS.fretWidth）
      // 0品的x坐标应该是：CONSTS.offsetX + CONSTS.fretWidth / 2 - CONSTS.fretWidth = CONSTS.offsetX - CONSTS.fretWidth / 2
      const x = CONSTS.offsetX - CONSTS.fretWidth / 2;
      const y = CONSTS.offsetY + CONSTS.stringSpacing * j;
      const noteData = data[noteId] || {};
      
      let displayName;
      if (noteData.noteText) {
        // 如果用户手动编辑了文本，优先使用编辑的文本
        displayName = noteData.noteText;
      } else if (displayMode === 'solfege' && rootNote !== null) {
        // 唱名模式（需要选中根音）
        const noteIndex = computeNoteIndex(-1, j);
        displayName = noteToSolfege(noteIndex, rootNote, enharmonic);
      } else {
        // 音名模式
        displayName = computeNoteName(-1, j);
      }
      
      notes.push({
        id: noteId,
        x,
        y,
        noteName: displayName,
        isOpen: true,
        data: noteData
      });
    }
    
    for (let i = startFret; i < endFret; i++) {
      for (let j = 0; j < CONSTS.numStrings; j++) {
        const noteId = `f${i}-s${j}`;
        const x = CONSTS.offsetX + (CONSTS.fretWidth / 2) + CONSTS.fretWidth * (i - startFret);
        const y = CONSTS.offsetY + CONSTS.stringSpacing * j;
        const noteData = data[noteId] || {};
        
        let displayName;
        if (noteData.noteText) {
          // 如果用户手动编辑了文本，优先使用编辑的文本
          displayName = noteData.noteText;
        } else if (displayMode === 'solfege' && rootNote !== null) {
          // 唱名模式（需要选中根音）
          const noteIndex = computeNoteIndex(i, j);
          displayName = noteToSolfege(noteIndex, rootNote, enharmonic);
        } else {
          // 音名模式
          displayName = computeNoteName(i, j);
        }
        
        notes.push({
          id: noteId,
          x,
          y,
          noteName: displayName,
          isOpen: false,
          data: noteData
        });
      }
    }
    
    return notes;
  }, [startFret, endFret, data, computeNoteName, computeNoteIndex, displayMode, rootNote, enharmonic]);

  const generateMarkers = useCallback(() => {
    const filteredMarkers = CONSTS.markers.filter(i => i > startFret && i <= endFret);
    const markers = [];
    
    // 底部marker
    filteredMarkers.forEach(i => {
      markers.push({
        x: CONSTS.offsetX + (i - 1 - startFret) * CONSTS.fretWidth + (CONSTS.fretWidth / 2),
        y: CONSTS.offsetY + CONSTS.fretHeight + CONSTS.stringSpacing,
        number: i,
        position: 'bottom'
      });
    });
    
    // 顶部marker（使用相对距离）
    filteredMarkers.forEach(i => {
      markers.push({
        x: CONSTS.offsetX + (i - 1 - startFret) * CONSTS.fretWidth + (CONSTS.fretWidth / 2),
        y: CONSTS.offsetY - CONSTS.stringSpacing * 0.7, // 使用stringSpacing的70%作为padding
        number: i,
        position: 'top'
      });
    });
    
    return markers;
  }, [startFret, endFret]);

  const generateFretPath = useCallback(() => {
    let path = `M ${CONSTS.offsetX} ${CONSTS.offsetY}`;
    for (let i = startFret; i < endFret + 1; i++) {
      const factor = (i - startFret) % 2 === 0 ? 1 : -1;
      path += ` v ${factor * CONSTS.fretHeight}`;
      path += ` m ${CONSTS.fretWidth} 0`;
    }
    return path;
  }, [startFret, endFret]);

  const generateStringPath = useCallback((stringIndex) => {
    const y = CONSTS.offsetY + stringIndex * CONSTS.stringSpacing;
    return `M ${CONSTS.offsetX} ${y} h ${fretboardWidth}`;
  }, [fretboardWidth]);

  const notes = generateNotes();
  const markers = generateMarkers();
  const fretPath = generateFretPath();
  
  // 获取连线数据
  const connections = React.useMemo(() => {
    return (data && data.connections) ? data.connections : {};
  }, [data]);
  
  // 监听连线数据变化，输出日志（只在变化时输出）
  const connectionsRef = useRef(null);
  useEffect(() => {
    const connectionsStr = JSON.stringify(connections);
    const prevConnectionsStr = connectionsRef.current;
    
    // 只在连线数据真正变化时输出日志
    if (connectionsStr !== prevConnectionsStr) {
      const connectionsCount = Object.keys(connections).length;
      if (connectionsCount > 0) {
        console.log('[连线数据变化]', {
          connectionsCount,
          connections: Object.values(connections).map(conn => ({
            id: conn.id,
            startNoteId: conn.startNoteId,
            endNoteId: conn.endNoteId,
            type: conn.type,
            color: conn.color,
            gradientColors: conn.gradientColors
          }))
        });
      }
      connectionsRef.current = connectionsStr;
    }
  }, [connections]);
  
  // 获取note位置
  const getNotePosition = useCallback((noteId) => {
    const note = notes.find(n => n.id === noteId);
    if (note) {
      return { x: note.x, y: note.y };
    }
    return null;
  }, [notes]);
  
  // 检测下拉菜单应该向上还是向下展开
  const detectDropdownDirection = useCallback((buttonElement) => {
    if (!buttonElement || !toolbarRef.current || !svgElementRef.current) {
      console.log('[检测方向] 缺少元素，返回down');
      return 'down';
    }
    
    const buttonRect = buttonElement.getBoundingClientRect();
    const svgRect = svgElementRef.current.getBoundingClientRect();
    
    // 计算按钮相对于 SVG 的位置
    const buttonTopInSvg = buttonRect.top - svgRect.top;
    const buttonBottomInSvg = buttonRect.bottom - svgRect.top;
    const svgHeight = svgRect.height;
    
    // 计算按钮在 SVG 内部下方和上方的可用空间
    const spaceBelow = svgHeight - buttonBottomInSvg;
    const spaceAbove = buttonTopInSvg;
    
    // 估算下拉菜单高度（大约 150px，加上一些边距）
    const estimatedMenuHeight = 160;
    
    // 计算按钮在 SVG 中的位置比例（0 = 顶部，1 = 底部）
    const buttonPositionRatio = buttonBottomInSvg / svgHeight;
    
    console.log('[检测方向]', {
      spaceBelow,
      spaceAbove,
      estimatedMenuHeight,
      buttonTopInSvg,
      buttonBottomInSvg,
      svgHeight,
      buttonPositionRatio
    });
    
    // 如果下方空间不足，必须向上展开
    if (spaceBelow < estimatedMenuHeight) {
      if (spaceAbove >= estimatedMenuHeight) {
        console.log('[检测方向] 返回up（下方空间不足）');
        return 'up';
      }
    }
    
    // 如果按钮位置很靠下（超过 SVG 的40%），且上方空间足够，向上展开（进一步降低阈值）
    if (buttonPositionRatio > 0.4 && spaceAbove >= estimatedMenuHeight) {
      console.log('[检测方向] 返回up（按钮位置靠下）');
      return 'up';
    }
    
    // 如果上方空间大于下方空间，且上方空间足够，向上展开
    if (spaceAbove > spaceBelow && spaceAbove >= estimatedMenuHeight) {
      console.log('[检测方向] 返回up（上方空间更大）');
      return 'up';
    }
    
    // 如果按钮位置在 SVG 下半部分（超过35%），且上方空间足够，向上展开（更宽松的条件）
    if (buttonPositionRatio > 0.35 && spaceAbove >= estimatedMenuHeight && spaceAbove > spaceBelow * 0.6) {
      console.log('[检测方向] 返回up（按钮在下半部分且上方空间足够）');
      return 'up';
    }
    
    // 如果上方空间接近下方空间（差距不大），且上方空间足够，向上展开
    if (spaceAbove >= estimatedMenuHeight && spaceAbove > spaceBelow * 0.5 && spaceBelow < estimatedMenuHeight * 1.5) {
      console.log('[检测方向] 返回up（上方空间接近下方且足够）');
      return 'up';
    }
    
    console.log('[检测方向] 返回down');
    return 'down';
  }, []);

  // 打开连线工具栏
  const openConnectionToolbar = useCallback((connectionId) => {
    const conn = connections[connectionId];
    if (!conn) return;
    
    // 计算连线的中点位置
    const startPos = getNotePosition(conn.startNoteId);
    const endPos = getNotePosition(conn.endNoteId);
    if (!startPos || !endPos) return;
    
    // 计算中点
    const midX = (startPos.x + endPos.x) / 2;
    const midY = (startPos.y + endPos.y) / 2;
    
    // 将工具栏放在连线下方（y坐标加上偏移量，避免遮挡连线）
    setConnectionToolbarPosition({ x: midX - 150, y: midY + 20 });
    setSelectedConnection(connectionId);
    setConnectionToolbarVisible(true);
    setToolbarDropdown(null);
  }, [connections, getNotePosition]);

  // 处理连线右键菜单
  const handleConnectionContextMenu = useCallback((event, connectionId) => {
    event.preventDefault();
    event.stopPropagation();
    openConnectionToolbar(connectionId);
  }, [openConnectionToolbar]);

  // 处理连线左键点击
  const handleConnectionClick = useCallback((event, connectionId) => {
    event.stopPropagation();
    openConnectionToolbar(connectionId);
  }, [openConnectionToolbar]);

  // 当下拉菜单打开时，重新检测方向（确保 DOM 已更新）
  useEffect(() => {
    if (toolbarDropdown && toolbarRef.current) {
      // 使用 setTimeout 确保 DOM 已更新
      setTimeout(() => {
        const buttonSelector = `.toolbar-icon-btn[title="${toolbarDropdown === 'type' ? '类型' : toolbarDropdown === 'arrow' ? '箭头' : toolbarDropdown === 'width' ? '粗细' : '弧度'}"]`;
        const button = toolbarRef.current?.querySelector(buttonSelector);
        if (button) {
          const direction = detectDropdownDirection(button);
          if (direction !== toolbarDropdownDirection) {
            console.log('[useEffect] 重新检测方向', { old: toolbarDropdownDirection, new: direction });
            setToolbarDropdownDirection(direction);
          }
        }
      }, 0);
    }
  }, [toolbarDropdown, detectDropdownDirection, toolbarDropdownDirection]);

  // 当note颜色改变时，更新所有以该note为起点或终点的连线颜色
  const prevNoteColorsRef = useRef({});
  
  useEffect(() => {
    if (!data.connections) return;
    
    // 遍历所有连线，检查起点和终点note的颜色是否改变
    const connectionsToUpdate = {};
    const currentNoteColors = {};
    
    Object.keys(data.connections).forEach(connId => {
      const conn = data.connections[connId];
      if (!conn.startNoteId || !conn.endNoteId) return;
      
      const startNoteData = data[conn.startNoteId];
      const endNoteData = data[conn.endNoteId] || {};
      
      if (!startNoteData) return;
      
      // 获取起点和终点note的color1和color2
      const startColor1 = startNoteData.color || 'white';
      const startColor2 = startNoteData.color2 || null;
      const endColor1 = endNoteData.color || 'white';
      const endColor2 = endNoteData.color2 || null;
      
      // 从gradientColors中获取创建连线时使用的颜色
      const storedStartColor = conn.gradientColors?.start;
      const storedEndColor = conn.gradientColors?.end;
      
      // 如果gradientColors为null（旧数据），跳过更新，保持原样
      if (!conn.gradientColors) {
        return;
      }
      
      // 判断创建连线时使用的是color1还是color2
      // 如果storedStartColor等于当前的color1，说明创建时使用的是color1
      // 如果storedStartColor等于当前的color2，说明创建时使用的是color2
      // 如果都不匹配，可能是颜色改变了，需要重新判断
      let startColor = startColor1;
      let endColor = endColor1;
      
      if (storedStartColor) {
        if (storedStartColor === startColor2 && startColor2 !== null) {
          // 创建时使用的是color2，现在也使用color2
          startColor = startColor2;
        } else if (storedStartColor === startColor1) {
          // 创建时使用的是color1，现在也使用color1
          startColor = startColor1;
        } else {
          // 颜色改变了，需要判断应该使用哪个层级
          // 如果storedStartColor在color1和color2中都不存在，说明颜色改变了
          // 保持使用color1（默认）
          startColor = startColor1;
        }
      }
      
      if (storedEndColor) {
        if (storedEndColor === endColor2 && endColor2 !== null) {
          // 创建时使用的是color2，现在也使用color2
          endColor = endColor2;
        } else if (storedEndColor === endColor1) {
          // 创建时使用的是color1，现在也使用color1
          endColor = endColor1;
        } else {
          // 颜色改变了，需要判断应该使用哪个层级
          // 如果storedEndColor在color1和color2中都不存在，说明颜色改变了
          // 保持使用color1（默认）
          endColor = endColor1;
        }
      }
      
      // 记录当前颜色
      currentNoteColors[conn.startNoteId] = startColor;
      currentNoteColors[conn.endNoteId] = endColor;
      
      // 如果颜色改变了，需要更新连线
      if (storedStartColor !== startColor || storedEndColor !== endColor) {
        // 重新计算连线颜色
        const tempStartNoteData = { color: startColor };
        const tempEndNoteData = { color: endColor };
        const newConnectionColor = calculateConnectionColor(tempStartNoteData, tempEndNoteData, connId);
        
        // 判断是否需要渐变
        const needsGradient = newConnectionColor.startsWith('gradient-') || 
                             (startColor !== endColor && startColor !== 'white' && endColor !== 'white');
        // 即使不需要渐变，也要保存gradientColors，这样useEffect才能知道创建时使用的是哪个颜色层级
        const newGradientColors = { start: startColor, end: endColor };
        
        // 只更新颜色相关属性，保留其他所有属性（type, arrowDirection, strokeWidth, arcCurvature等）
        connectionsToUpdate[connId] = {
          color: newConnectionColor,
          gradientColors: newGradientColors
        };
      }
    });
    
    // 如果有连线需要更新，批量更新
    if (Object.keys(connectionsToUpdate).length > 0) {
      setData(prevData => {
        const newData = { ...prevData };
        if (!newData.connections) {
          newData.connections = {};
        }
        Object.keys(connectionsToUpdate).forEach(connId => {
          // 只更新颜色相关属性，保留其他属性（type, arrowDirection, strokeWidth, arcCurvature等）
          if (newData.connections[connId]) {
            newData.connections[connId] = {
              ...newData.connections[connId],
              ...connectionsToUpdate[connId]
            };
          } else {
            newData.connections[connId] = connectionsToUpdate[connId];
          }
        });
        return newData;
      });
    }
    
    // 更新颜色记录
    prevNoteColorsRef.current = currentNoteColors;
  }, [data]);

  useEffect(() => {
    notes.forEach(note => {
      if (!(note.id in data)) {
        setData(prevData => ({
          ...prevData,
          [note.id]: { type: 'note', color: 'white', visibility: visibility }
        }));
      }
    });
    
    if (selected) {
      const noteIds = notes.map(n => n.id);
      if (!noteIds.includes(selected.id)) {
        setSelected(null);
      }
    }
  }, [notes, selected, data, visibility]);

  // 在DOM更新后，确保所有音符的类名正确应用（完全按照原始代码逻辑）
  useEffect(() => {
    if (notesElementRef.current) {
      notes.forEach(note => {
        const noteElement = document.getElementById(note.id);
        if (noteElement) {
          const noteData = data[note.id] || { type: 'note', color: 'white', visibility: visibility };
          updateNote(noteElement, data, { 
            type: noteData.type || 'note',
            color: noteData.color || 'white',
            color2: noteData.color2 || null,
            visibility: noteData.visibility || visibility
          });
        }
      });
    }
  }, [notes, data, visibility]);

  const editNoteLabel = useCallback((noteId, noteElement) => {
    const noteData = data[noteId] || {};
    const textElem = noteElement?.querySelector('text');
    // 优先使用手动编辑的文本，否则使用当前显示的文本（可能是唱名或音名）
    const noteName = noteData.noteText || textElem?.textContent || textElem?.getAttribute('data-note') || '';
    setEditableText(noteName);
    setEditingNote(noteId);
    
    const x = parseFloat(noteElement?.getAttribute('data-x') || '0');
    const y = parseFloat(noteElement?.getAttribute('data-y') || '0');
    setEditableDivX(x - CONSTS.circleRadius);
    setEditableDivY(y - CONSTS.circleRadius + 4);
    setEditableDivVisible(true);
  }, [data]);

  const handleNoteClick = useCallback((event, noteId) => {
    event.stopPropagation();
    const noteElement = event.currentTarget;
    noteElement.focus();
    
    const noteData = data[noteId] || { type: 'note', color: 'white', visibility: visibility };
    const currentColor = noteData.color || 'white';
    const currentColor2 = noteData.color2 || null;
    const currentVisibility = noteData.visibility || visibility;
    
    // 连线模式处理
    if (connectionMode) {
      // 如果note是visible的，优先执行连线逻辑
      if (currentVisibility === 'visible') {
        if (!connectionStartNote) {
          // 第一次点击：记录起点
          const x = parseFloat(noteElement.getAttribute('data-x') || '0');
          const y = parseFloat(noteElement.getAttribute('data-y') || '0');
          setConnectionStartNote(noteId);
          setConnectionStartPosition({ x, y });
          return;
        } else {
          // 第二次点击：创建连线
          if (connectionStartNote === noteId) {
            // 点击同一个note，取消连线
            setConnectionStartNote(null);
            setConnectionStartPosition(null);
            setMousePosition(null);
            setPreviewHoverNote(null);
            setUseColor2Level(false);
            return;
          }
          
          // 检查终点note是否visible
          if (currentVisibility !== 'visible') {
            return; // 不visible的note不能作为终点
          }
          
          // 检查起点note是否仍然visible
          const startNoteElement = document.getElementById(connectionStartNote);
          let startNoteData = data[connectionStartNote] || { type: 'note', color: 'white', visibility: visibility };
          
          console.log('[创建连线] 起点note数据', {
            noteId: connectionStartNote,
            startNoteData,
            hasColor2: !!startNoteData.color2,
            color: startNoteData.color,
            color2: startNoteData.color2
          });
          
          // 如果起点note有color2，考虑用户通过中键切换的逻辑
          // 如果用户在起点note上中键切换了颜色（previewHoverNote为null时切换的是起点），应该使用切换后的颜色
          if (startNoteData.color2 && startNoteData.color2 !== null) {
            const color1IsWhite = !startNoteData.color || startNoteData.color === 'white';
            
            if (color1IsWhite) {
              // color1是white，必须使用color2
              startNoteData = { ...startNoteData, color: startNoteData.color2 };
              console.log('[创建连线] 起点使用color2（color1是white）', {
                originalColor: startNoteData.color,
                color2: startNoteData.color2
              });
            } else {
              // color1不是white，根据全局颜色层级决定使用color1还是color2
              // useColor2Level: true表示使用color2层级，false表示使用color1层级
              if (useColor2Level) {
                // 使用color2层级
                const originalColor1 = startNoteData.color; // 保存原始的color1
                startNoteData = { ...startNoteData, color: startNoteData.color2 };
                console.log('[创建连线] 起点使用color2（全局层级）', {
                  originalColor1: originalColor1,
                  color2: startNoteData.color2,
                  finalColor: startNoteData.color2,
                  useColor2Level
                });
              } else {
                // 使用color1层级，保持原color1
                console.log('[创建连线] 起点使用color1（全局层级）', {
                  color: startNoteData.color,
                  color2: startNoteData.color2,
                  useColor2Level
                });
              }
            }
          } else {
            // 从DOM元素的class中提取实际颜色（如果data中没有颜色）
            let actualStartColorFromData = startNoteData.color;
            if (!actualStartColorFromData || actualStartColorFromData === 'white') {
              // 尝试从DOM元素的class中提取颜色
              if (startNoteElement) {
                const classList = startNoteElement.className?.baseVal?.split(' ') || startNoteElement.className?.split(' ') || [];
                const colorClass = classList.find(cls => LEVEL1_COLOR_ORDER.includes(cls));
                if (colorClass) {
                  actualStartColorFromData = colorClass;
                  console.log('[创建连线] 从DOM提取起点颜色', { 
                    noteId: connectionStartNote, 
                    colorFromData: startNoteData.color,
                    colorFromDOM: colorClass 
                  });
                }
              }
            }
            startNoteData = { ...startNoteData, color: actualStartColorFromData || 'white' };
          }
          
          // 更新startNoteData中的颜色
          const startNoteDataWithColor = startNoteData;
          
          const startVisibility = startNoteDataWithColor.visibility || visibility;
          if (startVisibility !== 'visible') {
            // 起点不再是visible，取消连线
            setConnectionStartNote(null);
            setConnectionStartPosition(null);
            setMousePosition(null);
            setPreviewHoverNote(null);
            setUseColor2Level(false);
            return;
          }
          
          // 创建连线
          let endNoteData = noteData;
          console.log('[创建连线] 开始', {
            noteId,
            endNoteData,
            useColor2Level,
            hasColor2: !!endNoteData.color2,
            color: endNoteData.color,
            color2: endNoteData.color2
          });
          
          // 如果终点note有color2，优先使用color2（与起点逻辑一致）
          // 如果color1是white（或不存在）但color2存在，必须使用color2
          // 如果color1不是white，才考虑用户通过中键切换的逻辑
          if (endNoteData.color2 && endNoteData.color2 !== null) {
            const color1IsWhite = !endNoteData.color || endNoteData.color === 'white';
            
            if (color1IsWhite) {
              // color1是white，必须使用color2
              const originalColor = endNoteData.color;
              endNoteData = { ...endNoteData, color: endNoteData.color2 };
              console.log('[创建连线] 终点使用color2（color1是white）', { 
                originalColor, 
                newColor: endNoteData.color2
              });
            } else {
              // color1不是white，根据全局颜色层级决定使用color1还是color2
              // useColor2Level: true表示使用color2层级，false表示使用color1层级
              if (useColor2Level) {
                // 使用color2层级
                const originalColor = endNoteData.color;
                endNoteData = { ...endNoteData, color: endNoteData.color2 };
                console.log('[创建连线] 终点使用color2（全局层级）', {
                  originalColor,
                  newColor: endNoteData.color2,
                  useColor2Level
                });
              } else {
                // 使用color1层级，确保使用color1（不修改endNoteData.color，因为它已经是color1了）
                // 但是需要确保endNoteData.color确实是color1，而不是被其他地方修改过
                const originalColor = endNoteData.color;
                // endNoteData.color 应该已经是color1了，不需要修改
                console.log('[创建连线] 终点使用color1（全局层级）', {
                  originalColor: originalColor,
                  color: endNoteData.color,
                  color2: endNoteData.color2,
                  useColor2Level,
                  noteId
                });
              }
            }
          }
          
          // 注意：endNoteData.color 已经根据 useColor2Level 设置好了，不需要再从DOM提取
          // 因为我们已经根据全局颜色层级选择了正确的颜色（color1 或 color2）
          
          // 检查是否已存在相同起点和终点的连线，如果存在则删除旧的
          const existingConnectionId = Object.keys(connections).find(connId => {
            const conn = connections[connId];
            return (conn.startNoteId === connectionStartNote && conn.endNoteId === noteId) ||
                   (conn.startNoteId === noteId && conn.endNoteId === connectionStartNote);
          });
          
          const connectionId = existingConnectionId || `conn-${Date.now()}`;
          
          // 计算颜色
          const connectionColor = calculateConnectionColor(startNoteDataWithColor, endNoteData, connectionId);
          console.log('[创建连线] 计算颜色', {
            startColor: startNoteDataWithColor.color,
            endColor: endNoteData.color,
            connectionColor
          });
          
          // 创建连线数据
          // 使用切换后的颜色来判断是否需要渐变
          const actualStartColor = startNoteDataWithColor.color || 'white';
          const actualEndColor = endNoteData.color || 'white';
          
          // 判断是否需要渐变：如果connectionColor是渐变ID，或者颜色不同且都不是white
          const isGradientColor = connectionColor.startsWith('gradient-');
          const needsGradient = isGradientColor || (actualStartColor !== actualEndColor && actualStartColor !== 'white' && actualEndColor !== 'white');
          // 即使不需要渐变，也要保存gradientColors，这样useEffect才能知道创建时使用的是哪个颜色层级
          const gradientColors = { start: actualStartColor, end: actualEndColor };
          
          console.log('[创建连线] 渐变判断', {
            actualStartColor,
            actualEndColor,
            needsGradient,
            isGradientColor,
            gradientColors,
            connectionColor
          });
          
          // 如果connectionColor是渐变ID但gradientColors是null，说明有问题，需要修复
          if (isGradientColor && !gradientColors) {
            console.warn('[创建连线] 警告：connectionColor是渐变ID但gradientColors是null，强制设置gradientColors', {
              actualStartColor,
              actualEndColor
            });
            // 强制设置gradientColors
            const forcedGradientColors = { start: actualStartColor, end: actualEndColor };
            // 如果存在旧连线，保留其属性（如strokeWidth、arrowDirection等），只更新颜色相关属性
            const existingConnection = existingConnectionId ? connections[existingConnectionId] : null;
            const newConnection = {
              id: connectionId,
              startNoteId: connectionStartNote,
              endNoteId: noteId,
              type: existingConnection?.type || 'line',
              hasArrow: existingConnection?.hasArrow || false,
              arrowDirection: existingConnection?.arrowDirection || 'none',
              strokeWidth: existingConnection?.strokeWidth || 3,
              arcCurvature: existingConnection?.arcCurvature || 0.7,
              color: connectionColor,
              gradientColors: forcedGradientColors
            };
            console.log('[创建连线] 最终连线数据（强制渐变）', newConnection);
            setData(prevData => {
              const newData = { ...prevData };
              if (!newData.connections) {
                newData.connections = {};
              }
              newData.connections[connectionId] = newConnection;
              return newData;
            });
            
            // 清除连线模式状态
            setConnectionStartNote(null);
            setConnectionStartPosition(null);
            setMousePosition(null);
            setPreviewHoverNote(null);
            setUseColor2Level(false);
            return;
          }
          
          // 如果存在旧连线，保留其属性（如strokeWidth、arrowDirection等），只更新颜色相关属性
          const existingConnection = existingConnectionId ? connections[existingConnectionId] : null;
          const newConnection = {
            id: connectionId,
            startNoteId: connectionStartNote,
            endNoteId: noteId,
            type: existingConnection?.type || 'line',
            hasArrow: existingConnection?.hasArrow || false,
            arrowDirection: existingConnection?.arrowDirection || 'none',
            strokeWidth: existingConnection?.strokeWidth || 3,
            arcCurvature: existingConnection?.arcCurvature || 0,
            color: connectionColor,
            gradientColors: gradientColors
          };
          
          console.log('[创建连线] 最终连线数据', newConnection);
          
          setData(prevData => {
            const newData = { ...prevData };
            if (!newData.connections) {
              newData.connections = {};
            }
            newData.connections[connectionId] = newConnection;
            return newData;
          });
          
          // 清除连线模式状态
          setConnectionStartNote(null);
          setConnectionStartPosition(null);
          setMousePosition(null);
          setPreviewHoverNote(null);
          setUseColor2Level(false);
          return;
        }
      } else {
        // 如果note不是visible的，且选中了调色盘，则执行相应逻辑（继续执行后面的代码）
        // 如果note不是visible的，且没有选中调色盘，则return
        if (!selectedColorLevel) {
          return; // 不visible的note且没有选中调色盘，不执行任何操作
        }
        // 如果note不是visible的，但选中了调色盘，继续执行后面的逻辑
      }
    }
    
    // 如果选中了第一层级调色盘
    if (selectedColorLevel === 1 && selectedColor !== null) {
      // 如果音符当前第一层级颜色与选中的调色盘颜色相同
      if (currentColor === selectedColor) {
        // 如果音符是visible状态
        if (currentVisibility === 'visible') {
          // 如果音符还有第二层级颜色，只清除第一层级颜色，保持visible状态
          if (currentColor2 && currentColor2 !== null) {
            updateNote(noteElement, data, { color: 'white', visibility: 'visible' });
            setData(prevData => {
              const newData = { ...prevData };
              if (!(noteId in newData)) {
                newData[noteId] = {};
              }
              newData[noteId] = { ...newData[noteId], color: 'white', visibility: 'visible' };
              return newData;
            });
          } else {
            // 如果音符没有第二层级颜色，则切换为普通状态
            updateNote(noteElement, data, { color: 'white', visibility: visibility });
            setData(prevData => {
              const newData = { ...prevData };
              if (!(noteId in newData)) {
                newData[noteId] = {};
              }
              newData[noteId] = { ...newData[noteId], color: 'white', visibility: visibility };
              return newData;
            });
          }
        } else {
          // 如果音符不是visible状态，则切换为visible状态并保持颜色
          updateNote(noteElement, data, { color: selectedColor, visibility: 'visible' });
          setData(prevData => {
            const newData = { ...prevData };
            if (!(noteId in newData)) {
              newData[noteId] = {};
            }
            newData[noteId] = { ...newData[noteId], color: selectedColor, visibility: 'visible' };
            return newData;
          });
        }
      } else {
        // 如果音符当前颜色与选中的调色盘颜色不同，改变颜色并设置为visible
        updateNote(noteElement, data, { color: selectedColor, visibility: 'visible' });
        setData(prevData => {
          const newData = { ...prevData };
          if (!(noteId in newData)) {
            newData[noteId] = {};
          }
          newData[noteId] = { ...newData[noteId], color: selectedColor, visibility: 'visible' };
          return newData;
        });
      }
      return;
    }
    
    // 如果选中了第二层级调色盘
    if (selectedColorLevel === 2 && selectedColor !== null) {
      // 如果音符当前第二层级颜色与选中的调色盘颜色相同，清除第二层级颜色
      if (currentColor2 === selectedColor) {
        // 如果第一层级颜色是white（普通状态），清除第二层级后应该变成普通状态
        // 如果第一层级颜色不是white，清除第二层级后应该保持visible状态
        const newVisibility = (currentColor === 'white') ? visibility : 'visible';
        updateNote(noteElement, data, { color2: null, visibility: newVisibility });
        setData(prevData => {
          const newData = { ...prevData };
          if (!(noteId in newData)) {
            newData[noteId] = {};
          }
          newData[noteId] = { ...newData[noteId], color2: null, visibility: newVisibility };
          return newData;
        });
      } else {
        // 如果不同，设置第二层级颜色（保持visible状态，如果已经是visible）
        const newVisibility = currentVisibility === 'visible' ? 'visible' : 'visible';
        updateNote(noteElement, data, { color2: selectedColor, visibility: newVisibility });
        setData(prevData => {
          const newData = { ...prevData };
          if (!(noteId in newData)) {
            newData[noteId] = {};
          }
          newData[noteId] = { 
            ...newData[noteId], 
            color2: selectedColor, 
            visibility: newVisibility 
          };
          return newData;
        });
      }
      return;
    }
    
    // 如果没有选中调色盘，执行原来的选中逻辑
    // 如果点击的音符当前是visible状态，将其变回普通状态（颜色重置为white）
    if (currentVisibility === 'visible') {
      updateNote(noteElement, data, { color: 'white', color2: null, visibility: visibility });
      setData(prevData => {
        const newData = { ...prevData };
        if (!(noteId in newData)) {
          newData[noteId] = {};
        }
        newData[noteId] = { ...newData[noteId], color: 'white', color2: null, visibility: visibility };
        return newData;
      });
      return;
    }
    
    // 否则，选中音符
    if (selected) {
      const prevElement = selected.element || document.getElementById(selected.id);
      if (prevElement) {
        updateNote(prevElement, data, { visibility: 'visible' });
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
    updateNote(noteElement, data, { visibility: 'selected' });
    setData(prevData => {
      const newData = { ...prevData };
      if (!(noteId in newData)) {
        newData[noteId] = {};
      }
      newData[noteId] = { ...newData[noteId], visibility: 'selected' };
      return newData;
    });
    setSelected({ id: noteId, element: noteElement });
    
    // 暂时注释掉Ctrl+点击重命名功能
    // if (event.ctrlKey) {
    //   editNoteLabel(noteId, noteElement);
    // }
  }, [selected, selectedColorLevel, selectedColor, data, visibility, editNoteLabel, connectionMode, connectionStartNote, useColor2Level, previewHoverNote, connections]);

  const handleNoteContextMenu = useCallback((event, noteId) => {
    event.preventDefault();
    event.stopPropagation();
    const noteElement = event.currentTarget;
    
    if (selected) {
      const prevElement = selected.element || document.getElementById(selected.id);
      if (prevElement) {
        updateNote(prevElement, data, { visibility: 'visible' });
        setData(prevData => {
          const newData = { ...prevData };
          if (selected.id in newData) {
            newData[selected.id] = { ...newData[selected.id], visibility: 'visible' };
          }
          return newData;
        });
      }
    }
    updateNote(noteElement, data, { visibility: 'selected' });
    setData(prevData => {
      const newData = { ...prevData };
      if (!(noteId in newData)) {
        newData[noteId] = {};
      }
      newData[noteId] = { ...newData[noteId], visibility: 'selected' };
      return newData;
    });
    setSelected({ id: noteId, element: noteElement });
    // 暂时注释掉右键重命名功能
    // editNoteLabel(noteId, noteElement);
  }, [selected, data, editNoteLabel]);

  const finishEditing = useCallback(() => {
    if (editingNote) {
      const noteElement = document.getElementById(editingNote);
      if (noteElement) {
        if (editableText.trim()) {
          updateNote(noteElement, data, { noteText: editableText.trim() });
          setData(prevData => {
            const newData = { ...prevData };
            if (!(editingNote in newData)) {
              newData[editingNote] = {};
            }
            newData[editingNote] = { ...newData[editingNote], noteText: editableText.trim() };
            return newData;
          });
        } else {
          // 清空编辑文本时，删除 noteText，让 generateNotes 根据当前模式重新计算显示名称
          setData(prevData => {
            const newData = { ...prevData };
            if (editingNote in newData) {
              const noteData = { ...newData[editingNote] };
              delete noteData.noteText;
              newData[editingNote] = noteData;
            }
            return newData;
          });
        }
      }
    }
    setEditableDivVisible(false);
    setEditingNote(null);
    setEditableText('');
  }, [editingNote, editableText, data]);

  const deleteNote = useCallback(() => {
    if (selected) {
      const noteElement = selected.element || document.getElementById(selected.id);
      if (noteElement) {
        updateNote(noteElement, data, { 
          color: 'white', 
          color2: null,
          visibility: visibility 
        });
        setData(prevData => {
          const newData = { ...prevData };
          if (selected.id in newData) {
            newData[selected.id] = { ...newData[selected.id], color: 'white', color2: null, visibility: visibility };
            delete newData[selected.id].noteText;
          }
          // 删除与该note相关的所有连线
          if (newData.connections) {
            const connections = { ...newData.connections };
            Object.keys(connections).forEach(connId => {
              const conn = connections[connId];
              if (conn.startNoteId === selected.id || conn.endNoteId === selected.id) {
                delete connections[connId];
              }
            });
            newData.connections = connections;
          }
          return newData;
        });
        // 删除noteText后，让generateNotes重新计算显示名称
        // 不需要手动设置textContent，因为notes会重新生成并更新DOM
      }
      setSelected(null);
    }
  }, [selected, visibility, data]);

  const selectColor = useCallback((level, color) => {
    // 如果点击的是当前已选中的颜色和层级，则取消选中
    if (selectedColorLevel === level && selectedColor === color) {
      setSelectedColorLevel(null);
      setSelectedColor(null);
    } else {
      // 选择颜色时，不清除删除按钮的选中状态（可以同时选中）
      setSelectedColorLevel(level);
      setSelectedColor(color);
    }
  }, [selectedColorLevel, selectedColor]);

  // 循环选择第一层级颜色
  const cycleLevel1Color = useCallback(() => {
    if (selectedColorLevel === 1 && selectedColor) {
      // 如果当前已选中第一层级颜色，找到下一个
      const currentIndex = LEVEL1_COLOR_ORDER.indexOf(selectedColor);
      const nextIndex = (currentIndex + 1) % LEVEL1_COLOR_ORDER.length;
      selectColor(1, LEVEL1_COLOR_ORDER[nextIndex]);
    } else {
      // 如果未选中或选中其他层级，选择第一个颜色
      selectColor(1, LEVEL1_COLOR_ORDER[0]);
    }
  }, [selectedColorLevel, selectedColor, selectColor]);

  // 循环选择第二层级颜色
  const cycleLevel2Color = useCallback(() => {
    if (selectedColorLevel === 2 && selectedColor) {
      // 如果当前已选中第二层级颜色，找到下一个
      const currentIndex = LEVEL2_COLOR_ORDER.indexOf(selectedColor);
      const nextIndex = (currentIndex + 1) % LEVEL2_COLOR_ORDER.length;
      selectColor(2, LEVEL2_COLOR_ORDER[nextIndex]);
    } else {
      // 如果未选中或选中其他层级，选择第一个颜色
      selectColor(2, LEVEL2_COLOR_ORDER[0]);
    }
  }, [selectedColorLevel, selectedColor, selectColor]);


  const toggleVisibility = useCallback(() => {
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
    
    setData(prevData => {
      const newData = { ...prevData };
      for (const [key, value] of Object.entries(newData)) {
        // 跳过connections等非note数据
        if (key.startsWith('conn-')) {
          continue;
        }
        // 只更新非visible和selected的note
        if (value && typeof value === 'object' && value.visibility !== 'visible' && value.visibility !== 'selected') {
          newData[key] = { ...value, visibility: newVisibility };
        }
      }
      return newData;
    });
  }, [visibility, data]);

  const toggleEnharmonic = useCallback(() => {
    setEnharmonic(prev => (prev + 1) % 2);
  }, []);

  const reset = useCallback(() => {
    if (window.confirm("Do you really want to reset your diagram?")) {
      // 只重置点的颜色和visibility，保留音名（noteText）
      // 不改变displayMode，让notes根据当前的displayMode自动重新生成
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
      
      // 更新DOM中的note样式，但不改变textContent
      // textContent会根据当前的displayMode和noteText自动更新（通过generateNotes）
      if (notesElementRef.current) {
        for (const note of notesElementRef.current.children) {
          updateNote(note, data, { type: 'note', color: 'white', color2: null, visibility: visibility });
        }
      }
      setSelected(null);
    }
  }, [visibility, data]);

  const saveSVG = useCallback(() => {
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
  }, [selected, data, connectionToolbarVisible]);

  // 保存历史记录
  const saveToHistory = useCallback((newData) => {
    if (isUndoingRef.current) {
      // 如果正在执行撤销操作，不保存历史
      return;
    }
    
    const dataStr = JSON.stringify(newData);
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;
    
    // 如果当前不在历史记录的末尾，删除后面的记录（分支历史）
    const newHistory = currentHistory.slice(0, currentIndex + 1);
    // 添加新的历史记录
    newHistory.push(dataStr);
    // 限制历史记录数量（最多50条）
    if (newHistory.length > 50) {
      newHistory.shift();
      historyIndexRef.current = 49;
    } else {
      historyIndexRef.current = newHistory.length - 1;
    }
    historyRef.current = newHistory;
  }, []);

  // 撤销操作
  const undo = useCallback(() => {
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;
    
    if (currentIndex > 0) {
      isUndoingRef.current = true;
      const prevIndex = currentIndex - 1;
      const prevDataStr = currentHistory[prevIndex];
      if (prevDataStr) {
        try {
          const prevData = JSON.parse(prevDataStr);
          setData(prevData);
          historyIndexRef.current = prevIndex;
        } catch (e) {
          console.error('撤销失败：无法解析历史记录', e);
        }
      }
      // 使用 setTimeout 确保 setData 完成后再重置标志
      setTimeout(() => {
        isUndoingRef.current = false;
      }, 0);
    }
  }, []);

  // 监听 data 变化，保存历史记录
  const prevDataRef = useRef(JSON.stringify(data));
  useEffect(() => {
    const currentDataStr = JSON.stringify(data);
    if (currentDataStr !== prevDataRef.current && !isUndoingRef.current) {
      saveToHistory(data);
      prevDataRef.current = currentDataStr;
    }
  }, [data, saveToHistory]);

  // 初始化历史记录
  useEffect(() => {
    if (historyRef.current.length === 0) {
      const initialDataStr = JSON.stringify(data);
      historyRef.current = [initialDataStr];
      historyIndexRef.current = 0;
      prevDataRef.current = initialDataStr;
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl+Z 撤销
      if (event.ctrlKey && event.code === 'KeyZ' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      
      switch (event.code) {
        case 'Backspace':
        case 'Delete':
          if (selected) {
            deleteNote();
          }
          break;
        case 'KeyB':
          selectColor(1, 'blue');
          break;
        case 'KeyG':
          selectColor(1, 'green');
          break;
        case 'KeyS':
          // 切换连线工具
          setConnectionMode(prev => {
            if (prev) {
              // 退出连线模式时清除状态
              setConnectionStartNote(null);
              setConnectionStartPosition(null);
              setMousePosition(null);
              setPreviewHoverNote(null);
              setUseColor2Level(false);
            }
            return !prev;
          });
          break;
        case 'KeyR':
          selectColor(1, 'red');
          break;
        case 'KeyX':
          // 如果hover在某个note上，删除该note
          if (hoveredNoteId) {
            const noteElement = document.getElementById(hoveredNoteId);
            if (noteElement) {
              const noteData = data[hoveredNoteId] || {};
              const currentVisibility = noteData.visibility || visibility;
              // 只对visible状态的音符生效
              if (currentVisibility === 'visible') {
                updateNote(noteElement, data, { 
                  color: 'white', 
                  color2: null,
                  visibility: visibility 
                });
                setData(prevData => {
                  const newData = { ...prevData };
                  if (hoveredNoteId in newData) {
                    newData[hoveredNoteId] = { 
                      ...newData[hoveredNoteId], 
                      color: 'white', 
                      color2: null,
                      visibility: visibility 
                    };
                  }
                  // 删除与该note相关的所有连线
                  if (newData.connections) {
                    const connections = { ...newData.connections };
                    Object.keys(connections).forEach(connId => {
                      const conn = connections[connId];
                      if (conn.startNoteId === hoveredNoteId || conn.endNoteId === hoveredNoteId) {
                        delete connections[connId];
                      }
                    });
                    newData.connections = connections;
                  }
                  return newData;
                });
              }
            }
          }
          break;
        case 'KeyA':
          cycleLevel1Color();
          break;
        case 'KeyD':
          cycleLevel2Color();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected, deleteNote, selectColor, cycleLevel1Color, cycleLevel2Color, undo, hoveredNoteId, data, visibility]);

  const handleSvgClick = useCallback(() => {
    if (connectionMode && connectionStartNote) {
      // 在连线模式下，点击空白区域取消连线
      setConnectionStartNote(null);
      setConnectionStartPosition(null);
      setMousePosition(null);
      setPreviewHoverNote(null);
      setPreviewUseColor2(false);
      return;
    }
    
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
    
    // 点击外部区域关闭连线工具栏
    if (connectionToolbarVisible) {
      setConnectionToolbarVisible(false);
      setToolbarDropdown(null);
    }
  }, [selected, data, connectionMode, connectionStartNote, connectionToolbarVisible]);

  // 监听全局点击事件，关闭连线工具栏
  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (connectionToolbarVisible) {
        // 检查点击是否在工具栏内部
        const toolbarElement = document.querySelector('.connection-toolbar');
        if (toolbarElement && !toolbarElement.contains(event.target)) {
          setConnectionToolbarVisible(false);
          setToolbarDropdown(null);
        }
      }
    };

    if (connectionToolbarVisible) {
      // 延迟添加监听器，避免立即触发
      setTimeout(() => {
        document.addEventListener('click', handleDocumentClick);
      }, 0);
    }

    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [connectionToolbarVisible]);
  
  // 监听全局右键事件，取消连线功能
  useEffect(() => {
    const handleDocumentContextMenu = (event) => {
      if (connectionMode) {
        // 在连线模式下，右键取消连线工具
        event.preventDefault();
        setConnectionMode(false);
        setConnectionStartNote(null);
        setConnectionStartPosition(null);
        setMousePosition(null);
        setPreviewHoverNote(null);
        setPreviewUseColor2(false);
      }
    };

    if (connectionMode) {
      document.addEventListener('contextmenu', handleDocumentContextMenu);
    }

    return () => {
      document.removeEventListener('contextmenu', handleDocumentContextMenu);
    };
  }, [connectionMode]);
  
  // 处理SVG右键事件
  const handleSvgContextMenu = useCallback((event) => {
    if (connectionMode) {
      // 在连线模式下，右键取消连线工具
      event.preventDefault();
      setConnectionMode(false);
      setConnectionStartNote(null);
      setConnectionStartPosition(null);
      setMousePosition(null);
      setPreviewHoverNote(null);
      setPreviewUseColor2(false);
    }
  }, [connectionMode]);
  
  // 处理SVG鼠标移动
  const handleSvgMouseMove = useCallback((e) => {
    if (connectionMode && connectionStartNote && svgElementRef.current) {
      const svg = svgElementRef.current;
      const point = svg.createSVGPoint();
      point.x = e.clientX;
      point.y = e.clientY;
      const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
      setMousePosition({ x: svgPoint.x, y: svgPoint.y });
      
      // 检测鼠标是否在某个note上，并且该note必须是visible的
      const hoveredNote = detectNoteAtPosition(svgPoint.x, svgPoint.y, notes, CONSTS.circleRadius);
      if (hoveredNote) {
        const hoveredNoteData = data[hoveredNote.id] || { type: 'note', color: 'white', visibility: visibility };
        const hoveredVisibility = hoveredNoteData.visibility || visibility;
        // 只有visible的note才能作为预览终点
        if (hoveredVisibility === 'visible') {
          const prevHoverNote = previewHoverNote;
          setPreviewHoverNote(hoveredNote.id);
          // 如果切换到新的note，保持全局颜色层级不变（因为它是全局的）
        } else {
          setPreviewHoverNote(null);
        }
      } else {
        setPreviewHoverNote(null);
      }
    }
  }, [connectionMode, connectionStartNote, notes, data, visibility, previewHoverNote]);
  
  // 处理鼠标中键事件，切换预览note的颜色
  const handleSvgMouseDown = useCallback((e) => {
    // 如果点击的是工具栏按钮，不处理
    if (e.target.closest('.toolbar-icon-btn') || e.target.closest('.connection-toolbar')) {
      return;
    }
    console.log('[handleSvgMouseDown]', {
      connectionMode,
      connectionStartNote,
      previewHoverNote,
      button: e.button,
      target: e.target
    });
    
    if (connectionMode && connectionStartNote && e.button === 1) {
      // 鼠标中键（button === 1）
      e.preventDefault();
      e.stopPropagation();
      
      // 优先使用悬停的note，如果没有则使用起点note
      const targetNoteId = previewHoverNote || connectionStartNote;
      const targetNoteData = data[targetNoteId] || { type: 'note', color: 'white', visibility: visibility };
      const hasColor2 = targetNoteData.color2 && targetNoteData.color2 !== null;
      
      console.log('[handleSvgMouseDown] 中键点击，切换颜色层级', {
        targetNoteId,
        targetNoteData,
        hasColor2,
        previewHoverNote,
        connectionStartNote,
        color: targetNoteData.color,
        color2: targetNoteData.color2,
        currentUseColor2Level: useColor2Level,
        availableColors: {
          color1: targetNoteData.color,
          color2: targetNoteData.color2
        }
      });
      
      // 只有当note有两层颜色时才能切换层级
      if (hasColor2) {
        // 全局切换颜色层级
        setUseColor2Level(prev => {
          const newValue = !prev;
          console.log('[handleSvgMouseDown] 切换颜色层级', { 
            prev, 
            newValue,
            willUseLevel: newValue ? 'color2' : 'color1',
            availableColors: {
              color1: targetNoteData.color,
              color2: targetNoteData.color2
            }
          });
          return newValue;
        });
      } else {
        console.log('[handleSvgMouseDown] note没有color2，无法切换层级', {
          color: targetNoteData.color,
          color2: targetNoteData.color2
        });
      }
      return false;
    }
  }, [connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level]);
  
  // 处理鼠标滚轮事件，切换预览note的颜色（备用方案）
  const handleSvgWheel = useCallback((e) => {
    if (connectionMode && connectionStartNote && previewHoverNote) {
      const hoveredNoteData = data[previewHoverNote] || { type: 'note', color: 'white', visibility: visibility };
      const hasColor2 = hoveredNoteData.color2 && hoveredNoteData.color2 !== null;
      
      // 只有当note有两层颜色时才能切换
      if (hasColor2) {
        e.preventDefault();
        e.stopPropagation();
        setUseColor2Level(prev => !prev);
      }
    }
  }, [connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level]);

  const handleEditableKeyDown = useCallback((event) => {
    if (event.code === 'Enter') {
      event.preventDefault();
      event.target.blur();
    }
    event.stopPropagation();
  }, []);

  const handleEditableClick = useCallback((event) => {
    event.stopPropagation();
  }, []);

  useEffect(() => {
    if (editableDivVisible && editableDivRef.current) {
      editableDivRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(editableDivRef.current);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [editableDivVisible]);

  return (
    <>
      <div className="title-header">
        <h1>Fretboard Diagram Generator</h1>
        <div className="datetime">{currentDateTime}</div>
      </div>
      <figure id="fretboard-diagram-creator" className="half-full">
        <svg
          ref={svgElementRef}
          id="fretboard-svg"
          xmlns="http://www.w3.org/2000/svg"
          width={svgWidth}
          height={svgHeight}
          viewBox={`${svgViewBoxX} ${svgViewBoxY} ${svgViewBoxWidth} ${svgViewBoxHeight}`}
          onClick={handleSvgClick}
          onMouseMove={handleSvgMouseMove}
          onMouseDown={handleSvgMouseDown}
          onContextMenu={handleSvgContextMenu}
          onWheel={handleSvgWheel}
        >
          <defs>
            {/* 渐变定义 */}
            {Object.values(connections).map(conn => {
              // 如果连线使用渐变（color以gradient-开头），创建渐变定义
              if (conn.color && conn.color.startsWith('gradient-')) {
                // 如果没有gradientColors，尝试从conn中获取
                const gradientColors = conn.gradientColors || { start: 'white', end: 'white' };
                const startColorName = gradientColors.start;
                const endColorName = gradientColors.end;
                
                // 判断颜色是第一层级还是第二层级
                const isStartLevel1 = startColorName in LEVEL1_COLORS;
                const isEndLevel1 = endColorName in LEVEL1_COLORS;
                const startColor = isStartLevel1 ? getLevel1FillColor(startColorName) : getLevel2Color(startColorName);
                const endColor = isEndLevel1 ? getLevel1FillColor(endColorName) : getLevel2Color(endColorName);
                
                // 获取起点和终点的位置，用于设置渐变方向
                const gradientStartCenter = getNotePosition(conn.startNoteId);
                const gradientEndCenter = getNotePosition(conn.endNoteId);
                
                // 渐变色的起始色和结束色直接对应起点和终点note的颜色
                // gradientColors.start 对应起点note的颜色，gradientColors.end 对应终点note的颜色
                // 不需要交换，直接使用
                const finalStartColor = startColorName === 'white' ? '#aaaaaa' : startColor;
                const finalEndColor = endColorName === 'white' ? '#aaaaaa' : endColor;
                
                // 确保颜色值有效（不能是 undefined 或 null）
                const safeStartColor = finalStartColor || '#aaaaaa';
                const safeEndColor = finalEndColor || '#aaaaaa';
                
                // 确保渐变ID正确
                const gradientId = conn.color; // 已经是 'gradient-conn-xxx' 格式
                
                // 确保颜色值是有效的字符串
                const finalStartColorStr = String(safeStartColor);
                const finalEndColorStr = String(safeEndColor);
                
                // 获取起点和终点的位置，用于设置渐变方向
                // 关键：渐变定义必须与连线的实际渲染方向完全一致
                // 连线渲染时：x1,y1 = startEdge（对应 conn.startNoteId），x2,y2 = endEdge（对应 conn.endNoteId）
                // 所以渐变定义中：
                // - x1,y1 必须对应 startEdge 的位置（conn.startNoteId 的边缘，使用 startColor）
                // - x2,y2 必须对应 endEdge 的位置（conn.endNoteId 的边缘，使用 endColor）
                const startNotePos = getNotePosition(conn.startNoteId);
                const endNotePos = getNotePosition(conn.endNoteId);
                
                if (!startNotePos || !endNotePos) {
                  return null;
                }
                
                // 计算边缘点（与连线渲染时使用的相同）
                const startEdge = getPointOnNoteEdge(startNotePos.x, startNotePos.y, endNotePos.x, endNotePos.y, CONSTS.circleRadius);
                const endEdge = getPointOnNoteEdge(endNotePos.x, endNotePos.y, startNotePos.x, startNotePos.y, CONSTS.circleRadius);
                
                // 对于所有连线，都使用 userSpaceOnUse 和实际坐标（边缘点）
                // 这样可以确保渐变方向与连线渲染方向完全一致
                // x1,y1 = startEdge（对应 conn.startNoteId，使用 startColor）
                // x2,y2 = endEdge（对应 conn.endNoteId，使用 endColor）
                const gradientUnits = "userSpaceOnUse";
                const gradientX1 = startEdge.x;
                const gradientY1 = startEdge.y;
                const gradientX2 = endEdge.x;
                const gradientY2 = endEdge.y;
                
                
                return (
                  <linearGradient 
                    key={conn.id} 
                    id={gradientId} 
                    x1={gradientX1} 
                    y1={gradientY1} 
                    x2={gradientX2} 
                    y2={gradientY2}
                    gradientUnits={gradientUnits}
                  >
                    <stop offset="0%" stopColor={finalStartColorStr} />
                    <stop offset="100%" stopColor={finalEndColorStr} />
                  </linearGradient>
                );
              }
              return null;
            })}
          </defs>
          
          <path className="frets" d={fretPath} />
          
          <g className="markers">
            {markers.map(marker => (
              <text key={`${marker.position}-${marker.number}`} className="marker" x={marker.x} y={marker.y}>
                {marker.number}
              </text>
            ))}
          </g>
          
          <g className="strings" style={{ pointerEvents: 'none' }}>
            {Array.from({ length: CONSTS.numStrings }).map((_, i) => (
              <path
                key={i}
                className="string"
                d={generateStringPath(i)}
                style={{ strokeWidth: `${CONSTS.minStringSize * (i + 1)}px` }}
              />
            ))}
          </g>
          
          <g className="notes" ref={notesElementRef}>
            {notes.map(note => {
              const noteData = data[note.id] || { type: 'note', color: 'white', visibility: visibility };
              const currentColor = noteData.color || 'white';
              const currentColor2 = noteData.color2 || null;
              const currentVisibility = selected?.id === note.id ? 'selected' : (noteData.visibility || visibility);
              const isPreviewHover = connectionMode && connectionStartNote && previewHoverNote === note.id;
              const className = `note ${currentColor} ${currentVisibility} ${isPreviewHover ? 'preview-hover' : ''}`;
              
              // 根据 color2 设置描边颜色
              let hasColor2 = currentColor2 && currentColor2 !== null;
              let strokeColor = note.isOpen ? 'none' : undefined;
              let strokeWidth = undefined;
              if (hasColor2) {
                strokeColor = getLevel2Color(currentColor2);
                strokeWidth = '3.5';
              }
              
              // 如果note只有color2（没有color1或color1是white），设置文本颜色为白色
              const color1IsWhite = !currentColor || currentColor === 'white';
              const textColor = (hasColor2 && color1IsWhite) ? 'white' : undefined;
              
              let originalNoteName = '';
              if (note.id.startsWith('o-s')) {
                const string = parseInt(note.id.substring(3));
                originalNoteName = computeNoteName(-1, string);
              } else if (note.id.startsWith('f') && note.id.includes('-s')) {
                const parts = note.id.substring(1).split('-s');
                const fret = parseInt(parts[0]);
                const string = parseInt(parts[1]);
                originalNoteName = computeNoteName(fret, string);
              }
              
              return (
                <g
                  key={note.id}
                  id={note.id}
                  className={className}
                  transform={`translate(${note.x}, ${note.y})`}
                  data-x={note.x}
                  data-y={note.y}
                  data-open={note.isOpen}
                  onClick={(e) => handleNoteClick(e, note.id)}
                  onMouseDown={(e) => {
                    // 如果是中键，在连线模式下处理颜色切换
                    if (e.button === 1 && connectionMode && connectionStartNote) {
                      const noteData = data[note.id] || { type: 'note', color: 'white', visibility: visibility };
                      const hasColor2 = noteData.color2 && noteData.color2 !== null;
                      
                      console.log('[note onMouseDown] 中键点击', {
                        noteId: note.id,
                        noteData,
                        hasColor2,
                        color: noteData.color,
                        color2: noteData.color2,
                        availableColors: {
                          color1: noteData.color,
                          color2: noteData.color2
                        },
                        currentUseColor2Level: useColor2Level,
                        previewHoverNote,
                        connectionMode,
                        connectionStartNote
                      });
                      
                      // 只有当note有两层颜色时才能切换
                      if (hasColor2) {
                        e.preventDefault();
                        e.stopPropagation();
                        // 确保previewHoverNote设置正确
                        if (previewHoverNote !== note.id) {
                          setPreviewHoverNote(note.id);
                        }
                        // 全局切换颜色层级
                        setUseColor2Level(prev => {
                          const newValue = !prev;
                          console.log('[note onMouseDown] 切换颜色层级', { 
                            prev, 
                            newValue,
                            willUseLevel: newValue ? 'color2' : 'color1',
                            availableColors: {
                              color1: noteData.color,
                              color2: noteData.color2
                            }
                          });
                          return newValue;
                        });
                        return false;
                      } else {
                        console.log('[note onMouseDown] note没有color2，无法切换', {
                          color: noteData.color,
                          color2: noteData.color2
                        });
                      }
                    }
                  }}
                  // 暂时注释掉右键重命名功能: onContextMenu={(e) => handleNoteContextMenu(e, note.id)}
                  onMouseEnter={() => setHoveredNoteId(note.id)}
                  onMouseLeave={() => setHoveredNoteId(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* 填充的circle */}
                  <circle
                    r={CONSTS.circleRadius}
                    stroke={note.isOpen ? 'none' : undefined}
                  />
                  <text 
                    data-note={originalNoteName}
                    style={{ 
                      opacity: editingNote === note.id ? 0 : 1,
                      fill: textColor,
                      stroke: textColor
                    }}
                  >
                    {note.noteName}
                  </text>
                </g>
              );
            })}
          </g>
          
          {/* 连线渲染 - 放在最后，确保在最上层（SVG中后渲染的元素会覆盖先渲染的元素） */}
          {/* 注意：连线必须在notes之后，但在预览线和工具栏之前 */}
          <g className="connections">
            {Object.values(connections).map(conn => {
              const startCenter = getNotePosition(conn.startNoteId);
              const endCenter = getNotePosition(conn.endNoteId);
              
              // 如果起点或终点note不存在，不渲染连线
              if (!startCenter || !endCenter) {
                return null;
              }
              
              // 获取起点和终点的note数据，用于检查是否被删除
              const startNoteData = data[conn.startNoteId] || { type: 'note', color: 'white', visibility: visibility };
              const endNoteData = data[conn.endNoteId] || { type: 'note', color: 'white', visibility: visibility };
              
              // 如果note被删除了（color是white且visibility不是visible），不渲染连线
              const startIsDeleted = startNoteData.color === 'white' && startNoteData.visibility !== 'visible';
              const endIsDeleted = endNoteData.color === 'white' && endNoteData.visibility !== 'visible';
              if (startIsDeleted || endIsDeleted) {
                return null;
              }
              
              // 获取起点和终点的note数据，用于获取颜色
              // 注意：conn.startNoteId 和 conn.endNoteId 是连线创建时的起点和终点
              // 但是，连线的实际渲染方向可能不同（从startEdge到endEdge）
              // 所以我们需要确保渐变定义中的颜色和位置对应关系正确
              // startNoteData 和 endNoteData 已经在上面声明过了
              
              // 从gradientColors中获取实际使用的颜色（如果存在）
              // gradientColors.start 对应 conn.startNoteId 的颜色
              // gradientColors.end 对应 conn.endNoteId 的颜色
              // 注意：如果note有color2，创建连线时应该使用了color2，所以gradientColors中存储的应该是color2
              let startColor = startNoteData.color || 'white';
              let endColor = endNoteData.color || 'white';
              
              // 如果连线有gradientColors，说明创建时使用了实际颜色（根据useColor2Level选择的color1或color2），优先使用gradientColors
              if (conn.gradientColors) {
                startColor = conn.gradientColors.start || startColor;
                endColor = conn.gradientColors.end || endColor;
              }
              // 注意：如果没有gradientColors，使用当前note的color（不强制使用color2，因为可能创建时使用的是color1）
              
              // 如果从gradientColors获取的颜色还是'white'，尝试从DOM元素中提取
              if (startColor === 'white') {
                const startNoteElement = document.getElementById(conn.startNoteId);
                if (startNoteElement) {
                  const classList = startNoteElement.className?.baseVal?.split(' ') || startNoteElement.className?.split(' ') || [];
                  const colorClass = classList.find(cls => LEVEL1_COLOR_ORDER.includes(cls) || cls in LEVEL2_COLORS);
                  if (colorClass) {
                    startColor = colorClass;
                  }
                }
              }
              
              if (endColor === 'white') {
                const endNoteElement = document.getElementById(conn.endNoteId);
                if (endNoteElement) {
                  const classList = endNoteElement.className?.baseVal?.split(' ') || endNoteElement.className?.split(' ') || [];
                  const colorClass = classList.find(cls => LEVEL1_COLOR_ORDER.includes(cls) || cls in LEVEL2_COLORS);
                  if (colorClass) {
                    endColor = colorClass;
                  }
                }
              }
              
              // 计算连线颜色：如果是渐变ID，使用url引用；否则使用起点颜色
              const isGradient = conn.color && conn.color.startsWith('gradient-');
              const strokeColor = isGradient ? `url(#${conn.color})` : (conn.color || (startColor === 'white' ? '#aaaaaa' : reduceColorSaturation(startColor, 0.6)));
              
              // 箭头颜色：每个箭头使用自己接触的note的颜色（降低饱和度）
              const getArrowColor = (colorName) => {
                if (colorName === 'white') return '#aaaaaa';
                // 使用reduceColorSaturation函数，它会自动处理第一层级和第二层级颜色
                return reduceColorSaturation(colorName, 0.6);
              };
              const startArrowColor = getArrowColor(startColor);
              const endArrowColor = getArrowColor(endColor);
              
              // 计算边缘上的点
              // 有箭头和无箭头需要不同的算法：
              // - 无箭头：线条端点应该在note边缘（radius距离）
              // - 有箭头：线条端点需要向内缩进箭头长度，使箭头尖端正好在边缘
              const hasArrowStart = conn.arrowDirection === 'start' || conn.arrowDirection === 'both';
              const hasArrowEnd = conn.arrowDirection === 'end' || conn.arrowDirection === 'both';
              
              // 使用相对单位：箭头长度相对于圆半径
              const arrowLength = CONSTS.circleRadius * (2/3); // 约等于原来的12/18
              
              // 先计算圆边线上的点
              const startEdge = getPointOnNoteEdge(startCenter.x, startCenter.y, endCenter.x, endCenter.y, CONSTS.circleRadius);
              const endEdge = getPointOnNoteEdge(endCenter.x, endCenter.y, startCenter.x, startCenter.y, CONSTS.circleRadius);
              
              // 获取线条宽度，用于计算无箭头时的端点偏移
              const strokeWidth = conn.strokeWidth || 3;
              
              // 计算实际的路径端点
              // 对于无箭头的情况，需要考虑strokeLinecap的影响，端点需要稍微向外偏移
              // 对于有箭头的情况，端点需要向内缩进箭头长度
              // 注意：对于直线，有箭头时的缩进会在else分支中重新计算，所以这里只处理无箭头的情况
              let pathStartX = startEdge.x;
              let pathStartY = startEdge.y;
              let pathEndX = endEdge.x;
              let pathEndY = endEdge.y;
              
              // 对于无箭头的情况，端点需要稍微向外偏移，以补偿strokeLinecap的影响
              if (!hasArrowStart) {
                // 从边线点向外（远离中心）偏移 strokeWidth/2
                const dx = startEdge.x - startCenter.x;
                const dy = startEdge.y - startCenter.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > 0) {
                  const unitX = dx / distance;
                  const unitY = dy / distance;
                  pathStartX = startEdge.x + unitX * (strokeWidth / 2);
                  pathStartY = startEdge.y + unitY * (strokeWidth / 2);
                }
              }
              
              if (!hasArrowEnd) {
                // 从边线点向外（远离中心）偏移 strokeWidth/2
                const dx = endEdge.x - endCenter.x;
                const dy = endEdge.y - endCenter.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > 0) {
                  const unitX = dx / distance;
                  const unitY = dy / distance;
                  pathEndX = endEdge.x + unitX * (strokeWidth / 2);
                  pathEndY = endEdge.y + unitY * (strokeWidth / 2);
                }
              }
              
              const markerStart = (conn.arrowDirection === 'start' || conn.arrowDirection === 'both') ? `url(#arrowhead-start-${conn.id})` : undefined;
              const markerEnd = (conn.arrowDirection === 'end' || conn.arrowDirection === 'both') ? `url(#arrowhead-end-${conn.id})` : undefined;
              
              if (conn.type === 'arc') {
                // 对于弧线，需要沿着路径计算缩进点
                if (hasArrowStart || hasArrowEnd) {
                  // 先计算从边线点到边线点的完整弧线路径
                  const fullPathString = calculateArcPath(startEdge.x, startEdge.y, endEdge.x, endEdge.y, conn.arcCurvature);
                  
                  if (hasArrowStart) {
                    // 从起点沿着路径向内缩进箭头长度
                    const startOffsetPoint = getPointOnPathAtDistance(fullPathString, arrowLength);
                    pathStartX = startOffsetPoint.x;
                    pathStartY = startOffsetPoint.y;
                  }
                  
                  if (hasArrowEnd) {
                    // 从终点沿着路径向内缩进箭头长度
                    // 需要获取路径总长度，然后从总长度减去箭头长度
                    const svgNS = 'http://www.w3.org/2000/svg';
                    const tempPath = document.createElementNS(svgNS, 'path');
                    tempPath.setAttribute('d', fullPathString);
                    const totalLength = tempPath.getTotalLength();
                    const endOffsetPoint = getPointOnPathAtDistance(fullPathString, totalLength - arrowLength);
                    pathEndX = endOffsetPoint.x;
                    pathEndY = endOffsetPoint.y;
                  }
                }
                
                // 使用缩进后的点计算实际路径
                const path = calculateArcPath(pathStartX, pathStartY, pathEndX, pathEndY, conn.arcCurvature);
                return (
                  <g key={conn.id}>
                    {/* 为每条连线创建独立的箭头标记，使用接触的note颜色 */}
                    {/* 箭头路径：起点箭头，使用相对单位 */}
                    {/* refX设置为arrowLength，使箭头尖端正好在边缘 */}
                    {(conn.arrowDirection === 'start' || conn.arrowDirection === 'both') && (
                      <marker
                        id={`arrowhead-start-${conn.id}`}
                        markerWidth={arrowLength * 1.25}
                        markerHeight={arrowLength * 1.25}
                        refX={String(arrowLength)}
                        refY={String(arrowLength * 0.375)}
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d={`M0,${arrowLength * 0.375} L${arrowLength},0 L${arrowLength},${arrowLength * 0.75} z`} fill={startArrowColor} />
                      </marker>
                    )}
                    {/* 箭头路径：终点箭头，使用相对单位 */}
                    {/* refX设置为0，使箭头尖端正好在边缘 */}
                    {(conn.arrowDirection === 'end' || conn.arrowDirection === 'both') && (
                      <marker
                        id={`arrowhead-end-${conn.id}`}
                        markerWidth={arrowLength * 1.25}
                        markerHeight={arrowLength * 1.25}
                        refX="0"
                        refY={String(arrowLength * 0.375)}
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d={`M${arrowLength},${arrowLength * 0.375} L0,0 L0,${arrowLength * 0.75} z`} fill={endArrowColor} />
                      </marker>
                    )}
                    <path
                      d={path}
                      className="connection"
                      stroke={strokeColor}
                      strokeWidth={conn.strokeWidth || 3}
                      fill="none"
                      markerStart={markerStart}
                      markerEnd={markerEnd}
                      onClick={(e) => handleConnectionClick(e, conn.id)}
                      onContextMenu={(e) => handleConnectionContextMenu(e, conn.id)}
                      style={{ 
                        cursor: 'pointer',
                        strokeWidth: `${conn.strokeWidth || 3}px`
                      }}
                    />
                  </g>
                );
              } else {
                // 对于直线，使用和弧线相同的方法：沿着路径计算缩进点
                if (hasArrowStart || hasArrowEnd) {
                  // 先创建从边线点到边线点的直线路径
                  const linePathString = `M ${startEdge.x} ${startEdge.y} L ${endEdge.x} ${endEdge.y}`;
                  
                  if (hasArrowStart) {
                    // 从起点沿着路径向内缩进箭头长度
                    const startOffsetPoint = getPointOnPathAtDistance(linePathString, arrowLength);
                    pathStartX = startOffsetPoint.x;
                    pathStartY = startOffsetPoint.y;
                  }
                  
                  if (hasArrowEnd) {
                    // 从终点沿着路径向内缩进箭头长度
                    // 需要获取路径总长度，然后从总长度减去箭头长度
                    const svgNS = 'http://www.w3.org/2000/svg';
                    const tempPath = document.createElementNS(svgNS, 'path');
                    tempPath.setAttribute('d', linePathString);
                    const totalLength = tempPath.getTotalLength();
                    const endOffsetPoint = getPointOnPathAtDistance(linePathString, totalLength - arrowLength);
                    pathEndX = endOffsetPoint.x;
                    pathEndY = endOffsetPoint.y;
                  }
                }
                
                return (
                  <g key={conn.id}>
                    {/* 为每条连线创建独立的箭头标记，使用接触的note颜色 */}
                    {/* 箭头路径：起点箭头，使用相对单位 */}
                    {/* refX设置为arrowLength，使箭头尖端正好在边缘 */}
                    {(conn.arrowDirection === 'start' || conn.arrowDirection === 'both') && (
                      <marker
                        id={`arrowhead-start-${conn.id}`}
                        markerWidth={arrowLength * 1.25}
                        markerHeight={arrowLength * 1.25}
                        refX={String(arrowLength)}
                        refY={String(arrowLength * 0.375)}
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d={`M0,${arrowLength * 0.375} L${arrowLength},0 L${arrowLength},${arrowLength * 0.75} z`} fill={startArrowColor} />
                      </marker>
                    )}
                    {/* 箭头路径：终点箭头，使用相对单位 */}
                    {/* refX设置为0，使箭头尖端正好在边缘 */}
                    {(conn.arrowDirection === 'end' || conn.arrowDirection === 'both') && (
                      <marker
                        id={`arrowhead-end-${conn.id}`}
                        markerWidth={arrowLength * 1.25}
                        markerHeight={arrowLength * 1.25}
                        refX="0"
                        refY={String(arrowLength * 0.375)}
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d={`M${arrowLength},${arrowLength * 0.375} L0,0 L0,${arrowLength * 0.75} z`} fill={endArrowColor} />
                      </marker>
                    )}
                    <line
                      x1={pathStartX}
                      y1={pathStartY}
                      x2={pathEndX}
                      y2={pathEndY}
                      className="connection"
                      stroke={strokeColor}
                      strokeWidth={conn.strokeWidth || 3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerStart={markerStart}
                      markerEnd={markerEnd}
                      onClick={(e) => handleConnectionClick(e, conn.id)}
                      onContextMenu={(e) => handleConnectionContextMenu(e, conn.id)}
                      style={{ 
                        cursor: 'pointer',
                        strokeWidth: `${conn.strokeWidth || 3}px`,
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round'
                      }}
                    />
                  </g>
                );
              }
            })}
          </g>
          
          {/* 第二层颜色描边 - 放在连线之后，确保覆盖连线 */}
          <g className="color2-strokes">
            {notes.map(note => {
              const noteData = data[note.id] || { type: 'note', color: 'white', visibility: visibility };
              const currentColor2 = noteData.color2 || null;
              const hasColor2 = currentColor2 && currentColor2 !== null;
              
              if (!hasColor2) return null;
              
              const strokeColor = getLevel2Color(currentColor2);
              
              return (
                <circle
                  key={`color2-${note.id}`}
                  cx={note.x}
                  cy={note.y}
                  r={CONSTS.circleRadius}
                  stroke={strokeColor}
                  strokeWidth="3.5"
                  fill="none"
                  pointerEvents="none"
                />
              );
            })}
          </g>
          
          {/* 预览线 */}
          {connectionMode && connectionStartNote && connectionStartPosition && mousePosition && (
            <g className="connection-preview">
              {(() => {
                let startNoteData = data[connectionStartNote] || { type: 'note', color: 'white', visibility: visibility };
                let endNoteData = null;
                
                // 处理起点note的颜色（考虑全局颜色层级）
                const startColor1IsWhite = !startNoteData.color || startNoteData.color === 'white';
                if (startNoteData.color2 && startNoteData.color2 !== null) {
                  if (startColor1IsWhite) {
                    // color1是white，必须使用color2
                    startNoteData = { ...startNoteData, color: startNoteData.color2 };
                  } else if (useColor2Level) {
                    // color1不是white，且全局层级切换到color2
                    startNoteData = { ...startNoteData, color: startNoteData.color2 };
                  }
                }
                
                // 如果有预览悬停的note，获取其数据（考虑color2切换）
                if (previewHoverNote && previewHoverNote !== connectionStartNote) {
                  endNoteData = data[previewHoverNote] || { type: 'note', color: 'white', visibility: visibility };
                  
                  // 如果color1是white（或不存在）但color2存在，必须使用color2
                  // 如果color1不是white，根据全局颜色层级决定
                  const color1IsWhite = !endNoteData.color || endNoteData.color === 'white';
                  if (endNoteData.color2 && endNoteData.color2 !== null) {
                    if (color1IsWhite) {
                      // color1是white，必须使用color2
                      endNoteData = { ...endNoteData, color: endNoteData.color2 };
                    } else if (useColor2Level) {
                      // color1不是white，且全局层级切换到color2
                      endNoteData = { ...endNoteData, color: endNoteData.color2 };
                    }
                  }
                }
                
                // 计算预览线颜色
                let previewColor;
                if (endNoteData) {
                  // 使用calculateConnectionColor计算颜色
                  const tempConnectionId = 'preview-temp';
                  previewColor = calculateConnectionColor(startNoteData, endNoteData, tempConnectionId);
                  
                  // 如果是渐变，预览时使用起点颜色（简化显示）
                  if (previewColor.startsWith('gradient-')) {
                    previewColor = startNoteData.color === 'white' 
                      ? '#aaaaaa' 
                      : reduceColorSaturation(startNoteData.color, 0.6);
                  }
                } else {
                  // 没有悬停note，使用起点颜色
                  previewColor = startNoteData.color === 'white' 
                    ? '#aaaaaa' 
                    : reduceColorSaturation(startNoteData.color, 0.6);
                }
                
                let endX, endY;
                let startEdgeX = connectionStartPosition.x;
                let startEdgeY = connectionStartPosition.y;
                
                if (previewHoverNote) {
                  const hoveredNote = notes.find(n => n.id === previewHoverNote);
                  if (hoveredNote) {
                    // 计算起点边缘（从起点中心向终点中心方向）
                    const startEdge = getPointOnNoteEdge(
                      connectionStartPosition.x, 
                      connectionStartPosition.y, 
                      hoveredNote.x, 
                      hoveredNote.y, 
                      CONSTS.circleRadius
                    );
                    startEdgeX = startEdge.x;
                    startEdgeY = startEdge.y;
                    
                    // 计算终点边缘（从终点中心向起点中心方向）
                    const endEdge = getPointOnNoteEdge(
                      hoveredNote.x, 
                      hoveredNote.y, 
                      connectionStartPosition.x, 
                      connectionStartPosition.y, 
                      CONSTS.circleRadius
                    );
                    endX = endEdge.x;
                    endY = endEdge.y;
                  } else {
                    // 计算起点边缘（从起点中心向鼠标位置方向）
                    const startEdge = getPointOnNoteEdge(
                      connectionStartPosition.x, 
                      connectionStartPosition.y, 
                      mousePosition.x, 
                      mousePosition.y, 
                      CONSTS.circleRadius
                    );
                    startEdgeX = startEdge.x;
                    startEdgeY = startEdge.y;
                    endX = mousePosition.x;
                    endY = mousePosition.y;
                  }
                } else {
                  // 计算起点边缘（从起点中心向鼠标位置方向）
                  const startEdge = getPointOnNoteEdge(
                    connectionStartPosition.x, 
                    connectionStartPosition.y, 
                    mousePosition.x, 
                    mousePosition.y, 
                    CONSTS.circleRadius
                  );
                  startEdgeX = startEdge.x;
                  startEdgeY = startEdge.y;
                  endX = mousePosition.x;
                  endY = mousePosition.y;
                }
                
                return (
                  <line
                    x1={startEdgeX}
                    y1={startEdgeY}
                    x2={endX}
                    y2={endY}
                    className="connection-preview"
                    stroke={previewColor}
                    strokeWidth={3}
                    strokeDasharray="5,5"
                    opacity={0.6}
                    pointerEvents="none"
                  />
                );
              })()}
            </g>
          )}
          
          {errorMessage && (
            <text className="error" x={400} y={140} dangerouslySetInnerHTML={{ __html: errorMessage }} />
          )}
          
          {editableDivVisible && (
            <foreignObject
              x={editableDivX}
              y={editableDivY}
              width={2 * CONSTS.circleRadius}
              height={2 * CONSTS.circleRadius}
              className="visible"
            >
              <div
                ref={editableDivRef}
                contentEditable="true"
                suppressContentEditableWarning={true}
                onBlur={finishEditing}
                onKeyDown={handleEditableKeyDown}
                onClick={handleEditableClick}
                onInput={(e) => setEditableText(e.target.textContent)}
                id="editable-div"
                style={{
                  textAlign: 'center',
                  fontSize: '18px',
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent'
                }}
              >
                {editableText}
              </div>
            </foreignObject>
          )}
          
          {/* 连线工具栏 */}
          {connectionToolbarVisible && selectedConnection && connections[selectedConnection] && (
            <foreignObject
              x={connectionToolbarPosition.x - 300}
              y={connectionToolbarPosition.y - 300}
              width="1200"
              height="800"
              className="connection-toolbar-container"
              style={{ overflow: 'visible', pointerEvents: 'all' }}
            >
              <div
                ref={toolbarRef}
                className="connection-toolbar"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onMouseDown={(e) => {
                  // 如果点击的是按钮，阻止事件冒泡到 SVG
                  if (e.target.closest('.toolbar-icon-btn')) {
                    e.stopPropagation();
                  }
                }}
                onContextMenu={(e) => e.preventDefault()}
                style={{ position: 'relative', left: '300px', top: '300px' }}
              >
                <div className="toolbar-icons">
                  {/* 类型按钮 - switch切换 */}
                  <div className="toolbar-icon-wrapper">
                    <button
                      className={`toolbar-icon-btn ${connections[selectedConnection]?.type === 'arc' ? 'active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                        const connId = selectedConnection;
                        if (!connId) return;
                        // 防止重复点击
                        if (buttonClickRef.current.type) {
                          return;
                        }
                        buttonClickRef.current.type = true;
                        setTimeout(() => {
                          buttonClickRef.current.type = false;
                        }, 100);
                        // 使用 dataRef 获取最新状态，避免闭包问题
                        const currentData = dataRef.current;
                        const currentConn = currentData?.connections?.[connId];
                        if (!currentConn) {
                          return;
                        }
                        const currentType = currentConn.type || 'line';
                        setData(prevData => {
                          const newData = { ...prevData };
                          if (!newData.connections) {
                            newData.connections = {};
                          }
                          if (newData.connections[connId]) {
                            if (currentType === 'line') {
                              // 切换到弧线
                              const newArcCurvature = (currentConn.arcCurvature === 0 || currentConn.arcCurvature < 0) 
                                ? 0.7 
                                : (currentConn.arcCurvature || 0.7);
                              newData.connections[connId] = {
                                ...newData.connections[connId],
                                type: 'arc',
                                arcCurvature: newArcCurvature
                              };
                            } else {
                              // 切换到直线
                              newData.connections[connId] = {
                                ...newData.connections[connId],
                                type: 'line'
                              };
                            }
                          }
                          return newData;
                        });
                      }}
                      title="类型"
                    >
                      {connections[selectedConnection]?.type === 'line' ? '线' : '弧'}
                    </button>
                  </div>

                  {/* 箭头按钮 - switch切换 */}
                  <div className="toolbar-icon-wrapper">
                    <button
                      className="toolbar-icon-btn"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                        const connId = selectedConnection;
                        if (!connId) return;
                        // 防止重复点击
                        if (buttonClickRef.current.arrow) {
                          return;
                        }
                        buttonClickRef.current.arrow = true;
                        setTimeout(() => {
                          buttonClickRef.current.arrow = false;
                        }, 100);
                        // 使用 dataRef 获取最新状态，避免闭包问题
                        const currentData = dataRef.current;
                        const currentConn = currentData?.connections?.[connId];
                        if (!currentConn) {
                          return;
                        }
                        const currentDirection = currentConn.arrowDirection || 'none';
                        // 循环切换：none -> start -> end -> both -> none
                        let nextDirection;
                        switch (currentDirection) {
                          case 'none':
                            nextDirection = 'start';
                            break;
                          case 'start':
                            nextDirection = 'end';
                            break;
                          case 'end':
                            nextDirection = 'both';
                            break;
                          case 'both':
                            nextDirection = 'none';
                            break;
                          default:
                            nextDirection = 'none';
                        }
                        setData(prevData => {
                          const newData = { ...prevData };
                          if (!newData.connections) {
                            newData.connections = {};
                          }
                          if (newData.connections[connId]) {
                            newData.connections[connId] = {
                              ...newData.connections[connId],
                              arrowDirection: nextDirection
                            };
                          }
                          return newData;
                        });
                      }}
                      title="箭头"
                    >
                      {(() => {
                        const arrowDir = connections[selectedConnection]?.arrowDirection || 'none';
                        if (arrowDir === 'none') return '无';
                        if (arrowDir === 'start') return '←';
                        if (arrowDir === 'end') return '→';
                        if (arrowDir === 'both') return '⇄';
                        return '无';
                      })()}
                    </button>
                  </div>

                  {/* 粗细按钮 */}
                  <div className="toolbar-icon-wrapper">
                    <button
                      className="toolbar-icon-btn"
                      onClick={(e) => {
                        const direction = detectDropdownDirection(e.currentTarget);
                        setToolbarDropdownDirection(direction);
                        setToolbarDropdown(toolbarDropdown === 'width' ? null : 'width');
                      }}
                      title="粗细"
                    >
                      粗
                    </button>
                    {toolbarDropdown === 'width' && (
                      <div className={`toolbar-dropdown toolbar-dropdown-${toolbarDropdownDirection}`}>
                        <div className="toolbar-slider-wrapper">
                          <input
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            value={connections[selectedConnection].strokeWidth || 3}
                            onChange={(e) => {
                              setData(prevData => {
                                const newData = { ...prevData };
                                if (newData.connections && newData.connections[selectedConnection]) {
                                  newData.connections[selectedConnection] = {
                                    ...newData.connections[selectedConnection],
                                    strokeWidth: parseInt(e.target.value)
                                  };
                                }
                                return newData;
                              });
                            }}
                          />
                          <span>{connections[selectedConnection].strokeWidth || 3}px</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 弧度按钮（仅弧线时显示） */}
                  {connections[selectedConnection].type === 'arc' && (
                    <div className="toolbar-icon-wrapper">
                      <button
                        className="toolbar-icon-btn"
                        onClick={(e) => {
                          const direction = detectDropdownDirection(e.currentTarget);
                          setToolbarDropdownDirection(direction);
                          setToolbarDropdown(toolbarDropdown === 'curvature' ? null : 'curvature');
                        }}
                        title="弧度"
                      >
                        弯
                      </button>
                      {toolbarDropdown === 'curvature' && (
                        <div className={`toolbar-dropdown toolbar-dropdown-${toolbarDropdownDirection}`}>
                          <div className="toolbar-slider-wrapper">
                            <input
                              type="range"
                              min="-2"
                              max="2"
                              step="0.1"
                              value={connections[selectedConnection].arcCurvature}
                              onChange={(e) => {
                                setData(prevData => {
                                  const newData = { ...prevData };
                                  if (newData.connections && newData.connections[selectedConnection]) {
                                    newData.connections[selectedConnection] = {
                                      ...newData.connections[selectedConnection],
                                      arcCurvature: parseFloat(e.target.value)
                                    };
                                  }
                                  return newData;
                                });
                              }}
                            />
                            <span>{connections[selectedConnection].arcCurvature >= 0 ? '+' : ''}{connections[selectedConnection].arcCurvature.toFixed(1)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 删除按钮 */}
                  <button
                    className="toolbar-icon-btn delete-icon-btn"
                    onClick={() => {
                      setData(prevData => {
                        const newData = { ...prevData };
                        if (newData.connections) {
                          delete newData.connections[selectedConnection];
                        }
                        return newData;
                      });
                      setConnectionToolbarVisible(false);
                      setSelectedConnection(null);
                    }}
                    title="删除连线"
                  >
                    ×
                  </button>
                </div>
              </div>
            </foreignObject>
          )}
        </svg>
      </figure>

      <div className="menu">
        <div id="color-selector">
          <div className="color-palette-row">
            <span className="palette-label">第一层:</span>
            {LEVEL1_COLOR_ORDER.map(colorName => (
              <button
                key={colorName}
                title={colorName}
                className={`color ${colorName} ${selectedColorLevel === 1 && selectedColor === colorName ? 'selected' : ''}`}
                onClick={() => selectColor(1, colorName)}
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
                onClick={() => selectColor(2, colorName)}
              />
            ))}
          </div>
        </div>
        <div id="global-actions">
          <button
            id="enharmonic"
            style={{ width: '25px', textAlign: 'center' }}
            onClick={toggleEnharmonic}
          >
            {CONSTS.sign[enharmonic]}
          </button>
          <button className="button" onClick={toggleVisibility}>Toggle</button>
          <button 
            className={`button ${connectionMode ? 'selected' : ''}`} 
            onClick={() => {
              setConnectionMode(!connectionMode);
              if (connectionMode) {
                // 退出连线模式时清除状态
                setConnectionStartNote(null);
                setConnectionStartPosition(null);
                setMousePosition(null);
                setPreviewHoverNote(null);
                setUseColor2Level(false);
              }
            }}
            title="连线工具"
          >
            连线
          </button>
          <button className="button" onClick={saveSVG}>Save</button>
          <button className="button" onClick={reset}>Reset</button>
        </div>
        <div id="piano-keyboard-container">
          <PianoKeyboard
            enharmonic={enharmonic}
            selectedNote={rootNote}
            onNoteSelect={(noteIndex) => {
              setRootNote(noteIndex);
              if (noteIndex === null) {
                // 取消选中时，自动切换到音名模式
                setDisplayMode('note');
              } else {
                // 选中琴键时，自动切换到唱名模式
                setDisplayMode('solfege');
              }
            }}
          />
        </div>
        <div className="fret-range-slider-wrapper">
          <div className="dual-range-slider">
            <div className="dual-range-inputs-container">
              {/* 轨道背景 */}
              <div className="dual-range-track" />
              
              {/* 选中范围高亮 */}
              <div 
                className="dual-range-selected"
                style={{
                  left: `calc(9px + ${(startFret / 22) * 100}% - ${(startFret / 22) * 18}px)`,
                  width: `calc(${((endFret - startFret) / 22) * 100}% - ${((endFret - startFret) / 22) * 18}px)`
                }}
              />
              
              {/* 左侧数字提示 */}
              <div 
                className="fret-value-tooltip"
                style={{
                  left: `calc(9px + ${(startFret / 22) * 100}% - ${(startFret / 22) * 18}px)`,
                  transform: 'translateX(-50%)'
                }}
              >
                {startFret + 1}
              </div>
              
              {/* 右侧数字提示 */}
              <div 
                className="fret-value-tooltip"
                style={{
                  left: `calc(9px + ${(endFret / 22) * 100}% - ${(endFret / 22) * 18}px)`,
                  transform: 'translateX(-50%)'
                }}
              >
                {endFret}
              </div>
              
              {/* 最小值滑块 */}
              <input
                type="range"
                className="dual-range-input dual-range-input-min"
                min="0"
                max="22"
                step="1"
                value={startFret}
                onChange={(e) => {
                  const newStart = parseInt(e.target.value);
                  if (newStart < endFret) {
                    setFretWindow({ start: newStart });
                  } else {
                    setFretWindow({ start: endFret - 1 });
                  }
                }}
              />
              
              {/* 最大值滑块 */}
              <input
                type="range"
                className="dual-range-input dual-range-input-max"
                min="0"
                max="22"
                step="1"
                value={endFret}
                onChange={(e) => {
                  const newEnd = parseInt(e.target.value);
                  if (newEnd > startFret) {
                    setFretWindow({ end: newEnd });
                  } else {
                    setFretWindow({ end: startFret + 1 });
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Fretboard;
