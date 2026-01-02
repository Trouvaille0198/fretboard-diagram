import { LEVEL1_COLORS, LEVEL2_COLORS } from '../colorConfig';
import { CONSTS } from '../constants';
import { reduceColorSaturation } from '../utils';

/**
 * 转义 CSS 选择器中的特殊字符
 * @param {string} selector - 需要转义的选择器字符串
 * @returns {string} 转义后的选择器字符串
 */
function escapeCSSSelector(selector) {
    // 如果浏览器支持 CSS.escape，使用它
    if (typeof CSS !== 'undefined' && CSS.escape) {
        return CSS.escape(selector);
    }
    // 否则手动转义特殊字符
    return selector.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

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

    // 处理 CSS 变量（如 var(--color-level1-blue-fill)）
    if (normalized.startsWith('var(')) {
        const varMatch = normalized.match(/var\(--color-level(\d+)-(.+?)(?:-fill|-button)?\)/);
        if (varMatch) {
            const varLevel = parseInt(varMatch[1]);
            const varColorName = varMatch[2];
            // 如果指定了层级，检查是否匹配
            if (level === null || level === varLevel) {
                // 检查颜色名称是否存在
                if (varLevel === 1 && varColorName in LEVEL1_COLORS) {
                    return varColorName;
                } else if (varLevel === 2 && varColorName in LEVEL2_COLORS) {
                    return varColorName;
                }
            }
        }
        // 如果无法从 CSS 变量中提取，返回 null，让后续逻辑处理
        return null;
    }

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

    // 处理命名颜色（如 steelblue, indianred 等）
    const namedColors = {
        'steelblue': 'blue',
        'indianred': 'red',
        '#00a080': 'green',
        '#8b4513': 'brown',
        '#aaaaaa': 'gray',
        '#ffd700': 'yellow',
        '#87ceeb': 'cyan',
        '#ffb6c1': 'pink',
        '#6b8e23': 'grass-green',
        '#ff8c00': 'orange',
        '#ffffff': 'white'
    };

    if (normalized in namedColors) {
        const colorName = namedColors[normalized];
        // 检查是否匹配指定的层级
        if (level === 1 && colorName in LEVEL1_COLORS) {
            return colorName;
        } else if (level === 2 && colorName in LEVEL2_COLORS) {
            return colorName;
        } else if (level === null) {
            return colorName;
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

        // 调试日志：输出解析的 note 颜色
        if (color !== 'white' || color2 !== null) {
            console.log(`解析 note ${noteId}: color=${color}, color2=${color2}, visibility=${visibility}`);
        }
    });

    // 调试日志：输出所有解析的 note 数据
    console.log(`解析了 ${Object.keys(data).length} 个 note，其中 ${Object.keys(data).filter(id => data[id].color !== 'white').length} 个有颜色`);

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

    // 查找所有连线路径（path 或 line）
    // 连线可能在以下位置：
    // 1. 直接在 <g className="connections"> 内的 path/line（有 class="connection"）
    // 2. 在 <g> 内的 path/line（class 可能在父元素上）
    // 3. 直接在 connections group 内的 path/line

    // 方法1：查找所有有 class="connection" 的 path 和 line
    const directConnections = svgElement.querySelectorAll('path.connection, line.connection');

    // 方法2：查找在 <g className="connections"> 内的所有 path 和 line
    const connectionsGroup = svgElement.querySelector('g.connections');
    const connectionsInGroup = connectionsGroup ?
        Array.from(connectionsGroup.querySelectorAll('path, line')).filter(el => {
            // 排除在 marker 内的元素
            return !el.closest('marker');
        }) : [];

    // 方法3：查找所有 path 和 line，然后检查是否在 connections 相关的结构中
    const allPathsAndLines = svgElement.querySelectorAll('path, line');
    const otherConnections = Array.from(allPathsAndLines).filter(el => {
        // 排除在 marker、defs 等内的元素
        if (el.closest('marker') || el.closest('defs')) return false;
        // 如果已经有 class="connection"，已经包含在 directConnections 中
        if (el.classList.contains('connection')) return false;
        // 检查是否在 connections group 内
        if (connectionsGroup && connectionsGroup.contains(el)) return true;
        // 检查是否有 stroke 属性（可能是连线）
        const stroke = el.getAttribute('stroke') || el.style.stroke;
        // 如果有 stroke 且不是 'none'，或者是 path/line 元素，都可能是连线
        // 特别要注意：没有箭头的连线可能没有 marker 属性，但仍然应该被识别
        if (stroke && stroke !== 'none') return true;
        // 如果是 path 或 line，且不在其他已知的组内（如 strings、frets 等），也可能是连线
        const parent = el.parentElement;
        if (parent) {
            const parentClass = parent.getAttribute('class') || '';
            // 如果不在 strings、frets、markers 等组内，可能是连线
            if (!parentClass.includes('string') &&
                !parentClass.includes('fret') &&
                !parentClass.includes('marker') &&
                !parentClass.includes('note')) {
                return true;
            }
        }
        return false;
    });

    // 合并所有连线，去重
    const allConnectionElements = new Set([
        ...Array.from(directConnections),
        ...connectionsInGroup,
        ...otherConnections
    ]);

    const connectionPaths = Array.from(allConnectionElements);

    // 调试信息：输出找到的连线数量
    console.log(`找到 ${connectionPaths.length} 条连线元素`);

    // 使用一个计数器确保每条连线都有唯一的 ID
    let connectionIndex = 0;
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

            // 如果仍然无法提取，生成一个唯一的 ID
            // 使用递增的 connectionIndex 确保每条连线都有唯一 ID
            if (!connId) {
                // 使用 Date.now() + connectionIndex + 随机字符串确保唯一性
                const timestamp = Date.now();
                const random = Math.random().toString(36).substr(2, 9);
                connId = `conn-imported-${timestamp}-${connectionIndex++}-${random}`;
                console.log(`[${index}] 为没有箭头的连线生成新 ID: ${connId}, connectionIndex: ${connectionIndex - 1}`);
            } else {
                console.log(`[${index}] 从 marker 提取的 ID: ${connId}`);
            }

            // 确保 connId 是唯一的（检查是否已存在）
            // 使用循环确保生成真正唯一的 ID
            while (connections[connId]) {
                console.warn(`[${index}] 警告：connId ${connId} 已存在，生成新的唯一 ID`);
                const timestamp = Date.now();
                const random = Math.random().toString(36).substr(2, 9);
                connId = `conn-imported-${timestamp}-${connectionIndex++}-${random}`;
            }
            if (connId !== (connections[connId]?.id || null)) {
                console.log(`[${index}] 最终使用的 ID: ${connId}`);
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
            const findNearestNote = (x, y, maxDistance = 100) => {
                let nearestNoteId = null;
                let minDistance = Infinity;

                for (const [noteId, pos] of Object.entries(notePositions)) {
                    const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
                    // 扩大搜索范围（考虑箭头缩进和路径偏移）
                    if (distance < minDistance && distance < maxDistance) {
                        minDistance = distance;
                        nearestNoteId = noteId;
                    }
                }

                return nearestNoteId;
            };

            let startNoteId = findNearestNote(startX, startY, 100);
            let endNoteId = findNearestNote(endX, endY, 100);

            // 如果找不到，尝试扩大搜索范围或使用路径上的其他点
            if (!startNoteId) {
                // 尝试从起点向终点方向移动一点再搜索
                const dx = endX - startX;
                const dy = endY - startY;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length > 0) {
                    const offset = 30; // 向终点方向移动 30px
                    const newX = startX + (dx / length) * offset;
                    const newY = startY + (dy / length) * offset;
                    startNoteId = findNearestNote(newX, newY, 150);
                }
            }

            if (!endNoteId) {
                // 尝试从终点向起点方向移动一点再搜索
                const dx = startX - endX;
                const dy = startY - endY;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length > 0) {
                    const offset = 30; // 向起点方向移动 30px
                    const newX = endX + (dx / length) * offset;
                    const newY = endY + (dy / length) * offset;
                    endNoteId = findNearestNote(newX, newY, 150);
                }
            }

            // 如果还是找不到，尝试更宽松的匹配
            if (!startNoteId || !endNoteId || startNoteId === endNoteId) {
                // 最后一次尝试：使用更大的搜索半径
                if (!startNoteId) {
                    startNoteId = findNearestNote(startX, startY, 200);
                }
                if (!endNoteId) {
                    endNoteId = findNearestNote(endX, endY, 200);
                }

                // 如果还是找不到，跳过这条连线
                if (!startNoteId || !endNoteId || startNoteId === endNoteId) {
                    console.warn(`无法匹配连线端点: start(${startX}, ${startY}) -> end(${endX}, ${endY}), startNoteId: ${startNoteId}, endNoteId: ${endNoteId}`);
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
                        // 转义 ID 中的特殊字符（如点号）
                        const escapedColor = escapeCSSSelector(color);
                        const gradientDef = svgElement.querySelector(`#${escapedColor}`);
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
            // 优先从已解析的 note 数据中获取
            const startNoteData = data[startNoteId] || {};
            const endNoteData = data[endNoteId] || {};
            let startColor = startNoteData.color || 'white';
            let endColor = endNoteData.color || 'white';

            // 调试日志：如果颜色是 white，输出 note 数据
            if (startColor === 'white' || endColor === 'white') {
                console.log(`[${index}] 连线 ${startNoteId} -> ${endNoteId}: startNoteData=`, startNoteData, `endNoteData=`, endNoteData);
            }

            // 如果连线使用渐变，尝试从渐变定义中提取颜色
            if (color && color.startsWith('gradient-')) {
                // 转义 ID 中的特殊字符（如点号）
                const escapedColor = escapeCSSSelector(color);
                const gradientDef = svgElement.querySelector(`#${escapedColor}`);
                if (gradientDef) {
                    const stop1 = gradientDef.querySelector('stop[offset="0%"]');
                    const stop2 = gradientDef.querySelector('stop[offset="100%"]');
                    if (stop1 && stop2) {
                        const startColorValue = stop1.getAttribute('stop-color') || stop1.getAttribute('stopColor');
                        const endColorValue = stop2.getAttribute('stop-color') || stop2.getAttribute('stopColor');

                        // 尝试从颜色值反推颜色名称（先尝试第一层级，再尝试第二层级，最后尝试不指定层级）
                        if (startColorValue) {
                            let startColorName = getColorNameFromValue(startColorValue, 1);
                            let isLevel2 = false;
                            if (!startColorName) {
                                startColorName = getColorNameFromValue(startColorValue, 2);
                                isLevel2 = !!startColorName;
                            }
                            if (!startColorName) {
                                startColorName = getColorNameFromValue(startColorValue, null);
                                // 检查是否是第二层级颜色
                                if (startColorName && startColorName in LEVEL2_COLORS) {
                                    isLevel2 = true;
                                }
                            }
                            if (startColorName) {
                                // 智能匹配：优先匹配 note 的实际颜色
                                // 如果是第二层级颜色，优先检查 note 的 color2
                                if (isLevel2) {
                                    if (startNoteData.color2 === startColorName) {
                                        // 匹配到 color2
                                        startColor = startColorName;
                                    } else if (startNoteData.color === startColorName) {
                                        // 虽然提取的是第二层级颜色，但 note 的 color1 匹配，使用 color1
                                        startColor = startColorName;
                                    } else {
                                        // 不匹配，但直接使用提取的颜色名称
                                        startColor = startColorName;
                                    }
                                } else {
                                    // 如果是第一层级颜色，优先检查 note 的 color1
                                    if (startNoteData.color === startColorName) {
                                        // 匹配到 color1
                                        startColor = startColorName;
                                    } else if (startNoteData.color2 === startColorName) {
                                        // 虽然提取的是第一层级颜色，但 note 的 color2 匹配，使用 color2
                                        startColor = startColorName;
                                    } else {
                                        // 不匹配，但直接使用提取的颜色名称
                                        startColor = startColorName;
                                    }
                                }
                            } else {
                                console.warn(`无法从渐变起点颜色值反推颜色名称: ${startColorValue}`);
                            }
                        }
                        if (endColorValue) {
                            let endColorName = getColorNameFromValue(endColorValue, 1);
                            let isLevel2 = false;
                            if (!endColorName) {
                                endColorName = getColorNameFromValue(endColorValue, 2);
                                isLevel2 = !!endColorName;
                            }
                            if (!endColorName) {
                                endColorName = getColorNameFromValue(endColorValue, null);
                                // 检查是否是第二层级颜色
                                if (endColorName && endColorName in LEVEL2_COLORS) {
                                    isLevel2 = true;
                                }
                            }
                            if (endColorName) {
                                // 智能匹配：优先匹配 note 的实际颜色
                                // 如果是第二层级颜色，优先检查 note 的 color2
                                if (isLevel2) {
                                    if (endNoteData.color2 === endColorName) {
                                        // 匹配到 color2
                                        endColor = endColorName;
                                    } else if (endNoteData.color === endColorName) {
                                        // 虽然提取的是第二层级颜色，但 note 的 color1 匹配，使用 color1
                                        endColor = endColorName;
                                    } else {
                                        // 不匹配，但直接使用提取的颜色名称
                                        endColor = endColorName;
                                    }
                                } else {
                                    // 如果是第一层级颜色，优先检查 note 的 color1
                                    if (endNoteData.color === endColorName) {
                                        // 匹配到 color1
                                        endColor = endColorName;
                                    } else if (endNoteData.color2 === endColorName) {
                                        // 虽然提取的是第一层级颜色，但 note 的 color2 匹配，使用 color2
                                        endColor = endColorName;
                                    } else {
                                        // 不匹配，但直接使用提取的颜色名称
                                        endColor = endColorName;
                                    }
                                }
                            } else {
                                console.warn(`无法从渐变终点颜色值反推颜色名称: ${endColorValue}`);
                            }
                        }
                    }
                }
            } else if (color && color !== 'none' && !color.startsWith('url(')) {
                // 如果是纯色，尝试从颜色值反推颜色名称
                let colorName = getColorNameFromValue(color, 1);
                if (!colorName) {
                    colorName = getColorNameFromValue(color, 2);
                }
                if (!colorName) {
                    colorName = getColorNameFromValue(color, null);
                }
                if (colorName) {
                    // 如果反推成功，使用该颜色
                    startColor = colorName;
                    endColor = colorName;
                } else {
                    console.warn(`无法从连线颜色值反推颜色名称: ${color}`);
                }
            }

            // 如果从渐变或颜色值中无法获取颜色，使用 note 的实际颜色
            // 但优先使用从渐变中提取的颜色
            // 先尝试 color1，如果 color1 是 white，再尝试 color2
            if (startColor === 'white') {
                if (startNoteData.color && startNoteData.color !== 'white') {
                    startColor = startNoteData.color;
                } else if (startNoteData.color2 && startNoteData.color2 !== null) {
                    startColor = startNoteData.color2;
                }
            }
            if (endColor === 'white') {
                if (endNoteData.color && endNoteData.color !== 'white') {
                    endColor = endNoteData.color;
                } else if (endNoteData.color2 && endNoteData.color2 !== null) {
                    endColor = endNoteData.color2;
                }
            }

            // 如果起点或终点的 note 颜色仍然是 'white'，尝试从 SVG 元素本身提取
            // 先尝试第一层级颜色，再尝试第二层级颜色
            if (startColor === 'white') {
                const startNoteElement = svgElement.querySelector(`g#${startNoteId}`);
                if (startNoteElement) {
                    const className = startNoteElement.getAttribute('class') || '';
                    const classes = className.split(/\s+/);
                    // 先尝试第一层级颜色
                    const level1ColorClasses = ['blue', 'green', 'red', 'black', 'white', 'trans', 'brown', 'gray'];
                    for (const colorClass of level1ColorClasses) {
                        if (classes.includes(colorClass) && colorClass !== 'white') {
                            startColor = colorClass;
                            break;
                        }
                    }
                    // 如果还是 white，尝试第二层级颜色
                    if (startColor === 'white') {
                        const level2ColorClasses = Object.keys(LEVEL2_COLORS);
                        for (const colorClass of level2ColorClasses) {
                            if (classes.includes(colorClass)) {
                                // 检查 note 的 color2 是否匹配
                                if (startNoteData.color2 === colorClass) {
                                    startColor = colorClass;
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if (endColor === 'white') {
                const endNoteElement = svgElement.querySelector(`g#${endNoteId}`);
                if (endNoteElement) {
                    const className = endNoteElement.getAttribute('class') || '';
                    const classes = className.split(/\s+/);
                    // 先尝试第一层级颜色
                    const level1ColorClasses = ['blue', 'green', 'red', 'black', 'white', 'trans', 'brown', 'gray'];
                    for (const colorClass of level1ColorClasses) {
                        if (classes.includes(colorClass) && colorClass !== 'white') {
                            endColor = colorClass;
                            break;
                        }
                    }
                    // 如果还是 white，尝试第二层级颜色
                    if (endColor === 'white') {
                        const level2ColorClasses = Object.keys(LEVEL2_COLORS);
                        for (const colorClass of level2ColorClasses) {
                            if (classes.includes(colorClass)) {
                                // 检查 note 的 color2 是否匹配
                                if (endNoteData.color2 === colorClass) {
                                    endColor = colorClass;
                                    break;
                                }
                            }
                        }
                    }
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
            } else if (startColor === 'trans' && endColor === 'trans') {
                connection.color = '#aaaaaa';
            } else if (startColor === endColor) {
                // 相同颜色，使用降低饱和度的颜色值
                try {
                    connection.color = reduceColorSaturation(startColor, 0.6);
                    console.log(`[${index}] 同色连线颜色计算: ${startColor} -> ${connection.color}`);
                } catch (error) {
                    console.error(`[${index}] 计算同色连线颜色失败:`, error, `startColor: ${startColor}`);
                    // 如果计算失败，使用默认灰色
                    connection.color = '#aaaaaa';
                }
            } else {
                // 不同颜色，使用渐变 ID
                connection.color = `gradient-${connId}`;
            }

            connections[connId] = connection;
            console.log(`成功导入连线 ${connId}: ${startNoteId} -> ${endNoteId}, 类型: ${type}, 箭头: ${arrowDirection}, 颜色: ${connection.color}, 起点颜色: ${startColor}, 终点颜色: ${endColor}`);
        } catch (error) {
            // 如果单个连线解析失败，记录错误但继续处理其他连线
            console.warn(`解析连线 ${index} 失败:`, error, pathElement);
        }
    });

    // 将连线添加到 data.connections 中
    if (Object.keys(connections).length > 0) {
        if (!data.connections) {
            data.connections = {};
        }
        Object.assign(data.connections, connections);
        console.log(`最终保存了 ${Object.keys(connections).length} 条连线到 data.connections`);
        console.log('连线 IDs:', Object.keys(connections));
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
