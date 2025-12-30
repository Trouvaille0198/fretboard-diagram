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
