import { useState, useEffect } from 'react';

export function useAltKey() {
    const [isAltPressed, setIsAltPressed] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Alt' || event.altKey) {
                setIsAltPressed(true);
            }
        };

        const handleKeyUp = (event) => {
            if (event.key === 'Alt' || !event.altKey) {
                setIsAltPressed(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    return isAltPressed;
}
