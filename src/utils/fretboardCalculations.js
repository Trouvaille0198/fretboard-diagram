import { CONSTS } from '../constants';

export function computeNoteIndex(fret, string) {
    const interval = CONSTS.stringIntervals[string] + fret + 1;
    return interval % 12;
}

export function computeNoteName(fret, string, enharmonic) {
    const noteIndex = computeNoteIndex(fret, string);
    return CONSTS.notes[enharmonic][noteIndex];
}

export function generateNotes(startFret, endFret, data, displayMode, rootNote, enharmonic, visibility, computeNoteName, computeNoteIndex, noteToSolfege) {
    const notes = [];

    // 只有当 startFret === 0 时，才显示开放弦（0品）
    if (startFret === 0) {
        for (let j = 0; j < CONSTS.numStrings; j++) {
            const noteId = `o-s${j}`;
            // 调整0品位置，使其与相邻品位的间隔相同
            // 第一个品位的x坐标是：CONSTS.offsetX + CONSTS.fretWidth / 2
            // 为了让0品和第一个品位之间的距离等于相邻品位之间的距离（CONSTS.fretWidth）
            // 0品的x坐标应该是：CONSTS.offsetX + CONSTS.fretWidth / 2 - CONSTS.fretWidth = CONSTS.offsetX - CONSTS.fretWidth / 2
            const x = CONSTS.offsetX - CONSTS.fretWidth / 2;
            const y = CONSTS.offsetY + CONSTS.stringSpacing * j;
            const noteData = data[noteId] || {};

            let displayName;
            if (noteData.noteText) {
                // 如果用户手动编辑了文本，优先使用编辑的文本
                displayName = noteData.noteText;
            } else if (displayMode === 'solfege' && rootNote !== null) {
                // 唱名模式（需要选中根音）
                const noteIndex = computeNoteIndex(-1, j);
                displayName = noteToSolfege(noteIndex, rootNote, enharmonic);
            } else {
                // 音名模式
                displayName = computeNoteName(-1, j, enharmonic);
            }

            notes.push({
                id: noteId,
                x,
                y,
                noteName: displayName,
                isOpen: true,
                data: noteData
            });
        }
    }

    for (let i = startFret; i < endFret; i++) {
        for (let j = 0; j < CONSTS.numStrings; j++) {
            const noteId = `f${i}-s${j}`;
            const x = CONSTS.offsetX + (CONSTS.fretWidth / 2) + CONSTS.fretWidth * (i - startFret);
            const y = CONSTS.offsetY + CONSTS.stringSpacing * j;
            const noteData = data[noteId] || {};

            let displayName;
            if (noteData.noteText) {
                // 如果用户手动编辑了文本，优先使用编辑的文本
                displayName = noteData.noteText;
            } else if (displayMode === 'solfege' && rootNote !== null) {
                // 唱名模式（需要选中根音）
                const noteIndex = computeNoteIndex(i, j);
                displayName = noteToSolfege(noteIndex, rootNote, enharmonic);
            } else {
                // 音名模式
                displayName = computeNoteName(i, j, enharmonic);
            }

            notes.push({
                id: noteId,
                x,
                y,
                noteName: displayName,
                isOpen: false,
                data: noteData
            });
        }
    }

    return notes;
}

export function generateMarkers(startFret, endFret) {
    const filteredMarkers = CONSTS.markers.filter(i => i > startFret && i <= endFret);
    const markers = [];

    // 底部marker
    filteredMarkers.forEach(i => {
        markers.push({
            x: CONSTS.offsetX + (i - 1 - startFret) * CONSTS.fretWidth + (CONSTS.fretWidth / 2),
            y: CONSTS.offsetY + CONSTS.fretHeight + CONSTS.stringSpacing,
            number: i,
            position: 'bottom'
        });
    });

    // 顶部marker（使用相对距离）
    filteredMarkers.forEach(i => {
        markers.push({
            x: CONSTS.offsetX + (i - 1 - startFret) * CONSTS.fretWidth + (CONSTS.fretWidth / 2),
            y: CONSTS.offsetY - CONSTS.stringSpacing * 0.7, // 使用stringSpacing的70%作为padding
            number: i,
            position: 'top'
        });
    });

    return markers;
}

export function generateFretPath(startFret, endFret) {
    let path = `M ${CONSTS.offsetX} ${CONSTS.offsetY}`;
    for (let i = startFret; i < endFret + 1; i++) {
        const factor = (i - startFret) % 2 === 0 ? 1 : -1;
        path += ` v ${factor * CONSTS.fretHeight}`;
        path += ` m ${CONSTS.fretWidth} 0`;
    }
    return path;
}

export function generateStringPath(stringIndex, fretboardWidth) {
    const y = CONSTS.offsetY + stringIndex * CONSTS.stringSpacing;
    return `M ${CONSTS.offsetX} ${y} h ${fretboardWidth}`;
}

export function getNotePosition(noteId, notes) {
    const note = notes.find(n => n.id === noteId);
    if (note) {
        return { x: note.x, y: note.y };
    }
    return null;
}
