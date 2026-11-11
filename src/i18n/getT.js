import { zh } from "./zh.js";
import { en } from "./en.js";

function withFallback(base, over) {
	if (!over || typeof over !== "object" || Array.isArray(over)) return over ?? base;
	if (!base || typeof base !== "object" || Array.isArray(base)) return over;
	const out = { ...base };
	for (const k of Object.keys(over)) {
		out[k] = withFallback(base[k], over[k]);
	}
	return out;
}

const translations = {
	zh,
	en: withFallback(zh, en),
};

export function getLang() {
	if (typeof localStorage === "undefined") return "zh";
	try {
		return localStorage.getItem("fretboard-lang") || "zh";
	} catch {
		return "zh";
	}
}

export function getT(lang = getLang()) {
	return translations[lang] ?? translations.zh;
}

export function fmt(tpl, vars) {
	if (typeof tpl !== "string" || !vars) return tpl ?? "";
	let out = tpl;
	for (const [k, v] of Object.entries(vars)) {
		out = out.replaceAll(`{${k}}`, String(v ?? ""));
	}
	return out;
}

export { zh, en, translations };
