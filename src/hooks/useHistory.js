import { useRef, useEffect, useCallback } from 'react';

export function useHistory(stateSnapshot, applySnapshot) {
    const historyRef = useRef([]); // 历史记录数组
    const historyIndexRef = useRef(-1); // 当前历史记录索引
    const isUndoingRef = useRef(false); // 是否正在执行撤销操作
    const isRedoingRef = useRef(false); // 是否正在执行重做操作
    const isBatchingRef = useRef(false); // 是否正在批量更新
    const pendingBatchSnapshotRef = useRef(null); // 批量更新期间的最终快照
    const prevStateRef = useRef(JSON.stringify(stateSnapshot));

    // 保存历史记录
    const saveToHistory = useCallback((nextSnapshot) => {
        if (isUndoingRef.current || isRedoingRef.current) {
            // 如果正在执行撤销或重做操作，不保存历史
            return;
        }

        const snapshotStr = JSON.stringify(nextSnapshot);
        const currentHistory = historyRef.current;
        const currentIndex = historyIndexRef.current;

        // 如果当前不在历史记录的末尾，删除后面的记录（分支历史）
        const newHistory = currentHistory.slice(0, currentIndex + 1);
        // 添加新的历史记录
        newHistory.push(snapshotStr);
        // 限制历史记录数量（最多50条）
        if (newHistory.length > 50) {
            newHistory.shift();
            historyIndexRef.current = 49;
        } else {
            historyIndexRef.current = newHistory.length - 1;
        }
        historyRef.current = newHistory;
    }, []);

    // 撤销操作
    const undo = useCallback(() => {
        const currentHistory = historyRef.current;
        const currentIndex = historyIndexRef.current;

        if (currentIndex > 0) {
            isUndoingRef.current = true;
            const prevIndex = currentIndex - 1;
            const prevDataStr = currentHistory[prevIndex];
            if (prevDataStr) {
                try {
                    const prevSnapshot = JSON.parse(prevDataStr);
                    applySnapshot(prevSnapshot);
                    historyIndexRef.current = prevIndex;
                } catch (e) {
                    console.error('撤销失败：无法解析历史记录', e);
                }
            }
            // 使用 setTimeout 确保 setData 完成后再重置标志
            setTimeout(() => {
                isUndoingRef.current = false;
            }, 0);
        }
    }, [applySnapshot]);

    // 重做操作
    const redo = useCallback(() => {
        const currentHistory = historyRef.current;
        const currentIndex = historyIndexRef.current;

        if (currentIndex < currentHistory.length - 1) {
            isRedoingRef.current = true;
            const nextIndex = currentIndex + 1;
            const nextDataStr = currentHistory[nextIndex];
            if (nextDataStr) {
                try {
                    const nextSnapshot = JSON.parse(nextDataStr);
                    applySnapshot(nextSnapshot);
                    historyIndexRef.current = nextIndex;
                } catch (e) {
                    console.error('重做失败：无法解析历史记录', e);
                }
            }
            // 使用 setTimeout 确保 setData 完成后再重置标志
            setTimeout(() => {
                isRedoingRef.current = false;
            }, 0);
        }
    }, [applySnapshot]);

    const beginBatch = useCallback(() => {
        if (isUndoingRef.current || isRedoingRef.current) {
            return;
        }

        isBatchingRef.current = true;
        pendingBatchSnapshotRef.current = null;
    }, []);

    const endBatch = useCallback(() => {
        if (!isBatchingRef.current) {
            return;
        }

        isBatchingRef.current = false;

        const pendingSnapshot = pendingBatchSnapshotRef.current;
        pendingBatchSnapshotRef.current = null;

        if (!pendingSnapshot) {
            return;
        }

        const pendingSnapshotStr = JSON.stringify(pendingSnapshot);
        if (pendingSnapshotStr === prevStateRef.current) {
            return;
        }

        saveToHistory(pendingSnapshot);
        prevStateRef.current = pendingSnapshotStr;
    }, [saveToHistory]);

    // 监听快照变化，保存历史记录
    useEffect(() => {
        const currentSnapshotStr = JSON.stringify(stateSnapshot);
        if (currentSnapshotStr !== prevStateRef.current && !isUndoingRef.current && !isRedoingRef.current) {
            if (isBatchingRef.current) {
                pendingBatchSnapshotRef.current = stateSnapshot;
                return;
            }

            saveToHistory(stateSnapshot);
            prevStateRef.current = currentSnapshotStr;
        }
    }, [stateSnapshot, saveToHistory]);

    // 初始化历史记录
    useEffect(() => {
        if (historyRef.current.length === 0) {
            const initialSnapshotStr = JSON.stringify(stateSnapshot);
            historyRef.current = [initialSnapshotStr];
            historyIndexRef.current = 0;
            prevStateRef.current = initialSnapshotStr;
        }
    }, [stateSnapshot]);

    return {
        undo,
        redo,
        beginBatch,
        endBatch
    };
}
