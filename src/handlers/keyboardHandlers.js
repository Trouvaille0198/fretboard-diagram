import { updateNote } from '../utils';

export function createKeyboardHandler(params) {
    const {
        selected,
        deleteNote,
        selectColor,
        cycleLevel1Color,
        cycleLevel2Color,
        undo,
        hoveredNoteId,
        data,
        setData,
        visibility,
        connectionMode,
        setConnectionMode,
        setConnectionStartNote,
        setConnectionStartPosition,
        setMousePosition,
        setPreviewHoverNote,
        setUseColor2Level,
        saveFretboardState
    } = params;

    return (event) => {
        // Ctrl+Shift+S 强制新建状态
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyS') {
            event.preventDefault();
            if (saveFretboardState) {
                saveFretboardState(true); // forceNew = true
            }
            return;
        }

        // Ctrl+S 保存状态（如果有选中则更新，否则新建）
        if (event.ctrlKey && event.code === 'KeyS' && !event.shiftKey) {
            event.preventDefault();
            if (saveFretboardState) {
                saveFretboardState(false); // forceNew = false
            }
            return;
        }

        // Ctrl+Z 撤销
        if (event.ctrlKey && event.code === 'KeyZ' && !event.shiftKey) {
            event.preventDefault();
            undo();
            return;
        }

        switch (event.code) {
            case 'Backspace':
            case 'Delete':
                if (selected) {
                    deleteNote();
                }
                break;
            case 'KeyB':
                selectColor(1, 'blue');
                break;
            case 'KeyG':
                selectColor(1, 'green');
                break;
            case 'KeyS':
                // 切换连线工具
                setConnectionMode(prev => {
                    if (prev) {
                        // 退出连线模式时清除状态
                        setConnectionStartNote(null);
                        setConnectionStartPosition(null);
                        setMousePosition(null);
                        setPreviewHoverNote(null);
                        setUseColor2Level(false);
                    }
                    return !prev;
                });
                break;
            case 'KeyR':
                selectColor(1, 'red');
                break;
            case 'KeyX':
                // 如果hover在某个note上，删除该note
                if (hoveredNoteId) {
                    const noteElement = document.getElementById(hoveredNoteId);
                    if (noteElement) {
                        const noteData = data[hoveredNoteId] || {};
                        const currentVisibility = noteData.visibility || visibility;
                        // 只对visible状态的音符生效
                        if (currentVisibility === 'visible') {
                            updateNote(noteElement, data, {
                                color: 'white',
                                color2: null,
                                visibility: visibility
                            });
                            setData(prevData => {
                                const newData = { ...prevData };
                                if (hoveredNoteId in newData) {
                                    newData[hoveredNoteId] = {
                                        ...newData[hoveredNoteId],
                                        color: 'white',
                                        color2: null,
                                        visibility: visibility
                                    };
                                }
                                // 删除与该note相关的所有连线
                                if (newData.connections) {
                                    const connections = { ...newData.connections };
                                    Object.keys(connections).forEach(connId => {
                                        const conn = connections[connId];
                                        if (conn.startNoteId === hoveredNoteId || conn.endNoteId === hoveredNoteId) {
                                            delete connections[connId];
                                        }
                                    });
                                    newData.connections = connections;
                                }
                                return newData;
                            });
                        }
                    }
                }
                break;
            case 'KeyA':
                cycleLevel1Color();
                break;
            case 'KeyD':
                cycleLevel2Color();
                break;
        }
    };
}
