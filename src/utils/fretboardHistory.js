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
    forceNew = false, // 强制新建（Ctrl+Shift+S）
    currentDirectoryId = 'default' // 当前目录 ID
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
            // 更新已存在的状态（保持原目录归属）
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
            // 新建状态（使用当前目录）
            stateSnapshot = {
                id: Date.now().toString(),
                directoryId: currentDirectoryId, // 设置目录归属
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

// 静默保存指板状态（用于页面关闭前自动保存，不显示提示）
export function saveFretboardStateSilently({
    data,
    startFret,
    endFret,
    enharmonic,
    displayMode,
    rootNote,
    visibility,
    svgElementRef,
    currentDirectoryId = 'default'
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

        // 检查是否与最新状态相同（避免重复保存）
        if (historyArray.length > 0) {
            const latestState = historyArray[0];
            const currentStateData = JSON.stringify({
                data: JSON.parse(JSON.stringify(data)),
                startFret,
                endFret,
                enharmonic,
                displayMode,
                rootNote,
                visibility
            });
            const latestStateData = JSON.stringify(latestState.state);
            if (currentStateData === latestStateData) {
                // 状态相同，不需要保存
                return;
            }
        }

        // 新建状态
        const stateSnapshot = {
            id: Date.now().toString(),
            directoryId: currentDirectoryId, // 设置目录归属
            timestamp: Date.now(),
            name: new Date().toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }) + ' (自动保存)',
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

        // 限制最大数量（50个）
        if (historyArray.length > 50) {
            historyArray = historyArray.slice(0, 50);
        }

        // 保存到 localStorage
        localStorage.setItem('fretboard-history', JSON.stringify(historyArray));
    } catch (error) {
        console.error('静默保存状态失败:', error);
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

// ===== 目录管理工具函数 =====

// 初始化目录数据
export function initializeDirectories() {
    try {
        const existingDirs = localStorage.getItem('fretboard-directories');
        if (existingDirs) {
            return JSON.parse(existingDirs);
        }

        // 创建默认目录
        const defaultDirectory = {
            id: 'default',
            name: 'default',
            createdAt: Date.now(),
            isDefault: true
        };

        const directories = [defaultDirectory];
        localStorage.setItem('fretboard-directories', JSON.stringify(directories));
        return directories;
    } catch (error) {
        console.error('初始化目录失败:', error);
        return [{
            id: 'default',
            name: 'default',
            createdAt: Date.now(),
            isDefault: true
        }];
    }
}

// 迁移旧版历史数据（为状态添加 directoryId）
export function migrateHistoryData() {
    try {
        const existingHistory = localStorage.getItem('fretboard-history');
        if (!existingHistory) return [];

        const historyArray = JSON.parse(existingHistory);
        let migrated = false;

        const migratedHistory = historyArray.map(item => {
            if (!item.directoryId) {
                migrated = true;
                return { ...item, directoryId: 'default' };
            }
            return item;
        });

        if (migrated) {
            localStorage.setItem('fretboard-history', JSON.stringify(migratedHistory));
        }

        return migratedHistory;
    } catch (error) {
        console.error('迁移历史数据失败:', error);
        return [];
    }
}

// 生成唯一目录名
export function generateUniqueDirName(directories, baseName = 'new') {
    const existingNames = directories.map(dir => dir.name.toLowerCase());

    if (!existingNames.includes(baseName.toLowerCase())) {
        return baseName;
    }

    let counter = 2;
    while (existingNames.includes(`${baseName}${counter}`.toLowerCase())) {
        counter++;
    }

    return `${baseName}${counter}`;
}

// 验证目录名称合法性
export function validateDirectoryName(name, directories, currentDirId = null) {
    const trimmedName = name.trim();

    if (!trimmedName) {
        return { valid: false, message: '目录名称不能为空' };
    }

    // 检查是否与其他目录同名
    const isDuplicate = directories.some(dir =>
        dir.id !== currentDirId && dir.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (isDuplicate) {
        return { valid: false, message: '目录名称已存在' };
    }

    return { valid: true, name: trimmedName };
}

// ===== 导出导入工具函数 =====

// 导出所有数据为 JSON
export function exportAllData() {
    try {
        const directories = JSON.parse(localStorage.getItem('fretboard-directories') || '[]');
        const historyStates = JSON.parse(localStorage.getItem('fretboard-history') || '[]');

        const exportData = {
            version: '1.0',
            exportTime: Date.now(),
            directories: directories.length > 0 ? directories : initializeDirectories(),
            historyStates
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const filename = `fretboard-backup-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.json`;

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        return { success: true, message: '导出成功！' };
    } catch (error) {
        console.error('导出失败:', error);
        return { success: false, message: '导出失败：' + error.message };
    }
}

// 验证导入数据格式
export function validateImportData(data) {
    try {
        if (!data || typeof data !== 'object') {
            return { valid: false, message: '无效的数据格式' };
        }

        if (!data.version || typeof data.version !== 'string') {
            return { valid: false, message: '缺少版本信息' };
        }

        if (!Array.isArray(data.directories)) {
            return { valid: false, message: '目录数据格式错误' };
        }

        if (!Array.isArray(data.historyStates)) {
            return { valid: false, message: '状态数据格式错误' };
        }

        // 验证目录结构
        for (const dir of data.directories) {
            if (!dir.id || !dir.name || typeof dir.createdAt !== 'number' || typeof dir.isDefault !== 'boolean') {
                return { valid: false, message: '目录数据结构不完整' };
            }
        }

        // 验证状态结构
        for (const state of data.historyStates) {
            if (!state.id || !state.directoryId || typeof state.timestamp !== 'number' || !state.name || !state.state) {
                return { valid: false, message: '状态数据结构不完整' };
            }
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, message: '数据验证失败：' + error.message };
    }
}

// 合并目录（处理同名目录）
export function mergeDirectories(localDirs, importDirs) {
    const dirMapping = {}; // { importDirId: localDirId }
    const newDirs = [];
    let mergeCount = 0;

    for (const importDir of importDirs) {
        const trimmedName = importDir.name.trim();
        const existingDir = localDirs.find(d => d.name.trim().toLowerCase() === trimmedName.toLowerCase());

        if (existingDir) {
            // 合并到现有目录
            dirMapping[importDir.id] = existingDir.id;
            mergeCount++;
        } else {
            // 创建新目录
            const newDir = { ...importDir };
            dirMapping[importDir.id] = importDir.id;
            newDirs.push(newDir);
        }
    }

    return { dirMapping, newDirs, mergeCount };
}

// 解决状态 ID 冲突
export function resolveStateConflicts(localStates, importStates, dirMapping) {
    const localIds = new Set(localStates.map(s => s.id));
    const resolvedStates = [];

    for (const importState of importStates) {
        let stateId = importState.id;

        // 处理 ID 冲突
        if (localIds.has(stateId)) {
            stateId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        // 更新目录归属
        const newDirectoryId = dirMapping[importState.directoryId] || 'default';

        resolvedStates.push({
            ...importState,
            id: stateId,
            directoryId: newDirectoryId
        });

        localIds.add(stateId);
    }

    return resolvedStates;
}

// 批量导入 JSON 数据
export function importBatchData(jsonData) {
    try {
        // 验证数据
        const validation = validateImportData(jsonData);
        if (!validation.valid) {
            return { success: false, message: validation.message };
        }

        // 读取本地数据
        const localDirs = JSON.parse(localStorage.getItem('fretboard-directories') || '[]');
        const localStates = JSON.parse(localStorage.getItem('fretboard-history') || '[]');

        // 确保有默认目录
        const directories = localDirs.length > 0 ? localDirs : initializeDirectories();

        // 合并目录
        const { dirMapping, newDirs, mergeCount } = mergeDirectories(directories, jsonData.directories);
        const updatedDirs = [...directories, ...newDirs];

        // 解决状态冲突
        const resolvedStates = resolveStateConflicts(localStates, jsonData.historyStates, dirMapping);
        const updatedStates = [...localStates, ...resolvedStates];

        // 保存到 localStorage
        localStorage.setItem('fretboard-directories', JSON.stringify(updatedDirs));
        localStorage.setItem('fretboard-history', JSON.stringify(updatedStates));

        const newDirCount = newDirs.length;
        const stateCount = resolvedStates.length;
        const message = `成功导入 ${newDirCount + mergeCount} 个目录（其中 ${mergeCount} 个合并）和 ${stateCount} 个状态`;

        return {
            success: true,
            message,
            directories: updatedDirs,
            historyStates: updatedStates
        };
    } catch (error) {
        console.error('批量导入失败:', error);
        return { success: false, message: '导入失败：' + error.message };
    }
}
