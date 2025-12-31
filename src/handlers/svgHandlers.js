import { detectNoteAtPosition } from '../utils';
import { CONSTS } from '../constants';

export function createSvgClickHandler(params) {
    const {
        connectionMode,
        connectionStartNote,
        setConnectionStartNote,
        setConnectionStartPosition,
        setMousePosition,
        setPreviewHoverNote,
        setUseColor2Level,
        selected,
        setSelected,
        data,
        setData,
        connectionToolbarVisible,
        setConnectionToolbarVisible,
        setToolbarDropdown,
        updateNote: updateNoteFn
    } = params;

    return () => {
        if (connectionMode && connectionStartNote) {
            // 在连线模式下，点击空白区域取消连线
            setConnectionStartNote(null);
            setConnectionStartPosition(null);
            setMousePosition(null);
            setPreviewHoverNote(null);
            setUseColor2Level(false);
            return;
        }

        if (selected) {
            const noteElement = selected.element || document.getElementById(selected.id);
            if (noteElement) {
                updateNoteFn(noteElement, data, { visibility: 'visible' });
                setData(prevData => {
                    const newData = { ...prevData };
                    if (selected.id in newData) {
                        newData[selected.id] = { ...newData[selected.id], visibility: 'visible' };
                    }
                    return newData;
                });
            }
            setSelected(null);
        }

        // 点击外部区域关闭连线工具栏
        if (connectionToolbarVisible) {
            setConnectionToolbarVisible(false);
            setToolbarDropdown(null);
        }
    };
}

export function createSvgContextMenuHandler(params) {
    const {
        connectionMode,
        setConnectionMode,
        setConnectionStartNote,
        setConnectionStartPosition,
        setMousePosition,
        setPreviewHoverNote,
        setUseColor2Level
    } = params;

    return (event) => {
        if (connectionMode) {
            // 在连线模式下，右键取消连线工具
            event.preventDefault();
            setConnectionMode(false);
            setConnectionStartNote(null);
            setConnectionStartPosition(null);
            setMousePosition(null);
            setPreviewHoverNote(null);
            setUseColor2Level(false);
        }
    };
}

export function createSvgMouseMoveHandler(params) {
    const {
        connectionMode,
        connectionStartNote,
        svgElementRef,
        setMousePosition,
        notes,
        data,
        visibility,
        setPreviewHoverNote,
        previewHoverNote
    } = params;

    return (e) => {
        if (connectionMode && connectionStartNote && svgElementRef.current) {
            const svg = svgElementRef.current;
            const point = svg.createSVGPoint();
            point.x = e.clientX;
            point.y = e.clientY;
            const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
            setMousePosition({ x: svgPoint.x, y: svgPoint.y });

            // 检测鼠标是否在某个note上，并且该note必须是visible的
            const hoveredNote = detectNoteAtPosition(svgPoint.x, svgPoint.y, notes, CONSTS.circleRadius);
            if (hoveredNote) {
                const hoveredNoteData = data[hoveredNote.id] || { type: 'note', color: 'white', visibility: visibility };
                const hoveredVisibility = hoveredNoteData.visibility || visibility;
                // 只有visible的note才能作为预览终点
                if (hoveredVisibility === 'visible') {
                    setPreviewHoverNote(hoveredNote.id);
                } else {
                    setPreviewHoverNote(null);
                }
            } else {
                setPreviewHoverNote(null);
            }
        }
    };
}

export function createSvgMouseDownHandler(params) {
    const {
        connectionMode,
        connectionStartNote,
        previewHoverNote,
        data,
        visibility,
        useColor2Level,
        setUseColor2Level
    } = params;

    return (e) => {
        // 如果点击的是工具栏按钮，不处理
        if (e.target.closest('.toolbar-icon-btn') || e.target.closest('.connection-toolbar')) {
            return;
        }

        if (connectionMode && connectionStartNote && e.button === 1) {
            // 鼠标中键（button === 1）
            e.preventDefault();
            e.stopPropagation();

            // 优先使用悬停的note，如果没有则使用起点note
            const targetNoteId = previewHoverNote || connectionStartNote;
            const targetNoteData = data[targetNoteId] || { type: 'note', color: 'white', visibility: visibility };
            const hasColor2 = targetNoteData.color2 && targetNoteData.color2 !== null;

            // 只有当note有两层颜色时才能切换层级
            if (hasColor2) {
                // 全局切换颜色层级
                setUseColor2Level(prev => !prev);
            }
            return false;
        }
    };
}

export function createSvgWheelHandler(params) {
    const {
        connectionMode,
        connectionStartNote,
        previewHoverNote,
        data,
        visibility,
        useColor2Level,
        setUseColor2Level
    } = params;

    return (e) => {
        if (connectionMode && connectionStartNote && previewHoverNote) {
            const hoveredNoteData = data[previewHoverNote] || { type: 'note', color: 'white', visibility: visibility };
            const hasColor2 = hoveredNoteData.color2 && hoveredNoteData.color2 !== null;

            // 只有当note有两层颜色时才能切换
            if (hasColor2) {
                e.preventDefault();
                e.stopPropagation();
                setUseColor2Level(prev => !prev);
            }
        }
    };
}

export function createEditableKeyDownHandler() {
    return (event) => {
        if (event.code === 'Enter') {
            event.preventDefault();
            event.target.blur();
        }
        event.stopPropagation();
    };
}

export function createEditableClickHandler() {
    return (event) => {
        event.stopPropagation();
    };
}
