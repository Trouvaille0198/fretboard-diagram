import React, { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import { LoginModal } from "./LoginModal";
import { authUser, logout, onAuthChange, mergeLocalToCloud, pullCloud } from "../utils/authModel";
import { loadCharts, persistCharts } from "../utils/chordChartModel";
import { loadClips, persistClips } from "../utils/clipModel";

// 顶部导航（8pu 式）：logo + 三模式文字 tab + 右侧主题/语言，常驻所有页面
// mode: 'normal' | 'dynamic' | 'chords'
export function TopNav({ mode }) {
	const { t, lang, toggleLang } = useLanguage();
	const tr = t?.rail ?? {};
	const [theme, setTheme] = useState(() => localStorage.getItem("fretboard-theme") || "dark");
	const [user, setUser] = useState(() => authUser()?.user ?? null);
	const [loginOpen, setLoginOpen] = useState(false);
	const [cloudFail, setCloudFail] = useState(false);
	const [logoutAsk, setLogoutAsk] = useState(false);

	// 云端同步失败提示（红点）：静默失败曾造成数据事故，必须可见
	useEffect(() => {
		const onErr = () => setCloudFail(true);
		const onOk = () => setCloudFail(false);
		window.addEventListener("fretboard:cloud-error", onErr);
		window.addEventListener("fretboard:cloud-ok", onOk);
		return () => { window.removeEventListener("fretboard:cloud-error", onErr); window.removeEventListener("fretboard:cloud-ok", onOk); };
	}, []);

	// 登录态变化：刷新顶栏用户名；登录成功 → 本机有游客数据则询问是否并入，没有则直接拉云端
	const [mergeAsk, setMergeAsk] = useState(null); // { user } 待询问；null 无
	// 已登录（token 从 localStorage 恢复，不经过 login 动作）时：挂载即静默合并云端——
	// 否则刷新页面会一直显示陈旧的本地列表，用户会以为数据丢了
	useEffect(() => {
		if (!authUser()) return;
		mergeLocalToCloud(loadCharts(), loadClips())
			.then(({ charts, clips }) => {
				persistCharts(charts); persistClips(clips);
				window.dispatchEvent(new CustomEvent("fretboard:charts-synced"));
				window.dispatchEvent(new CustomEvent("fretboard:clips-synced"));
			})
			.catch(() => { /* 服务不可达：保持本地 */ });
	}, []);
	useEffect(() => onAuthChange(() => {
		const au = authUser();
		setUser(au?.user ?? null);
		if (au) {
			const charts = loadCharts();
			const clips = loadClips();
			if (charts.length || clips.length) setMergeAsk({ user: au.user, charts: charts.length, clips: clips.length });
			else pullAndApply();
		}
	}), []);
	const pullAndApply = () => {
		pullCloud()
			.then(({ charts, clips }) => {
				persistCharts(charts); persistClips(clips);
				window.dispatchEvent(new CustomEvent("fretboard:charts-synced"));
				window.dispatchEvent(new CustomEvent("fretboard:clips-synced"));
			})
			.catch(() => { /* 服务端不可达：保持本地，下次登录再处理 */ });
	};
	const doMergeLocal = () => {
		mergeLocalToCloud(loadCharts(), loadClips())
			.then(({ charts, clips }) => {
				persistCharts(charts); persistClips(clips);
				window.dispatchEvent(new CustomEvent("fretboard:charts-synced"));
				window.dispatchEvent(new CustomEvent("fretboard:clips-synced"));
			})
			.catch(() => { /* 同上 */ });
		setMergeAsk(null);
	};
	const doNotMerge = () => {
		// 不合并：本机数据先备份（可找回），再以账号云端为准覆盖本地
		try {
			localStorage.setItem("fretboard-chordcharts-guest-bak", localStorage.getItem("fretboard-chordcharts") || "[]");
			localStorage.setItem("fretboard-clips-guest-bak", localStorage.getItem("fretboard-clips") || "[]");
		} catch (e) { /* 备份失败也继续 */ }
		pullAndApply();
		setMergeAsk(null);
	};

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
				<span className="top-nav-ver" title="界面版本：刷新后应显示 v81">v81</span>
				{user ? (
					<span className="top-nav-user" title={user + (cloudFail ? "（⚠ 云同步失败：改动只存在本机，稍后会自动重试或重新登录）" : "")}>
						{cloudFail ? <span className="top-nav-cloudfail" title="云同步失败：改动只存在本机">⚠</span> : null}
						<span className="top-nav-user-name">{user}</span>
						<button className="top-nav-icon" onClick={() => setLogoutAsk(true)} title="退出登录">⏻</button>
					</span>
				) : (
					<button className="top-nav-icon" onClick={() => setLoginOpen(true)} title="登录 / 注册（数据云端同步）">👤</button>
				)}
				{loginOpen ? (
					<LoginModal onLoggedIn={() => setLoginOpen(false)} onGuest={() => {}} onClose={() => setLoginOpen(false)} />
				) : null}
				{logoutAsk ? (
					<div className="login-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setLogoutAsk(false); }}>
						<div className="login-modal">
							<h2>退出登录？</h2>
							<p className="merge-ask-text">退出后回到游客模式，本机数据保留。</p>
							<div className="merge-ask-btns">
								<button className="btn-primary" onClick={() => { setLogoutAsk(false); logout(); }}>退出</button>
								<button className="merge-ask-no" onClick={() => setLogoutAsk(false)}>取消</button>
							</div>
						</div>
					</div>
				) : null}
				{mergeAsk ? (
					<div className="login-modal-overlay">
						<div className="login-modal">
							<h2>合并本机数据？</h2>
							<p className="merge-ask-text">
								检测到本机游客数据：{mergeAsk.charts ? mergeAsk.charts + " 首曲目" : ""}{mergeAsk.charts && mergeAsk.clips ? " · " : ""}{mergeAsk.clips ? mergeAsk.clips + " 个动图" : ""}。
								合并到账号 <b>{mergeAsk.user}</b> 吗？（同名单条以更新时间新者为准）
							</p>
							<div className="merge-ask-btns">
								<button className="btn-primary" onClick={doMergeLocal}>合并到账号</button>
								<button className="merge-ask-no" onClick={doNotMerge}>不合并（本机数据自动备份）</button>
							</div>
						</div>
					</div>
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
