import React, { useEffect, useRef, useState } from "react";
import { ChordChartView } from "./ChordChartView";
import { fetchShared, subscribeShare } from "../utils/shareModel";

// 分享链接落地页（#/share/<id> 短链 | #/share?c=<分享码> 内嵌链）：拉谱子 → 以只读查看态渲染。
// 不需要登录；谱子不进本机曲库，点「保存到我的曲库」才入库。
// 实时短链（作者开了开关）：订阅服务端推送，作者一保存就自动跟进最新版本——
// 500ms 去抖合并（作者连续编辑不刷屏），内容签名（rev|live）没变不重渲染，顶部轻提示 2 秒消失。
export function SharedChartPage({ shareId, code }) {
	const [state, setState] = useState({ loading: true, error: null, song: null, clips: [], live: false, rev: 0 });
	const [updated, setUpdated] = useState(false);
	const sigRef = useRef(""); // 上次内容签名：重拉结果没变就不动 DOM

	useEffect(() => {
		let alive = true;
		let unsub = () => {};
		let pending = null; // 重拉去抖
		let hint = null; // 轻提示自动消失
		const apply = (r, { silent } = {}) => {
			if (!alive) return;
			const sig = `${r.rev}|${r.live ? 1 : 0}`;
			if (!silent && sig === sigRef.current) return;
			sigRef.current = sig;
			setState({ loading: false, error: null, song: r.song, clips: r.clips || [], live: r.live, rev: r.rev });
			if (!silent) {
				setUpdated(true);
				clearTimeout(hint);
				hint = setTimeout(() => { if (alive) setUpdated(false); }, 2000);
			}
		};
		fetchShared({ id: shareId, code })
			.then(r => {
				apply(r, { silent: true }); // 首次加载不算"更新"
				// 订阅保持整个页面生命周期（不因快照态退订）：作者关掉实时后再重开，
				// 已打开的查看端要靠这条连接收到通知重新跟上；撤销分享时服务端会主动断开。
				if (shareId) {
					unsub = subscribeShare(shareId, () => {
						if (!alive) return;
						clearTimeout(pending);
						pending = setTimeout(() => {
							fetchShared({ id: shareId }).then(nr => apply(nr)).catch(() => { /* 拉失败：等下一次推送再试 */ });
						}, 500);
					});
				}
			})
			.catch(e => { if (alive) setState({ loading: false, error: e?.message || String(e), song: null, clips: [], live: false, rev: 0 }); });
		return () => { alive = false; clearTimeout(pending); clearTimeout(hint); unsub(); };
	}, [shareId, code]);

	if (state.loading) return <div className="cc-share-state">正在打开分享的谱子…</div>;
	if (state.error) return <div className="cc-share-state cc-share-error">打不开这个分享：{state.error}</div>;
	return (
		<div className="cc-share-wrap">
			{updated ? <div className="cc-share-updated">↻ 已更新到最新版本</div> : null}
			<ChordChartView key={"shared-" + (shareId || "c")} sharedSong={state.song} sharedClips={state.clips} />
		</div>
	);
}
