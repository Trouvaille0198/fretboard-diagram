// 时间轴展开 v2 —— 事件模型
// 每一步只有两个数：enter=变成这一步的动画时长（fx 时长），dur=这一步的停留时长。
// 播放：mount 步 → 播 enter 动画 → 等 enter+dur → 下一步。
// 传输格式（兼容导出引擎 buildPlan）：state.holdMs=dur_i；前一步的 state.transMs=enter_{i+1}。

import { frameTintFromData, tintAt } from "../colorConfig.js";

// 技法进入动画时长（轨迹要看得清）
const ENTER = { sl: 450, rt: 800, pre: 450, plain: 200, snap: 0 };
// 击勾三拍（预备/锤/勾回）各自的 enter 与 dur
const HP_BEATS = [
	{ enter: 60, dur: 60 },    // A 预备响
	{ enter: 100, dur: 90 },   // B 锤击闪现
	{ enter: 100, dur: null }  // A 勾回驻留（补足本帧总时长）
];

function sameBoard(a, b) {
	const actOf = d => new Set(Object.entries(d || {}).filter(([, n]) => n && (n.visibility === "visible" || n.visibility === "selected")).map(([id]) => id));
	const sa = actOf(a.data), sb = actOf(b.data);
	return sa.size === sb.size && [...sa].every(id => sb.has(id));
}

// 技法子拍的"当帧档色"：优先本帧出生（birth===i）音符的真实色（=当帧新增音），否则按帧位置公式
function beatTint(frame, i, frames) {
	const born = Object.values(frame.data || {}).find(n => n && typeof n === "object" && n.birth === i && n.color && typeof n.color === "object" && n.color.custom);
	if (born) return { name: born.color.name, custom: born.color.custom };
	const any = Object.values(frame.data || {}).find(n => n && typeof n === "object" && n.color && typeof n.color === "object" && n.color.name);
	if (!any) return null;
	return { name: any.color.name, custom: tintAt(any.color.name, frames.length > 1 ? i / (frames.length - 1) : 0) };
}

export function expandTimeline(frames, transitions, holdMs, transMs) {
	const H = holdMs > 0 ? holdMs : 300;
	const T = transMs > 0 ? transMs : 200;
	const states = [];
	const specs = []; // specs[i] = states[i-1]→states[i] 的过渡（pairs 进 fx）
	const frameOf = [];
	const sub = []; // 是否技法子拍（缩略图高亮跟随帧号即可，此数组仅保留兼容）

	// ① 生成步骤序列 {data-state, enter, dur}
	const steps = [];
	frames.forEach((frame, i) => {
		const inc = i > 0 ? (transitions[i - 1] || { pairs: [] }) : null;
		const pairs = (inc && inc.pairs) || [];
		const hpPairs = pairs.filter(p => p.technique === "hp");
		const otherPairs = pairs.filter(p => p.technique !== "hp");
		const pres = frame.preSlides || [];

		// 进入本帧第一步的动画时长
		let enter = T;
		if (i === 0) enter = ENTER.snap;
		else if (otherPairs.some(p => p.technique === "rt")) enter = ENTER.rt;
		else if (otherPairs.some(p => p.technique === "sl")) enter = ENTER.sl;
		else if (pres.length) enter = ENTER.pre;
		else if (hpPairs.length && sameBoard(frames[i - 1], frame)) enter = ENTER.snap; // 纯等待：击勾立即起手

		if (hpPairs.length) {
			// 击勾帧：A 预备 → B 锤击闪现 → A 勾回；B 色优先本帧出生音，否则帧位置档
			const ft = beatTint(frame, i, frames);
			let b1 = frame.data;
			hpPairs.forEach(p => {
				const fromData = frame.data[p.from] || {};
				b1 = { ...b1 };
				b1[p.from] = fromData; // A 不动
				b1[p.to] = { type: "note", color: ft ? { name: ft.name, custom: ft.custom } : "white", color2: null, visibility: "visible" };
			});
			const hpTotal = HP_BEATS[0].enter + HP_BEATS[0].dur + HP_BEATS[1].enter + HP_BEATS[1].dur + HP_BEATS[2].enter;
			steps.push({ state: { ...frame }, enter, dur: HP_BEATS[0].dur, spec: { technique: null, pairs: otherPairs }, fi: i, sub: true });
			steps.push({ state: { ...frame, data: b1 }, enter: HP_BEATS[1].enter, dur: HP_BEATS[1].dur, spec: { technique: null, pairs: [] }, fi: i, sub: true });
			steps.push({ state: { ...frame }, enter: HP_BEATS[2].enter, dur: Math.max(60, H - hpTotal), spec: { technique: null, pairs: [] }, fi: i, sub: true });
		} else if (pres.length) {
			// 前置划弦：B 以帧档色亮起并滑向 A 熄灭，随后本帧正常停留
			const ft = beatTint(frame, i, frames);
			let pre = frame.data;
			pres.forEach(s => {
				pre = { ...pre, [s.from]: { type: "note", color: { name: ft ? ft.name : "navy", custom: ft ? ft.custom : "#888888" }, color2: null, visibility: "visible" } };
			});
			steps.push({ state: { ...frame, data: pre }, enter, dur: 80, spec: { technique: null, pairs: pres.map(s => ({ from: s.from, to: s.to, technique: "pre" })) }, fi: i, sub: true });
			steps.push({ state: { ...frame }, enter: 150, dur: H, spec: { technique: null, pairs: [] }, fi: i, sub: false });
		} else {
			steps.push({ state: { ...frame }, enter, dur: H, spec: inc ? { technique: null, pairs: otherPairs } : null, fi: i, sub: false });
		}
	});

	// ② 展平为传输格式：holdMs=dur；前一步 transMs=本步 enter
	steps.forEach((st, k) => {
		const s = { ...st.state, holdMs: st.dur };
		states.push(s);
		frameOf.push(st.fi);
		sub.push(st.sub);
		if (k > 0) specs.push(st.spec || { technique: null, pairs: [] });
	});
	// transMs：states[i].transMs = 下一步的 enter（循环回到第一步）
	states.forEach((s, k) => {
		const nxt = steps[(k + 1) % steps.length];
		s.transMs = nxt ? nxt.enter : T;
	});

	return { states, specs, frameOf, sub };
}
