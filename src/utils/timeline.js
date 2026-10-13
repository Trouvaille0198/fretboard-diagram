// 时间轴 v4 —— 并发轨道模型
// 同帧所有技法并发：音符亮灭=全局边界合成数据步（diff 表达进出），光点轨迹=绝对时间 fx 轨道（不排队）。
import { frameTintFromData, tintAt } from "../colorConfig.js";

const DOT = 450, RT_OUT = 350, RT_BACK = 330, SETTLE = 60, HPMOMENT = 60, HPB = 190;

function beatTint(frame, i, frames) {
	const born = Object.values(frame.data || {}).find(n => n && typeof n === "object" && n.birth === i && n.color && typeof n.color === "object" && n.color.custom);
	if (born) return { name: born.color.name, custom: born.color.custom };
	const any = Object.values(frame.data || {}).find(n => n && typeof n === "object" && n.color && typeof n.color === "object" && n.color.name);
	if (!any) return null;
	return { name: any.color.name, custom: tintAt(any.color.name, frames.length > 1 ? i / (frames.length - 1) : 0) };
}
const lit = (data, id, color) => ({ ...data, [id]: color ? { type: "note", color: { name: color.name, custom: color.custom }, color2: null, visibility: "visible" } : { type: "note", color: "white", color2: null, visibility: "transparent" } });

export function expandTimeline(frames, transitions, holdMs, transMs) {
	const H = holdMs > 0 ? holdMs : 300;
	const T = transMs > 0 ? transMs : 200;
	const states = [], specs = [], frameOf = [], sub = [];
	const fx = []; // {spec, t0, dur} 绝对时间光点轨道
	const btimes = []; // 每步的绝对时间
	let now = 0;

	frames.forEach((frame, i) => {
		const inc = i > 0 ? (transitions[i - 1] || { pairs: [] }) : null;
		const pairs = (inc && inc.pairs) || [];
		const ft = beatTint(frame, i, frames);
		const base = frame.data;
		const pres = frame.preSlides || [];
		const slP = pairs.filter(p => p.technique === "sl");
		const rtP = pairs.filter(p => p.technique === "rt");
		const hpP = pairs.filter(p => p.technique === "hp");
		const tech = pres.length + slP.length + rtP.length + hpP.length;

		const frameStart = now;
		const enter = i === 0 ? 0 : (tech ? SETTLE : T);
		const t0 = frameStart + enter;
		const events = [];
		const mark = (t, on, off) => { if (t > frameStart) events.push({ t, on, off }); };

		pres.forEach(s => {
			fx.push({ spec: { technique: null, pairs: [{ from: s.from, to: s.to, technique: "pre" }] }, t0, dur: DOT });
			mark(t0, { id: s.from, c: ft }, null);
			mark(t0 + DOT, null, { id: s.from });
		});
		slP.forEach(p => {
			fx.push({ spec: { technique: null, pairs: [{ from: p.from, to: p.to, technique: "sl" }] }, t0, dur: DOT });
			mark(t0, { id: p.from, c: ft }, { id: p.to });
			mark(t0 + DOT, { id: p.to, c: ft }, { id: p.from });
		});
		rtP.forEach(p => {
			fx.push({ spec: { technique: null, pairs: [{ from: p.from, to: p.to, technique: "sl" }] }, t0, dur: RT_OUT });
			fx.push({ spec: { technique: null, pairs: [{ from: p.to, to: p.from, technique: "sl" }] }, t0: t0 + RT_OUT + 110, dur: RT_BACK });
			mark(t0 + RT_OUT, { id: p.to, c: ft }, { id: p.from });
			mark(t0 + RT_OUT + 110 + RT_BACK, { id: p.from, c: ft }, { id: p.to });
		});
		hpP.forEach(p => {
			mark(t0 + HPMOMENT, { id: p.to, c: ft }, null);
			mark(t0 + HPMOMENT + HPB, null, { id: p.to });
		});

		const uniq = [...new Set([t0, ...events.map(e => e.t)])].sort((a, b) => a - b);
		const patchAt = t => {
			let data = base;
			events.forEach(e => { if (e.t <= t) { if (e.on) data = lit(data, e.on.id, e.on.c); if (e.off) data = lit(data, e.off.id, null); } });
			return data;
		};
		uniq.forEach(t => {
			const data = tech ? patchAt(t) : base;
			states.push({ ...frame, data, holdMs: 0 });
			btimes.push(t);
			frameOf.push(i);
			sub.push(!!tech && t > frameStart);
			specs.push({ technique: null, pairs: [] });
		});
		const techEnd = events.length ? Math.max(...events.map(e => e.t)) : t0;
		const frameDur = Math.max(H, techEnd + 60 - frameStart);
		now = frameStart + frameDur;
	});

	// 回填：步 k 的进入动画时长 = 与上一边界的时间差；帧尾步停留补到帧尾；回环步=首步起点
	const stepT = btimes.slice();
	states.forEach((s, k) => {
		if (k === 0) { s.transMs = 0; return; }
		states[k - 1].transMs = Math.max(16, stepT[k] - stepT[k - 1]);
	});
	// 每帧尾步 hold 到帧尾（帧尾 = 下一帧首步时间；末帧 = total）
	let idx = 0;
	frames.forEach((frame, i) => {
		const start = idx;
		while (idx < frameOf.length && frameOf[idx] === i) idx++;
		if (idx <= start) return;
		const tLast = stepT[idx - 1];
		const nextT = idx < stepT.length ? stepT[idx] : now;
		const lastGap = Math.max(16, nextT - tLast - 60);
		states[idx - 1].holdMs = Math.max(60, nextT - tLast - lastGap);
		states[idx - 1].transMs = lastGap; // 尾步出边（到下一帧首步）
	});
	return { states, specs: specs.slice(1), frameOf, sub, fx, total: now };
}
