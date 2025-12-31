import { inlineCSS } from '../utils';

// 生成缩略图
export function generateThumbnail(svgElementRef) {
    if (!svgElementRef.current) return null;

    try {
        // 使用 inlineCSS 处理 SVG
        const svgCopy = inlineCSS(svgElementRef.current);

        // 克隆 SVG 以便修改
        const clonedSvg = svgCopy.cloneNode(true);

        // 获取原始 viewBox
        const originalViewBox = svgElementRef.current.getAttribute('viewBox');
        if (originalViewBox) {
            clonedSvg.setAttribute('viewBox', originalViewBox);
        }

        // 设置较小的尺寸用于缩略图
        clonedSvg.setAttribute('width', '300');
        clonedSvg.setAttribute('height', '200');
        clonedSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        // 转换为 data URL
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clonedSvg);
        const encodedSvg = encodeURIComponent(svgString);
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;

        return dataUrl;
    } catch (error) {
        console.error('生成缩略图失败:', error);
        return null;
    }
}

// 保存指板状态
export function saveFretboardState({
    data,
    startFret,
    endFret,
    enharmonic,
    displayMode,
    rootNote,
    visibility,
    svgElementRef,
    setHistoryStates,
    setToastMessage,
    setToastType,
    selectedHistoryState,
    setSelectedHistoryState,
    forceNew = false // 强制新建（Ctrl+Shift+S）
}) {
    try {
        // 从 localStorage 读取现有历史
        const existingHistory = localStorage.getItem('fretboard-history');
        let historyArray = [];
        if (existingHistory) {
            try {
                historyArray = JSON.parse(existingHistory);
            } catch (e) {
                console.error('解析历史记录失败:', e);
                historyArray = [];
            }
        }

        let stateSnapshot;
        let isUpdate = false;

        // 如果有选中的状态且不是强制新建，则更新该状态
        if (selectedHistoryState && !forceNew) {
            // 更新已存在的状态
            stateSnapshot = {
                ...selectedHistoryState,
                timestamp: Date.now(),
                name: new Date().toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                thumbnail: null,
                state: {
                    data: JSON.parse(JSON.stringify(data)), // 深拷贝，包括 connections
                    startFret,
                    endFret,
                    enharmonic,
                    displayMode,
                    rootNote,
                    visibility
                }
            };

            // 生成缩略图
            const thumbnailUrl = generateThumbnail(svgElementRef);
            if (thumbnailUrl) {
                stateSnapshot.thumbnail = thumbnailUrl;
            }

            // 找到并更新数组中的对应项
            const index = historyArray.findIndex(item => item.id === selectedHistoryState.id);
            if (index !== -1) {
                historyArray[index] = stateSnapshot;
                // 将更新的项移到最前面
                historyArray.splice(index, 1);
                historyArray.unshift(stateSnapshot);
                isUpdate = true;
            } else {
                // 如果找不到，当作新建处理
                historyArray.unshift(stateSnapshot);
            }
        } else {
            // 新建状态
            stateSnapshot = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                name: new Date().toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                thumbnail: null,
                state: {
                    data: JSON.parse(JSON.stringify(data)), // 深拷贝，包括 connections
                    startFret,
                    endFret,
                    enharmonic,
                    displayMode,
                    rootNote,
                    visibility
                }
            };

            // 生成缩略图
            const thumbnailUrl = generateThumbnail(svgElementRef);
            if (thumbnailUrl) {
                stateSnapshot.thumbnail = thumbnailUrl;
            }

            // 添加到数组开头（最新的在前）
            historyArray.unshift(stateSnapshot);

            // 如果之前有选中状态，清除选中（新建后选中新状态）
            if (setSelectedHistoryState) {
                setSelectedHistoryState(stateSnapshot);
            }
        }

        // 限制最大数量（50个）
        if (historyArray.length > 50) {
            historyArray = historyArray.slice(0, 50);
        }

        // 保存到 localStorage
        localStorage.setItem('fretboard-history', JSON.stringify(historyArray));

        // 更新画廊显示
        setHistoryStates(historyArray);

        // 显示提示
        setToastMessage(isUpdate ? '状态已更新！' : '状态已保存！');
        setToastType('success');

    } catch (error) {
        console.error('保存状态失败:', error);
        setToastMessage('保存失败：' + error.message);
        setToastType('error');
    }
}

// 恢复指板状态
export function restoreFretboardState(stateSnapshot, {
    setData,
    setStartFret,
    setEndFret,
    setEnharmonic,
    setDisplayMode,
    setRootNote,
    setVisibility,
    setSelected,
    setConnectionMode,
    setConnectionStartNote,
    setConnectionStartPosition,
    setMousePosition,
    setPreviewHoverNote,
    setUseColor2Level,
    setSelectedConnection,
    setConnectionToolbarVisible,
    setToastMessage,
    setToastType,
    setSelectedHistoryState
}) {
    try {
        const { state: savedState } = stateSnapshot;

        // 恢复所有状态 - 使用深拷贝确保创建新对象，避免引用问题
        const restoredData = savedState.data ? JSON.parse(JSON.stringify(savedState.data)) : {};
        const restoredVisibility = savedState.visibility ?? 'transparent';

        // 清除临时状态（先清除，避免干扰）
        setSelected(null);
        setConnectionMode(false);
        setConnectionStartNote(null);
        setConnectionStartPosition(null);
        setMousePosition(null);
        setPreviewHoverNote(null);
        setUseColor2Level(false);
        setSelectedConnection(null);
        setConnectionToolbarVisible(false);

        // 使用 setTimeout 确保状态更新顺序正确
        // 先更新显示相关的状态
        setTimeout(() => {
            setStartFret(savedState.startFret ?? 0);
            setEndFret(savedState.endFret ?? 15);
            setEnharmonic(savedState.enharmonic ?? 1);
            setDisplayMode(savedState.displayMode ?? 'note');
            setRootNote(savedState.rootNote ?? null);
            setVisibility(restoredVisibility);

            // 然后更新 data，使用函数式更新确保完全替换
            setTimeout(() => {
                setData(() => restoredData);
            }, 0);
        }, 0);

        // 选中该历史状态
        if (setSelectedHistoryState) {
            setSelectedHistoryState(stateSnapshot);
        }

        // 显示提示
        setToastMessage('状态已恢复！');
        setToastType('success');

    } catch (error) {
        console.error('恢复状态失败:', error);
        setToastMessage('恢复失败：' + error.message);
        setToastType('error');
    }
}
