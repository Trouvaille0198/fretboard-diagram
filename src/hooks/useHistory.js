import { useRef, useEffect, useCallback } from 'react';

export function useHistory(data, setData) {
    const historyRef = useRef([]); // 历史记录数组
    const historyIndexRef = useRef(-1); // 当前历史记录索引
    const isUndoingRef = useRef(false); // 是否正在执行撤销操作
    const prevDataRef = useRef(JSON.stringify(data));

    // 保存历史记录
    const saveToHistory = useCallback((newData) => {
        if (isUndoingRef.current) {
            // 如果正在执行撤销操作，不保存历史
            return;
        }

        const dataStr = JSON.stringify(newData);
        const currentHistory = historyRef.current;
        const currentIndex = historyIndexRef.current;

        // 如果当前不在历史记录的末尾，删除后面的记录（分支历史）
        const newHistory = currentHistory.slice(0, currentIndex + 1);
        // 添加新的历史记录
        newHistory.push(dataStr);
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
                    const prevData = JSON.parse(prevDataStr);
                    setData(prevData);
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
    }, [setData]);

    // 监听 data 变化，保存历史记录
    useEffect(() => {
        const currentDataStr = JSON.stringify(data);
        if (currentDataStr !== prevDataRef.current && !isUndoingRef.current) {
            saveToHistory(data);
            prevDataRef.current = currentDataStr;
        }
    }, [data, saveToHistory]);

    // 初始化历史记录
    useEffect(() => {
        if (historyRef.current.length === 0) {
            const initialDataStr = JSON.stringify(data);
            historyRef.current = [initialDataStr];
            historyIndexRef.current = 0;
            prevDataRef.current = initialDataStr;
        }
    }, []);

    return {
        undo
    };
}
