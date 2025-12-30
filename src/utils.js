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
