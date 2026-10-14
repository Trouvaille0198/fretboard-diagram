// 时间轴 v5 —— 技法独立时钟
// 音符亮灭边：各技法自己的 enter（60-100ms 快速切换），按技法相对时刻排序依次应用；
// 光点轨道：各技法独立的绝对时长（DOT/RT_OUT/RT_BACK），与边序列互不拉扯。
// 同帧多技法 = 并发（同一窗起点、各走各的节奏），与单技法完全同观感。
import { frameTintFromData, tintAt } from "../colorConfig.js";

const DOT = 300, RT_OUT = 280, RT_BACK = 260, SETTLE = 60, HPMOMENT = 60, HPB = 190; // DOT 380→300：滑动稍快

function beatTint(frame, i, frames) {
	const born = Object.values(frame.data || {}).find(n => n && typeof n === "object" && n.birth === i && n.color && typeof n.color === "object" && n.color.custom);
	if (born) return { name: born.color.name, custom: born.color.custom };
	const any = Object.values(frame.data || {}).find(n => n && typeof n === "object" && n.color && typeof n.color === "object" && n.color.name);
	if (!any) return null;
	return { name: any.color.name, custom: tintAt(any.color.name, frames.length > 1 ? i / (frames.length - 1) : 0) };
}
const lit = (data, id, color) => ({ ...data, [id]: color ? { type: "note", color: { name: color.name, custom: color.custom }, color2: null, visibility: "visible" } : { type: "note", color: "white", color2: null, visibility: "transparent" } });

export function expandTimeline(frames, transitions, holdMs, transMs, opts = {}) {
	const H = holdMs > 0 ? holdMs : 300;
	const T = transMs > 0 ? transMs : 200;
	const states = [], specs = [], frameOf = [], sub = [], fx = [];
	const btimes = [];
	let now = 0;

	// 从空白开始：最前面垫一块全空白态（等效"第0帧"），第一帧的音经标准过渡 T 进入——
	// 否则首帧音"天生就在"，没有出现动画。frameOf=-1：不属于任何帧（fx 定位/帧高亮不认它）
	if (opts.leadBlank && frames.length) {
		const blankData = {};
		Object.entries(frames[0].data || {}).forEach(([id, n]) => {
			if (id === 'connections' || id.startsWith('conn-')) { blankData[id] = n; return; }
			blankData[id] = n && typeof n === 'object' ? { ...n, color: 'white', color2: null, visibility: 'transparent' } : n;
		});
		states.push({ ...frames[0], data: blankData, holdMs: H });
		btimes.push(-1);
		frameOf.push(-1);
		sub.push(false);
		now = H; // 空白态先驻留 H，再经 T 过渡进第 1 帧（首态的 transMs 由 pushState 写到空白态上）
	}

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
			const ids = new Set([...rtP.map(p => p.to), ...hpP.map(p => p.to)]);
			if (!ids.size) return frame.data;
			let d = frame.data;
			ids.forEach(id => {
				if (d[id] && d[id].visibility === "visible") d = { ...d, [id]: { ...d[id], visibility: "transparent" } };
			});
			return d;
		})();
		const tech = pres.length + slP.length + rtP.length + hpP.length;
		// 本帧技法涉及的全部音符 id（涟漪静默用）
		const techIds = new Set();
		pres.forEach(s => { techIds.add(s.from); techIds.add(s.to); });
		slP.forEach(p => { techIds.add(p.from); techIds.add(p.to); });
		rtP.forEach(p => { techIds.add(p.from); techIds.add(p.to); });
		hpP.forEach(p => { techIds.add(p.from); techIds.add(p.to); });

		const frameStart = now;
		const enter0 = i === 0 ? (opts.leadBlank ? T : 0) : (tech ? SETTLE : T);
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
		// 前置划弦：一个音符从 A 划到 B 最后停在 B——板面只做"B 到达后点亮并停住"（窗开先不显示）
		pres.forEach(s => {
			const toC = origColor(s.to) || ft;
			edge(0, null, { id: s.to }, SETTLE);
			edge(DOT, { id: s.to, c: toC }, null, 0); // 瞬切：fx 音符同位同色消失/板面 B 点亮，同一帧完成（无闪影）
		});
		slP.forEach(p => {
			// 滑弦与前置划弦同构的"移动音符"语义：A 本体从原位滑到 B，出发原位即离场、
			// 抵达 B 点亮停住——不再用光点+轨迹线（用户定稿：A 直接到 B）
			const bData = base[p.to]; // sl 的 B 是帧数据真实音：用它自己的出生色（抵达即终态色，无闪影）
			const bC = bData && bData.color && typeof bData.color === 'object' && bData.visibility === 'visible' ? { name: bData.color.name, custom: bData.color.custom } : bTint(p);
			edge(0, null, { id: p.from }, SETTLE);
			edge(0, null, { id: p.to }, SETTLE);
			edge(DOT, { id: p.to, c: bC }, null, 0);
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
		// 技法参与音（sl/rt/hp 的 A/B、pre 的 B/A）钉在窗开启态上：这些音若恰在本帧新激活，
		// 进入涟漪要让位——划线/滑弦本身的表演已交代其出现（"有划线优先级更高，直接展示"）。
		// 渲染面（播放/GIF/SMIL）从 nextState.muteEnter 读取并在差分涟漪里跳过它们。
		states[states.length - 1].muteEnter = [...techIds];

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

		// 帧尾驻留（滑弦帧在抵达后多停一下，让"到 B"读得清再切走）
		const tail = Math.max(slP.length ? 260 : 60, H - (acc - frameStart));
		states[states.length - 1].holdMs = tail;
		states[states.length - 1].transMs = 60;
		now = acc + tail + 60;

		// 光点轨道：技法独立绝对时长（与单技法完全一致，不受边序列影响）
		// 窗开启态（含尾驻留）在 states 里的下标 = 末尾 - t>0边数 - 尾步1；fx 轨道与它对齐
		const winIdx = Math.max(0, states.length - 1 - edges.filter(e => e.t > 0).length - 1);
		const winT0 = btimes[winIdx] !== undefined ? btimes[winIdx] : t0;
		// fx 音符比板面 B 的 CSS 渐入(0.1s)多停 100ms：全程满亮盖住渐入，交接无亮度塌陷（闪影根因）
		pres.forEach(s => fx.push({ spec: { technique: null, pairs: [{ from: s.from, to: s.to, technique: "pre" }] }, t0: winT0, dur: DOT + 100, frame: i, _winOffset: 0 }));
		// sl 与 pre 同为移动音符：多停 100ms 盖住板面 B 的 CSS 渐入
		slP.forEach(p => fx.push({ spec: { technique: null, pairs: [{ from: p.from, to: p.to, technique: "sl" }] }, t0: winT0, dur: DOT + 100, frame: i, _winOffset: 0 }));
		rtP.forEach(p => {
			// rt 仍用光点平移（mv=dot 无轨迹线；rt 板面 A/B 有点亮节奏，移动音符会双重渲染）
			fx.push({ spec: { technique: null, pairs: [{ from: p.from, to: p.to, technique: "mv" }] }, t0: winT0, dur: RT_OUT, frame: i, _winOffset: 0 });
			fx.push({ spec: { technique: null, pairs: [{ from: p.to, to: p.from, technique: "mv" }] }, t0: 0, dur: RT_BACK, frame: i, _rtBack: true });
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


// 整轮播完、回环重启前的尾部停顿（末帧多停一拍再循环；播放与导出同源）
export const END_PAUSE_MS = 600;

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

// 累积态：激活过的音永不熄灭（"存在过的点不消失"样式）。
// 逐态前向回填——每个音保留它最后一次点亮时的形（颜色/标签），
// 在其后被熄灭的状态里恢复为该形；结构与时钟不变，fx 轨道照常对齐。
export function accumulateStates(states) {
	const carry = new Map();
	return states.map(s => {
		const data = { ...s.data };
		carry.forEach((n, id) => {
			const cur = data[id];
			const active = cur && (cur.visibility === "visible" || cur.visibility === "selected");
			if (!active) data[id] = n;
		});
		Object.entries(data).forEach(([id, n]) => {
			if (n && typeof n === "object" && (n.visibility === "visible" || n.visibility === "selected")) carry.set(id, n);
		});
		return { ...s, data };
	});
}
