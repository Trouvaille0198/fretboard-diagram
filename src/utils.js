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
import { getLevel2Color as getLevel2ColorFromConfig } from './colorConfig';

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
        classValues[1] = update.color || 'white';
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

    // 处理第二层级颜色（color2）- 设置到 circle 的 stroke 属性
    if ('color2' in update) {
        const circleElem = elem.querySelector('circle');
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
    const PROPERTIES = ["fill", "stroke", "stroke-width", "text-anchor", "dominant-baseline"];
    const svgElements = svg.querySelectorAll("*");
    const clonedSVG = svg.cloneNode(true);
    const clonedElements = clonedSVG.querySelectorAll("*");

    for (let i = 0; i < svgElements.length; i++) {
        const computedStyle = getComputedStyle(svgElements[i]);
        const opacity = computedStyle.getPropertyValue('opacity');
        if (opacity === '0') {
            clonedElements[i].remove();
            continue;
        }
        const styles = { opacity: opacity };
        for (const attr of PROPERTIES) {
            const value = computedStyle.getPropertyValue(attr);
            if (value) {
                styles[attr] = value;
            }
        }
        for (const [key, value] of Object.entries(styles)) {
            clonedElements[i].style.setProperty(key.replace(/-([a-z])/g, (g) => g[1].toUpperCase()), value);
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
