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
        hoveredConnectionId,
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
        saveFretboardState,
        toggleVisibility,
        reset
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

        // Z 切换可见性
        if (!event.ctrlKey && !event.altKey && !event.shiftKey && event.code === 'KeyZ') {
            event.preventDefault();
            if (toggleVisibility) {
                toggleVisibility();
            }
            return;
        }

        // Ctrl+D 重置
        if (event.ctrlKey && event.code === 'KeyD' && !event.shiftKey) {
            event.preventDefault();
            if (reset) {
                reset();
            }
            return;
        }

        switch (event.code) {
            case 'Backspace':
                // 屏蔽backspace的默认功能
                event.preventDefault();
                // 如果hover在某个连线上，删除该连线
                if (hoveredConnectionId) {
                    setData(prevData => {
                        const newData = { ...prevData };
                        if (newData.connections && newData.connections[hoveredConnectionId]) {
                            const connections = { ...newData.connections };
                            delete connections[hoveredConnectionId];
                            newData.connections = connections;
                        }
                        return newData;
                    });
                    return;
                }
                // 如果hover在某个visible的note上，删除该note
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
                // 如果不在任何note或连线上，已经通过preventDefault屏蔽了默认功能
                break;
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
            case 'KeyA':
                cycleLevel1Color();
                break;
            case 'KeyD':
                // 只在没有 Ctrl 键时执行（避免与 Ctrl+D 冲突）
                if (!event.ctrlKey) {
                    cycleLevel2Color();
                }
                break;
        }
    };
}
