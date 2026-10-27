import React, { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

// 顶部导航（8pu 式）：logo + 三模式文字 tab + 右侧主题/语言，常驻所有页面
// mode: 'normal' | 'dynamic' | 'chords'
export function TopNav({ mode }) {
	const { t, lang, toggleLang } = useLanguage();
	const tr = t?.rail ?? {};
	const [theme, setTheme] = useState(() => localStorage.getItem("fretboard-theme") || "dark");

	useEffect(() => {
		document.documentElement.setAttribute("data-theme", theme);
		localStorage.setItem("fretboard-theme", theme);
	}, [theme]);

	const items = [
		{ id: "normal", label: tr.normal ?? "普通编辑", route: "#/" },
		{ id: "dynamic", label: tr.dynamic ?? "动图", route: "#/dynamic" },
		{ id: "chords", label: tr.chords ?? "和弦谱", route: "#/chords" }
	];

	const go = (item) => {
		if (item.id === mode) return;
		if (item.id === "dynamic" && mode === "normal") {
			// 普通页 → 动图：走 Fretboard 的既有交接（携带当前板面，等价于 Q）
			window.dispatchEvent(new CustomEvent("fretboard:goto-dynamic"));
			return;
		}
		window.location.hash = item.route;
	};

	return (
		<header className="top-nav">
			<button className="top-nav-logo" onClick={() => go(items[0])} title="吉他指板动图工作台">
				<span className="top-nav-logo-icon">🎸</span>
				<span className="top-nav-logo-text">指板工坊</span>
			</button>
			<nav className="top-nav-tabs" aria-label={tr.label ?? "模式切换"}>
				{items.map(it => (
					<button
						key={it.id}
						className={`top-nav-tab ${mode === it.id ? "on" : ""}`}
						onClick={() => go(it)}
						aria-current={mode === it.id ? "page" : undefined}
					>
						{it.label}
					</button>
				))}
			</nav>
			<div className="top-nav-right">
				<span className="top-nav-ver" title="界面版本：刷新后应显示 v65">v65</span>
				<button className="top-nav-icon" onClick={toggleLang} title={lang === "zh" ? "Switch to English" : "切换为中文"}>
					{lang === "zh" ? "En" : "中"}
				</button>
				<button className="top-nav-icon" onClick={() => setTheme(x => (x === "dark" ? "light" : "dark"))}
					title={theme === "dark" ? (tr.toLight ?? "浅色") : (tr.toDark ?? "深色")}>
					{theme === "dark" ? "☀" : "☾"}
				</button>
			</div>
		</header>
	);
}
