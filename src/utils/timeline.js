// 时间轴 v5 —— 技法独立时钟
// 音符亮灭边：各技法自己的 enter（60-100ms 快速切换），按技法相对时刻排序依次应用；
// 光点轨道：各技法独立的绝对时长（DOT/RT_OUT/RT_BACK），与边序列互不拉扯。
// 同帧多技法 = 并发（同一窗起点、各走各的节奏），与单技法完全同观感。
import { frameTintFromData, tintAt } from "../colorConfig.js";

const DOT = 380, RT_OUT = 350, RT_BACK = 330, SETTLE = 60, HPMOMENT = 60, HPB = 190;

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
	const states = [], specs = [], frameOf = [], sub = [], fx = [];
	const btimes = [];
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
		const enter0 = i === 0 ? 0 : (tech ? SETTLE : T);
		const t0 = frameStart + enter0;

		const origColor = id => {
			const pick = d => {
				const n = d && d[id];
				return n && n.color && typeof n.color === "object" && n.visibility === "visible" ? { name: n.color.name, custom: n.color.custom } : null;
			};
			return (i > 0 ? pick(frames[i - 1].data) : null) || pick(base);
		};

		// 每技法独立边：{t=技法相对钟, on, off, enter=该边动画时长}
		const edges = [];
		const edge = (t, on, off, enter) => edges.push({ t, on, off, enter });
		pres.forEach(s => {
			edge(Math.round(DOT * 0.5), { id: s.from, c: ft }, null, 60); // B 行程一半才亮（与 sl 的 B 同逻辑，不一开局就出现）
			edge(DOT, null, { id: s.from }, 60); // 光点到达 A 后 B 熄灭
		});
		slP.forEach(p => {
			edge(0, { id: p.from, c: origColor(p.from) || ft }, { id: p.to }, SETTLE);
			edge(Math.round(DOT * 0.5), { id: p.to, c: ft }, { id: p.from }, 60); // B 在行程一半就亮（提前约半个行程，明显可感）
		});
		rtP.forEach(p => {
			edge(RT_OUT, { id: p.to, c: ft }, { id: p.from }, 60);
			edge(RT_OUT + 110 + RT_BACK, { id: p.from, c: origColor(p.from) || ft }, { id: p.to }, 60);
		});
		hpP.forEach(p => {
			edge(HPMOMENT, { id: p.to, c: ft }, null, 100);
			edge(HPMOMENT + HPB, null, { id: p.to }, 100);
		});
		edges.sort((a, b) => a.t - b.t);

		const pushState = (data, hold, isSub, inEnter) => {
			states.push({ ...frame, data, holdMs: hold });
			btimes.push(-1); // 占位：事后按累积时间回填
			frameOf.push(i);
			sub.push(isSub);
			if (states.length > 1) specs.push({ technique: null, pairs: [] });
			if (states.length > 1) states[states.length - 2].transMs = inEnter;
		};

		if (!tech) {
			pushState(base, H, false, enter0);
			now = frameStart + enter0 + H;
			return;
		}

		// 窗开启态 = base + 全部 t=0 边（各技法出发态并发合成）
		let startData = base;
		edges.forEach(e => { if (e.t === 0) { if (e.on) startData = lit(startData, e.on.id, e.on.c); if (e.off) startData = lit(startData, e.off.id, null); } });
		pushState(startData, 0, false, enter0);

		// t>0 的边按技法相对时刻依次应用：
		// 等待 = 与上一边的间隙（技法自己的节奏，与光点轨道同步）；
		// 动画 = 短促切换（60ms/hp 100ms）——不把间隙当动画时长（那是 v4 乱象根源）
		let acc = t0;
		let prevT = 0;
		edges.filter(e => e.t > 0).forEach(e => {
			const gap = e.t - prevT;
			prevT = e.t;
			// 上一态：先等 (gap - 切换时长)，再用切换时长过渡到本边状态
			const waitPrev = Math.max(0, gap - e.enter);
			states[states.length - 1].holdMs = waitPrev;
			let data = states[states.length - 1].data;
			if (e.on) data = lit(data, e.on.id, e.on.c);
			if (e.off) data = lit(data, e.off.id, null);
			pushState(data, 0, true, e.enter);
			acc += gap;
		});

		// 帧尾驻留
		const tail = Math.max(60, H - (acc - frameStart));
		states[states.length - 1].holdMs = tail;
		states[states.length - 1].transMs = 60;
		now = acc + tail + 60;

		// 光点轨道：技法独立绝对时长（与单技法完全一致，不受边序列影响）
		// 窗开启态（含尾驻留）在 states 里的下标 = 末尾 - t>0边数 - 尾步1；fx 轨道与它对齐
		const winIdx = Math.max(0, states.length - 1 - edges.filter(e => e.t > 0).length - 1);
		const winT0 = btimes[winIdx] !== undefined ? btimes[winIdx] : t0;
		pres.forEach(s => fx.push({ spec: { technique: null, pairs: [{ from: s.from, to: s.to, technique: "pre" }] }, t0: winT0, dur: DOT, frame: i, _winOffset: 0 }));
		slP.forEach(p => fx.push({ spec: { technique: null, pairs: [{ from: p.from, to: p.to, technique: "sl" }] }, t0: winT0, dur: DOT, frame: i, _winOffset: 0 }));
		rtP.forEach(p => {
			fx.push({ spec: { technique: null, pairs: [{ from: p.from, to: p.to, technique: "sl" }] }, t0: winT0, dur: RT_OUT, frame: i, _winOffset: 0 });
			fx.push({ spec: { technique: null, pairs: [{ from: p.to, to: p.from, technique: "sl" }] }, t0: 0, dur: RT_BACK, frame: i, _rtBack: true });
		});
	});

	// 回填每步的可见时刻：t[i] = t[i-1] + hold(i-1) + trans(i-1)
	let acc = 0;
	for (let k = 0; k < states.length; k++) {
		btimes[k] = acc;
		acc += (states[k].holdMs || 0) + (states[k].transMs || 0);
	}
	// fx 轨道 t0 重定位到窗开启态的真实可见时刻
	fx.forEach(x => {
		if (x.frame === undefined) return;
		const idxs = [];
		frameOf.forEach((f, k) => { if (f === x.frame) idxs.push(k); });
		if (!idxs.length) return;
		const winT = btimes[idxs[0]]; // 窗开态 = 该帧首态
		if (x._rtBack) x.t0 = winT + RT_OUT + 110;
		else x.t0 = winT;
	});
	return { states, specs: specs.slice(1), frameOf, sub, fx, total: now };
}
