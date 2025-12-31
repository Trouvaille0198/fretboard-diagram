import { useState, useRef, useEffect } from 'react';
import { CONSTS } from '../constants';

export function useNoteEditing() {
    const [editableText, setEditableText] = useState('');
    const [editingNote, setEditingNote] = useState(null);
    const [editableDivVisible, setEditableDivVisible] = useState(false);
    const [editableDivX, setEditableDivX] = useState(0);
    const [editableDivY, setEditableDivY] = useState(0);
    const editableDivRef = useRef(null);

    // 当编辑div可见时，自动聚焦并选中文本
    useEffect(() => {
        if (editableDivVisible && editableDivRef.current) {
            editableDivRef.current.focus();
            const range = document.createRange();
            range.selectNodeContents(editableDivRef.current);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }, [editableDivVisible]);

    const editNoteLabel = (noteId, noteElement, data) => {
        const noteData = data[noteId] || {};
        const textElem = noteElement?.querySelector('text');
        // 优先使用手动编辑的文本，否则使用当前显示的文本（可能是唱名或音名）
        const noteName = noteData.noteText || textElem?.textContent || textElem?.getAttribute('data-note') || '';
        setEditableText(noteName);
        setEditingNote(noteId);

        const x = parseFloat(noteElement?.getAttribute('data-x') || '0');
        const y = parseFloat(noteElement?.getAttribute('data-y') || '0');
        setEditableDivX(x - CONSTS.circleRadius);
        setEditableDivY(y - CONSTS.circleRadius + 4);
        setEditableDivVisible(true);
    };

    return {
        editableText,
        setEditableText,
        editingNote,
        setEditingNote,
        editableDivVisible,
        setEditableDivVisible,
        editableDivX,
        editableDivY,
        editableDivRef,
        editNoteLabel
    };
}
