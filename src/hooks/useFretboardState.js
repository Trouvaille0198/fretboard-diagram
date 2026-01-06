import { useState, useEffect, useRef } from 'react';
import { CONSTS } from '../constants';
import { LEVEL1_COLORS } from '../colorConfig';

export function useFretboardState() {
    const [selected, setSelected] = useState(null);
    // 默认选中第一层第一个颜色（trans）
    const firstLevel1Color = Object.keys(LEVEL1_COLORS)[0];
    const [selectedColorLevel, setSelectedColorLevel] = useState(1); // 1 | 2 | null
    const [selectedColor, setSelectedColor] = useState(firstLevel1Color); // 当前选中的调色盘颜色名称
    const [hoveredNoteId, setHoveredNoteId] = useState(null); // 当前hover的note ID（用于x键删除）
    const [hoveredConnectionId, setHoveredConnectionId] = useState(null); // 当前hover的连线ID（用于backspace删除）
    const [visibility, setVisibility] = useState('transparent');
    const [startFret, setStartFret] = useState(0);
    const [endFret, setEndFret] = useState(15);
    const [enharmonic, setEnharmonic] = useState(1); // 默认降号
    const [displayMode, setDisplayMode] = useState('note'); // 默认音名模式
    const [rootNote, setRootNote] = useState(null); // 默认不选中任何琴键
    const [data, setData] = useState({});
    const [errorMessage, setErrorMessage] = useState('');
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('info');
    const [historyStates, setHistoryStates] = useState([]);
    const [selectedHistoryState, setSelectedHistoryState] = useState(null); // 当前选中的历史状态
    const [currentDateTime, setCurrentDateTime] = useState('');

    const dataRef = useRef(data); // 存储最新的 data 状态，避免闭包问题
    const selectedTimeoutRef = useRef(null);

    // 同步 dataRef
    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    // 从 localStorage 恢复当前状态（页面刷新时）- 必须在初始化之前
    useEffect(() => {
        try {
            const savedState = localStorage.getItem('fretboard-current-state');
            if (savedState) {
                const state = JSON.parse(savedState);
                if (state.data) setData(state.data);
                if (typeof state.startFret === 'number') setStartFret(state.startFret);
                if (typeof state.endFret === 'number') setEndFret(state.endFret);
                if (typeof state.enharmonic === 'number') setEnharmonic(state.enharmonic);
                if (state.displayMode) setDisplayMode(state.displayMode);
                if (state.rootNote !== undefined) setRootNote(state.rootNote);
                if (state.visibility) setVisibility(state.visibility);
            } else {
                // 如果没有保存的状态，才初始化endFret
                const initialEndFret = Math.min(
                    Math.floor((window.innerWidth - 2 * CONSTS.offsetX) / CONSTS.fretWidth),
                    15
                );
                setEndFret(initialEndFret);
            }
        } catch (error) {
            console.error('恢复当前状态失败:', error);
            // 如果恢复失败，初始化endFret
            const initialEndFret = Math.min(
                Math.floor((window.innerWidth - 2 * CONSTS.offsetX) / CONSTS.fretWidth),
                15
            );
            setEndFret(initialEndFret);
        }
    }, []);

    // 更新当前日期时间
    useEffect(() => {
        const updateDateTime = () => {
            const now = new Date();
            const year = String(now.getFullYear()).slice(-2);
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            setCurrentDateTime(`${year}-${month}-${day} ${hours}:${minutes}:${seconds}`);
        };

        updateDateTime();
        const interval = setInterval(updateDateTime, 1000);

        return () => clearInterval(interval);
    }, []);

    // 从 localStorage 加载历史状态
    useEffect(() => {
        try {
            const existingHistory = localStorage.getItem('fretboard-history');
            if (existingHistory) {
                const historyArray = JSON.parse(existingHistory);
                setHistoryStates(historyArray);

                // 尝试匹配当前状态到历史记录中的某一项
                const savedState = localStorage.getItem('fretboard-current-state');
                if (savedState && historyArray.length > 0) {
                    const currentState = JSON.parse(savedState);
                    // 查找最近保存的状态（默认是数组第一项）
                    const latestHistoryState = historyArray[0];

                    // 比较当前状态和最新历史状态是否一致
                    const currentStateStr = JSON.stringify({
                        data: currentState.data || {},
                        startFret: currentState.startFret,
                        endFret: currentState.endFret,
                        enharmonic: currentState.enharmonic,
                        displayMode: currentState.displayMode,
                        rootNote: currentState.rootNote,
                        visibility: currentState.visibility
                    });
                    const historyStateStr = JSON.stringify(latestHistoryState.state);

                    if (currentStateStr === historyStateStr) {
                        // 状态一致，自动选中这个历史状态
                        setSelectedHistoryState(latestHistoryState);
                    }
                }
            }
        } catch (error) {
            console.error('加载历史状态失败:', error);
        }
    }, []);

    // 自动保存当前状态到 localStorage（状态变化时）
    // 使用 useRef 来避免初始化时立即保存
    const isInitialMount = useRef(true);
    useEffect(() => {
        // 跳过首次渲染（此时状态可能还在恢复中）
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }

        try {
            const currentState = {
                data,
                startFret,
                endFret,
                enharmonic,
                displayMode,
                rootNote,
                visibility
            };
            localStorage.setItem('fretboard-current-state', JSON.stringify(currentState));
        } catch (error) {
            console.error('保存当前状态失败:', error);
        }
    }, [data, startFret, endFret, enharmonic, displayMode, rootNote, visibility]);

    return {
        selected,
        setSelected,
        selectedColorLevel,
        setSelectedColorLevel,
        selectedColor,
        setSelectedColor,
        hoveredNoteId,
        setHoveredNoteId,
        hoveredConnectionId,
        setHoveredConnectionId,
        visibility,
        setVisibility,
        startFret,
        setStartFret,
        endFret,
        setEndFret,
        enharmonic,
        setEnharmonic,
        displayMode,
        setDisplayMode,
        rootNote,
        setRootNote,
        data,
        setData,
        errorMessage,
        setErrorMessage,
        toastMessage,
        setToastMessage,
        toastType,
        setToastType,
        historyStates,
        setHistoryStates,
        selectedHistoryState,
        setSelectedHistoryState,
        currentDateTime,
        dataRef,
        selectedTimeoutRef
    };
}
