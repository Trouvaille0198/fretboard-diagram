import { updateNote } from '../utils';
import { CONNECTION_PRESETS } from '../hooks/useConnectionState';

export function createKeyboardHandler(params) {
    const {
        selected,
        deleteNote,
        selectColor,
        cycleLevel1Color,
        cycleLevel1ColorReverse,
        cycleLevel2Color,
        cycleLevel2ColorReverse,
        undo,
        redo,
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
        dynamic,
        deleteHoveredPair,
        toggleVisibility,
        reset,
        saveSVG,
        copyGif,
        copyCumulativeSvg,
        selectedColorLevel,
        selectConnectionPreset
    } = params;

    return (event) => {
        // Ctrl+Shift+C：动态模式=导出累积式动图 SVG（激活过的音永不熄灭的样式）
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
            event.preventDefault();
            if (dynamic?.isDynamic && copyCumulativeSvg) {
                copyCumulativeSvg();
            }
            return;
        }

        // Ctrl+C 复制：动态模式(≥2帧)=GIF 到剪贴板；其余=SVG
        if (event.ctrlKey && event.code === 'KeyC' && !event.shiftKey) {
            event.preventDefault();
            if (copyGif && dynamic?.isDynamic) { // 动态页一律复制动图（单帧带技法/前置也可导出）
                copyGif();
            } else if (saveSVG) {
                saveSVG();
            }
            return;
        }

        // 动态编辑态：退格/Delete 优先删悬停的技法标注线；无悬停线则熄灭悬停的激活音（与普通模式退格同语义）
        if (dynamic?.isDynamic && dynamic.viewMode === 'edit' && !event.ctrlKey && !event.altKey && !event.shiftKey
            && (event.code === 'Backspace' || event.code === 'Delete')) {
            if (deleteHoveredPair && deleteHoveredPair()) { event.preventDefault(); return; }
            if (hoveredNoteId && dynamic.extinguishNote && dynamic.extinguishNote(hoveredNoteId)) { event.preventDefault(); return; }
            return;
        }

        // 动态模式逐帧跳转：←/→ 边界停；编辑态 A/D 循环绕回（首帧←D=末帧，末帧 D→=首帧）
        if (dynamic?.isDynamic && !event.ctrlKey && !event.altKey && !event.shiftKey
            && (event.code === 'ArrowLeft' || event.code === 'ArrowRight'
                || (dynamic.viewMode === 'edit' && (event.code === 'KeyA' || event.code === 'KeyD')))) {
            event.preventDefault();
            if (dynamic.gotoFrame) {
                const dir = (event.code === 'ArrowRight' || event.code === 'KeyD') ? 1 : -1;
                if (event.code === 'KeyA' || event.code === 'KeyD') {
                    const n = Number(dynamic.frameCount) || 0;
                    if (n > 0) dynamic.gotoFrame((dynamic.editIdx + dir + n) % n);
                } else {
                    dynamic.gotoFrame(dynamic.editIdx + dir);
                }
            }
            return;
        }

        // 动态编辑模式屏蔽连线快捷键（画线功能在动图编辑中让位给拖拽滑弦）
        if (dynamic?.isDynamic && !event.ctrlKey && !event.altKey && ['Digit1', 'Digit2', 'Digit3', 'KeyS'].includes(event.code)) {
            return;
        }

        // Q 进入/退出动态编辑模式（普通画图=帧1）
        if (!event.ctrlKey && !event.altKey && !event.shiftKey && event.code === 'KeyQ') {
            event.preventDefault();
            if (dynamic?.toggleQ) {
                dynamic.toggleQ();
            }
            return;
        }

        // Ctrl+S 只在动态编辑模式生效：整图保存/更新到动图堆
        if (event.ctrlKey && event.code === 'KeyS') {
            event.preventDefault();
            if (dynamic?.isDynamic && dynamic.viewMode === 'edit' && dynamic.persistClip) {
                dynamic.persistClip();
            }
            return;
        }


        // Ctrl+Shift+Z 重做（预览模式屏蔽）
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyZ') {
            event.preventDefault();
            if (dynamic?.isDynamic) {
                if (dynamic.viewMode === 'edit' && dynamic.redoStep && dynamic.redoStep()) return;
                return; // 预览态不重做
            }
            if (redo) {
                redo();
            }
            return;
        }

        // Ctrl+Z 撤销：动图编辑态=帧内撤销；预览态屏蔽；普通模式=编辑器撤销
        if (event.ctrlKey && event.code === 'KeyZ' && !event.shiftKey) {
            event.preventDefault();
            if (dynamic?.isDynamic) {
                if (dynamic.viewMode === 'edit' && dynamic.undoStep && dynamic.undoStep()) return;
                return;
            }
            undo();
            return;
        }

        // Esc 取消进行中的技法标注
        if (event.code === 'Escape' && dynamic?.isDynamic && (dynamic.pendingFrom || dynamic.hasPairs)) {
            event.preventDefault();
            if (dynamic.cancelMarking) {
                dynamic.cancelMarking();
            }
            return;
        }

        // Z 切换可见性（动图页屏蔽）
        if (!event.ctrlKey && !event.altKey && !event.shiftKey && event.code === 'KeyZ') {
            event.preventDefault();
            if (dynamic?.isDynamic) return;
            if (toggleVisibility) {
                toggleVisibility();
            }
            return;
        }

        // Ctrl+D：动图编辑态=当前帧还原为上一帧状态（第1帧无动作）；预览态屏蔽；普通模式=重置
        if (event.ctrlKey && event.code === 'KeyD' && !event.shiftKey) {
            event.preventDefault();
            if (dynamic?.isDynamic) {
                if (dynamic.viewMode === 'edit' && dynamic.revertToPrevFrame) dynamic.revertToPrevFrame();
                return;
            }
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
            case 'Digit1':
            case 'Digit2':
            case 'Digit3':
                if (!event.shiftKey && !event.altKey) {
                    event.preventDefault();
                    const presetIndex = parseInt(event.code.replace('Digit', ''), 10) - 1;
                    if (selectConnectionPreset && CONNECTION_PRESETS[presetIndex]) {
                        selectConnectionPreset(CONNECTION_PRESETS[presetIndex].id);
                    }
                }
                break;
            case 'Numpad1':
            case 'Numpad2':
            case 'Numpad3':
                if (!event.shiftKey && !event.altKey) {
                    event.preventDefault();
                    const presetIndex = parseInt(event.code.replace('Numpad', ''), 10) - 1;
                    if (selectConnectionPreset && CONNECTION_PRESETS[presetIndex]) {
                        selectConnectionPreset(CONNECTION_PRESETS[presetIndex].id);
                    }
                }
                break;
            case 'KeyB':
                event.preventDefault();
                selectColor(1, 'blue');
                break;
            case 'KeyG':
                event.preventDefault();
                selectColor(1, 'green');
                break;
            case 'KeyS':
                // 切换连线工具
                if (!event.ctrlKey && !event.shiftKey) {
                    event.preventDefault();
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
                }
                break;
            case 'KeyR':
                event.preventDefault();
                selectColor(1, 'red');
                break;
            case 'KeyW':
                event.preventDefault();
                // W 键：根据当前选中的颜色层级循环颜色
                // Shift+W：反向循环颜色
                if (event.shiftKey) {
                    // Shift+W：反向循环
                    if (selectedColorLevel === 1) {
                        cycleLevel1ColorReverse();
                    } else if (selectedColorLevel === 2) {
                        cycleLevel2ColorReverse();
                    } else {
                        // 如果没有选中任何层级，默认反向循环第一层颜色
                        cycleLevel1ColorReverse();
                    }
                } else {
                    // W：正向循环
                    if (selectedColorLevel === 1) {
                        cycleLevel1Color();
                    } else if (selectedColorLevel === 2) {
                        cycleLevel2Color();
                    } else {
                        // 如果没有选中任何层级，默认循环第一层颜色
                        cycleLevel1Color();
                    }
                }
                break;
            case 'KeyA':
                event.preventDefault();
                cycleLevel1Color();
                break;
            case 'KeyD':
                // 只在没有 Ctrl 键时执行（避免与 Ctrl+D 冲突）
                if (!event.ctrlKey) {
                    event.preventDefault();
                    cycleLevel2Color();
                }
                break;
        }
    };
}
