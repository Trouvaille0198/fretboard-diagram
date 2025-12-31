import { useState } from 'react';

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
        setToolbarDropdownDirection
    };
}
