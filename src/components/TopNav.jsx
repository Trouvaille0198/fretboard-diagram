import React, { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { LoginModal } from "./LoginModal";
import { authUser, logout, onAuthChange, syncChartsFromServer } from "../utils/authModel";
import { loadCharts, persistCharts } from "../utils/chordChartModel";

// 顶部导航（8pu 式）：logo + 三模式文字 tab + 右侧主题/语言，常驻所有页面
// mode: 'normal' | 'dynamic' | 'chords'
export function TopNav({ mode }) {
	const { t, lang, toggleLang } = useLanguage();
	const tr = t?.rail ?? {};
	const [theme, setTheme] = useState(() => localStorage.getItem("fretboard-theme") || "dark");
	const [user, setUser] = useState(() => authUser()?.user ?? null);
	const [loginOpen, setLoginOpen] = useState(false);
	const [cloudFail, setCloudFail] = useState(false);

	// 云端同步失败提示（红点）：静默失败曾造成数据事故，必须可见
	useEffect(() => {
		const onErr = () => setCloudFail(true);
		const onOk = () => setCloudFail(false);
		window.addEventListener("fretboard:cloud-error", onErr);
		window.addEventListener("fretboard:cloud-ok", onOk);
		return () => { window.removeEventListener("fretboard:cloud-error", onErr); window.removeEventListener("fretboard:cloud-ok", onOk); };
	}, []);

	// 登录态变化：刷新顶栏用户名；登录成功时把本地(游客期)曲目并入云端再拉回（updatedAt 新者胜）
	useEffect(() => onAuthChange(() => {
		const au = authUser();
		setUser(au?.user ?? null);
		if (au) {
			syncChartsFromServer(loadCharts())
				.then(merged => { persistCharts(merged); window.dispatchEvent(new CustomEvent("fretboard:charts-synced")); })
				.catch(() => { /* 服务端不可达时保持本地，下次登录再并 */ });
		}
	}), []);

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
				<span className="top-nav-ver" title="界面版本：刷新后应显示 v73">v73</span>
				{user ? (
					<span className="top-nav-user" title={user + (cloudFail ? "（⚠ 云同步失败：改动只存在本机，稍后会自动重试或重新登录）" : "")}>
						{cloudFail ? <span className="top-nav-cloudfail" title="云同步失败：改动只存在本机">⚠</span> : null}
						<span className="top-nav-user-name">{user}</span>
						<button className="top-nav-icon" onClick={() => { logout(); }} title="退出登录（回到游客，本地数据保留）">⎋</button>
					</span>
				) : (
					<button className="top-nav-icon" onClick={() => setLoginOpen(true)} title="登录 / 注册（数据云端同步）">👤</button>
				)}
				{loginOpen ? (
					<LoginModal onLoggedIn={() => setLoginOpen(false)} onGuest={() => {}} onClose={() => setLoginOpen(false)} />
				) : null}
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
