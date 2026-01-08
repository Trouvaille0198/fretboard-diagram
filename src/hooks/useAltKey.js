import { useState, useEffect } from 'react';

export function useAltKey() {
    const [isAltPressed, setIsAltPressed] = useState(false);
    const [audioMode, setAudioMode] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Alt' || event.altKey) {
                setIsAltPressed(true);
                setAudioMode(true);
            }
        };

        const handleKeyUp = (event) => {
            if (event.key === 'Alt' || !event.altKey) {
                setIsAltPressed(false);
                setAudioMode(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    return { isAltPressed, audioMode };
}
