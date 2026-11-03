// 谱子分享链接：生成一个链接，别人打开就能看（查看不需要登录）。
// 两种形态，自动选择：
//   · 短链 #/share/<id>：登录用户把谱子快照存到自己的同步服务，id 公开可读。链接永远短，微信/QQ 里不怕截断；
//     同一谱子再分享 = 刷新同一条链接的内容。
//   · 内嵌链 #/share?c=<分享码>：游客 / 服务不可达时的兜底——数据压在 URL 里，零后端，长度随谱子大小。
import { authUser, api } from "./authModel.js";
import { packChart, chartShareCode, unpackChartBundle } from "./chartPack.js";

const baseUrl = () => `${location.origin}${location.pathname}`;

// 返回 { url, kind: 'short' | 'embedded' }
export async function createShareLink(song) {
	if (authUser()) {
		try {
			const d = await api("POST", "/share", { chartId: song.id, data: packChart(song) });
			if (d && d.id) return { url: `${baseUrl()}#/share/${d.id}`, kind: "short" };
		} catch (e) { /* 未登录态过期 / 服务不可达 / 旧版服务没有该接口：退化为内嵌链 */ }
	}
	return { url: `${baseUrl()}#/share?c=${chartShareCode(song)}`, kind: "embedded" };
}

// 按链接参数取谱子：{ id } 短链 | { code } 内嵌链 → { song, clips }（clips = 随包内嵌的动图，保存到曲库时落回本机）
export async function fetchShared({ id, code }) {
	if (code) return unpackChartBundle(code);
	if (!id) throw new Error("链接不完整");
	const res = await fetch(`/api/share/${encodeURIComponent(id)}`); // 公开接口，不带 token
	if (res.status === 404) throw new Error("这个分享不存在或已被撤销");
	if (!res.ok) throw new Error(`读取失败（${res.status}）`);
	const d = await res.json();
	return unpackChartBundle(d.data);
}
