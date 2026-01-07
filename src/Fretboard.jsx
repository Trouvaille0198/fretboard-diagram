import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import './fretboard.css';
import { CONSTS } from './constants';
import { updateNote, inlineCSS, noteToSolfege, calculateConnectionColor } from './utils';
import { initColorCSSVariables } from './colorConfig';
import { useFretboardState } from './hooks/useFretboardState';
import { useConnectionState } from './hooks/useConnectionState';
import { useHistory } from './hooks/useHistory';
import { useNoteEditing } from './hooks/useNoteEditing';
import { useAuth } from './hooks/useAuth';
import { computeNoteIndex, computeNoteName, generateNotes, generateMarkers, generateFretPath, generateStringPath, getNotePosition } from './utils/fretboardCalculations';
import { detectDropdownDirection, openConnectionToolbar, handleConnectionContextMenu, handleConnectionClick, updateConnectionColors } from './utils/connectionUtils';
import { selectColor, cycleLevel1Color, cycleLevel2Color, toggleVisibility, toggleEnharmonic, reset, saveSVG, setFretWindow, replaceAllTintNotes } from './utils/fretboardActions';
import { generateTintVariants, getLevel1FillColor, getLevel2Color } from './colorConfig';
import { createNoteClickHandler, createNoteContextMenuHandler, createDeleteNoteHandler, createFinishEditingHandler } from './handlers/noteHandlers';
import { createSvgClickHandler, createSvgContextMenuHandler, createSvgMouseMoveHandler, createSvgMouseDownHandler, createSvgWheelHandler, createEditableKeyDownHandler, createEditableClickHandler } from './handlers/svgHandlers';
import { createKeyboardHandler } from './handlers/keyboardHandlers';
import { FretboardMenu } from './components/FretboardMenu';
import { FretboardGallery } from './components/FretboardGallery';
import { Toast } from './components/Toast';
import { FretboardSVG } from './components/FretboardSVG';
import { LoginModal } from './components/LoginModal';
import { saveFretboardState, restoreFretboardState, generateThumbnail, saveFretboardStateSilently, exportAllData } from './utils/fretboardHistory';
import { saveData, loadData } from './utils/api';
import { storageService } from './services/storageService';

function Fretboard() {
  // 认证状态
  const auth = useAuth();
  
  // 同步认证状态到 storageService
  useEffect(() => {
    storageService.setAuthState(auth.isAuthenticated, auth.username);
  }, [auth.isAuthenticated, auth.username]);
  
  // 使用自定义hooks
  const fretboardState = useFretboardState();
  const connectionState = useConnectionState();
  const { undo, redo } = useHistory(fretboardState.data, fretboardState.setData);
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
    selectedHistoryState, setSelectedHistoryState,
    currentDateTime,
    dataRef,
    selectedTimeoutRef,
    // 目录管理
    directories, setDirectories,
    currentDirectoryId, setCurrentDirectoryId,
    createDirectory, renameDirectory, deleteDirectory
  } = fretboardState;

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
  const [includeMarkers, setIncludeMarkers] = useState(true);
  const [copyOnly, setCopyOnly] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  // 异色模式标记
  const [inTintMode, setInTintMode] = useState(false);

  // Refs
  const svgElementRef = useRef(null);
  const notesElementRef = useRef(null);
  const toolbarRef = useRef(null);
  const buttonClickRef = useRef({ type: false, arrow: false });
  const prevNoteColorsRef = useRef({});

  // 计算值
  const numFrets = endFret - startFret;
  const fretboardWidth = CONSTS.fretWidth * numFrets;
  const leftOffset = CONSTS.offsetX + CONSTS.fretWidth / 2;
  const svgWidth = fretboardWidth + leftOffset + CONSTS.offsetX;
  const zeroFretX = CONSTS.offsetX - CONSTS.fretWidth / 2;
  const zeroFretLeftEdge = zeroFretX - CONSTS.circleRadius;
  const svgViewBoxX = zeroFretLeftEdge - 5;
  const svgViewBoxWidth = svgWidth - svgViewBoxX;
  const bottomMarkerY = CONSTS.offsetY + CONSTS.fretHeight + CONSTS.stringSpacing;
  const topMarkerY = CONSTS.offsetY - CONSTS.stringSpacing * 0.7;
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
    connections, connectionType, connectionArrowDirection, updateNote: updateNote
  }), [data, setData, visibility, selected, setSelected, selectedColorLevel, selectedColor,
      setSelectedColorLevel, setSelectedColor,
      connectionMode, connectionStartNote, setConnectionStartNote, setConnectionStartPosition,
      setMousePosition, setPreviewHoverNote, useColor2Level, setUseColor2Level, previewHoverNote, connections, connectionType, connectionArrowDirection]);

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
    notes, data, visibility, setPreviewHoverNote, previewHoverNote
  }), [connectionMode, connectionStartNote, setMousePosition, notes, data, visibility, setPreviewHoverNote, previewHoverNote]);

  const handleSvgMouseDown = useCallback(createSvgMouseDownHandler({
    connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level, setUseColor2Level
  }), [connectionMode, connectionStartNote, previewHoverNote, data, visibility, useColor2Level, setUseColor2Level]);

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

  // 双击颜色：进入异色版本模式
  // 第一层异色：默认选中第三个（浓一档，index 2）
  // 第二层异色：默认选中第一个（淡一档，index 0）
  const doubleClickColorMemo = useCallback((level, color) => {
    const baseColor = level === 1 ? getLevel1FillColor(color) : getLevel2Color(color);
    const variants = generateTintVariants(baseColor);
    // 根据层级选择不同的默认索引
    // 数组已反转：index 0=淡一档, 1=原色, 2=浓一档, 3=浓二档
    const defaultIndex = level === 1 ? 2 : 0; // 第一层选浓一档，第二层选淡一档
    selectColor(level, color, selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor, variants[defaultIndex]);
    setInTintMode(true);
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
    saveSVG(selected, setSelected, data, updateNote, connectionToolbarVisible, setConnectionToolbarVisible, svgElementRef, inlineCSS, displayMode, rootNote, enharmonic, startFret, endFret, includeMarkers, copyOnly, showNotes, setToastMessage, setToastType, visibility, setVisibility);
  }, [selected, setSelected, data, connectionToolbarVisible, setConnectionToolbarVisible, displayMode, rootNote, enharmonic, startFret, endFret, includeMarkers, copyOnly, showNotes, setToastMessage, setToastType, visibility, setVisibility]);

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
      // 构建状态快照
      let stateSnapshot;
      let updatedStates = [...historyStates];
      let isUpdate = false;
      
      if (selectedHistoryState && !forceNew) {
        // 更新现有状态
        stateSnapshot = {
          ...selectedHistoryState,
          timestamp: Date.now(),
          name: new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          }),
          state: {
            data: JSON.parse(JSON.stringify(data)),
            startFret,
            endFret,
            enharmonic,
            displayMode,
            rootNote,
            visibility
          }
        };
        
        // 生成缩略图
        const thumbnailUrl = generateThumbnail(svgElementRef);
        if (thumbnailUrl) {
          stateSnapshot.thumbnail = thumbnailUrl;
        }
        
        const index = updatedStates.findIndex(item => item.id === selectedHistoryState.id);
        if (index !== -1) {
          updatedStates[index] = stateSnapshot;
          updatedStates.splice(index, 1);
          updatedStates.unshift(stateSnapshot);
          isUpdate = true;
        }
      } else {
        // 新建状态
        stateSnapshot = {
          id: Date.now().toString(),
          directoryId: currentDirectoryId,
          timestamp: Date.now(),
          name: new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          }),
          state: {
            data: JSON.parse(JSON.stringify(data)),
            startFret,
            endFret,
            enharmonic,
            displayMode,
            rootNote,
            visibility
          }
        };
        
        // 生成缩略图
        const thumbnailUrl = generateThumbnail(svgElementRef);
        if (thumbnailUrl) {
          stateSnapshot.thumbnail = thumbnailUrl;
        }
        
        updatedStates.unshift(stateSnapshot);
      }
      
      // 限制最大数量
      if (updatedStates.length > 50) {
        updatedStates = updatedStates.slice(0, 50);
      }
      
      // 使用 storageService 保存
      await storageService.saveAll(directories, updatedStates);
      setHistoryStates(updatedStates);
      
      // 保存成功后才设置选中状态（只在新建状态时）
      if (!isUpdate) {
        setSelectedHistoryState(stateSnapshot);
      }
      
      setToastMessage(isUpdate ? '状态已更新！' : '状态已保存！');
      setToastType('success');
    } catch (error) {
      console.error('保存失败:', error);
      setToastMessage('保存失败: ' + error.message);
      setToastType('error');
    }
  }, [data, startFret, endFret, enharmonic, displayMode, rootNote, visibility, setHistoryStates, setToastMessage, setToastType, selectedHistoryState, setSelectedHistoryState, currentDirectoryId, directories, historyStates, svgElementRef]);

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
      setSelectedHistoryState
    });
  }, [setData, setStartFret, setEndFret, setEnharmonic, setDisplayMode, setRootNote, setVisibility,
      setSelected, setConnectionMode, setConnectionStartNote, setConnectionStartPosition,
      setMousePosition, setPreviewHoverNote, setUseColor2Level, setSelectedConnection,
      setConnectionToolbarVisible, setToastMessage, setToastType, setSelectedHistoryState]);

  // 包装目录操作函数，使用 storageService
  const wrappedCreateDirectory = useCallback(async (baseName = 'new') => {
    const result = createDirectory(baseName);
    
    // 同步到存储
    try {
      await storageService.saveAll(directories, historyStates);
    } catch (error) {
      console.error('同步目录失败:', error);
    }
    
    return result;
  }, [createDirectory, directories, historyStates]);
  
  const wrappedRenameDirectory = useCallback(async (dirId, newName) => {
    const result = renameDirectory(dirId, newName);
    
    if (result.success) {
      // 同步到存储
      try {
        await storageService.saveAll(directories, historyStates);
      } catch (error) {
        console.error('同步目录重命名失败:', error);
      }
    }
    
    return result;
  }, [renameDirectory, directories, historyStates]);
  
  const wrappedDeleteDirectory = useCallback(async (dirId) => {
    const result = deleteDirectory(dirId);
    
    if (result.success) {
      // 同步到存储
      try {
        await storageService.saveAll(directories, historyStates);
      } catch (error) {
        console.error('同步目录删除失败:', error);
      }
    }
    
    return result;
  }, [deleteDirectory, directories, historyStates]);

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

  // 加载初始数据（仅登录后）
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (auth.isLoading) return; // 等待认证检查完成
    if (hasLoadedRef.current) return; // 已经加载过
    if (!auth.isAuthenticated) return; // 未登录不加载历史
    
    hasLoadedRef.current = true;
    
    // 从服务器加载
    storageService.loadAll().then(({ directories: loadedDirs, states: loadedStates }) => {
      if (loadedDirs && loadedDirs.length > 0) {
        setDirectories(loadedDirs);
      }
      if (loadedStates && loadedStates.length > 0) {
        setHistoryStates(loadedStates);
      }
      setToastMessage('数据已从服务器加载');
      setToastType('success');
    }).catch(error => {
      console.error('加载数据失败:', error);
      setToastMessage(`加载数据失败: ${error.message}`);
      setToastType('error');
    });
  }, [auth.isAuthenticated, auth.isLoading]);

  // 键盘事件 - 使用 ref 保持最新值，避免频繁重新注册导致重复触发
  const [showLoginModal, setShowLoginModal] = useState(false);

  return (
    <>
      <div className="title-header">
        <div>
          <h1>Fretboard Diagram Generator</h1>
          {selectedHistoryState && (
            <>
              <div className="selected-state-name" title="当前选中的历史状态,保存将更新此状态" style={{ backgroundColor: 'rgba(74, 144, 226, 0.3)', color: 'white' }}>
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
                      saveFretboardStateSilently(updatedStates);
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
              <button
                className="new-state-btn"
                onClick={() => setSelectedHistoryState(null)}
                title="创建新状态(清除选中,保留当前指板状态)"
                style={{
                  marginLeft: '6px',
                  padding: '1px 6px',
                  fontSize: '10px',
                  backgroundColor: 'transparent',
                  border: '1px solid currentColor',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  color: 'inherit'
                }}
              >
                new
              </button>
            </>
          )}
        </div>
        <div className="login-status">
          {auth.isAuthenticated ? (
            <>
              <span style={{ fontSize: '14px', color: '#666' }}>
                用户: {auth.username}
              </span>
              <button
                onClick={auth.logout}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                登出
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
              title="登录后可将数据同步到服务器"
            >
              登录
            </button>
          )}
        </div>
      </div>
      <figure id="fretboard-diagram-creator" className="half-full">
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
        onDoubleClickColor={doubleClickColorMemo}
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
      
      <FretboardGallery
        historyStates={historyStates}
        selectedHistoryState={selectedHistoryState}
        onSelect={setSelectedHistoryState}
        onRestore={restoreFretboardStateMemo}
        // 目录管理
        directories={directories}
        currentDirectoryId={currentDirectoryId}
        onDirectoryChange={setCurrentDirectoryId}
        onDirectoryCreate={wrappedCreateDirectory}
        onDirectoryRename={wrappedRenameDirectory}
        onDirectoryDelete={wrappedDeleteDirectory}
        onExportAll={() => {
          const result = exportAllData();
          setToastMessage(result.message);
          setToastType(result.success ? 'success' : 'error');
        }}
        onBatchImport={(result) => {
          if (result.success) {
            // 使用 storageService 保存
            storageService.saveAll(result.directories, result.historyStates).then(() => {
              setDirectories(result.directories);
              setHistoryStates(result.historyStates);
              setCurrentDirectoryId('default');
              setToastMessage(result.message);
              setToastType('success');
            }).catch(error => {
              console.error('保存失败:', error);
              setToastMessage('保存失败: ' + error.message);
              setToastType('error');
            });
          } else {
            setToastMessage(result.message);
            setToastType('error');
          }
        }}
        onDelete={async (stateSnapshot) => {
          try {
            const updatedStates = historyStates.filter(item => item.id !== stateSnapshot.id);
            await storageService.saveAll(directories, updatedStates);
            setHistoryStates(updatedStates);
            if (selectedHistoryState && selectedHistoryState.id === stateSnapshot.id) {
              setSelectedHistoryState(null);
            }
            setToastMessage('状态已删除！');
            setToastType('success');
          } catch (error) {
            console.error('删除状态失败:', error);
            setToastMessage('删除失败：' + error.message);
            setToastType('error');
          }
        }}
        onClearAll={async () => {
          try {
            await storageService.saveAll(directories, []);
            setHistoryStates([]);
            setSelectedHistoryState(null);
            setToastMessage('所有历史状态已清空！');
            setToastType('success');
          } catch (error) {
            console.error('清空历史状态失败:', error);
            setToastMessage('清空失败：' + error.message);
            setToastType('error');
          }
        }}
        onRename={async (stateSnapshot, newName) => {
          try {
            const updatedStates = historyStates.map(item =>
              item.id === stateSnapshot.id ? { ...item, name: newName } : item
            );
            await storageService.saveAll(directories, updatedStates);
            setHistoryStates(updatedStates);
            if (selectedHistoryState && selectedHistoryState.id === stateSnapshot.id) {
              setSelectedHistoryState(updatedStates.find(item => item.id === stateSnapshot.id));
            }
            setToastMessage('重命名成功！');
            setToastType('success');
          } catch (error) {
            console.error('重命名失败:', error);
            setToastMessage('重命名失败：' + error.message);
            setToastType('error');
          }
        }}
        onImport={async (result) => {
          try {
            if (!result.success) {
              setToastMessage(result.message || '操作失败');
              setToastType('error');
              return;
            }

            // 如果只有消息没有数据，说明是分享操作，只显示消息
            if (!result.data || !result.data.state) {
              if (result.message) {
                setToastMessage(result.message);
                setToastType('success');
                return;
              } else {
                setToastMessage('导入数据格式错误');
                setToastType('error');
                return;
              }
            }

            // 创建新的状态快照对象
            // 如果导入的数据包含名称，使用导入的名称，否则使用默认名称
            const importedName = result.data.name 
              ? result.data.name 
              : new Date().toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                }) + ' (导入)';
            
            // 使用导入的状态数据（包括从 SVG 推断的显示模式）
            const importedStateData = { ...result.data.state };
            
            const importedState = {
              id: Date.now().toString(),
              directoryId: currentDirectoryId, // 添加当前目录 ID
              timestamp: Date.now(),
              name: importedName,
              thumbnail: null,
              state: importedStateData
            };

            // 先恢复导入的状态（这样 SVG 会更新）
            restoreFretboardStateMemo(importedState);

            // 等待 SVG 更新后生成缩略图
            // 使用 requestAnimationFrame 确保 DOM 已更新
            requestAnimationFrame(() => {
              setTimeout(async () => {
                // 生成缩略图
                const thumbnailUrl = generateThumbnail(svgElementRef);
                if (thumbnailUrl) {
                  importedState.thumbnail = thumbnailUrl;
                }

                // 使用 storageService 保存
                try {
                  let updatedStates = [...historyStates];
                  const existingIndex = updatedStates.findIndex(item => item.id === importedState.id);
                  if (existingIndex !== -1) {
                    updatedStates[existingIndex] = importedState;
                  } else {
                    updatedStates.unshift(importedState);
                  }
                  
                  if (updatedStates.length > 50) {
                    updatedStates = updatedStates.slice(0, 50);
                  }
                  
                  await storageService.saveAll(directories, updatedStates);
                  setHistoryStates(updatedStates);
                } catch (error) {
                  console.error('保存导入状态失败:', error);
                }
              }, 100); // 给 SVG 100ms 时间完成渲染
            });

            setToastMessage(result.message || '导入成功！');
            setToastType('success');
          } catch (error) {
            console.error('导入处理失败:', error);
            setToastMessage('导入处理失败：' + error.message);
            setToastType('error');
          }
        }}
        isAuthenticated={auth.isAuthenticated}
        onShowLogin={() => setShowLoginModal(true)}
      />
      
      <Toast 
        message={toastMessage} 
        type={toastType}
        duration={toastType === 'error' ? 3000 : 2000}
        onClose={() => setToastMessage('')}
      />
      
      {showLoginModal && (
        <LoginModal 
          onLogin={async (username) => {
            const result = await auth.login(username);
            if (result.success) {
              setShowLoginModal(false);
              setToastMessage(result.message);
              setToastType('success');
            }
            return result;
          }}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </>
  );
}

export default Fretboard;
