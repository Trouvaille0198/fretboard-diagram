import { useState, useEffect, useRef } from 'react';
import { CONSTS } from '../constants';
import { LEVEL1_COLORS } from '../colorConfig';
import { initializeDirectories, migrateHistoryData, generateUniqueDirName, validateDirectoryName } from '../utils/fretboardHistory';
import { storageService } from '../services/storageService';

export function useFretboardState() {
    const [selected, setSelected] = useState(null);
    // 默认选中第一层第一个颜色（trans）
    const firstLevel1Color = Object.keys(LEVEL1_COLORS)[0];
    const [selectedColorLevel, setSelectedColorLevel] = useState(1); // 1 | 2 | null
    const [selectedColor, setSelectedColor] = useState(firstLevel1Color); // 当前选中的调色盘颜色名称
    const [hoveredNoteId, setHoveredNoteId] = useState(null); // 当前hover的note ID（用于x键删除）
    const [hoveredConnectionId, setHoveredConnectionId] = useState(null); // 当前hover的连线ID（用于backspace删除）

    // 从 localStorage 初始化状态
    const getInitialState = () => {
        try {
            const savedState = localStorage.getItem('fretboard-current-state');
            if (savedState) {
                return JSON.parse(savedState);
            }
        } catch (error) {
            console.error('读取保存状态失败:', error);
        }
        return null;
    };

    const initialState = getInitialState();

    const [visibility, setVisibility] = useState(initialState?.visibility || 'transparent');
    const [startFret, setStartFret] = useState(initialState?.startFret ?? 0);
    const [endFret, setEndFret] = useState(() => {
        if (initialState && typeof initialState.endFret === 'number') {
            return initialState.endFret;
        }
        return Math.min(
            Math.floor((window.innerWidth - 2 * CONSTS.offsetX) / CONSTS.fretWidth),
            15
        );
    });
    const [enharmonic, setEnharmonic] = useState(initialState?.enharmonic ?? 1);
    const [displayMode, setDisplayMode] = useState(initialState?.displayMode || 'note');
    const [rootNote, setRootNote] = useState(initialState?.rootNote ?? null);
    const [data, setData] = useState(initialState?.data || {});
    const [errorMessage, setErrorMessage] = useState('');
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('info');
    const [historyStates, setHistoryStates] = useState([]);
    const [selectedHistoryState, setSelectedHistoryState] = useState(null); // 当前选中的历史状态
    const [currentDateTime, setCurrentDateTime] = useState('');

    // 目录管理状态
    const [directories, setDirectories] = useState([]);
    const [currentDirectoryId, setCurrentDirectoryId] = useState('default');

    const dataRef = useRef(data); // 存储最新的 data 状态，避免闭包问题
    const selectedTimeoutRef = useRef(null);

    // 同步 dataRef
    useEffect(() => {
        dataRef.current = data;
    }, [data]);

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

    // 初始化目录
    // 注意：完全不加载历史数据，由父组件根据登录状态决定
    useEffect(() => {
        try {
            // 只初始化目录（如果为空）
            if (directories.length === 0) {
                const dirs = initializeDirectories();
                setDirectories(dirs);
            }
        } catch (error) {
            console.error('初始化失败:', error);
        }
    }, []);

    // 自动保存当前状态到 localStorage（状态变化时）
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
        selectedTimeoutRef,
        // 目录管理
        directories,
        setDirectories,
        currentDirectoryId,
        setCurrentDirectoryId,
        // 目录操作函数
        createDirectory: (baseName = 'new') => {
            const uniqueName = generateUniqueDirName(directories, baseName);
            const newDir = {
                id: Date.now().toString(),
                name: uniqueName,
                createdAt: Date.now(),
                isDefault: false
            };
            const updatedDirs = [...directories, newDir];
            setDirectories(updatedDirs);
            localStorage.setItem('fretboard-directories', JSON.stringify(updatedDirs));
            setCurrentDirectoryId(newDir.id);
            return newDir;
        },
        renameDirectory: (dirId, newName) => {
            const validation = validateDirectoryName(newName, directories, dirId);
            if (!validation.valid) {
                return { success: false, message: validation.message };
            }
            const updatedDirs = directories.map(dir =>
                dir.id === dirId ? { ...dir, name: validation.name } : dir
            );
            setDirectories(updatedDirs);
            localStorage.setItem('fretboard-directories', JSON.stringify(updatedDirs));
            return { success: true, directories: updatedDirs };
        },
        deleteDirectory: (dirId) => {
            const dirToDelete = directories.find(d => d.id === dirId);
            if (!dirToDelete || dirToDelete.isDefault) {
                return { success: false, message: '无法删除默认目录' };
            }

            // 将该目录下的状态迁移到 default
            const updatedStates = historyStates.map(state =>
                state.directoryId === dirId ? { ...state, directoryId: 'default' } : state
            );
            setHistoryStates(updatedStates);
            localStorage.setItem('fretboard-history', JSON.stringify(updatedStates));

            // 删除目录
            const updatedDirs = directories.filter(d => d.id !== dirId);
            setDirectories(updatedDirs);
            localStorage.setItem('fretboard-directories', JSON.stringify(updatedDirs));

            // 切换到 default
            setCurrentDirectoryId('default');
            return { success: true };
        }
    };
}
