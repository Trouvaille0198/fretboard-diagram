// 时间轴 v3 —— 全技法统一"数据步"建模
// 每步 {state, enter, dur, spec}：enter=进入动画时长（diff/pair fx），dur=停留。
// 原则：音符的亮/灭全由各步板面数据表达（颜色/数字/外框与板面天然一致），
// fx 只画光点轨迹/装饰环；B 一律"光点到达才出现在数据里"。
import { frameTintFromData, tintAt } from "../colorConfig.js";

const DOT = 450; // 单程滑弦轨迹时长
const RT_OUT = 350, RT_BACK = 330;

function beatTint(frame, i, frames) {
	const born = Object.values(frame.data || {}).find(n => n && typeof n === "object" && n.birth === i && n.color && typeof n.color === "object" && n.color.custom);
	if (born) return { name: born.color.name, custom: born.color.custom };
	const any = Object.values(frame.data || {}).find(n => n && typeof n === "object" && n.color && typeof n.color === "object" && n.color.name);
	if (!any) return null;
	return { name: any.color.name, custom: tintAt(any.color.name, frames.length > 1 ? i / (frames.length - 1) : 0) };
}
const patch = (data, id, color) => ({ ...data, [id]: color ? { type: "note", color: { name: color.name, custom: color.custom }, color2: null, visibility: "visible" } : { type: "note", color: "white", color2: null, visibility: "transparent" } });

export function expandTimeline(frames, transitions, holdMs, transMs) {
	const H = holdMs > 0 ? holdMs : 300;
	const T = transMs > 0 ? transMs : 200;
	const states = [], specs = [], frameOf = [], sub = [];
	const steps = [];

	frames.forEach((frame, i) => {
		const inc = i > 0 ? (transitions[i - 1] || { pairs: [] }) : null;
		const pairs = (inc && inc.pairs) || [];
		const ft = beatTint(frame, i, frames);
		const base = frame.data;
		const pres = frame.preSlides || [];
		const slPairs = pairs.filter(p => p.technique === "sl");
		const rtPairs = pairs.filter(p => p.technique === "rt");
		const hpPairs = pairs.filter(p => p.technique === "hp");
		const techCount = pres.length + slPairs.length + rtPairs.length + hpPairs.length;
		const startEnter = i === 0 ? 0 : (techCount ? 60 : T); // 技法帧立即起手

		// —— 段编排：pre → sl → rt → hp，最后本帧驻留 ——
		// 约定：第 k 步的 spec = "进入第 k 步"的过渡；滑行窗期间板面保持出发态（B 不提前亮），光点到达后下一步才切数据
		const firstEnter = () => (steps.length && steps[steps.length - 1].fi === i) ? 60 : startEnter;
		if (pres.length) {
			let pre = base;
			pres.forEach(s => { pre = patch(pre, s.from, ft); });
			steps.push({ data: pre, enter: firstEnter(), dur: 10, spec: { technique: null, pairs: [] }, fi: i, sub: true });
			steps.push({ data: pre, enter: DOT, dur: 10, spec: { technique: null, pairs: pres.map(s => ({ from: s.from, to: s.to, technique: "pre" })) }, fi: i, sub: true }); // 滑行窗：B 亮滑向 A
			steps.push({ data: base, enter: 60, dur: 0, spec: { technique: null, pairs: [] }, fi: i, sub: true }); // B 熄灭
		}
		slPairs.forEach(p => {
			let travel = base;
			travel = patch(patch(travel, p.to, null), p.from, ft); // 途中态：B 灭、A 亮
			steps.push({ data: travel, enter: firstEnter(), dur: 10, spec: { technique: null, pairs: [] }, fi: i, sub: true });
			steps.push({ data: travel, enter: DOT, dur: 10, spec: { technique: null, pairs: [{ from: p.from, to: p.to, technique: "sl" }] }, fi: i, sub: true }); // 光点滑行（板面=途中）
			steps.push({ data: base, enter: 60, dur: 0, spec: { technique: null, pairs: [] }, fi: i, sub: false }); // 抵达：B 亮 A 灭
		});
		rtPairs.forEach(p => {
			const atB = patch(patch(base, p.from, null), p.to, ft); // 到 B 态：A 灭 B 亮
			steps.push({ data: base, enter: firstEnter(), dur: 10, spec: { technique: null, pairs: [] }, fi: i, sub: true });
			steps.push({ data: base, enter: RT_OUT, dur: 10, spec: { technique: null, pairs: [{ from: p.from, to: p.to, technique: "sl" }] }, fi: i, sub: true }); // 滑出窗（板面 A 亮）
			steps.push({ data: atB, enter: 60, dur: 110, spec: { technique: null, pairs: [] }, fi: i, sub: true }); // 到 B：A 灭 B 亮
			steps.push({ data: atB, enter: RT_BACK, dur: 10, spec: { technique: null, pairs: [{ from: p.to, to: p.from, technique: "sl" }] }, fi: i, sub: true }); // 滑回窗（板面仍 A 灭 B 亮）
			steps.push({ data: base, enter: 60, dur: 20, spec: { technique: null, pairs: [] }, fi: i, sub: true }); // 回到 A：A 重亮
		});
		hpPairs.forEach(p => {
			const b1 = patch(base, p.to, ft); // 锤击态：B 亮，A 不动
			steps.push({ data: base, enter: firstEnter(), dur: 60, spec: { technique: null, pairs: [] }, fi: i, sub: true }); // 预备
			steps.push({ data: b1, enter: 100, dur: 90, spec: { technique: null, pairs: [] }, fi: i, sub: true }); // 锤
			steps.push({ data: base, enter: 100, dur: 20, spec: { technique: null, pairs: [] }, fi: i, sub: true }); // 勾回
		});
		// 本帧驻留
		steps.push({ data: base, enter: steps.length && steps[steps.length - 1].fi === i ? 60 : startEnter, dur: H, spec: { technique: null, pairs: [] }, fi: i, sub: false });
	});

	steps.forEach((st, k) => {
		const src = frames[st.fi];
		states.push({ ...src, data: st.data, holdMs: st.dur });
		frameOf.push(st.fi);
		sub.push(st.sub);
		if (k > 0) specs.push(st.spec || { technique: null, pairs: [] });
	});
	states.forEach((s, k) => {
		const nxt = steps[(k + 1) % steps.length];
		s.transMs = nxt ? nxt.enter : T;
	});
	return { states, specs, frameOf, sub };
}
