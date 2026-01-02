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
import { selectColor, cycleLevel1Color, cycleLevel2Color, toggleVisibility, toggleEnharmonic, reset, saveSVG, setFretWindow } from './utils/fretboardActions';
import { createNoteClickHandler, createNoteContextMenuHandler, createDeleteNoteHandler, createFinishEditingHandler } from './handlers/noteHandlers';
import { createSvgClickHandler, createSvgContextMenuHandler, createSvgMouseMoveHandler, createSvgMouseDownHandler, createSvgWheelHandler, createEditableKeyDownHandler, createEditableClickHandler } from './handlers/svgHandlers';
import { createKeyboardHandler } from './handlers/keyboardHandlers';
import { FretboardMenu } from './components/FretboardMenu';
import { FretboardGallery } from './components/FretboardGallery';
import { Toast } from './components/Toast';
import { FretboardSVG } from './components/FretboardSVG';
import { saveFretboardState, restoreFretboardState, generateThumbnail } from './utils/fretboardHistory';

function Fretboard() {
  // 使用自定义hooks
  const fretboardState = useFretboardState();
  const connectionState = useConnectionState();
  const { undo } = useHistory(fretboardState.data, fretboardState.setData);
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
    selectedTimeoutRef
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
  const [copyOnly, setCopyOnly] = useState(false);

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
  const selectColorMemo = useCallback((level, color) => {
    selectColor(level, color, selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor);
  }, [selectedColorLevel, selectedColor, setSelectedColorLevel, setSelectedColor]);

  const cycleLevel1ColorMemo = useCallback(() => {
    cycleLevel1Color(selectedColorLevel, selectedColor, selectColorMemo);
  }, [selectedColorLevel, selectedColor, selectColorMemo]);

  const cycleLevel2ColorMemo = useCallback(() => {
    cycleLevel2Color(selectedColorLevel, selectedColor, selectColorMemo);
  }, [selectedColorLevel, selectedColor, selectColorMemo]);

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

  const resetMemo = useCallback(() => {
    reset(visibility, setData, setSelected, notesElementRef, data, updateNote, setStartFret, setEndFret, setDisplayMode, setRootNote, setEnharmonic);
  }, [visibility, setData, setSelected, data, setStartFret, setEndFret, setDisplayMode, setRootNote, setEnharmonic]);

  const saveSVGMemo = useCallback(() => {
    saveSVG(selected, setSelected, data, updateNote, connectionToolbarVisible, setConnectionToolbarVisible, svgElementRef, inlineCSS, displayMode, rootNote, enharmonic, startFret, endFret, includeMarkers, copyOnly, setToastMessage, setToastType);
  }, [selected, setSelected, data, connectionToolbarVisible, setConnectionToolbarVisible, displayMode, rootNote, enharmonic, startFret, endFret, includeMarkers, copyOnly, setToastMessage, setToastType]);

  const setFretWindowMemo = useCallback((fretWindow) => {
    setFretWindow(fretWindow, startFret, endFret, selected, setSelected, data, setData, updateNote, setToastMessage, setStartFret, setEndFret);
  }, [startFret, endFret, selected, setSelected, data, setData, setToastMessage, setStartFret, setEndFret]);

  // 保存指板状态
  const saveFretboardStateMemo = useCallback((forceNew = false) => {
    saveFretboardState({
      data,
      startFret,
      endFret,
      enharmonic,
      displayMode,
      rootNote,
      visibility,
      svgElementRef,
      setHistoryStates,
      setToastMessage,
      setToastType,
      selectedHistoryState,
      setSelectedHistoryState,
      forceNew
    });
  }, [data, startFret, endFret, enharmonic, displayMode, rootNote, visibility, setHistoryStates, setToastMessage, setToastType, selectedHistoryState, setSelectedHistoryState]);

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

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = createKeyboardHandler({
      selected, deleteNote, selectColor: selectColorMemo, cycleLevel1Color: cycleLevel1ColorMemo,
      cycleLevel2Color: cycleLevel2ColorMemo, undo, hoveredNoteId, hoveredConnectionId, data, setData, visibility,
      connectionMode, setConnectionMode, setConnectionStartNote, setConnectionStartPosition,
      setMousePosition, setPreviewHoverNote, setUseColor2Level, saveFretboardState: saveFretboardStateMemo,
      toggleVisibility: toggleVisibilityMemo, reset: resetMemo
    });

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected, deleteNote, selectColorMemo, cycleLevel1ColorMemo, cycleLevel2ColorMemo, undo, hoveredNoteId, hoveredConnectionId, data, setData, visibility,
      connectionMode, setConnectionMode, setConnectionStartNote, setConnectionStartPosition,
      setMousePosition, setPreviewHoverNote, setUseColor2Level, saveFretboardStateMemo, toggleVisibilityMemo, resetMemo]);

  // 生成字符串路径
  const generateStringPathMemo = useCallback((stringIndex) => generateStringPath(stringIndex, fretboardWidth), [fretboardWidth]);

  // 渲染SVG内容（这部分代码太长，暂时保留在原文件中，后续可以进一步拆分）
  // 由于SVG渲染代码非常复杂（包含渐变、连线、预览线等），暂时保留在原位置
  // 这里只展示主要结构

  return (
    <>
      <div className="title-header">
        <h1>Fretboard Diagram Generator</h1>
        <div className="datetime">{currentDateTime}</div>
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
        />
      </figure>
      <FretboardMenu
        selectedColorLevel={selectedColorLevel}
        selectedColor={selectedColor}
        onSelectColor={selectColorMemo}
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
        onDelete={(stateSnapshot) => {
          try {
            const existingHistory = localStorage.getItem('fretboard-history');
            let historyArray = [];
            if (existingHistory) {
              historyArray = JSON.parse(existingHistory);
            }
            historyArray = historyArray.filter(item => item.id !== stateSnapshot.id);
            localStorage.setItem('fretboard-history', JSON.stringify(historyArray));
            setHistoryStates(historyArray);
            // 如果删除的是选中的状态，清除选中
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
        onClearAll={() => {
          try {
            localStorage.removeItem('fretboard-history');
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
        onRename={(stateSnapshot, newName) => {
          try {
            const existingHistory = localStorage.getItem('fretboard-history');
            let historyArray = [];
            if (existingHistory) {
              historyArray = JSON.parse(existingHistory);
            }
            const index = historyArray.findIndex(item => item.id === stateSnapshot.id);
            if (index !== -1) {
              historyArray[index] = { ...historyArray[index], name: newName };
              localStorage.setItem('fretboard-history', JSON.stringify(historyArray));
              setHistoryStates(historyArray);
              // 如果重命名的是选中的状态，更新选中状态
              if (selectedHistoryState && selectedHistoryState.id === stateSnapshot.id) {
                setSelectedHistoryState(historyArray[index]);
              }
              setToastMessage('重命名成功！');
              setToastType('success');
            }
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
              setTimeout(() => {
                // 生成缩略图
                const thumbnailUrl = generateThumbnail(svgElementRef);
                if (thumbnailUrl) {
                  importedState.thumbnail = thumbnailUrl;
                }

                // 保存到历史记录
                const existingHistory = localStorage.getItem('fretboard-history');
                let historyArray = [];
                if (existingHistory) {
                  try {
                    historyArray = JSON.parse(existingHistory);
                  } catch (e) {
                    console.error('解析历史记录失败:', e);
                    historyArray = [];
                  }
                }

                // 检查是否已存在（避免重复添加）
                const existingIndex = historyArray.findIndex(item => item.id === importedState.id);
                if (existingIndex !== -1) {
                  // 更新已存在的项（更新缩略图）
                  historyArray[existingIndex] = importedState;
                } else {
                  // 添加到数组开头
                  historyArray.unshift(importedState);
                }

                // 限制最大数量
                if (historyArray.length > 50) {
                  historyArray = historyArray.slice(0, 50);
                }

                // 保存到 localStorage
                localStorage.setItem('fretboard-history', JSON.stringify(historyArray));
                setHistoryStates(historyArray);
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
