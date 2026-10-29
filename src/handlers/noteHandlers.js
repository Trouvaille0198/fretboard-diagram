import { updateNote, getNoteSplitMode, getSplitTargetFromPoint, getColorName, detectNoteAtPosition, calculateConnectionColor } from '../utils';
import { adaptiveArcCurvature, isSolidNoteData, isSemitoneSlidePair } from '../utils/connectionUtils';
import { CONSTS } from '../constants';
import { LEVEL1_COLORS } from '../colorConfig';

const LEVEL1_COLOR_ORDER = Object.keys(LEVEL1_COLORS);

// 在两个音符之间创建/覆盖一条连线（拖拽松开时调用）
// 预设决定形状、方向和粗细；重新连线同一对音符时也按当前预设覆盖样式
// ghost=true：半音划音——从空音符（未着色）连到实音；样式仍走预设体系，颜色为 灰→实音色 渐变
export function createConnectionBetweenNotes({
    startNoteId,
    endNoteId,
    data,
    visibility,
    connections,
    connectionPreset,
    useColor2Level,
    ghost = false,
    setData
}) {
    const startNoteElement = document.getElementById(startNoteId);
    let startNoteData = data[startNoteId] || { type: 'note', color: 'white', visibility: visibility };

    // 如果起点note有color2，考虑用户通过中键切换的逻辑
    if (startNoteData.color2 && startNoteData.color2 !== null) {
        const color1IsWhite = !startNoteData.color || startNoteData.color === 'white';

        if (color1IsWhite || useColor2Level) {
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

    // 半音划音的起点本来就是空音符（未着色），跳过起点可见性检查；终点是否实音由调用方校验
    if (!ghost && (startNoteData.visibility || visibility) !== 'visible') {
        return false;
    }

    // 如果终点note有color2，优先使用color2
    let endNoteData = data[endNoteId] || { type: 'note', color: 'white', visibility: visibility };
    if (endNoteData.color2 && endNoteData.color2 !== null) {
        const color1IsWhite = !endNoteData.color || endNoteData.color === 'white';

        if (color1IsWhite || useColor2Level) {
            endNoteData = { ...endNoteData, color: endNoteData.color2 };
        }
    }

    // 检查是否已存在相同起点和终点的连线
    const existingConnectionId = Object.keys(connections || {}).find(connId => {
        const conn = connections[connId];
        return (conn.startNoteId === startNoteId && conn.endNoteId === endNoteId) ||
            (conn.startNoteId === endNoteId && conn.endNoteId === startNoteId);
    });

    const connectionId = existingConnectionId || `conn-${Date.now()}`;

    // 弧线默认凸向随位置自适应：上半指板朝上凸、下半指板朝下凸（背离指板中心）
    const centerOf = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const x = parseFloat(el.getAttribute('data-x')), y = parseFloat(el.getAttribute('data-y'));
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    };
    const arcCurvature = connectionPreset.type === 'arc'
        ? adaptiveArcCurvature(centerOf(startNoteId), centerOf(endNoteId), connectionPreset.arcCurvature)
        : connectionPreset.arcCurvature;
    const connectionColor = calculateConnectionColor(startNoteData, endNoteData, connectionId);

    // 处理自定义颜色对象，保存完整的颜色信息
    const gradientColors = { start: startNoteData.color || 'white', end: endNoteData.color || 'white' };

    // 检查两个note是否都只有第一层颜色且是透明色（需要检查原始note数据，而不是处理后的数据）
    const originalStartNoteData = data[startNoteId] || { type: 'note', color: 'white', visibility: visibility };
    const originalEndNoteData = data[endNoteId] || { type: 'note', color: 'white', visibility: visibility };
    const startColorName = typeof originalStartNoteData.color === 'object' ? originalStartNoteData.color.name : (originalStartNoteData.color || 'white');
    const endColorName = typeof originalEndNoteData.color === 'object' ? originalEndNoteData.color.name : (originalEndNoteData.color || 'white');
    const startHasColor2 = originalStartNoteData.color2 && originalStartNoteData.color2 !== null;
    const endHasColor2 = originalEndNoteData.color2 && originalEndNoteData.color2 !== null;
    const isBothTrans = startColorName === 'trans' && endColorName === 'trans' && !startHasColor2 && !endHasColor2;

    // 两端都是单色（透明色）时沿用细虚线，方便画音阶走向
    const presetHasArrow = connectionPreset.arrowDirection !== 'none';
    const useDashedStyle = isBothTrans && presetHasArrow;
    const newConnection = {
        id: connectionId,
        startNoteId: startNoteId,
        endNoteId: endNoteId,
        type: connectionPreset.type,
        hasArrow: presetHasArrow,
        arrowDirection: connectionPreset.arrowDirection,
        strokeWidth: useDashedStyle ? 2 : connectionPreset.strokeWidth,
        strokeDasharray: useDashedStyle ? '8,4' : undefined,
        arcCurvature,
        color: connectionColor,
        gradientColors: gradientColors,
        ghost: ghost || undefined
    };

    setData(prevData => {
        const newData = { ...prevData };
        if (!newData.connections) {
            newData.connections = {};
        }
        newData.connections[connectionId] = newConnection;
        return newData;
    });

    return true;
}

// 连线模式：按下音符即开始拖拽连线。
// 实音（已着色）＝普通连线起点；空音符（未着色）也允许起拖＝半音划音手势，
// 合法落点（同弦相邻一品的实音）在松手时校验；快速点按空音符不拖动仍是着色端点（click 照常触发）
export function createNoteMouseDownHandler(params) {
    const {
        connectionMode,
        notes,
        setConnectionStartNote,
        setConnectionStartPosition,
        connectionDragActiveRef
    } = params;

    return (event, noteId) => {
        if (!connectionMode || event.button !== 0) {
            return;
        }

        const note = notes.find(n => n.id === noteId);
        if (!note) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        // 同步标记拖拽进行中：touchmove 守卫需要在下一次事件里读到（React 状态更新来不及）
        if (connectionDragActiveRef) {
            connectionDragActiveRef.current = true;
        }
        setConnectionStartNote(noteId);
        setConnectionStartPosition({ x: note.x, y: note.y });
    };
}

// 拖拽连线松开：落在可见的目标音符上则生成连线，否则取消（挂在 window 上，拖出指板也能正确收尾）
// 起点是空音符时按"半音划音"处理：落点必须是同弦相邻一品（±1 品）的实音，违规 toast 报错并取消
export function createConnectionDragEndHandler(params) {
    const {
        connectionMode,
        connectionStartNote,
        notes,
        data,
        visibility,
        svgElementRef,
        connections,
        connectionPreset,
        useColor2Level,
        setData,
        setConnectionStartNote,
        setConnectionStartPosition,
        setMousePosition,
        setPreviewHoverNote,
        setUseColor2Level,
        connectionDragActiveRef,
        toast
    } = params;

    return (event) => {
        if (!connectionMode || !connectionStartNote) {
            return;
        }
        // 系统打断手势（如滚动手势接管）时直接取消
        if (event.type === 'pointercancel') {
            if (connectionDragActiveRef) {
                connectionDragActiveRef.current = false;
            }
            setConnectionStartNote(null);
            setConnectionStartPosition(null);
            setMousePosition(null);
            setPreviewHoverNote(null);
            setUseColor2Level(false);
            return;
        }
        // 只响应左键/主指针松开，右键（退出连线模式）不触发
        if (event.button !== undefined && event.button !== 0) {
            return;
        }

        const clearPending = () => {
            if (connectionDragActiveRef) {
                connectionDragActiveRef.current = false;
            }
            setConnectionStartNote(null);
            setConnectionStartPosition(null);
            setMousePosition(null);
            setPreviewHoverNote(null);
            setUseColor2Level(false);
        };

        const svg = svgElementRef.current;
        if (!svg || !svg.getScreenCTM()) {
            clearPending();
            return;
        }

        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());

        const dropNote = detectNoteAtPosition(svgPoint.x, svgPoint.y, notes, CONSTS.circleRadius);
        if (!dropNote || dropNote.id === connectionStartNote) {
            clearPending();
            return;
        }

        const dropNoteData = data[dropNote.id] || { type: 'note', color: 'white', visibility: visibility };
        if ((dropNoteData.visibility || visibility) !== 'visible') {
            clearPending();
            return;
        }

        // 空音符起拖＝半音划音手势：落点必须是实音，且与起点同弦、相邻恰一品（开放弦按 0 品计）
        const ghostDrag = !isSolidNoteData(data[connectionStartNote], visibility);
        if (ghostDrag) {
            const dropSolid = isSolidNoteData(data[dropNote.id], visibility);
            if (!dropSolid || !isSemitoneSlidePair(connectionStartNote, dropNote.id)) {
                toast?.('半音划音：只能从空音符连到同弦相邻一品（±1 品）的实音上', 'error');
                clearPending();
                return;
            }
        }

        createConnectionBetweenNotes({
            startNoteId: connectionStartNote,
            endNoteId: dropNote.id,
            data,
            visibility,
            connections,
            connectionPreset,
            useColor2Level,
            ghost: ghostDrag,
            setData
        });
        if (ghostDrag) {
            toast?.('已画半音划音（空音滑入实音，样式随连线预设）', 'success');
        }
        clearPending();
    };
}

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
        consumePendingBrushClick,
        updateNote: updateNoteFn
    } = params;

    const colorsMatch = (left, right) => {
        if (left === right) return true;
        if (!left || !right) return false;
        if (typeof left === 'object' && typeof right === 'object') {
            return left.name === right.name && left.custom === right.custom;
        }
        return false;
    };

    const isSingleOnlyColor = (color) => getColorName(color) === 'trans';

    return (event, noteId) => {
        if (consumePendingBrushClick && consumePendingBrushClick()) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        event.stopPropagation();
        const noteElement = event.currentTarget;
        noteElement.focus();

        const noteData = data[noteId] || { type: 'note', color: 'white', visibility: visibility };
        const currentColor = noteData.color || 'white';
        const currentColor2 = noteData.color2 || null;
        const currentVisibility = noteData.visibility || visibility;
        const pointerX = ('clientX' in event) ? event.clientX : 0;
        const pointerY = ('clientY' in event) ? event.clientY : 0;
        const circleRect = noteElement.querySelector('circle')?.getBoundingClientRect();
        const localX = circleRect ? pointerX - (circleRect.left + circleRect.width / 2) : 0;
        const localY = circleRect ? pointerY - (circleRect.top + circleRect.height / 2) : 0;

        // 连线模式下：可见音符只作为拖拽连线的端点（按下→拖动→松开），单击不再画线；
        // 不可见音符仍可先着色，方便准备端点
        if (connectionMode) {
            if (currentVisibility === 'visible') {
                return;
            }
            if (!selectedColorLevel) {
                return;
            }
        }

        // 单排调色盘：统一通过选中的颜色驱动 note 的第一色/第二色
        if (selectedColorLevel === 1 && selectedColor !== null) {
            const hasPrimaryColor = currentColor && currentColor !== 'white';
            const hasSecondaryColor = currentColor2 && currentColor2 !== null;
            const selectedIsSingleOnly = isSingleOnlyColor(selectedColor);
            const currentHasSingleOnlyColor = isSingleOnlyColor(currentColor) || isSingleOnlyColor(currentColor2);

            let update;

            if (!hasPrimaryColor || currentVisibility !== 'visible') {
                update = { color: selectedColor, color2: null, visibility: 'visible' };
            } else if (selectedIsSingleOnly || currentHasSingleOnlyColor) {
                if (colorsMatch(currentColor, selectedColor) && !hasSecondaryColor) {
                    update = { visibility: 'visible' };
                } else {
                    update = { color: selectedColor, color2: null, visibility: 'visible' };
                }
            } else if (!hasSecondaryColor) {
                if (colorsMatch(currentColor, selectedColor)) {
                    update = { visibility: 'visible' };
                } else {
                    const targetKey = getSplitTargetFromPoint(getNoteSplitMode(noteData), localX, localY);
                    if (targetKey === 'color') {
                        update = { color: selectedColor, color2: currentColor, visibility: 'visible' };
                    } else {
                        update = { color: currentColor, color2: selectedColor, visibility: 'visible' };
                    }
                }
            } else {
                const targetKey = getSplitTargetFromPoint(getNoteSplitMode(noteData), localX, localY);
                const targetColor = targetKey === 'color' ? currentColor : currentColor2;
                const otherKey = targetKey === 'color' ? 'color2' : 'color';
                const otherColor = otherKey === 'color' ? currentColor : currentColor2;
                if (colorsMatch(targetColor, selectedColor)) {
                    update = { visibility: 'visible' };
                } else if (colorsMatch(otherColor, selectedColor)) {
                    update = { color: selectedColor, color2: null, visibility: 'visible' };
                } else {
                    update = { [targetKey]: selectedColor, visibility: 'visible' };
                }
            }

            updateNoteFn(noteElement, data, update);
            setData(prevData => {
                const newData = { ...prevData };
                if (!(noteId in newData)) {
                    newData[noteId] = {};
                }
                newData[noteId] = { ...newData[noteId], ...update };
                return newData;
            });
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
