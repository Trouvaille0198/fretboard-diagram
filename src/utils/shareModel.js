// 谱子分享链接：生成一个链接，别人打开就能看（查看不需要登录）。
// 两种形态，自动选择：
//   · 短链 #/share/<id>：登录用户把谱子快照存到自己的同步服务，id 公开可读。链接永远短，微信/QQ 里不怕截断；
//     同一谱子再分享 = 刷新同一条链接的内容。
//   · 内嵌链 #/share?c=<分享码>：游客 / 服务不可达时的兜底——数据压在 URL 里，零后端，长度随谱子大小。
// 短链可选「实时」模式（opts.live）：链接内容跟随作者云端最新版本，作者每次保存，正在看的查看端
// 经 SSE 自动跟进；作者删谱后回退到最后直播过的版本。内嵌链永远冻结（数据在 URL 里，无后端可跟）。
import { authUser, api } from "./authModel.js";
import { packChart, chartShareCode, unpackChartBundle } from "./chartPack.js";
import { getT, fmt } from "../i18n/getT.js";

const baseUrl = () => `${location.origin}${location.pathname}`;

// 返回 { url, kind: 'short' | 'embedded', live }
// live 不传 = 不动这条链接现有的模式（服务端回传当前值，弹窗开关据此如实显示）
export async function createShareLink(song, { live } = {}) {
	if (authUser()) {
		try {
			const body = { chartId: song.id, data: packChart(song) };
			if (live != null) body.live = live ? 1 : 0;
			const d = await api("POST", "/share", body);
			if (d && d.id) return { url: `${baseUrl()}#/share/${d.id}`, kind: "short", live: !!(d.live ?? live) };
		} catch (e) { /* 未登录态过期 / 服务不可达 / 旧版服务没有该接口：退化为内嵌链 */ }
	}
	return { url: `${baseUrl()}#/share?c=${chartShareCode(song)}`, kind: "embedded", live: false };
}

// 按链接参数取谱子：{ id } 短链 | { code } 内嵌链
// → { song, clips, live, rev }（clips = 随包内嵌的动图，保存到曲库时落回本机；live/rev 仅实时短链有）
export async function fetchShared({ id, code }) {
	const s = getT().share;
	if (code) return { ...(await unpackChartBundle(code)), live: false, rev: 0 };
	if (!id) throw new Error(s.incompleteLink);
	const res = await fetch(`/api/share/${encodeURIComponent(id)}`); // 公开接口，不带 token
	if (res.status === 404) throw new Error(s.notFound);
	if (!res.ok) throw new Error(fmt(s.loadFailed, { status: res.status }));
	const d = await res.json();
	const { song, clips } = await unpackChartBundle(d.data);
	return { song, clips, live: !!d.live, rev: Number(d.rev) || 0 };
}

// 实时短链订阅：作者的活谱子一变（保存/再分享/切开关/删谱）就回调，调用方重拉即可。
// 失败静默（EventSource 自动重连）；撤销后服务端 404，浏览器会停止重连。返回关闭函数。
export function subscribeShare(id, onChange) {
	if (!id || typeof EventSource === "undefined") return () => {};
	const es = new EventSource(`/api/share/${encodeURIComponent(id)}/events`);
	es.addEventListener("changed", () => { try { onChange(); } catch (e) { /* 订阅方兜 */ } });
	return () => { try { es.close(); } catch (e) { /* 已关 */ } };
}
