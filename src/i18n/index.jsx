import React, { createContext, useContext, useState } from "react";
import { getLang, getT, fmt, zh, en } from "./getT.js";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
    const [lang, setLang] = useState(getLang);

    const toggleLang = () => {
        setLang((prev) => {
            const next = prev === "zh" ? "en" : "zh";
            try {
                localStorage.setItem("fretboard-lang", next);
            } catch { /* ignore storage errors */ }
            return next;
        });
    };

    const t = getT(lang);

    return (
        <LanguageContext.Provider value={{ lang, toggleLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const ctx = useContext(LanguageContext);
    if (!ctx)
        throw new Error("useLanguage must be used inside LanguageProvider");
    return ctx;
}

export { getT, fmt, zh, en };
