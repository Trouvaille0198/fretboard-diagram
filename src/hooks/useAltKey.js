import { useState, useEffect, useRef } from 'react';

export function useAltKey() {
    const [isAltPressed, setIsAltPressed] = useState(false);
    const [audioMode, setAudioMode] = useState(false);
    const altPressedRef = useRef(false);

    useEffect(() => {
        const handleKeyDown = (event) => {
            // 检查是否是 Alt 键按下
            if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight' || event.altKey) {
                if (!altPressedRef.current) {
                    altPressedRef.current = true;
                    setIsAltPressed(true);
                    setAudioMode(true);
                }
            }
        };

        const handleKeyUp = (event) => {
            // 检查 Alt 键是否被释放
            // 使用多种方式检查以确保兼容性
            const isAltKey = event.key === 'Alt' ||
                event.code === 'AltLeft' ||
                event.code === 'AltRight' ||
                (altPressedRef.current && !event.altKey);

            if (isAltKey && altPressedRef.current) {
                altPressedRef.current = false;
                setIsAltPressed(false);
                setAudioMode(false);
            }
        };

        // 处理窗口失去焦点的情况（用户可能在按住 Alt 键时切换窗口）
        const handleBlur = () => {
            if (altPressedRef.current) {
                altPressedRef.current = false;
                setIsAltPressed(false);
                setAudioMode(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, []);

    return { isAltPressed, audioMode };
}
