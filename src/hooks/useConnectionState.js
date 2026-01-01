import { useState } from 'react';

// 预设配置
export const CONNECTION_PRESETS = {
    preset1: {
        name: '预设1',
        type: 'line',
        arrowDirection: 'none',
        strokeWidth: 3,
        arcCurvature: 0
    },
    preset2: {
        name: '预设2',
        type: 'arc',
        arrowDirection: 'end',
        strokeWidth: 3,
        arcCurvature: 0.7
    }
};

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
    const [connectionType, setConnectionType] = useState('line'); // 'line' | 'arc'，默认直线
    const [connectionArrowDirection, setConnectionArrowDirection] = useState('none'); // 'none' | 'start' | 'end' | 'both'，默认无箭头

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
        connectionType,
        setConnectionType,
        connectionArrowDirection,
        setConnectionArrowDirection
    };
}
