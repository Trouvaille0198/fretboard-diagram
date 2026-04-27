import React, { createContext, useContext, useState } from "react";
import { zh } from "./zh";
import { en } from "./en";

const translations = { zh, en };

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
    const [lang, setLang] = useState(
        () => localStorage.getItem("fretboard-lang") || "zh",
    );

    const toggleLang = () => {
        setLang((prev) => {
            const next = prev === "zh" ? "en" : "zh";
            localStorage.setItem("fretboard-lang", next);
            return next;
        });
    };

    const t = translations[lang];

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
