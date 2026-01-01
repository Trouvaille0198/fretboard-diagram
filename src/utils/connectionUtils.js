import { calculateConnectionColor } from '../utils.js';

export function detectDropdownDirection(buttonElement, toolbarRef, svgElementRef) {
    if (!buttonElement || !toolbarRef.current || !svgElementRef.current) {
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

    // 如果下方空间不足，必须向上展开
    if (spaceBelow < estimatedMenuHeight) {
        if (spaceAbove >= estimatedMenuHeight) {
            return 'up';
        }
    }

    // 如果按钮位置很靠下（超过 SVG 的40%），且上方空间足够，向上展开（进一步降低阈值）
    if (buttonPositionRatio > 0.4 && spaceAbove >= estimatedMenuHeight) {
        return 'up';
    }

    // 如果上方空间大于下方空间，且上方空间足够，向上展开
    if (spaceAbove > spaceBelow && spaceAbove >= estimatedMenuHeight) {
        return 'up';
    }

    // 如果按钮位置在 SVG 下半部分（超过35%），且上方空间足够，向上展开（更宽松的条件）
    if (buttonPositionRatio > 0.35 && spaceAbove >= estimatedMenuHeight && spaceAbove > spaceBelow * 0.6) {
        return 'up';
    }

    // 如果上方空间接近下方空间（差距不大），且上方空间足够，向上展开
    if (spaceAbove >= estimatedMenuHeight && spaceAbove > spaceBelow * 0.5 && spaceBelow < estimatedMenuHeight * 1.5) {
        return 'up';
    }

    return 'down';
}

export function openConnectionToolbar(connectionId, connections, getNotePosition, setConnectionToolbarPosition, setSelectedConnection, setConnectionToolbarVisible, setToolbarDropdown) {
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
}

export function handleConnectionContextMenu(event, connectionId, openConnectionToolbar) {
    event.preventDefault();
    event.stopPropagation();
    openConnectionToolbar(connectionId);
}

export function handleConnectionClick(event, connectionId, openConnectionToolbar) {
    event.stopPropagation();
    openConnectionToolbar(connectionId);
}

export function updateConnectionColors(data, setData, calculateConnectionColor) {
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
        let startColor = startColor1;
        let endColor = endColor1;

        if (storedStartColor) {
            if (storedStartColor === startColor2 && startColor2 !== null) {
                startColor = startColor2;
            } else if (storedStartColor === startColor1) {
                startColor = startColor1;
            } else {
                startColor = startColor1;
            }
        }

        if (storedEndColor) {
            if (storedEndColor === endColor2 && endColor2 !== null) {
                endColor = endColor2;
            } else if (storedEndColor === endColor1) {
                endColor = endColor1;
            } else {
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

            // 即使不需要渐变，也要保存gradientColors
            const newGradientColors = { start: startColor, end: endColor };

            // 只更新颜色相关属性，保留其他所有属性
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
}
