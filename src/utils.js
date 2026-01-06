// 第一层级颜色的 RGB 值（从 CSS 中获取）
const baseColorRGB = {
    'blue': { r: 70, g: 130, b: 180 },      // steelblue
    'green': { r: 0, g: 128, b: 128 },     // teal
    'red': { r: 205, g: 92, b: 92 },       // indianred
    'white': { r: 0, g: 0, b: 0 },         // 黑色背景（需要特殊处理）
    'black': { r: 170, g: 170, b: 170 }    // 浅灰色文本（需要特殊处理）
};

// RGB 转 HSL
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // 无色彩
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
}

// HSL 转 RGB
function hslToRgb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;

    let r, g, b;

    if (s === 0) {
        r = g = b = l; // 无色彩
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

// RGB 转十六进制
function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

// 从颜色配置文件导入
import { getLevel2Color as getLevel2ColorFromConfig, LEVEL1_COLORS, LEVEL2_COLORS, getLevel1FillColor } from './colorConfig';

// 获取第二层级颜色值（独立设置，不依赖第一层级）
export function getLevel2Color(colorName) {
    return getLevel2ColorFromConfig(colorName);
}

// 生成类名
export function generateClassValue(elem, update) {
    const classVal = elem.className?.baseVal || elem.getAttribute('class') || 'note white transparent';
    const classValues = classVal.split(' ');
    if ('type' in update) {
        classValues[0] = update.type || 'note';
    }
    if ('color' in update) {
        // 如果是自定义颜色对象，使用其 name 属性
        const colorName = typeof update.color === 'object' ? update.color.name : update.color;
        classValues[1] = colorName || 'white';
    }
    if ('visibility' in update) {
        classValues[2] = update.visibility || 'transparent';
    }
    return classValues.join(' ');
}

// 更新音符
export function updateNote(elem, data, update) {
    const noteId = elem.id;
    if (!(noteId in data)) {
        data[noteId] = {};
    }
    const classValue = generateClassValue(elem, update);
    elem.setAttribute('class', classValue);

    if ('noteText' in update) {
        const textElem = elem.querySelector('text');
        if (textElem) {
            textElem.textContent = update.noteText;
        }
    }

    // 处理第一层级自定义颜色
    const circleElem = elem.querySelector('circle');
    if ('color' in update && circleElem) {
        if (typeof update.color === 'object' && update.color.custom) {
            // 使用自定义颜色，直接设置 fill
            circleElem.setAttribute('fill', update.color.custom);
        } else {
            // 使用预定义颜色，移除 fill 属性让 CSS 控制
            circleElem.removeAttribute('fill');
        }
    }

    // 处理第二层级颜色（color2）- 设置到 circle 的 stroke 属性
    if ('color2' in update) {
        if (circleElem) {
            if (update.color2 && update.color2 !== null) {
                const level2Color = getLevel2Color(update.color2);
                circleElem.setAttribute('stroke', level2Color);
                circleElem.setAttribute('stroke-width', '4.5');
            } else {
                // 清除第二层级颜色
                circleElem.removeAttribute('stroke');
                circleElem.removeAttribute('stroke-width');
            }
        }
    }

    const noteData = data[noteId];
    for (const [key, value] of Object.entries(update)) {
        noteData[key] = value;
    }
}

// 内联 CSS
export function inlineCSS(svg) {
    const PROPERTIES = [
        "fill",
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-dasharray",
        "text-anchor",
        "dominant-baseline",
        "font-size",
        "font-family",
        "font-weight"
    ];

    // 获取 CSS 变量值（从原始 DOM 获取）
    const root = document.documentElement;
    const rootStyle = getComputedStyle(root);
    const cssVars = {
        '--background-color': rootStyle.getPropertyValue('--background-color').trim() || 'black',
        '--text-color': rootStyle.getPropertyValue('--text-color').trim() || '#aaaaaa'
    };

    // 获取所有颜色 CSS 变量
    const colorVars = {};
    for (let i = 0; i < rootStyle.length; i++) {
        const prop = rootStyle[i];
        if (prop.startsWith('--color-')) {
            colorVars[prop] = rootStyle.getPropertyValue(prop).trim();
        }
    }

    // 从原始 SVG（在 DOM 中的）获取元素
    const originalSvg = document.getElementById('fretboard-svg');
    if (!originalSvg) {
        // 如果找不到原始 SVG，使用传入的 svg（可能是克隆的）
        return svg;
    }

    const originalElements = originalSvg.querySelectorAll("*");
    const clonedSVG = svg.cloneNode(true);
    const clonedElements = clonedSVG.querySelectorAll("*");

    for (let i = 0; i < originalElements.length; i++) {
        const originalElement = originalElements[i];
        const clonedElement = clonedElements[i];

        if (!clonedElement) continue;

        // 跳过 foreignObject 中的 HTML 元素
        if (originalElement.tagName === 'foreignObject' || originalElement.closest('foreignObject')) {
            continue;
        }

        // 从原始元素（在 DOM 中的）获取计算样式
        const computedStyle = getComputedStyle(originalElement);
        const opacity = computedStyle.getPropertyValue('opacity');
        if (opacity === '0') {
            clonedElement.remove();
            continue;
        }
        const styles = { opacity: opacity };
        for (const attr of PROPERTIES) {
            let value = computedStyle.getPropertyValue(attr);
            // 替换 CSS 变量为实际值
            if (value) {
                // 替换 --background-color
                if (value.includes('var(--background-color)')) {
                    value = value.replace(/var\(--background-color\)/g, cssVars['--background-color']);
                }
                // 替换 --text-color
                if (value.includes('var(--text-color)')) {
                    value = value.replace(/var\(--text-color\)/g, cssVars['--text-color']);
                }
                // 替换所有颜色变量
                for (const [varName, varValue] of Object.entries(colorVars)) {
                    if (value.includes(`var(${varName})`)) {
                        value = value.replace(new RegExp(`var\\(${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'), varValue);
                    }
                }
            }
            if (value && value !== 'none' && value !== 'normal' && value.trim() !== '') {
                styles[attr] = value;
            }
        }
        for (const [key, value] of Object.entries(styles)) {
            // text-anchor 和 dominant-baseline 应该作为 SVG 属性，而不是 CSS 样式
            if (key === 'text-anchor' || key === 'dominant-baseline') {
                clonedElement.setAttribute(key, value);
            } else {
                clonedElement.style.setProperty(key.replace(/-([a-z])/g, (g) => g[1].toUpperCase()), value);
            }
        }

        // 对于文本元素，确保设置 x 和 y 属性（如果它们在 g 元素内，需要设置为 0）
        if (clonedElement.tagName === 'text' && originalElement.parentElement?.tagName === 'g') {
            // 检查文本元素是否已经有 x 和 y 属性
            if (!clonedElement.hasAttribute('x')) {
                clonedElement.setAttribute('x', '0');
            }
            if (!clonedElement.hasAttribute('y')) {
                clonedElement.setAttribute('y', '0');
            }
        }
    }
    return clonedSVG;
}

// 音名到唱名转换
// noteIndex: 当前音符的索引 (0-11)
// rootNote: 根音索引 (0-11)
// enharmonic: 0=升号, 1=降号
export function noteToSolfege(noteIndex, rootNote, enharmonic) {
    // 计算相对于根音的半音数
    let semitones = (noteIndex - rootNote + 12) % 12;

    // 基本唱名映射（大调音阶）
    const solfegeMap = {
        0: '1',   // 根音
        2: '2',   // 大二度
        4: '3',   // 大三度
        5: '4',   // 纯四度
        7: '5',   // 纯五度
        9: '6',   // 大六度
        11: '7'   // 大七度
    };

    // 如果是基本音级，直接返回
    if (semitones in solfegeMap) {
        return solfegeMap[semitones];
    }

    // 处理升降号
    if (semitones === 1) {
        // 小二度：1# 或 2b
        if (enharmonic === 0) {
            return '1#';
        } else {
            return '2b';
        }
    } else if (semitones === 3) {
        // 小三度：2# 或 3b
        if (enharmonic === 0) {
            return '2#';
        } else {
            return '3b';
        }
    } else if (semitones === 6) {
        // 增四度/减五度：4# 或 5b
        if (enharmonic === 0) {
            return '4#';
        } else {
            return '5b';
        }
    } else if (semitones === 8) {
        // 小六度：5# 或 6b
        if (enharmonic === 0) {
            return '5#';
        } else {
            return '6b';
        }
    } else if (semitones === 10) {
        // 小七度：6# 或 7b
        if (enharmonic === 0) {
            return '6#';
        } else {
            return '7b';
        }
    }

    // 默认情况（理论上不应该到达这里）
    return solfegeMap[semitones] || String(semitones);
}

// 获取颜色的RGB值
function getColorRGB(colorName) {
    if (colorName === 'white') {
        return { r: 170, g: 170, b: 170 }; // 灰色，用于white note
    }
    // trans 是透明色，使用黑色背景
    if (colorName === 'trans') {
        return { r: 0, g: 0, b: 0 }; // 黑色背景（透明色）
    }
    // 先尝试第一层级颜色
    if (colorName in LEVEL1_COLORS) {
        const colorValue = getLevel1FillColor(colorName);
        if (colorValue && colorValue.startsWith('#')) {
            const hex = colorValue.slice(1);
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16)
            };
        }
    }
    // 再尝试第二层级颜色
    if (colorName in LEVEL2_COLORS) {
        const colorValue = getLevel2Color(colorName);
        if (colorValue && colorValue.startsWith('#')) {
            const hex = colorValue.slice(1);
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16)
            };
        }
    }
    // 处理命名颜色（从CSS变量或直接颜色名）
    if (colorName === 'blue') return { r: 70, g: 130, b: 180 };
    if (colorName === 'green') return { r: 0, g: 160, b: 128 }; // #00a080
    if (colorName === 'red') return { r: 205, g: 92, b: 92 };
    if (colorName === 'brown') return { r: 139, g: 69, b: 19 };
    if (colorName === 'gray') return { r: 170, g: 170, b: 170 }; // 灰色 #aaaaaa
    return { r: 170, g: 170, b: 170 }; // 默认灰色
}

// 降低颜色饱和度
export function reduceColorSaturation(colorName, saturationFactor = 0.5) {
    const rgb = getColorRGB(colorName);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsl.s = Math.max(0, hsl.s * saturationFactor);
    const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
}

// 计算连线颜色
export function calculateConnectionColor(startNoteData, endNoteData, connectionId) {
    const startColor = startNoteData?.color || 'white';
    const endColor = endNoteData?.color || 'white';

    // 如果都是white，返回灰色
    if (startColor === 'white' && endColor === 'white') {
        return '#aaaaaa';
    }

    // 如果都是trans，返回灰色
    if (startColor === 'trans' && endColor === 'trans') {
        return '#aaaaaa';
    }

    // 如果颜色相同，降低饱和度
    if (startColor === endColor) {
        return reduceColorSaturation(startColor, 0.6);
    }

    // 不同颜色，返回渐变ID
    return `gradient-${connectionId}`;
}

// 检测鼠标位置是否在某个note上
export function detectNoteAtPosition(x, y, notes, circleRadius = 18) {
    for (const note of notes) {
        const noteX = note.x;
        const noteY = note.y;
        const distance = Math.sqrt(Math.pow(x - noteX, 2) + Math.pow(y - noteY, 2));
        if (distance <= circleRadius) {
            return note;
        }
    }
    return null;
}

// 计算note边缘上的点（从中心点向目标点方向延伸radius距离）
export function getPointOnNoteEdge(centerX, centerY, targetX, targetY, radius) {
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) {
        // 如果目标点就是中心点，返回一个默认方向（向右）
        return { x: centerX + radius, y: centerY };
    }

    // 计算单位向量
    const unitX = dx / distance;
    const unitY = dy / distance;

    // 从中心点沿着方向延伸radius距离
    return {
        x: centerX + unitX * radius,
        y: centerY + unitY * radius
    };
}

// 计算弧线路径
// curvature: -1到1之间，0为直线，正值为向上弯曲，负值为向下弯曲
export function calculateArcPath(startX, startY, endX, endY, curvature = 0) {
    if (curvature === 0) {
        // 直线
        return `M ${startX} ${startY} L ${endX} ${endY}`;
    }

    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const arcHeight = Math.abs(curvature) * distance * 0.3; // 可调整的弧度系数

    // 计算垂直方向（垂直于起点到终点的方向）
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);
    // 根据curvature的正负决定弯曲方向
    // 在SVG坐标系中，y轴向下，所以向上凸需要y值更小
    const perpX = -dy / length;
    const perpY = dx / length;

    // 反转符号：正值向上凸（y值更小），负值向下凸（y值更大）
    const sign = curvature > 0 ? -1 : 1;
    const controlX = midX + perpX * arcHeight * sign;
    const controlY = midY + perpY * arcHeight * sign;

    return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
}

// 计算路径上距离起点指定距离的点
// 使用浏览器原生的SVGPathElement.getPointAtLength()方法
export function getPointOnPathAtDistance(pathString, distanceFromStart) {
    // 创建临时的SVG元素来计算路径点
    const svgNS = 'http://www.w3.org/2000/svg';
    const pathElement = document.createElementNS(svgNS, 'path');
    pathElement.setAttribute('d', pathString);

    // 获取路径总长度
    const totalLength = pathElement.getTotalLength();

    // 确保距离在有效范围内
    const distance = Math.max(0, Math.min(distanceFromStart, totalLength));

    // 获取路径上指定距离的点
    const point = pathElement.getPointAtLength(distance);

    return { x: point.x, y: point.y };
}
