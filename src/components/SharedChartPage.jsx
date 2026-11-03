import React, { useEffect, useState } from "react";
import { ChordChartView } from "./ChordChartView";
import { fetchShared } from "../utils/shareModel";

// 分享链接落地页（#/share/<id> 短链 | #/share?c=<分享码> 内嵌链）：拉谱子 → 以只读查看态渲染。
// 不需要登录；谱子不进本机曲库，点「保存到我的曲库」才入库。
export function SharedChartPage({ shareId, code }) {
	const [state, setState] = useState({ loading: true, error: null, song: null, clips: [] });
	useEffect(() => {
		let alive = true;
		setState({ loading: true, error: null, song: null, clips: [] });
		fetchShared({ id: shareId, code })
			.then(({ song, clips }) => { if (alive) setState({ loading: false, error: null, song, clips: clips || [] }); })
			.catch(e => { if (alive) setState({ loading: false, error: e?.message || String(e), song: null, clips: [] }); });
		return () => { alive = false; };
	}, [shareId, code]);

	if (state.loading) return <div className="cc-share-state">正在打开分享的谱子…</div>;
	if (state.error) return <div className="cc-share-state cc-share-error">打不开这个分享：{state.error}</div>;
	return <ChordChartView key={"shared-" + (shareId || "c")} sharedSong={state.song} sharedClips={state.clips} />;
}
