// 时间轴展开：带 hp（击勾）过渡的帧在播放/导出时拆成 3 个子拍
// 子拍间用纯 diff（B 环亮+A 淡出＝锤击，反向＝勾回），复用现有动画引擎

import { deepenTint } from "../colorConfig.js";

// 技法特效时长：滑弦轨迹/往返光点需要看清楚，比普通过渡窗（transMs）长
export const TECH_FX_MS = { rt: 800, sl: 600 };

function effTransMs(spec, base) {
	const techs = (spec?.pairs || []).map(p => p.technique);
	let ms = base;
	if (techs.includes("rt")) ms = Math.max(ms, TECH_FX_MS.rt);
	if (techs.includes("sl")) ms = Math.max(ms, TECH_FX_MS.sl);
	return ms;
}

// frames/transitions → 播放步序列：普通帧 1 步；hp 帧 3 步
export function expandTimeline(frames, transitions, holdMs, transMs) {
	const baseTrans = transMs > 0 ? transMs : 200;
	const states = [];
	const specs = []; // specs[i] = states[i]→states[i+1]，长度 = states-1
	const frameOf = []; // 每步对应的原始帧号（缩略图高亮用）
	const sub = []; // 该步是否 hp 子拍（播放提速用）

	frames.forEach((frame, i) => {
		const inc = i > 0 ? (transitions[i - 1] || { technique: null, pairs: [] }) : null;
		const hpPairs = (inc && inc.pairs || []).filter(p => p.technique === "hp");

		if (hpPairs.length) {
			// 击勾帧：3 子拍。hp pair 的动画被子拍取代；同一过渡里的其他 pair（sl/rt）保留在进入第一拍时播放
			const otherPairs = (inc.pairs || []).filter(p => p.technique !== "hp");
			let beatData = frame.data;
			let firstBeat = true;
			for (let beat = 0; beat < 3; beat++) {
				if (beat === 1) {
					beatData = { ...frame.data };
					hpPairs.forEach(p => { beatData = hpBeatData(beatData, p); });
				} else {
					beatData = frame.data;
				}
				states.push({ ...frame, data: beatData });
				frameOf.push(i);
				sub.push(true);
				if (states.length > 1) specs.push(firstBeat ? { technique: null, pairs: otherPairs } : { technique: null, pairs: [] });
				firstBeat = false;
			}
		} else {
			states.push(frame);
			frameOf.push(i);
			sub.push(false);
			if (states.length > 1) specs.push(inc || { technique: null, pairs: [] });
		}
	});
	// 每步挂"出边特效时长"：带 sl/rt 的过渡拉长（轨迹看得清）；hp 子拍之间减半（利落）
	states.forEach((s, i) => {
		s.transMs = i < specs.length
			? (sub[i] ? Math.max(80, baseTrans / 2) : effTransMs(specs[i], baseTrans))
			: baseTrans;
	});
	return { states, specs, frameOf, sub };
}

function hpBeatData(frameData, pair) {
	const next = { ...frameData };
	const fromData = frameData[pair.from] || {};
	// A 全程不变（保持原色原可见）；击勾的视觉全部由 B 的进出表达（锤击=进环+深色闪现，勾回=淡出）
	// B 的锤击闪现比 A 深一档（A 的色阶位置 +1/4，封顶 deep）；无法定位时回落 A 的颜色
	const deeper = deepenTint(fromData.color);
	const bColor = deeper && fromData.color && typeof fromData.color === "object"
		? { name: fromData.color.name, custom: deeper }
		: ((fromData.color && typeof fromData.color === "object") ? fromData.color : (fromData.color || "white"));
	next[pair.to] = {
		type: "note",
		color: bColor,
		color2: null,
		visibility: "visible",
		...(fromData.noteText ? { noteText: fromData.noteText } : {})
	};
	return next;
}
