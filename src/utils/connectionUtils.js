import { calculateConnectionColor, calculateArcPath, getPointOnPathAtDistance } from '../utils.js';
import { CONSTS } from '../constants.js';

// 音符是否为"实音"（板上真正点亮的端点）：visible/selected 且带一二级颜色。
// 与动图内核 isNoteActive 同语义；空音符（无色圆圈）返回 false——半音划音的幽灵起点
export function isSolidNoteData(noteData, globalVisibility) {
    if (!noteData || typeof noteData !== 'object') return false;
    const vis = noteData.visibility || globalVisibility;
    if (vis !== 'visible' && vis !== 'selected') return false;
    const hasColor1 = !!noteData.color && noteData.color !== 'white';
    const hasColor2 = !!noteData.color2 && noteData.color2 !== null;
    return hasColor1 || hasColor2;
}

// 音符 id → 品号（o-s2 开放弦=0；f5-s2=5；解析不出返回 null）
export function fretOfNoteId(noteId) {
    if (typeof noteId !== 'string') return null;
    if (noteId.startsWith('o-s')) return 0;
    const m = noteId.match(/^f(-?\d+)-s\d+$/);
    return m ? parseInt(m[1], 10) : null;
}

// 音符 id → 弦号（f5-s2 / o-s3 → 2 / 3；解析不出返回 null）
export function stringOfNoteId(noteId) {
    if (typeof noteId !== 'string') return null;
    const m = noteId.match(/-s(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
}

// 半音划音配对：同弦且品距恰为一品（±1，开放弦=0 品也参与）
export function isSemitoneSlidePair(fromId, toId) {
    const fs = stringOfNoteId(fromId), ts = stringOfNoteId(toId);
    if (fs === null || ts === null || fs !== ts) return false;
    const ff = fretOfNoteId(fromId), tf = fretOfNoteId(toId);
    return ff !== null && tf !== null && Math.abs(ff - tf) === 1;
}

function measurePathLength(pathString) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const tempPath = document.createElementNS(svgNS, 'path');
    tempPath.setAttribute('d', pathString);
    return tempPath.getTotalLength();
}

// 弧线默认凸向自适应：连线中点落在指板上半区 → 朝上凸（curvature 为正），
// 下半区 → 朝下凸（负）。弧线背离指板中心弯出，不压中间弦的音符；
// magnitude 取预设弧度绝对值（用户手动调过的弧度不走这里）
export function adaptiveArcCurvature(startCenter, endCenter, magnitude = 0.7) {
    if (!startCenter || !endCenter) return Math.abs(magnitude);
    const boardMiddleY = CONSTS.offsetY + CONSTS.stringSpacing * (CONSTS.numStrings - 1) / 2;
    const midY = (startCenter.y + endCenter.y) / 2;
    return midY < boardMiddleY ? Math.abs(magnitude) : -Math.abs(magnitude);
}

// 生成连线路径：直线/弧线共用一套逻辑，箭头和描边端点各自留出缩进
// 正式渲染和拖拽预览都用它，保证预览所见即所得
export function buildConnectionPath(startEdge, endEdge, options = {}) {
    const {
        type = 'line',
        curvature = 0,
        arrowDirection = 'none',
        arrowLength = 0,
        strokeWidth = 3,
        startCenter = null,
        endCenter = null
    } = options;

    const hasArrowStart = arrowDirection === 'start' || arrowDirection === 'both';
    const hasArrowEnd = arrowDirection === 'end' || arrowDirection === 'both';

    const buildPath = (fromX, fromY, toX, toY) => (type === 'arc'
        ? calculateArcPath(fromX, fromY, toX, toY, curvature)
        : `M ${fromX} ${fromY} L ${toX} ${toY}`);

    // 没有箭头的一端向外偏移半个线宽，补偿 strokeLinecap 的圆头
    const offsetOutward = (edge, center) => {
        if (!center) return edge;
        const dx = edge.x - center.x;
        const dy = edge.y - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance === 0) return edge;
        return {
            x: edge.x + (dx / distance) * (strokeWidth / 2),
            y: edge.y + (dy / distance) * (strokeWidth / 2)
        };
    };

    if (!hasArrowStart && !hasArrowEnd) {
        const start = offsetOutward(startEdge, startCenter);
        const end = offsetOutward(endEdge, endCenter);
        return buildPath(start.x, start.y, end.x, end.y);
    }

    const fullPath = buildPath(startEdge.x, startEdge.y, endEdge.x, endEdge.y);
    let pathStartX = startEdge.x;
    let pathStartY = startEdge.y;
    let pathEndX = endEdge.x;
    let pathEndY = endEdge.y;

    if (hasArrowStart) {
        const trimmed = getPointOnPathAtDistance(fullPath, arrowLength);
        pathStartX = trimmed.x;
        pathStartY = trimmed.y;
    }

    if (hasArrowEnd) {
        const trimmed = getPointOnPathAtDistance(fullPath, measurePathLength(fullPath) - arrowLength);
        pathEndX = trimmed.x;
        pathEndY = trimmed.y;
    }

    return buildPath(pathStartX, pathStartY, pathEndX, pathEndY);
}

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

    // 将工具栏放在连线下方（y坐标加上偏移量，避免遮挡连线）；水平方向交给 CSS 居中
    setConnectionToolbarPosition({ x: midX, y: midY + 20 });
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

        // 辅助函数：比较两个颜色是否相同（处理自定义颜色对象）
        const colorsEqual = (color1, color2) => {
            if (color1 === color2) return true;
            if (!color1 || !color2) return false;
            // 如果都是对象，比较 name 和 custom
            if (typeof color1 === 'object' && typeof color2 === 'object') {
                return color1.name === color2.name && color1.custom === color2.custom;
            }
            return false;
        };

        // 判断创建连线时使用的是color1还是color2
        let startColor = startColor1;
        let endColor = endColor1;

        if (storedStartColor) {
            if (colorsEqual(storedStartColor, startColor2) && startColor2 !== null) {
                startColor = startColor2;
            } else if (colorsEqual(storedStartColor, startColor1)) {
                startColor = startColor1;
            } else {
                startColor = startColor1;
            }
        }

        if (storedEndColor) {
            if (colorsEqual(storedEndColor, endColor2) && endColor2 !== null) {
                endColor = endColor2;
            } else if (colorsEqual(storedEndColor, endColor1)) {
                endColor = endColor1;
            } else {
                endColor = endColor1;
            }
        }

        // 记录当前颜色
        currentNoteColors[conn.startNoteId] = startColor;
        currentNoteColors[conn.endNoteId] = endColor;

        // 如果颜色改变了，需要更新连线
        if (!colorsEqual(storedStartColor, startColor) || !colorsEqual(storedEndColor, endColor)) {
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
