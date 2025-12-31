import { useState, useEffect, useRef } from 'react';
import { CONSTS } from '../constants';

export function useFretboardState() {
    const [selected, setSelected] = useState(null);
    const [selectedColorLevel, setSelectedColorLevel] = useState(null); // 1 | 2 | null
    const [selectedColor, setSelectedColor] = useState(null); // 当前选中的调色盘颜色名称
    const [hoveredNoteId, setHoveredNoteId] = useState(null); // 当前hover的note ID（用于x键删除）
    const [visibility, setVisibility] = useState('transparent');
    const [startFret, setStartFret] = useState(0);
    const [endFret, setEndFret] = useState(15);
    const [enharmonic, setEnharmonic] = useState(1); // 默认降号
    const [displayMode, setDisplayMode] = useState('note'); // 默认音名模式
    const [rootNote, setRootNote] = useState(null); // 默认不选中任何琴键
    const [data, setData] = useState({});
    const [errorMessage, setErrorMessage] = useState('');
    const [currentDateTime, setCurrentDateTime] = useState('');

    const dataRef = useRef(data); // 存储最新的 data 状态，避免闭包问题
    const selectedTimeoutRef = useRef(null);

    // 同步 dataRef
    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    // 初始化endFret
    useEffect(() => {
        const initialEndFret = Math.min(
            Math.floor((window.innerWidth - 2 * CONSTS.offsetX) / CONSTS.fretWidth),
            15
        );
        setEndFret(initialEndFret);
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

    return {
        selected,
        setSelected,
        selectedColorLevel,
        setSelectedColorLevel,
        selectedColor,
        setSelectedColor,
        hoveredNoteId,
        setHoveredNoteId,
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
        currentDateTime,
        dataRef,
        selectedTimeoutRef
    };
}
