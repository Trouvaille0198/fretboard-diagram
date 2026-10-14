// 时间轴 v5 —— 技法独立时钟
// 音符亮灭边：各技法自己的 enter（60-100ms 快速切换），按技法相对时刻排序依次应用；
// 光点轨道：各技法独立的绝对时长（DOT/RT_OUT/RT_BACK），与边序列互不拉扯。
// 同帧多技法 = 并发（同一窗起点、各走各的节奏），与单技法完全同观感。
import { frameTintFromData, tintAt } from "../colorConfig.js";

const DOT = 380, RT_OUT = 280, RT_BACK = 260, SETTLE = 60, HPMOMENT = 60, HPB = 190;

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
		const pres = frame.preSlides || [];
		const slP = pairs.filter(p => p.technique === "sl");
		const rtP = pairs.filter(p => p.technique === "rt");
		const hpP = pairs.filter(p => p.technique === "hp");
		// 瞬时目标音（rt/hp 的 B、pre 的暗音）即使混进帧数据，窗口期也不得提前亮——base 里压暗，交给边点亮
		const base = (() => {
			const ids = new Set([...rtP.map(p => p.to), ...hpP.map(p => p.to), ...pres.map(s => s.from)]);
			if (!ids.size) return frame.data;
			let d = frame.data;
			ids.forEach(id => {
				if (d[id] && d[id].visibility === "visible") d = { ...d, [id]: { ...d[id], visibility: "transparent" } };
			});
			return d;
		})();
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

		// 瞬时 B 的颜色 = 帧位档 ft（=当前帧新增音符得到的色，与 sl 的 B 观感完全一致）
		const bTint = () => ft;

		// 每技法独立边：{t=技法相对钟, on, off, enter=该边动画时长}
		const edges = [];
		const edge = (t, on, off, enter) => edges.push({ t, on, off, enter });
		pres.forEach(s => {
			// 语义：滑音先"取消"目标（窗开目标先灭=回到未生效），滑行音半程亮，抵达瞬间目标以原色复亮（=生效）
			const toC = origColor(s.to) || ft; // 目标自己的原色（帧数据里的生效色）
			edge(0, null, { id: s.to }, SETTLE); // 窗开：目标先灭（未生效）
			edge(Math.round(DOT * 0.5), { id: s.from, c: ft }, null, 60); // 滑行音半程亮（帧位档）
			edge(DOT, { id: s.to, c: toC }, { id: s.from }, 60); // 抵达：目标复亮（原色）+ 滑行音灭
		});
		slP.forEach(p => {
			edge(0, { id: p.from, c: origColor(p.from) || ft }, { id: p.to }, SETTLE);
			const bData = base[p.to]; // sl 的 B 是帧数据真实音：用它自己的出生色（半程亮＝终态色，不会中途变色）
			const bC = bData && bData.color && typeof bData.color === 'object' && bData.visibility === 'visible' ? { name: bData.color.name, custom: bData.color.custom } : bTint(p);
			edge(Math.round(DOT * 0.5), { id: p.to, c: bC }, { id: p.from }, 60); // B 在行程一半就亮（提前约半个行程，明显可感）
		});
		rtP.forEach(p => {
			edge(Math.round(RT_OUT * 0.5), { id: p.to, c: bTint(p) }, null, 60); // B 行程一半亮（与 sl/pre 同逻辑）
			edge(RT_OUT, null, { id: p.from }, 60); // 光点到达 B：A 灭、B 保持
			edge(RT_OUT + 110 + Math.round(RT_BACK * 0.5), { id: p.from, c: origColor(p.from) || ft }, { id: p.to }, 60); // 回程一半：A 先亮、B 同步灭（B 生命期=半出程→半回程，居中于驻留）
		});
		hpP.forEach(p => {
			edge(HPMOMENT, { id: p.to, c: bTint(p) }, null, 100);
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
			// 切换动画不得超过等待间隙（超过则压缩动画，防时钟漂移把后续技法边推迟）
			const enter = Math.min(e.enter, gap);
			// 上一态：先等 (gap - 切换时长)，再用切换时长过渡到本边状态
			const waitPrev = Math.max(0, gap - enter);
			states[states.length - 1].holdMs = waitPrev;
			let data = states[states.length - 1].data;
			if (e.on) data = lit(data, e.on.id, e.on.c);
			if (e.off) data = lit(data, e.off.id, null);
			pushState(data, 0, true, enter);
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


// 状态绝对时钟（播放器与导出共用的唯一真源）：
// 状态 k 显示 [starts[k], starts[k+1])，时长 = hold_k + enterOf(k)；
// enterOf(k) = 进入下一状态的切换动画（存在 states[k+1].transMs）——与 fx 轨道 t0/dur 严格同轴。
// GIF/WebM 导出按此时刻表采样，预览按此表调度，两边行为按构造一致。
export function stateClock(states, holdMs = 300, transMs = 200) {
	// states[k].transMs 的语义 =「进入状态 k+1」的切换动画（pushState 写在前驱上）。
	// 0 是合法瞬切（同刻边群只有首条带动画），只有真正缺失才回退——
	// 曾误用 states[k+1]（反向一格）又把 0 当缺失，同时刻技法被凭空错开（"不同步"的根因）。
	const enterOf = k => {
		const own = states[k]?.transMs;
		if (Number.isFinite(own)) return Math.max(0, own);
		if (k > 0) {
			const pv = states[k - 1]?.transMs;
			if (Number.isFinite(pv)) return Math.max(0, pv);
		}
		return transMs;
	};
	const starts = [0];
	for (let k = 0; k < states.length - 1; k++) {
		const h = Number.isFinite(states[k]?.holdMs) ? Math.max(0, states[k].holdMs) : holdMs;
		starts.push(starts[k] + h + enterOf(k));
	}
	const last = states.length - 1;
	const holdLast = Number.isFinite(states[last]?.holdMs) ? Math.max(0, states[last].holdMs) : holdMs;
	const total = starts[last] + holdLast + enterOf(last);
	return { starts, total, enterOf };
}
