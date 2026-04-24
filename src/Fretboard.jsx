import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import './fretboard.css';
import { CONSTS } from './constants';
import { updateNote, inlineCSS, noteToSolfege, calculateConnectionColor } from './utils';
import { initColorCSSVariables } from './colorConfig';
import { useFretboardState } from './hooks/useFretboardState';
import { useConnectionState } from './hooks/useConnectionState';
import { useHistory } from './hooks/useHistory';
import { useNoteEditing } from './hooks/useNoteEditing';
import { computeNoteIndex, computeNoteName, generateNotes, generateMarkers, generateFretPath, generateStringPath, getNotePosition } from './utils/fretboardCalculations';
import { detectDropdownDirection, openConnectionToolbar, handleConnectionContextMenu, handleConnectionClick, updateConnectionColors } from './utils/connectionUtils';
import { selectColor, cycleLevel1Color, cycleLevel2Color, toggleVisibility, toggleEnharmonic, reset, saveSVG, setFretWindow, replaceAllTintNotes } from './utils/fretboardActions';
import { generateTintVariants, getLevel1FillColor, getLevel2Color } from './colorConfig';
import { createNoteClickHandler, createNoteContextMenuHandler, createDeleteNoteHandler, createFinishEditingHandler } from './handlers/noteHandlers';
import { createSvgClickHandler, createSvgContextMenuHandler, createSvgMouseMoveHandler, createSvgMouseDownHandler, createSvgWheelHandler, createEditableKeyDownHandler, createEditableClickHandler } from './handlers/svgHandlers';
import { createKeyboardHandler } from './handlers/keyboardHandlers';
import { FretboardMenu } from './components/FretboardMenu';
import { FretboardDock } from './components/FretboardDock';
import { Toast } from './components/Toast';
import { FretboardSVG } from './components/FretboardSVG';
import { restoreFretboardState, generateThumbnail, createStateSnapshot } from './utils/fretboardHistory';

function Fretboard() {
  // 使用自定义hooks
  const fretboardState = useFretboardState();
  const connectionState = useConnectionState();
  const noteEditing = useNoteEditing();

  // 解构状态
  const {
    selected, setSelected,
    selectedColorLevel, setSelectedColorLevel,
    selectedColor, setSelectedColor,
    hoveredNoteId, setHoveredNoteId,
    hoveredConnectionId, setHoveredConnectionId,
    visibility, setVisibility,
    startFret, setStartFret,
    endFret, setEndFret,
    enharmonic, setEnharmonic,
    displayMode, setDisplayMode,
    rootNote, setRootNote,
    data, setData,
    errorMessage, setErrorMessage,
    toastMessage, setToastMessage,
    toastType, setToastType,
    historyStates, setHistoryStates,
    includeMarkers, setIncludeMarkers,
    copyOnly, setCopyOnly,
    showNotes, setShowNotes,
    horizontalCrop, setHorizontalCrop,
    verticalCrop, setVerticalCrop,
    selectedHistoryState, setSelectedHistoryState,
    currentDateTime,
    dataRef,
    selectedTimeoutRef,
    // 目录管理
    currentDirectoryId,
    setCurrentDirectoryId
  } = fretboardState;

  const historySnapshot = useMemo(() => ({
    data,
    startFret,
    endFret,
    enharmonic,
    displayMode,
    rootNote,
    visibility,
    historyStates,
    selectedHistoryStateId: selectedHistoryState?.id ?? null,
    currentDirectoryId
  }), [data, startFret, endFret, enharmonic, displayMode, rootNote, visibility, historyStates, selectedHistoryState, currentDirectoryId]);

  const applyHistorySnapshot = useCallback((snapshot) => {
    setData(snapshot?.data || {});
    setStartFret(typeof snapshot?.startFret === 'number' ? snapshot.startFret : 0);
    setEndFret(typeof snapshot?.endFret === 'number' ? snapshot.endFret : 12);
    setEnharmonic(typeof snapshot?.enharmonic === 'number' ? snapshot.enharmonic : 1);
    setDisplayMode(snapshot?.displayMode || 'note');
    setRootNote(snapshot?.rootNote ?? null);
    setVisibility(snapshot?.visibility || 'transparent');
    const nextHistoryStates = Array.isArray(snapshot?.historyStates) ? snapshot.historyStates : [];
    setHistoryStates(nextHistoryStates);
    const nextSelectedState = snapshot?.selectedHistoryStateId
      ? nextHistoryStates.find((state) => state.id === snapshot.selectedHistoryStateId) || null
      : null;
    setSelectedHistoryState(nextSelectedState);
    if (snapshot?.currentDirectoryId) {
      setCurrentDirectoryId(snapshot.currentDirectoryId);
    }
  }, [setData, setStartFret, setEndFret, setEnharmonic, setDisplayMode, setRootNote, setVisibility, setHistoryStates, setSelectedHistoryState, setCurrentDirectoryId]);

  const { undo, redo, beginBatch, endBatch } = useHistory(historySnapshot, applyHistorySnapshot);

  const {
    connectionMode, setConnectionMode,
    connectionStartNote, setConnectionStartNote,
    connectionStartPosition, setConnectionStartPosition,
    mousePosition, setMousePosition,
    previewHoverNote, setPreviewHoverNote,
    useColor2Level, setUseColor2Level,
    selectedConnection, setSelectedConnection,
    connectionToolbarVisible, setConnectionToolbarVisible,
    connectionToolbarPosition, setConnectionToolbarPosition,
    toolbarDropdown, setToolbarDropdown,
    toolbarDropdownDirection, setToolbarDropdownDirection,
    connectionType, setConnectionType,
    connectionArrowDirection, setConnectionArrowDirection
  } = connectionState;

  const {
    editableText, setEditableText,
    editingNote, setEditingNote,
    editableDivVisible, setEditableDivVisible,
    editableDivX, editableDivY,
    editableDivRef,
    editNoteLabel
  } = noteEditing;

  // 下载选项状态

  // 异色模式标记
  const [inTintMode, setInTintMode] = useState(false);

  // 主题
  const [theme, setTheme] = useState(() => localStorage.getItem('fretboard-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fretboard-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  // Refs
  const svgElementRef = useRef(null);
  const notesElementRef = useRef(null);
  const toolbarRef = useRef(null);
  const buttonClickRef = useRef({ type: false, arrow: false });
  const prevNoteColorsRef = useRef({});
  const brushPaintStateRef = useRef({ armed: false, dragged: false, lastPaintedNoteId: null });
  const suppressBrushClickRef = useRef(false);

  // 计算值
  const numFrets = endFret - startFret;
  const fretboardWidth = CONSTS.fretWidth * numFrets;
  const leftOffset = CONSTS.offsetX + CONSTS.fretWidth / 2;
  const svgWidth = fretboardWidth + leftOffset + CONSTS.offsetX;
  const zeroFretX = CONSTS.offsetX - CONSTS.fretWidth / 2;
  const zeroFretLeftEdge = zeroFretX - CONSTS.circleRadius;
  const svgViewBoxX = zeroFretLeftEdge - 5;
  const svgViewBoxWidth = svgWidth - svgViewBoxX;
  const bottomMarkerY = CONSTS.offsetY + CONSTS.fretHeight + CONSTS.stringSpacing * 0.7;
  const topMarkerY = CONSTS.offsetY - CONSTS.stringSpacing * 0.5;
  const svgHeight = bottomMarkerY + 20;
  const svgViewBoxY = topMarkerY - 20;
  const svgViewBoxHeight = svgHeight - svgViewBoxY;

  // 计算函数
  const computeNoteIndexMemo = useCallback((fret, string) => computeNoteIndex(fret, string), []);
  const computeNoteNameMemo = useCallback((fret, string) => computeNoteName(fret, string, enharmonic), [enharmonic]);

  // 生成数据
  const notes = useMemo(() =>
    generateNotes(startFret, endFret, data, displayMode, rootNote, enharmonic, visibility, computeNoteNameMemo, computeNoteIndexMemo, noteToSolfege),
    [startFret, endFret, data, displayMode, rootNote, enharmonic, visibility, computeNoteNameMemo, computeNoteIndexMemo]
  );
  const markers = useMemo(() => generateMarkers(startFret, endFret), [startFret, endFret]);
  const fretPath = useMemo(() => generateFretPath(startFret, endFret), [startFret, endFret]);
  const connections = useMemo(() => (data && data.connections) ? data.connections : {}, [data]);

  // 获取note位置
  const getNotePositionMemo = useCallback((noteId) => getNotePosition(noteId, notes), [notes]);

  // 初始化
  useEffect(() => {
    initColorCSSVariables();
  }, []);

  // 自动解除selected状态
  useEffect(() => {
    if (selectedTimeoutRef.current) {
      clearTimeout(selectedTimeoutRef.current);
      selectedTimeoutRef.current = null;
    }

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

    return () => {
      if (selectedTimeoutRef.current) {
        clearTimeout(selectedTimeoutRef.current);
        selectedTimeoutRef.current = null;
      }
    };
  }, [selected, data, setData, setSelected]);

  // 连线颜色更新
  useEffect(() => {
    updateConnectionColors(data, setData, calculateConnectionColor);
  }, [data, setData]);

  // 初始化notes数据
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
  }, [notes, selected, data, visibility, setData, setSelected]);

  // 更新DOM中的note样式
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

  // 下拉菜单方向检测
  useEffect(() => {
    if (toolbarDropdown && toolbarRef.current) {
      setTimeout(() => {
        const buttonSelector = `.toolbar-icon-btn[title="${toolbarDropdown === 'type' ? '类型' : toolbarDropdown === 'arrow' ? '箭头' : toolbarDropdown === 'width' ? '粗细' : '弧度'}"]`;
        const button = toolbarRef.current?.querySelector(buttonSelector);
        if (button) {
          const direction = detectDropdownDirection(button, toolbarRef, svgElementRef);
          if (direction !== toolbarDropdownDirection) {
            setToolbarDropdownDirection(direction);
          }
        }
      }, 0);
    }
  }, [toolbarDropdown, toolbarDropdownDirection, setToolbarDropdownDirection]);

  useEffect(() => {
    const stopBrushPaint = () => {
      const wasBatching = brushPaintStateRef.current.armed;
      brushPaintStateRef.current.armed = false;
      brushPaintStateRef.current.lastPaintedNoteId = null;

      if (wasBatching) {
        endBatch();
      }
    };

    window.addEventListener('mouseup', stopBrushPaint);
    window.addEventListener('blur', stopBrushPaint);

    return () => {
      window.removeEventListener('mouseup', stopBrushPaint);
      window.removeEventListener('blur', stopBrushPaint);
    };
  }, [endBatch]);

  const colorsMatch = useCallback((left, right) => {
    if (left === right) return true;
    if (!left || !right) return false;
    if (typeof left === 'object' && typeof right === 'object') {
      return left.name === right.name && left.custom === right.custom;
    }
    return false;
  }, []);

  const startBrushPaint = useCallback(() => {
    if (connectionMode || selectedColorLevel === null || selectedColor === null) {
      brushPaintStateRef.current.armed = false;
      brushPaintStateRef.current.dragged = false;
      brushPaintStateRef.current.lastPaintedNoteId = null;
      return;
    }

    brushPaintStateRef.current.armed = true;
    brushPaintStateRef.current.dragged = false;
    brushPaintStateRef.current.lastPaintedNoteId = null;
    beginBatch();
  }, [connectionMode, selectedColorLevel, selectedColor, beginBatch]);

  const shouldBrushPaint = useCallback((event) => {
    return brushPaintStateRef.current.armed && (event.buttons & 1) === 1 && selectedColorLevel !== null && selectedColor !== null;
  }, [selectedColorLevel, selectedColor]);

  const markBrushDragging = useCallback(() => {
    brushPaintStateRef.current.dragged = true;
  }, []);

  const applyBrushPaintToNote = useCallback((noteId) => {
    if (selectedColorLevel === null || !selectedColor || brushPaintStateRef.current.lastPaintedNoteId === noteId) {
      return;
    }

    const noteElement = document.getElementById(noteId);
    if (!noteElement) {
      return;
    }

    const noteData = dataRef.current[noteId] || { type: 'note', color: 'white', visibility };
    const currentColor = noteData.color || 'white';
    const currentColor2 = noteData.color2 || null;
    const currentVisibility = noteData.visibility || visibility;
    const nextUpdate = { color: selectedColor, color2: null, visibility: 'visible' };

    if (colorsMatch(currentColor, selectedColor) && currentColor2 === null && currentVisibility === 'visible') {
      brushPaintStateRef.current.lastPaintedNoteId = noteId;
      return;
    }

    updateNote(noteElement, dataRef.current, nextUpdate);
    brushPaintStateRef.current.lastPaintedNoteId = noteId;
    suppressBrushClickRef.current = true;

    setData(prevData => {
      const newData = { ...prevData };
      if (!(noteId in newData)) {
        newData[noteId] = {};
      }
      newData[noteId] = { ...newData[noteId], ...nextUpdate };
      return newData;
    });
  }, [selectedColorLevel, selectedColor, visibility, colorsMatch, setData, dataRef]);

  const consumePendingBrushClick = useCallback(() => {
    if (!suppressBrushClickRef.current) {
      return false;
    }

    suppressBrushClickRef.current = false;
    return true;
  }, []);

  // 全局点击事件
  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (connectionToolbarVisible) {
        const toolbarElement = document.querySelector('.connection-toolbar');
        if (toolbarElement && !toolbarElement.contains(event.target)) {
          setConnectionToolbarVisible(false);
          setToolbarDropdown(null);
        }
      }
    };

    if (connectionToolbarVisible) {
      setTimeout(() => {
        document.addEventListener('click', handleDocumentClick);
      }, 0);
    }

    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [connectionToolbarVisible, setConnectionToolbarVisible, setToolbarDropdown]);

  // 全局右键事件
  useEffect(() => {
    const handleDocumentContextMenu = (event) => {
      if (connectionMode) {
        event.preventDefault();
        setConnectionMode(false);
        setConnectionStartNote(null);
        setConnectionStartPosition(null);
        setMousePosition(null);
        setPreviewHoverNote(null);
        setUseColor2Level(false);
      }
    };

    if (connectionMode) {
      document.addEventListener('contextmenu', handleDocumentContextMenu);
    }

    return () => {
      document.removeEventListener('contextmenu', handleDocumentContextMenu);
    };
  }, [connectionMode, setConnectionMode, setConnectionStartNote, setConnectionStartPosition, setMousePosition, setPreviewHoverNote, setUseColor2Level]);

  // 创建事件处理器
  const handleNoteClick = useCallback(createNoteClickHandler({
    data, setData, visibility, selected, setSelected,
    selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor,
    connectionMode, connectionStartNote,
    setConnectionStartNote, setConnectionStartPosition, setMousePosition,
    setPreviewHoverNote, useColor2Level, setUseColor2Level, previewHoverNote,
    connections, connectionType, connectionArrowDirection, consumePendingBrushClick, updateNote: updateNote
  }), [data, setData, visibility, selected, setSelected, selectedColorLevel, selectedColor,
    setSelectedColorLevel, setSelectedColor,
    connectionMode, connectionStartNote, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, useColor2Level, setUseColor2Level, previewHoverNote, connections, connectionType, connectionArrowDirection, consumePendingBrushClick]);

  const handleNoteContextMenu = useCallback(createNoteContextMenuHandler({
    selected, setSelected, data, setData, updateNote: updateNote
  }), [selected, setSelected, data, setData]);

  const deleteNote = useCallback(createDeleteNoteHandler({
    selected, setSelected, visibility, data, setData, updateNote: updateNote
  }), [selected, setSelected, visibility, data, setData]);

  const finishEditing = useCallback(createFinishEditingHandler({
    editingNote, setEditingNote, editableText, setEditableText, setEditableDivVisible, data, setData, updateNote: updateNote
  }), [editingNote, setEditingNote, editableText, setEditableText, setEditableDivVisible, data, setData]);

  const handleSvgClick = useCallback(createSvgClickHandler({
    connectionMode, connectionStartNote, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level, selected, setSelected,
    data, setData, connectionToolbarVisible, setConnectionToolbarVisible, setToolbarDropdown,
    updateNote: updateNote
  }), [connectionMode, connectionStartNote, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level, selected, setSelected,
    data, setData, connectionToolbarVisible, setConnectionToolbarVisible, setToolbarDropdown]);

  const handleSvgContextMenu = useCallback(createSvgContextMenuHandler({
    connectionMode, setConnectionMode, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level
  }), [connectionMode, setConnectionMode, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level]);

  const handleSvgMouseMove = useCallback(createSvgMouseMoveHandler({
    connectionMode, connectionStartNote, svgElementRef, setMousePosition,
    notes, data, visibility, setPreviewHoverNote, previewHoverNote,
    shouldBrushPaint, applyBrushPaintToNote, markBrushDragging
  }), [connectionMode, connectionStartNote, setMousePosition, notes, data, visibility, setPreviewHoverNote, previewHoverNote, shouldBrushPaint, applyBrushPaintToNote, markBrushDragging]);

  const handleSvgMouseDown = useCallback(createSvgMouseDownHandler({
    connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level, setUseColor2Level, startBrushPaint
  }), [connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level, setUseColor2Level, startBrushPaint]);

  const handleSvgWheel = useCallback(createSvgWheelHandler({
    connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level, setUseColor2Level
  }), [connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level, setUseColor2Level]);

  const handleEditableKeyDown = useCallback(createEditableKeyDownHandler(), []);
  const handleEditableClick = useCallback(createEditableClickHandler(), []);

  // 连线相关处理器
  const openConnectionToolbarMemo = useCallback((connectionId) => {
    openConnectionToolbar(connectionId, connections, getNotePositionMemo,
      setConnectionToolbarPosition, setSelectedConnection, setConnectionToolbarVisible, setToolbarDropdown);
  }, [connections, getNotePositionMemo, setConnectionToolbarPosition, setSelectedConnection, setConnectionToolbarVisible, setToolbarDropdown]);

  const handleConnectionContextMenuMemo = useCallback((event, connectionId) => {
    handleConnectionContextMenu(event, connectionId, openConnectionToolbarMemo);
  }, [openConnectionToolbarMemo]);

  const handleConnectionClickMemo = useCallback((event, connectionId) => {
    handleConnectionClick(event, connectionId, openConnectionToolbarMemo);
  }, [openConnectionToolbarMemo]);

  // 工具函数
  const selectColorMemo = useCallback((level, color, customColor = null) => {
    selectColor(level, color, selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor, customColor);
    // 单击退出异色模式
    if (!customColor) {
      setInTintMode(false);
    }
  }, [selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor]);

  // 单击颜色：选中基色并展开异色版本面板
  const openTintPaletteMemo = useCallback((level, color) => {
    selectColor(level, color, selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor);
    setInTintMode(color !== 'trans');
  }, [selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor]);

  const cycleLevel1ColorMemo = useCallback(() => {
    cycleLevel1Color(selectedColorLevel, selectedColor, selectColorMemo, generateTintVariants, getLevel1FillColor, inTintMode, 1);
  }, [selectedColorLevel, selectedColor, selectColorMemo, inTintMode]);

  const cycleLevel1ColorReverseMemo = useCallback(() => {
    cycleLevel1Color(selectedColorLevel, selectedColor, selectColorMemo, generateTintVariants, getLevel1FillColor, inTintMode, -1);
  }, [selectedColorLevel, selectedColor, selectColorMemo, inTintMode]);

  const cycleLevel2ColorMemo = useCallback(() => {
    cycleLevel2Color(selectedColorLevel, selectedColor, selectColorMemo, generateTintVariants, getLevel2Color, inTintMode, 1);
  }, [selectedColorLevel, selectedColor, selectColorMemo, inTintMode]);

  const cycleLevel2ColorReverseMemo = useCallback(() => {
    cycleLevel2Color(selectedColorLevel, selectedColor, selectColorMemo, generateTintVariants, getLevel2Color, inTintMode, -1);
  }, [selectedColorLevel, selectedColor, selectColorMemo, inTintMode]);

  const cyclePaletteTintColorMemo = useCallback((colorName, direction = 1) => {
    const tintVariants = generateTintVariants(getLevel1FillColor(colorName));
    const actualColorName = selectedColor && typeof selectedColor === 'object' ? selectedColor.name : selectedColor;
    const currentCustom = selectedColor && typeof selectedColor === 'object' ? selectedColor.custom : null;
    const currentIndex = selectedColorLevel === 1 && actualColorName === colorName && currentCustom
      ? tintVariants.indexOf(currentCustom)
      : -1;
    const nextIndex = currentIndex === -1
      ? direction > 0 ? 0 : tintVariants.length - 1
      : (currentIndex + direction + tintVariants.length) % tintVariants.length;

    selectColorMemo(1, colorName, tintVariants[nextIndex]);
    setInTintMode(true);
  }, [selectedColorLevel, selectedColor, selectColorMemo, setInTintMode]);

  const toggleVisibilityMemo = useCallback(() => {
    toggleVisibility(visibility, setVisibility, notesElementRef, data, updateNote);
    setData(prevData => {
      const newData = { ...prevData };
      for (const [key, value] of Object.entries(newData)) {
        if (key.startsWith('conn-')) continue;
        if (value && typeof value === 'object' && value.visibility !== 'visible' && value.visibility !== 'selected') {
          newData[key] = { ...value, visibility: visibility === 'hidden' ? 'transparent' : 'hidden' };
        }
      }
      return newData;
    });
  }, [visibility, setVisibility, data, setData]);

  const toggleEnharmonicMemo = useCallback(() => {
    toggleEnharmonic(enharmonic, setEnharmonic);
  }, [enharmonic, setEnharmonic]);

  const replaceAllTintNotesMemo = useCallback((targetColorName) => {
    replaceAllTintNotes(targetColorName, data, setData, notesElementRef, updateNote, generateTintVariants, getLevel1FillColor, getLevel2Color);
  }, [data, setData, generateTintVariants, getLevel1FillColor, getLevel2Color]);

  const resetMemo = useCallback(() => {
    reset(visibility, setData, setSelected, notesElementRef, data, updateNote, setStartFret, setEndFret, setDisplayMode, setRootNote, setEnharmonic);
  }, [visibility, setData, setSelected, data, setStartFret, setEndFret, setDisplayMode, setRootNote, setEnharmonic]);

  const saveSVGMemo = useCallback(() => {
    saveSVG(selected, setSelected, data, updateNote, connectionToolbarVisible, setConnectionToolbarVisible, svgElementRef, inlineCSS, displayMode, rootNote, enharmonic, startFret, endFret, includeMarkers, copyOnly, showNotes, setToastMessage, setToastType, visibility, setVisibility, horizontalCrop, verticalCrop);
  }, [selected, setSelected, data, connectionToolbarVisible, setConnectionToolbarVisible, displayMode, rootNote, enharmonic, startFret, endFret, includeMarkers, copyOnly, showNotes, setToastMessage, setToastType, visibility, setVisibility, horizontalCrop, verticalCrop]);

  const setFretWindowMemo = useCallback((fretWindow) => {
    setFretWindow(fretWindow, startFret, endFret, selected, setSelected, data, setData, updateNote, setToastMessage, setStartFret, setEndFret);
  }, [startFret, endFret, selected, setSelected, data, setData, setToastMessage, setStartFret, setEndFret]);

  // 保存指板状态
  // 防抖：避免短时间内重复保存
  const lastSaveTimeRef = useRef(0);
  const saveFretboardStateMemo = useCallback(async (forceNew = false) => {
    const now = Date.now();
    if (now - lastSaveTimeRef.current < 300) { // 300ms内只允许保存一次
      return;
    }
    lastSaveTimeRef.current = now;

    try {
      let updatedStates = [...historyStates];
      const stateSnapshot = createStateSnapshot({
        data,
        startFret,
        endFret,
        enharmonic,
        displayMode,
        rootNote,
        visibility,
        includeMarkers,
        copyOnly,
        showNotes,
        horizontalCrop,
        verticalCrop,
        currentDirectoryId,
      });

      const thumbnailUrl = generateThumbnail(svgElementRef, {
        selected,
        data,
        displayMode,
        rootNote,
        enharmonic,
        startFret,
        includeMarkers,
        showNotes,
        horizontalCrop,
        verticalCrop,
      });
      if (thumbnailUrl) {
        stateSnapshot.thumbnail = thumbnailUrl;
      }

      const canOverwriteSelected = selectedHistoryState && !forceNew;
      if (canOverwriteSelected) {
        const selectedId = selectedHistoryState.id;
        const existingIndex = updatedStates.findIndex((item) => item.id === selectedId);

        if (existingIndex !== -1) {
          stateSnapshot.id = selectedHistoryState.id;
          stateSnapshot.timestamp = Date.now();
          stateSnapshot.name = selectedHistoryState.name;
          updatedStates[existingIndex] = stateSnapshot;
          updatedStates.splice(existingIndex, 1);
          updatedStates.unshift(stateSnapshot);
        } else {
          updatedStates.unshift(stateSnapshot);
        }
      } else {
        updatedStates.unshift(stateSnapshot);
      }

      // 限制最大数量
      if (updatedStates.length > 50) {
        updatedStates = updatedStates.slice(0, 50);
      }

      setHistoryStates(updatedStates);
      setSelectedHistoryState(stateSnapshot);
      setToastMessage(canOverwriteSelected ? '已覆盖当前指板快照！' : '已加入指板堆！');
      setToastType('success');
    } catch (error) {
      console.error('保存失败:', error);
      setToastMessage('保存失败: ' + error.message);
      setToastType('error');
    }
  }, [data, startFret, endFret, enharmonic, displayMode, rootNote, visibility, includeMarkers, copyOnly, showNotes, horizontalCrop, verticalCrop, setHistoryStates, setToastMessage, setToastType, setSelectedHistoryState, currentDirectoryId, historyStates, selectedHistoryState, svgElementRef, selected]);

  // 恢复指板状态
  const restoreFretboardStateMemo = useCallback((stateSnapshot) => {
    restoreFretboardState(stateSnapshot, {
      setData,
      setStartFret,
      setEndFret,
      setEnharmonic,
      setDisplayMode,
      setRootNote,
      setVisibility,
      setSelected,
      setConnectionMode,
      setConnectionStartNote,
      setConnectionStartPosition,
      setMousePosition,
      setPreviewHoverNote,
      setUseColor2Level,
      setSelectedConnection,
      setConnectionToolbarVisible,
      setToastMessage,
      setToastType,
      setSelectedHistoryState,
      // 恢复配置项
      setIncludeMarkers,
      setCopyOnly,
      setShowNotes,
      setHorizontalCrop,
      setVerticalCrop
    });
  }, [setData, setStartFret, setEndFret, setEnharmonic, setDisplayMode, setRootNote, setVisibility,
    setSelected, setConnectionMode, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level, setSelectedConnection,
    setConnectionToolbarVisible, setToastMessage, setToastType, setSelectedHistoryState,
    setIncludeMarkers, setCopyOnly, setShowNotes, setHorizontalCrop, setVerticalCrop]);

  // 键盘事件 - 使用 ref 保持最新值，避免频繁重新注册导致重复触发
  const handlerParamsRef = useRef();
  handlerParamsRef.current = {
    selected, deleteNote, selectColor: selectColorMemo, cycleLevel1Color: cycleLevel1ColorMemo,
    cycleLevel1ColorReverse: cycleLevel1ColorReverseMemo, cycleLevel2Color: cycleLevel2ColorMemo,
    cycleLevel2ColorReverse: cycleLevel2ColorReverseMemo, undo, redo, hoveredNoteId, hoveredConnectionId, data, setData, visibility,
    connectionMode, setConnectionMode, setConnectionStartNote, setConnectionStartPosition,
    setMousePosition, setPreviewHoverNote, setUseColor2Level, saveFretboardState: saveFretboardStateMemo,
    toggleVisibility: toggleVisibilityMemo, reset: resetMemo, saveSVG: saveSVGMemo,
    selectedColorLevel
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      // 检查是否在输入框中
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
        return;
      }

      const handler = createKeyboardHandler(handlerParamsRef.current);
      handler(event);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // 空依赖数组，只注册一次

  // 生成字符串路径
  const generateStringPathMemo = useCallback((stringIndex) => generateStringPath(stringIndex, fretboardWidth), [fretboardWidth]);

  // 键盘事件 - 使用 ref 保持最新值，避免频繁重新注册导致重复触发

  return (
    <>
      <button
        className={`theme-switch${theme === 'light' ? ' theme-switch--light' : ''}`}
        onClick={toggleTheme}
        title={theme === 'dark' ? '切换亮色模式' : '切换暗色模式'}
        aria-label="Toggle theme"
      >
        <span className="theme-switch__track">
          <span className="theme-switch__thumb">
            <span className="theme-switch__icon">{theme === 'dark' ? '☾' : '☀'}</span>
          </span>
        </span>
      </button>
      <div className="title-header">
        <div className="title-header-inner">
          <h1>
            Fretboard Diagram Generator
          </h1>
          <div className="datetime">{currentDateTime}</div>
          {selectedHistoryState && (
            <>
              <div className="selected-state-name" title="当前应用中的指板堆快照">
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onDoubleClick={(e) => {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(e.target);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }}
                  onBlur={(e) => {
                    const newName = e.target.textContent.trim();
                    if (newName && newName !== selectedHistoryState.name) {
                      const updatedStates = historyStates.map(state =>
                        state.id === selectedHistoryState.id
                          ? { ...state, name: newName }
                          : state
                      );
                      setHistoryStates(updatedStates);
                      setSelectedHistoryState({ ...selectedHistoryState, name: newName });
                    } else {
                      e.target.textContent = selectedHistoryState.name;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.target.blur();
                    } else if (e.key === 'Escape') {
                      e.target.textContent = selectedHistoryState.name;
                      e.target.blur();
                    }
                  }}
                  style={{
                    cursor: 'text',
                    outline: 'none'
                  }}
                  title="双击编辑"
                >
                  {selectedHistoryState.name}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
      <figure className="fretboard-stage">
        <FretboardSVG
          svgElementRef={svgElementRef}
          svgWidth={svgWidth}
          svgHeight={svgHeight}
          svgViewBoxX={svgViewBoxX}
          svgViewBoxY={svgViewBoxY}
          svgViewBoxWidth={svgViewBoxWidth}
          svgViewBoxHeight={svgViewBoxHeight}
          handleSvgClick={handleSvgClick}
          handleSvgMouseMove={handleSvgMouseMove}
          handleSvgMouseDown={handleSvgMouseDown}
          handleSvgContextMenu={handleSvgContextMenu}
          handleSvgWheel={handleSvgWheel}
          fretPath={fretPath}
          markers={markers}
          generateStringPathMemo={generateStringPathMemo}
          notes={notes}
          notesElementRef={notesElementRef}
          data={data}
          visibility={visibility}
          selected={selected}
          connectionMode={connectionMode}
          connectionStartNote={connectionStartNote}
          previewHoverNote={previewHoverNote}
          editingNote={editingNote}
          handleNoteClick={handleNoteClick}
          setPreviewHoverNote={setPreviewHoverNote}
          setUseColor2Level={setUseColor2Level}
          setHoveredNoteId={setHoveredNoteId}
          setHoveredConnectionId={setHoveredConnectionId}
          computeNoteNameMemo={computeNoteNameMemo}
          connections={connections}
          getNotePositionMemo={getNotePositionMemo}
          handleConnectionClickMemo={handleConnectionClickMemo}
          handleConnectionContextMenuMemo={handleConnectionContextMenuMemo}
          connectionStartPosition={connectionStartPosition}
          mousePosition={mousePosition}
          useColor2Level={useColor2Level}
          editableDivVisible={editableDivVisible}
          editableDivX={editableDivX}
          editableDivY={editableDivY}
          editableDivRef={editableDivRef}
          editableText={editableText}
          finishEditing={finishEditing}
          handleEditableKeyDown={handleEditableKeyDown}
          handleEditableClick={handleEditableClick}
          setEditableText={setEditableText}
          connectionToolbarVisible={connectionToolbarVisible}
          selectedConnection={selectedConnection}
          connectionToolbarPosition={connectionToolbarPosition}
          toolbarRef={toolbarRef}
          toolbarDropdown={toolbarDropdown}
          toolbarDropdownDirection={toolbarDropdownDirection}
          setToolbarDropdown={setToolbarDropdown}
          setToolbarDropdownDirection={setToolbarDropdownDirection}
          detectDropdownDirection={detectDropdownDirection}
          dataRef={dataRef}
          buttonClickRef={buttonClickRef}
          setData={setData}
          setConnectionToolbarVisible={setConnectionToolbarVisible}
          setSelectedConnection={setSelectedConnection}
          showNotes={showNotes}
        />
      </figure>
      <FretboardMenu
        selectedColorLevel={selectedColorLevel}
        selectedColor={selectedColor}
        inTintMode={inTintMode}
        onSelectColor={selectColorMemo}
        onOpenTintPalette={openTintPaletteMemo}
        onCycleTintColor={cyclePaletteTintColorMemo}
        onReplaceAllTintNotes={replaceAllTintNotesMemo}
        enharmonic={enharmonic}
        onToggleEnharmonic={toggleEnharmonicMemo}
        onToggleVisibility={toggleVisibilityMemo}
        connectionMode={connectionMode}
        connectionType={connectionType}
        setConnectionType={setConnectionType}
        connectionArrowDirection={connectionArrowDirection}
        setConnectionArrowDirection={setConnectionArrowDirection}
        onToggleConnectionMode={() => {
          setConnectionMode(!connectionMode);
          if (connectionMode) {
            setConnectionStartNote(null);
            setConnectionStartPosition(null);
            setMousePosition(null);
            setPreviewHoverNote(null);
            setUseColor2Level(false);
          }
        }}
        onSaveSVG={saveSVGMemo}
        includeMarkers={includeMarkers}
        setIncludeMarkers={setIncludeMarkers}
        copyOnly={copyOnly}
        setCopyOnly={setCopyOnly}
        showNotes={showNotes}
        setShowNotes={setShowNotes}
        horizontalCrop={horizontalCrop}
        setHorizontalCrop={setHorizontalCrop}
        verticalCrop={verticalCrop}
        setVerticalCrop={setVerticalCrop}
        onSaveState={saveFretboardStateMemo}
        onReset={resetMemo}
        rootNote={rootNote}
        onRootNoteSelect={setRootNote}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        startFret={startFret}
        endFret={endFret}
        onFretWindowChange={setFretWindowMemo}
      />

      <FretboardDock
        historyStates={historyStates}
        currentDirectoryId={currentDirectoryId}
        selectedHistoryState={selectedHistoryState}
        onRestore={restoreFretboardStateMemo}
        onDelete={(stateSnapshot) => {
          const updatedStates = historyStates.filter(item => item.id !== stateSnapshot.id);
          const nextSelectedState = selectedHistoryState?.id === stateSnapshot.id
            ? null
            : selectedHistoryState;
          setHistoryStates(updatedStates);
          setSelectedHistoryState(nextSelectedState);
          setToastMessage('已从指板堆删除');
          setToastType('success');
        }}
        onClear={() => {
          const currentDirectoryStates = historyStates.filter(
            (state) => state.directoryId === currentDirectoryId
          );

          if (currentDirectoryStates.length === 0) {
            return;
          }

          const confirmed = window.confirm('确定要清空当前指板堆吗？此操作不可恢复。');
          if (!confirmed) {
            return;
          }

          const filteredStates = historyStates.filter(
            (state) => state.directoryId !== currentDirectoryId
          );
          const nextSelectedState = selectedHistoryState?.directoryId === currentDirectoryId
            ? null
            : selectedHistoryState;
          setHistoryStates(filteredStates);
          setSelectedHistoryState(nextSelectedState);
          setToastMessage('当前指板堆已清空');
          setToastType('success');
        }}
      />

      <Toast
        message={toastMessage}
        type={toastType}
        duration={toastType === 'error' ? 3000 : 2000}
        onClose={() => setToastMessage('')}
      />
    </>
  );
}

export default Fretboard;
