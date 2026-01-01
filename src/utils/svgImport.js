import { LEVEL1_COLORS, LEVEL2_COLORS } from '../colorConfig';
import { CONSTS } from '../constants';

/**
 * 从颜色值反推颜色名称（支持第一层级和第二层级颜色）
 * @param {string} colorValue - 颜色值（如 '#ffd700' 或 'rgb(255, 215, 0)' 或 'steelblue'）
 * @param {number} level - 颜色层级（1 或 2），如果不指定则同时查找两个层级
 * @returns {string|null} 颜色名称，如果找不到则返回 null
 */
function getColorNameFromValue(colorValue, level = null) {
    if (!colorValue || colorValue === 'none') return null;

    // 标准化颜色值（转换为小写，去除空格）
    const normalized = colorValue.toLowerCase().trim();

    // 如果是 rgb/rgba 格式，转换为 hex
    let hexValue = normalized;
    if (normalized.startsWith('rgb')) {
        const matches = normalized.match(/\d+/g);
        if (matches && matches.length >= 3) {
            const r = parseInt(matches[0]);
            const g = parseInt(matches[1]);
            const b = parseInt(matches[2]);
            hexValue = `#${[r, g, b].map(x => {
                const hex = x.toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            }).join('')}`;
        }
    }

    // 如果指定了层级，只查找该层级
    if (level === 1) {
        // 查找第一层级颜色
        for (const [colorName, colorObj] of Object.entries(LEVEL1_COLORS)) {
            const fillColor = colorObj.fill.toLowerCase().trim();
            const buttonColor = colorObj.button.toLowerCase().trim();
            if (fillColor === hexValue || fillColor === normalized ||
                buttonColor === hexValue || buttonColor === normalized) {
                return colorName;
            }
        }
    } else if (level === 2) {
        // 查找第二层级颜色
        for (const [colorName, colorVal] of Object.entries(LEVEL2_COLORS)) {
            const colorValLower = colorVal.toLowerCase().trim();
            if (colorValLower === hexValue || colorValLower === normalized) {
                return colorName;
            }
        }
    } else {
        // 未指定层级，先查找第二层级，再查找第一层级
        for (const [colorName, colorVal] of Object.entries(LEVEL2_COLORS)) {
            const colorValLower = colorVal.toLowerCase().trim();
            if (colorValLower === hexValue || colorValLower === normalized) {
                return colorName;
            }
        }

        for (const [colorName, colorObj] of Object.entries(LEVEL1_COLORS)) {
            const fillColor = colorObj.fill.toLowerCase().trim();
            const buttonColor = colorObj.button.toLowerCase().trim();
            if (fillColor === hexValue || fillColor === normalized ||
                buttonColor === hexValue || buttonColor === normalized) {
                return colorName;
            }
        }
    }

    return null;
}

/**
 * 从 SVG 文件解析并还原指板状态
 * @param {string|File} svgInput - SVG 文件内容（字符串）或 File 对象
 * @returns {Promise<Object>} 解析后的指板状态数据
 */
export async function parseSVGToFretboardState(svgInput) {
    let svgText;

    // 如果是 File 对象，读取内容
    if (svgInput instanceof File) {
        svgText = await svgInput.text();
    } else if (typeof svgInput === 'string') {
        svgText = svgInput;
    } else {
        throw new Error('无效的 SVG 输入');
    }

    // 解析 SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    // 检查是否是有效的 SVG
    if (svgElement.tagName !== 'svg') {
        throw new Error('无效的 SVG 文件');
    }

    // 从 SVG 元数据中读取显示模式信息
    let metadataDisplayMode = svgElement.getAttribute('data-display-mode');
    let metadataRootNote = svgElement.getAttribute('data-root-note');
    let metadataEnharmonic = svgElement.getAttribute('data-enharmonic');

    // 解析元数据
    if (metadataRootNote !== null && metadataRootNote !== '') {
        metadataRootNote = parseInt(metadataRootNote);
        if (isNaN(metadataRootNote)) {
            metadataRootNote = null;
        }
    } else {
        metadataRootNote = null;
    }

    if (metadataEnharmonic !== null && metadataEnharmonic !== '') {
        metadataEnharmonic = parseInt(metadataEnharmonic);
        if (isNaN(metadataEnharmonic)) {
            metadataEnharmonic = 1;
        }
    } else {
        metadataEnharmonic = 1;
    }

    if (!metadataDisplayMode || (metadataDisplayMode !== 'note' && metadataDisplayMode !== 'solfege')) {
        metadataDisplayMode = 'note';
    }

    // 查找所有音符元素（g 元素，id 以 o-s 或 f 开头）
    const noteElements = svgElement.querySelectorAll('g[id^="o-s"], g[id^="f"]');

    // 先收集所有文本内容和对应的音符信息，用于推断显示模式和根音（在解析音符之前）
    const allNoteTexts = [];
    const noteTextMap = new Map(); // 存储 noteId -> { text, fret, string } 的映射
    noteElements.forEach(noteElement => {
        const noteId = noteElement.getAttribute('id');
        if (!noteId) return;

        // 解析 ID 获取 fret 和 string
        let fret = -1;
        let string = -1;

        if (noteId.startsWith('o-s')) {
            fret = -1;
            string = parseInt(noteId.substring(3));
        } else if (noteId.startsWith('f') && noteId.includes('-s')) {
            const parts = noteId.substring(1).split('-s');
            fret = parseInt(parts[0]);
            string = parseInt(parts[1]);
        }

        const textElement = noteElement.querySelector('text');
        if (textElement) {
            const textContent = textElement.textContent?.trim();
            if (textContent) {
                allNoteTexts.push(textContent);
                noteTextMap.set(noteId, { text: textContent, fret, string });
            }
        }
    });

    // 从文本内容推断显示模式（在解析音符之前）
    let inferredDisplayMode = metadataDisplayMode || 'note';
    if (!metadataDisplayMode || metadataDisplayMode === 'note') {
        if (allNoteTexts.length > 0) {
            const solfegePattern = /^[1-7][b#]?$/;
            const noteNamePattern = /^[A-G][b#]?$/;

            let solfegeCount = 0;
            let noteNameCount = 0;

            allNoteTexts.forEach(text => {
                if (solfegePattern.test(text)) {
                    solfegeCount++;
                } else if (noteNamePattern.test(text)) {
                    noteNameCount++;
                }
            });

            if (solfegeCount > noteNameCount && solfegeCount >= allNoteTexts.length * 0.5) {
                inferredDisplayMode = 'solfege';
            }
        }
    }

    const data = {};
    let minFret = Infinity;
    let maxFret = -1;

    // 解析每个音符
    noteElements.forEach(noteElement => {
        const noteId = noteElement.getAttribute('id');
        if (!noteId) return;

        // 解析 ID 获取 fret 和 string
        let fret = -1;
        let string = -1;

        if (noteId.startsWith('o-s')) {
            // 开放弦：o-s{stringIndex}
            fret = -1;
            string = parseInt(noteId.substring(3));
        } else if (noteId.startsWith('f') && noteId.includes('-s')) {
            // 指板音符：f{fret}-s{stringIndex}
            const parts = noteId.substring(1).split('-s');
            fret = parseInt(parts[0]);
            string = parseInt(parts[1]);
        } else {
            return; // 跳过不符合格式的元素
        }

        // 更新 fret 范围
        if (fret >= 0) {
            minFret = Math.min(minFret, fret);
            maxFret = Math.max(maxFret, fret);
        }

        // 从 className 提取颜色和可见性
        const className = noteElement.getAttribute('class') || '';
        const classes = className.split(/\s+/);

        let color = 'white';
        let color2 = null;
        let visibility = 'transparent';

        // 查找颜色类名（blue, green, red, black, white, trans, brown, gray）
        const colorClasses = ['blue', 'green', 'red', 'black', 'white', 'trans', 'brown', 'gray'];
        for (const colorClass of colorClasses) {
            if (classes.includes(colorClass)) {
                color = colorClass;
                break;
            }
        }

        // 查找可见性类名
        if (classes.includes('visible')) {
            visibility = 'visible';
        } else if (classes.includes('hidden')) {
            visibility = 'hidden';
        } else if (classes.includes('selected')) {
            visibility = 'selected';
        } else {
            visibility = 'transparent';
        }

        // 从 circle 元素提取颜色（优先从 fill 提取 color1，从 stroke 提取 color2）
        const circle = noteElement.querySelector('circle');
        if (circle) {
            // 提取 color1（从 fill 属性）
            // 如果从 class 中没有找到颜色，尝试从 circle 的 fill 属性中提取
            if (color === 'white') {
                const fill = circle.getAttribute('fill') || circle.style.fill;
                if (fill && fill !== 'none') {
                    const color1Name = getColorNameFromValue(fill, 1);
                    if (color1Name) {
                        color = color1Name;
                    }
                }
            }

            // 提取 color2（从 stroke 颜色判断）
            const stroke = circle.getAttribute('stroke') || circle.style.stroke;
            const strokeWidth = circle.getAttribute('stroke-width') || circle.style.strokeWidth;

            // 如果有描边且宽度较大（>2px），说明有 color2
            if (stroke && stroke !== 'none' && parseFloat(strokeWidth) > 2) {
                const color2Name = getColorNameFromValue(stroke, 2);
                if (color2Name) {
                    color2 = color2Name;
                }
            }
        }

        // 如果仍然没有找到颜色，尝试从 noteElement 的 style 中提取
        if (color === 'white') {
            const noteFill = noteElement.style.fill || noteElement.getAttribute('fill');
            if (noteFill && noteFill !== 'none') {
                const color1Name = getColorNameFromValue(noteFill, 1);
                if (color1Name) {
                    color = color1Name;
                }
            }
        }

        // 从 text 元素提取标签文本
        // 重要：不要将所有文本都保存为 noteText！
        // 只有用户自定义编辑的文本才保存为 noteText
        // 系统根据 displayMode 自动生成的文本不应该保存为 noteText，这样切换显示模式时文本会自动更新
        const textElement = noteElement.querySelector('text');
        let noteText = null;
        if (textElement) {
            const textContent = textElement.textContent?.trim();
            const dataNote = textElement.getAttribute('data-note'); // 原始音名（音名模式的默认值）

            if (textContent) {
                const solfegePattern = /^[1-7][b#]?$/;
                const noteNamePattern = /^[A-G][b#]?$/;
                const isSolfegeText = solfegePattern.test(textContent);
                const isNoteNameText = noteNamePattern.test(textContent);

                // 判断是否是用户自定义文本：
                // 1. 如果文本既不是唱名格式也不是音名格式，肯定是自定义文本
                if (!isSolfegeText && !isNoteNameText) {
                    noteText = textContent;
                }
                // 2. 如果推断的显示模式是唱名，但文本是音名格式，说明是自定义文本
                else if (inferredDisplayMode === 'solfege' && isNoteNameText) {
                    noteText = textContent;
                }
                // 3. 如果推断的显示模式是音名，但文本是唱名格式，说明是自定义文本
                else if (inferredDisplayMode === 'note' && isSolfegeText) {
                    noteText = textContent;
                }
                // 4. 如果文本与 data-note 不同，且不符合当前显示模式，可能是自定义文本
                else if (textContent !== dataNote) {
                    // 检查是否可能是其他显示模式的文本（但已经被推断为当前模式）
                    // 这种情况下，如果文本与 data-note 不同，可能是用户编辑过的，保存为 noteText
                    // 但为了允许切换显示模式，我们只在明确是自定义文本时才保存
                    // 这里暂时不保存，让系统根据 displayMode 自动生成
                }
                // 否则，文本与推断的显示模式匹配，不保存为 noteText，让系统根据 displayMode 自动生成
            }
        }

        // 构建音符数据
        const noteData = {
            type: 'note',
            color: color,
            visibility: visibility
        };

        if (color2) {
            noteData.color2 = color2;
        }

        if (noteText) {
            noteData.noteText = noteText;
        }

        data[noteId] = noteData;
    });

    // 确定 startFret 和 endFret
    // 如果 minFret 和 maxFret 都是 -1，说明只有开放弦，使用默认值
    const startFret = minFret === Infinity ? 0 : Math.max(0, minFret);
    const endFret = maxFret === -1 ? 15 : Math.min(22, maxFret + 1);

    // 使用之前推断的显示模式（在解析音符之前已经推断过了）
    // 优先使用 SVG 元数据，如果没有则使用之前推断的结果
    let detectedDisplayMode = metadataDisplayMode || inferredDisplayMode || 'note';
    let detectedRootNote = metadataRootNote;
    let detectedEnharmonic = metadataEnharmonic;

    // 如果检测到是唱名模式，但 rootNote 是 null，尝试从文本内容推断根音
    if (detectedDisplayMode === 'solfege' && detectedRootNote === null) {
        // 尝试从文本内容推断根音
        // 找到标记为 "1"（根音）的音符，然后计算它的实际音高，反推根音
        let foundRootNote = null;

        // 使用之前收集的 noteTextMap 来查找标记为 "1" 的音符
        for (const [noteId, noteInfo] of noteTextMap.entries()) {
            const { text, fret, string } = noteInfo;

            // 如果文本是 "1"（根音），计算这个音符的实际音高
            if (text === '1' && fret >= -1 && string >= 0 && string < CONSTS.numStrings) {
                // 计算这个音符的音高索引
                // noteIndex = (stringIntervals[string] + fret + 1) % 12
                const noteIndex = (CONSTS.stringIntervals[string] + fret + 1) % 12;
                // 如果这个音符标记为 "1"，那么它的音高索引就是根音
                foundRootNote = noteIndex;
                break;
            }
        }

        // 如果找到了根音，使用它
        if (foundRootNote !== null) {
            detectedRootNote = foundRootNote;
        }
    }

    // 解析连线（包括箭头）
    const connections = {};

    // 首先收集所有音符的位置信息，用于匹配连线端点
    const notePositions = {};
    noteElements.forEach(noteElement => {
        const noteId = noteElement.getAttribute('id');
        if (!noteId) return;

        let x, y;

        // 优先从 data-x 和 data-y 属性读取
        const dataX = noteElement.getAttribute('data-x');
        const dataY = noteElement.getAttribute('data-y');
        if (dataX !== null && dataY !== null) {
            x = parseFloat(dataX);
            y = parseFloat(dataY);
        } else {
            // 备选：从 transform 属性解析
            const transform = noteElement.getAttribute('transform');
            if (transform) {
                const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
                if (match) {
                    x = parseFloat(match[1]);
                    y = parseFloat(match[2]);
                }
            }
        }

        if (x !== undefined && y !== undefined && !isNaN(x) && !isNaN(y)) {
            notePositions[noteId] = { x, y };
        }
    });

    // 查找所有连线路径（path 或 line，class 为 connection）
    // 注意：连线可能在 <g> 元素内，需要查找所有包含 connection class 的路径
    // 先查找所有包含 connection class 的元素
    const allConnectionElements = svgElement.querySelectorAll('.connection');
    const connectionPaths = Array.from(allConnectionElements).filter(el =>
        el.tagName === 'path' || el.tagName === 'line'
    );

    connectionPaths.forEach((pathElement, index) => {
        try {
            // 从 markerStart 和 markerEnd 中提取连接 ID
            let connId = null;

            // 检查路径元素本身的 marker 属性
            const markerStartAttr = pathElement.getAttribute('marker-start');
            const markerEndAttr = pathElement.getAttribute('marker-end');

            // 也检查 style 属性中的 marker
            const styleAttr = pathElement.getAttribute('style') || '';
            const styleMarkerStart = styleAttr.match(/marker-start:\s*([^;]+)/);
            const styleMarkerEnd = styleAttr.match(/marker-end:\s*([^;]+)/);

            const markerStart = markerStartAttr || (styleMarkerStart ? styleMarkerStart[1].trim() : null);
            const markerEnd = markerEndAttr || (styleMarkerEnd ? styleMarkerEnd[1].trim() : null);

            // 尝试从 marker ID 中提取连接 ID
            // marker 格式：url(#arrowhead-start-{connId}) 或 #arrowhead-start-{connId}
            if (markerStart) {
                // 匹配 url(#arrowhead-start-xxx) 或 #arrowhead-start-xxx
                const match = markerStart.match(/(?:url\(#|#)arrowhead-start-([^\)]+)/);
                if (match && match[1]) {
                    connId = match[1].trim();
                }
            }
            if (!connId && markerEnd) {
                const match = markerEnd.match(/(?:url\(#|#)arrowhead-end-([^\)]+)/);
                if (match && match[1]) {
                    connId = match[1].trim();
                }
            }

            // 如果无法从 marker 属性提取，尝试从父元素 <g> 的 marker 元素中提取
            if (!connId) {
                let parentG = pathElement.parentElement;
                // 向上查找，直到找到包含 marker 的 <g> 元素
                while (parentG && parentG.tagName !== 'svg') {
                    if (parentG.tagName === 'g') {
                        const parentMarkers = parentG.querySelectorAll('marker');
                        parentMarkers.forEach(marker => {
                            const markerId = marker.getAttribute('id');
                            if (markerId) {
                                const startMatch = markerId.match(/arrowhead-start-(.+)/);
                                const endMatch = markerId.match(/arrowhead-end-(.+)/);
                                if (startMatch && startMatch[1]) {
                                    connId = startMatch[1];
                                } else if (endMatch && endMatch[1]) {
                                    connId = endMatch[1];
                                }
                            }
                        });
                        if (connId) break;
                    }
                    parentG = parentG.parentElement;
                }
            }

            // 如果仍然无法提取，生成一个 ID
            if (!connId) {
                connId = `conn-imported-${Date.now()}-${index}`;
            }

            // 确定箭头方向
            // 检查 marker 属性或父元素中的 marker 元素
            let hasMarkerStart = false;
            let hasMarkerEnd = false;

            if (markerStart) {
                hasMarkerStart = true;
            }
            if (markerEnd) {
                hasMarkerEnd = true;
            }

            // 如果从属性中没找到，检查父元素中的 marker
            if (!hasMarkerStart && !hasMarkerEnd) {
                const parentG = pathElement.parentElement;
                if (parentG && parentG.tagName === 'g') {
                    const markers = parentG.querySelectorAll('marker');
                    markers.forEach(marker => {
                        const markerId = marker.getAttribute('id');
                        if (markerId) {
                            if (markerId.includes('arrowhead-start-')) {
                                hasMarkerStart = true;
                            }
                            if (markerId.includes('arrowhead-end-')) {
                                hasMarkerEnd = true;
                            }
                        }
                    });
                }
            }

            let arrowDirection = 'none';
            if (hasMarkerStart && hasMarkerEnd) {
                arrowDirection = 'both';
            } else if (hasMarkerStart) {
                arrowDirection = 'start';
            } else if (hasMarkerEnd) {
                arrowDirection = 'end';
            }

            // 获取路径的起点和终点坐标
            let startX, startY, endX, endY;

            if (pathElement.tagName === 'path') {
                // 对于 path，解析 d 属性
                const d = pathElement.getAttribute('d');
                if (d) {
                    // 解析 M x y（起点）
                    const moveMatch = d.match(/M\s+([\d.-]+)[\s,]+([\d.-]+)/);
                    if (moveMatch) {
                        startX = parseFloat(moveMatch[1]);
                        startY = parseFloat(moveMatch[2]);
                    }

                    // 解析 L x y（直线终点）或 Q cx cy x y（二次贝塞尔曲线）
                    const lineMatch = d.match(/L\s+([\d.-]+)[\s,]+([\d.-]+)/);
                    const quadMatch = d.match(/Q\s+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)/);

                    if (quadMatch) {
                        // 二次贝塞尔曲线：Q cx cy x y
                        endX = parseFloat(quadMatch[3]);
                        endY = parseFloat(quadMatch[4]);
                    } else if (lineMatch) {
                        // 直线：L x y
                        endX = parseFloat(lineMatch[1]);
                        endY = parseFloat(lineMatch[2]);
                    }
                }
            } else if (pathElement.tagName === 'line') {
                // 对于 line，直接读取属性
                startX = parseFloat(pathElement.getAttribute('x1') || '0');
                startY = parseFloat(pathElement.getAttribute('y1') || '0');
                endX = parseFloat(pathElement.getAttribute('x2') || '0');
                endY = parseFloat(pathElement.getAttribute('y2') || '0');
            }

            if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
                return; // 无法解析坐标，跳过
            }

            // 找到最近的音符作为起点和终点
            // 注意：由于箭头缩进，路径的起点和终点可能不在音符中心，需要扩大搜索范围
            const findNearestNote = (x, y) => {
                let nearestNoteId = null;
                let minDistance = Infinity;

                for (const [noteId, pos] of Object.entries(notePositions)) {
                    const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
                    // 扩大搜索范围到 50px（考虑箭头缩进和路径偏移）
                    if (distance < minDistance && distance < 50) {
                        minDistance = distance;
                        nearestNoteId = noteId;
                    }
                }

                return nearestNoteId;
            };

            const startNoteId = findNearestNote(startX, startY);
            const endNoteId = findNearestNote(endX, endY);

            if (!startNoteId || !endNoteId || startNoteId === endNoteId) {
                // 如果找不到，尝试使用路径的中点来匹配
                const midX = (startX + endX) / 2;
                const midY = (startY + endY) / 2;

                // 如果还是找不到，跳过这条连线
                if (!startNoteId || !endNoteId) {
                    console.warn(`无法匹配连线端点: start(${startX}, ${startY}) -> end(${endX}, ${endY})`);
                    return;
                }
            }

            // 判断是弧线还是直线（通过检查路径是否包含曲线命令）
            const d = pathElement.getAttribute('d') || '';
            const isArc = d.includes('Q') || d.includes('q');
            const type = isArc ? 'arc' : 'line';

            // 获取其他属性
            const strokeWidth = parseFloat(pathElement.getAttribute('stroke-width') || pathElement.style.strokeWidth || '3');
            let stroke = pathElement.getAttribute('stroke') || pathElement.style.stroke || '#aaaaaa';

            // 如果 stroke 是 'none' 或空，尝试从 computed style 获取
            if (!stroke || stroke === 'none') {
                const computedStyle = window.getComputedStyle(pathElement);
                stroke = computedStyle.stroke || '#aaaaaa';
            }

            // 解析颜色（可能是渐变 ID 或颜色值）
            let color = null;
            if (stroke && stroke.startsWith('url(')) {
                // 渐变，提取 ID
                const match = stroke.match(/url\(#(.+)\)/);
                if (match) {
                    color = match[1];
                    // 如果渐变 ID 不是以 'gradient-' 开头，需要查找对应的渐变定义
                    if (!color.startsWith('gradient-')) {
                        // 查找渐变定义，提取起点和终点颜色
                        const gradientDef = svgElement.querySelector(`#${color}`);
                        if (gradientDef) {
                            const stop1 = gradientDef.querySelector('stop[offset="0%"]');
                            const stop2 = gradientDef.querySelector('stop[offset="100%"]');
                            if (stop1 && stop2) {
                                const startColorValue = stop1.getAttribute('stop-color') || stop1.getAttribute('stopColor');
                                const endColorValue = stop2.getAttribute('stop-color') || stop2.getAttribute('stopColor');
                                // 这里暂时保留原始渐变 ID，后续会根据 gradientColors 重新生成
                            }
                        }
                    }
                }
            } else if (stroke && stroke !== 'none') {
                // 如果是纯色，尝试从颜色值反推颜色名称
                // 但连线的颜色通常是根据起点和终点音符的颜色计算的，所以这里先设为 null
                // 系统会根据 gradientColors 自动生成渐变或使用起点颜色
                color = null;
            }

            // 构建连线数据
            const connection = {
                id: connId, // 添加 id 字段，用于点击事件识别
                startNoteId: startNoteId,
                endNoteId: endNoteId,
                type: type,
                arrowDirection: arrowDirection,
                color: color,
                strokeWidth: strokeWidth
            };

            // 如果是弧线，尝试从路径解析曲率
            if (type === 'arc') {
                const quadMatch = d.match(/Q\s+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)/);
                if (quadMatch && startX !== undefined && startY !== undefined && endX !== undefined && endY !== undefined) {
                    const controlX = parseFloat(quadMatch[1]);
                    const controlY = parseFloat(quadMatch[2]);

                    // 反推曲率：计算控制点到中点的距离，然后反推曲率值
                    const midX = (startX + endX) / 2;
                    const midY = (startY + endY) / 2;
                    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));

                    if (distance > 0) {
                        // 计算垂直方向
                        const dx = endX - startX;
                        const dy = endY - startY;
                        const length = Math.sqrt(dx * dx + dy * dy);
                        const perpX = -dy / length;
                        const perpY = dx / length;

                        // 计算控制点相对于中点的偏移
                        const offsetX = controlX - midX;
                        const offsetY = controlY - midY;
                        const offsetDistance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);

                        // 计算曲率：arcHeight = |curvature| * distance * 0.3
                        // 所以 |curvature| = arcHeight / (distance * 0.3)
                        const arcHeight = offsetDistance;
                        const curvatureAbs = arcHeight / (distance * 0.3);

                        // 判断曲率方向（正负）
                        const dotProduct = offsetX * perpX + offsetY * perpY;
                        const curvature = dotProduct > 0 ? -curvatureAbs : curvatureAbs;

                        connection.arcCurvature = curvature;
                    } else {
                        connection.arcCurvature = 0.7; // 默认值
                    }
                } else {
                    connection.arcCurvature = 0.7; // 默认值
                }
            }

            // 获取起点和终点的颜色（用于渐变）
            const startNoteData = data[startNoteId] || {};
            const endNoteData = data[endNoteId] || {};
            let startColor = startNoteData.color || 'white';
            let endColor = endNoteData.color || 'white';

            // 如果连线使用渐变，尝试从渐变定义中提取颜色
            if (color && color.startsWith('gradient-')) {
                const gradientDef = svgElement.querySelector(`#${color}`);
                if (gradientDef) {
                    const stop1 = gradientDef.querySelector('stop[offset="0%"]');
                    const stop2 = gradientDef.querySelector('stop[offset="100%"]');
                    if (stop1 && stop2) {
                        const startColorValue = stop1.getAttribute('stop-color') || stop1.getAttribute('stopColor');
                        const endColorValue = stop2.getAttribute('stop-color') || stop2.getAttribute('stopColor');

                        // 尝试从颜色值反推颜色名称
                        if (startColorValue) {
                            const startColorName = getColorNameFromValue(startColorValue);
                            if (startColorName) {
                                startColor = startColorName;
                            }
                        }
                        if (endColorValue) {
                            const endColorName = getColorNameFromValue(endColorValue);
                            if (endColorName) {
                                endColor = endColorName;
                            }
                        }
                    }
                }
            } else if (color && color !== 'none') {
                // 如果是纯色，尝试从颜色值反推颜色名称
                const colorName = getColorNameFromValue(color);
                if (colorName) {
                    // 如果反推成功，使用该颜色；否则使用起点颜色
                    startColor = colorName;
                    endColor = colorName;
                }
            }

            connection.gradientColors = {
                start: startColor,
                end: endColor
            };

            // 根据起点和终点颜色计算连线颜色 ID
            // 如果颜色相同，使用降低饱和度的颜色值；如果不同，使用渐变 ID
            if (startColor === 'white' && endColor === 'white') {
                connection.color = '#aaaaaa';
            } else if (startColor === endColor) {
                // 相同颜色，使用降低饱和度的颜色值（这里暂时保留为 null，让系统自动计算）
                connection.color = null; // 系统会根据颜色自动计算
            } else {
                // 不同颜色，使用渐变 ID
                connection.color = `gradient-${connId}`;
            }

            connections[connId] = connection;
        } catch (error) {
            // 如果单个连线解析失败，记录错误但继续处理其他连线
            console.warn(`解析连线 ${index} 失败:`, error);
        }
    });

    // 将连线添加到 data.connections 中
    if (Object.keys(connections).length > 0) {
        if (!data.connections) {
            data.connections = {};
        }
        Object.assign(data.connections, connections);
    }

    return {
        version: 1,
        name: `导入自SVG (${new Date().toLocaleString()})`,
        state: {
            data: data,
            startFret: startFret,
            endFret: endFret,
            enharmonic: detectedEnharmonic, // 从 SVG 元数据或默认值
            displayMode: detectedDisplayMode, // 从 SVG 元数据或文本内容推断
            rootNote: detectedRootNote, // 从 SVG 元数据或 null
            visibility: 'transparent' // 默认值
        }
    };
}
