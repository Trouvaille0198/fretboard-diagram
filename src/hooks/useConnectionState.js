import { useCallback, useEffect, useMemo, useState } from 'react';

// 连线预设：工具栏与连线浮动工具栏共用同一组预设
export const CONNECTION_PRESETS = [
    {
        id: 'line',
        type: 'line',
        arrowDirection: 'none',
        strokeWidth: 3,
        arcCurvature: 0
    },
    {
        id: 'line-arrow',
        type: 'line',
        arrowDirection: 'end',
        strokeWidth: 3,
        arcCurvature: 0
    },
    {
        id: 'arc-arrow',
        type: 'arc',
        arrowDirection: 'end',
        strokeWidth: 3,
        arcCurvature: 0.7
    }
];

export const DEFAULT_CONNECTION_PRESET_ID = 'line';

export function getConnectionPreset(presetId) {
    return CONNECTION_PRESETS.find(preset => preset.id === presetId) || CONNECTION_PRESETS[0];
}

// 找出连线当前对应的预设；自定义样式（如手动调粗、改了弧度、反向箭头）返回 null
export function matchConnectionPreset(connection) {
    if (!connection) return null;
    const type = connection.type || 'line';
    const arrowDirection = connection.arrowDirection || 'none';
    return CONNECTION_PRESETS.find(preset => preset.type === type && preset.arrowDirection === arrowDirection) || null;
}

export function useConnectionState() {
    const [connectionMode, setConnectionMode] = useState(false);
    const [connectionStartNote, setConnectionStartNote] = useState(null);
    const [connectionStartPosition, setConnectionStartPosition] = useState(null);
    const [mousePosition, setMousePosition] = useState(null);
    const [previewHoverNote, setPreviewHoverNote] = useState(null);
    const [useColor2Level, setUseColor2Level] = useState(false); // 全局颜色层级：true表示使用color2，false表示使用color1
    const [selectedConnection, setSelectedConnection] = useState(null);
    const [connectionToolbarVisible, setConnectionToolbarVisible] = useState(false);
    const [connectionToolbarPosition, setConnectionToolbarPosition] = useState({ x: 0, y: 0 });
    const [toolbarDropdown, setToolbarDropdown] = useState(null); // 'type' | 'arrow' | 'width' | 'curvature' | null
    const [toolbarDropdownDirection, setToolbarDropdownDirection] = useState('down'); // 'up' | 'down'
    const [connectionPresetId, setConnectionPresetId] = useState(() => {
        try {
            const saved = localStorage.getItem('fretboard-connection-preset');
            return CONNECTION_PRESETS.some(preset => preset.id === saved) ? saved : DEFAULT_CONNECTION_PRESET_ID;
        } catch (error) {
            return DEFAULT_CONNECTION_PRESET_ID;
        }
    });

    // 预设选择持久化，刷新后保持
    useEffect(() => {
        try {
            localStorage.setItem('fretboard-connection-preset', connectionPresetId);
        } catch (error) {
            console.error('保存连线预设失败:', error);
        }
    }, [connectionPresetId]);

    const connectionPreset = useMemo(() => getConnectionPreset(connectionPresetId), [connectionPresetId]);

    // 点预设即进入连线模式；再点一次当前预设退出（右键、S 键同样可以退出）
    const selectConnectionPreset = useCallback((presetId) => {
        if (connectionMode && connectionPresetId === presetId) {
            setConnectionMode(false);
            setConnectionStartNote(null);
            setConnectionStartPosition(null);
            setMousePosition(null);
            setPreviewHoverNote(null);
            setUseColor2Level(false);
            return;
        }
        setConnectionPresetId(presetId);
        setConnectionMode(true);
    }, [connectionMode, connectionPresetId]);

    return {
        connectionMode,
        setConnectionMode,
        connectionStartNote,
        setConnectionStartNote,
        connectionStartPosition,
        setConnectionStartPosition,
        mousePosition,
        setMousePosition,
        previewHoverNote,
        setPreviewHoverNote,
        useColor2Level,
        setUseColor2Level,
        selectedConnection,
        setSelectedConnection,
        connectionToolbarVisible,
        setConnectionToolbarVisible,
        connectionToolbarPosition,
        setConnectionToolbarPosition,
        toolbarDropdown,
        setToolbarDropdown,
        toolbarDropdownDirection,
        setToolbarDropdownDirection,
        connectionPresetId,
        connectionPreset,
        selectConnectionPreset
    };
}