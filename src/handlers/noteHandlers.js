import { updateNote } from '../utils';
import { calculateConnectionColor } from '../utils';
import { LEVEL1_COLORS } from '../colorConfig';
import audioService from '../services/audioService';

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
        setSelectedColorLevel,
        setSelectedColor,
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
        connectionType,
        connectionArrowDirection,
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

                    // 处理自定义颜色对象，保存完整的颜色信息
                    const actualStartColor = startNoteDataWithColor.color || 'white';
                    const actualEndColor = endNoteData.color || 'white';
                    const gradientColors = { start: actualStartColor, end: actualEndColor };

                    // 检查两个note是否都只有第一层颜色且是透明色
                    // 需要检查原始note数据，而不是处理后的数据
                    const originalStartNoteData = data[connectionStartNote] || { type: 'note', color: 'white', visibility: visibility };
                    const originalEndNoteData = data[noteId] || { type: 'note', color: 'white', visibility: visibility };
                    const originalStartColor = originalStartNoteData.color || 'white';
                    const originalEndColor = originalEndNoteData.color || 'white';
                    const startColorName = typeof originalStartColor === 'object' ? originalStartColor.name : originalStartColor;
                    const endColorName = typeof originalEndColor === 'object' ? originalEndColor.name : originalEndColor;
                    const startHasColor2 = originalStartNoteData.color2 && originalStartNoteData.color2 !== null;
                    const endHasColor2 = originalEndNoteData.color2 && originalEndNoteData.color2 !== null;
                    const isBothTrans = startColorName === 'trans' && endColorName === 'trans' && !startHasColor2 && !endHasColor2;

                    const existingConnection = existingConnectionId ? connections[existingConnectionId] : null;
                    // 使用当前选择的类型和箭头方向（如果连线已存在，则保留原有样式）
                    // 对于两个透明色note的连线，默认有箭头，方向为始->终（end）
                    const defaultArrowDirection = isBothTrans ? 'end' : connectionArrowDirection;
                    const newConnection = {
                        id: connectionId,
                        startNoteId: connectionStartNote,
                        endNoteId: noteId,
                        type: existingConnection?.type || connectionType,
                        hasArrow: existingConnection?.hasArrow || (defaultArrowDirection !== 'none'),
                        arrowDirection: existingConnection?.arrowDirection || defaultArrowDirection,
                        strokeWidth: existingConnection?.strokeWidth || (isBothTrans ? 2 : 3),
                        strokeDasharray: existingConnection?.strokeDasharray || (isBothTrans ? '8,4' : undefined),
                        arcCurvature: existingConnection?.arcCurvature || (connectionType === 'arc' ? 0.7 : 0),
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
            // 获取实际的颜色名称用于比较
            const actualSelectedColorName = typeof selectedColor === 'object' ? selectedColor.name : selectedColor;
            const actualCurrentColorName = currentColor && typeof currentColor === 'object' ? currentColor.name : currentColor;
            // 检查选中的是否是异色（有 custom 字段）
            const isSelectedTint = typeof selectedColor === 'object' && selectedColor.custom;

            if (actualCurrentColorName === actualSelectedColorName) {
                // 如果选中的是异色，且当前也是异色（同色），清除颜色
                const isCurrentTint = typeof currentColor === 'object' && currentColor.custom;
                if (isSelectedTint && isCurrentTint) {
                    // 检查是否是同一个异色（custom 值相同）
                    const currentCustom = currentColor.custom;
                    const selectedCustom = selectedColor.custom;
                    if (currentCustom === selectedCustom) {
                        // 同色异色，清除
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
                        // 不同异色，覆盖
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
                } else if (isSelectedTint && !isCurrentTint) {
                    // 选中的是异色，但当前不是异色，应用异色
                    updateNoteFn(noteElement, data, { color: selectedColor, visibility: 'visible' });
                    setData(prevData => {
                        const newData = { ...prevData };
                        if (!(noteId in newData)) {
                            newData[noteId] = {};
                        }
                        newData[noteId] = { ...newData[noteId], color: selectedColor, visibility: 'visible' };
                        return newData;
                    });
                } else if (currentVisibility === 'visible') {
                    // 如果选中的不是异色，且当前是visible，清除颜色
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
                    // 如果选中的不是异色，且当前不是visible，应用颜色
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
                // 颜色名称不同，直接应用选中的颜色
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
            // 获取实际的颜色名称用于比较
            const actualSelectedColorName = typeof selectedColor === 'object' ? selectedColor.name : selectedColor;
            const actualCurrentColor2Name = currentColor2 && typeof currentColor2 === 'object' ? currentColor2.name : currentColor2;
            // 检查选中的是否是异色（有 custom 字段）
            const isSelectedTint = typeof selectedColor === 'object' && selectedColor.custom;

            if (actualCurrentColor2Name === actualSelectedColorName) {
                // 如果选中的是异色，且当前也是异色（同色），清除第二层颜色
                const isCurrentTint = typeof currentColor2 === 'object' && currentColor2.custom;
                if (isSelectedTint && isCurrentTint) {
                    // 检查是否是同一个异色（custom 值相同）
                    const currentCustom = currentColor2.custom;
                    const selectedCustom = selectedColor.custom;
                    if (currentCustom === selectedCustom) {
                        // 同色异色，清除第二层颜色
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
                        // 不同异色，覆盖
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
                } else if (isSelectedTint && !isCurrentTint) {
                    // 选中的是异色，但当前不是异色，应用异色
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
                } else {
                    // 如果选中的不是异色，清除第二层颜色
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
                }
            } else {
                // 颜色名称不同，直接应用选中的颜色
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

        // 如果没有选中调色盘，自动选中透明色并用透明色着色
        const defaultTransColor = LEVEL1_COLOR_ORDER[0]; // 第一层第一个颜色（trans）
        if (selectedColorLevel === null || selectedColor === null) {
            // 自动选中透明色
            setSelectedColorLevel(1);
            setSelectedColor(defaultTransColor);

            // 用透明色给note着色
            if (currentColor === defaultTransColor) {
                if (currentVisibility === 'visible') {
                    updateNoteFn(noteElement, data, { color: 'white', visibility: visibility });
                    setData(prevData => {
                        const newData = { ...prevData };
                        if (!(noteId in newData)) {
                            newData[noteId] = {};
                        }
                        newData[noteId] = { ...newData[noteId], color: 'white', visibility: visibility };
                        return newData;
                    });
                } else {
                    updateNoteFn(noteElement, data, { color: defaultTransColor, visibility: 'visible' });
                    setData(prevData => {
                        const newData = { ...prevData };
                        if (!(noteId in newData)) {
                            newData[noteId] = {};
                        }
                        newData[noteId] = { ...newData[noteId], color: defaultTransColor, visibility: 'visible' };
                        return newData;
                    });
                }
            } else {
                updateNoteFn(noteElement, data, { color: defaultTransColor, visibility: 'visible' });
                setData(prevData => {
                    const newData = { ...prevData };
                    if (!(noteId in newData)) {
                        newData[noteId] = {};
                    }
                    newData[noteId] = { ...newData[noteId], color: defaultTransColor, visibility: 'visible' };
                    return newData;
                });
            }
            return;
        }
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
