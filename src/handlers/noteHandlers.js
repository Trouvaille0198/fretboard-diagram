import { updateNote } from '../utils';
import { calculateConnectionColor } from '../utils';
import { LEVEL1_COLORS } from '../colorConfig';

const LEVEL1_COLOR_ORDER = Object.keys(LEVEL1_COLORS);

export function createNoteClickHandler(params) {
    const {
        data,
        setData,
        visibility,
        selected,
        setSelected,
        selectedColorLevel,
        selectedColor,
        connectionMode,
        connectionStartNote,
        setConnectionStartNote,
        setConnectionStartPosition,
        setMousePosition,
        setPreviewHoverNote,
        useColor2Level,
        setUseColor2Level,
        previewHoverNote,
        connections,
        updateNote: updateNoteFn
    } = params;

    return (event, noteId) => {
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

                    // 如果起点note有color2，考虑用户通过中键切换的逻辑
                    if (startNoteData.color2 && startNoteData.color2 !== null) {
                        const color1IsWhite = !startNoteData.color || startNoteData.color === 'white';

                        if (color1IsWhite) {
                            startNoteData = { ...startNoteData, color: startNoteData.color2 };
                        } else if (useColor2Level) {
                            startNoteData = { ...startNoteData, color: startNoteData.color2 };
                        }
                    } else {
                        // 从DOM元素的class中提取实际颜色
                        let actualStartColorFromData = startNoteData.color;
                        if (!actualStartColorFromData || actualStartColorFromData === 'white') {
                            if (startNoteElement) {
                                const classList = startNoteElement.className?.baseVal?.split(' ') || startNoteElement.className?.split(' ') || [];
                                const colorClass = classList.find(cls => LEVEL1_COLOR_ORDER.includes(cls));
                                if (colorClass) {
                                    actualStartColorFromData = colorClass;
                                }
                            }
                        }
                        startNoteData = { ...startNoteData, color: actualStartColorFromData || 'white' };
                    }

                    const startNoteDataWithColor = startNoteData;
                    const startVisibility = startNoteDataWithColor.visibility || visibility;
                    if (startVisibility !== 'visible') {
                        setConnectionStartNote(null);
                        setConnectionStartPosition(null);
                        setMousePosition(null);
                        setPreviewHoverNote(null);
                        setUseColor2Level(false);
                        return;
                    }

                    // 创建连线
                    let endNoteData = noteData;

                    // 如果终点note有color2，优先使用color2
                    if (endNoteData.color2 && endNoteData.color2 !== null) {
                        const color1IsWhite = !endNoteData.color || endNoteData.color === 'white';

                        if (color1IsWhite) {
                            endNoteData = { ...endNoteData, color: endNoteData.color2 };
                        } else if (useColor2Level) {
                            endNoteData = { ...endNoteData, color: endNoteData.color2 };
                        }
                    }

                    // 检查是否已存在相同起点和终点的连线
                    const existingConnectionId = Object.keys(connections).find(connId => {
                        const conn = connections[connId];
                        return (conn.startNoteId === connectionStartNote && conn.endNoteId === noteId) ||
                            (conn.startNoteId === noteId && conn.endNoteId === connectionStartNote);
                    });

                    const connectionId = existingConnectionId || `conn-${Date.now()}`;
                    const connectionColor = calculateConnectionColor(startNoteDataWithColor, endNoteData, connectionId);
                    const actualStartColor = startNoteDataWithColor.color || 'white';
                    const actualEndColor = endNoteData.color || 'white';
                    const gradientColors = { start: actualStartColor, end: actualEndColor };

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
                // 如果note不是visible的，且没有选中调色盘，则return
                if (!selectedColorLevel) {
                    return;
                }
            }
        }

        // 如果选中了第一层级调色盘
        if (selectedColorLevel === 1 && selectedColor !== null) {
            if (currentColor === selectedColor) {
                if (currentVisibility === 'visible') {
                    if (currentColor2 && currentColor2 !== null) {
                        updateNoteFn(noteElement, data, { color: 'white', visibility: 'visible' });
                        setData(prevData => {
                            const newData = { ...prevData };
                            if (!(noteId in newData)) {
                                newData[noteId] = {};
                            }
                            newData[noteId] = { ...newData[noteId], color: 'white', visibility: 'visible' };
                            return newData;
                        });
                    } else {
                        updateNoteFn(noteElement, data, { color: 'white', visibility: visibility });
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
                    updateNoteFn(noteElement, data, { color: selectedColor, visibility: 'visible' });
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
                updateNoteFn(noteElement, data, { color: selectedColor, visibility: 'visible' });
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
            if (currentColor2 === selectedColor) {
                const newVisibility = (currentColor === 'white') ? visibility : 'visible';
                updateNoteFn(noteElement, data, { color2: null, visibility: newVisibility });
                setData(prevData => {
                    const newData = { ...prevData };
                    if (!(noteId in newData)) {
                        newData[noteId] = {};
                    }
                    newData[noteId] = { ...newData[noteId], color2: null, visibility: newVisibility };
                    return newData;
                });
            } else {
                const newVisibility = currentVisibility === 'visible' ? 'visible' : 'visible';
                updateNoteFn(noteElement, data, { color2: selectedColor, visibility: newVisibility });
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
        if (currentVisibility === 'visible') {
            updateNoteFn(noteElement, data, { color: 'white', color2: null, visibility: visibility });
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
                updateNoteFn(prevElement, data, { visibility: 'visible' });
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
        updateNoteFn(noteElement, data, { visibility: 'selected' });
        setData(prevData => {
            const newData = { ...prevData };
            if (!(noteId in newData)) {
                newData[noteId] = {};
            }
            newData[noteId] = { ...newData[noteId], visibility: 'selected' };
            return newData;
        });
        setSelected({ id: noteId, element: noteElement });
    };
}

export function createNoteContextMenuHandler(params) {
    const { selected, setSelected, data, setData, updateNote: updateNoteFn } = params;

    return (event, noteId) => {
        event.preventDefault();
        event.stopPropagation();
        const noteElement = event.currentTarget;

        if (selected) {
            const prevElement = selected.element || document.getElementById(selected.id);
            if (prevElement) {
                updateNoteFn(prevElement, data, { visibility: 'visible' });
                setData(prevData => {
                    const newData = { ...prevData };
                    if (selected.id in newData) {
                        newData[selected.id] = { ...newData[selected.id], visibility: 'visible' };
                    }
                    return newData;
                });
            }
        }
        updateNoteFn(noteElement, data, { visibility: 'selected' });
        setData(prevData => {
            const newData = { ...prevData };
            if (!(noteId in newData)) {
                newData[noteId] = {};
            }
            newData[noteId] = { ...newData[noteId], visibility: 'selected' };
            return newData;
        });
        setSelected({ id: noteId, element: noteElement });
    };
}

export function createDeleteNoteHandler(params) {
    const { selected, setSelected, visibility, data, setData, updateNote: updateNoteFn } = params;

    return () => {
        if (selected) {
            const noteElement = selected.element || document.getElementById(selected.id);
            if (noteElement) {
                updateNoteFn(noteElement, data, {
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
            }
            setSelected(null);
        }
    };
}

export function createFinishEditingHandler(params) {
    const { editingNote, setEditingNote, editableText, setEditableText, setEditableDivVisible, data, setData, updateNote: updateNoteFn } = params;

    return () => {
        if (editingNote) {
            const noteElement = document.getElementById(editingNote);
            if (noteElement) {
                if (editableText.trim()) {
                    updateNoteFn(noteElement, data, { noteText: editableText.trim() });
                    setData(prevData => {
                        const newData = { ...prevData };
                        if (!(editingNote in newData)) {
                            newData[editingNote] = {};
                        }
                        newData[editingNote] = { ...newData[editingNote], noteText: editableText.trim() };
                        return newData;
                    });
                } else {
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
    };
}
