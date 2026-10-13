// 时间轴展开：带 hp（击勾）过渡的帧在播放/导出时拆成 3 个子拍
// 子拍间用纯 diff（B 环亮+A 淡出＝锤击，反向＝勾回），复用现有动画引擎

import { deepenTint, tintAt, frameTintFromData } from "../colorConfig.js";

// 技法特效时长：滑弦轨迹/往返光点需要看清楚，比普通过渡窗（transMs）长
export const TECH_FX_MS = { rt: 800, sl: 450 };

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
					// 本帧帧档色＝从该帧板面真实音符颜色取（与板面逐字节一致，兼容旧配色示例档）
					const ft = frameTintFromData(frame.data, i, frames.length);
					hpPairs.forEach(p => { beatData = hpBeatData(beatData, p, ft ? ft.custom : null, ft ? ft.name : "navy"); });
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
	// 每步盖"帧档色"标记（rt/hp 瞬时 B 的闪现色＝当帧新增音符色；animator 优先取用）
	const frameTintOf = (i) => frameTintFromData(frames[i]?.data, i, frames.length);
	// 每步挂"出边特效时长"与停留：sl/rt 过渡拉长（轨迹看得清）；hp 起始拍几乎立即、随后两拍稍驻
	const beatHold = [30, 70, 110];
	let beatIdx = -1;
	states.forEach((s, i) => {
		s.transMs = i < specs.length
			? (sub[i] ? Math.min(150, baseTrans) : effTransMs(specs[i], baseTrans))
			: baseTrans;
		if (sub[i]) { beatIdx = (beatIdx + 1) % 3; s.holdMs = beatHold[beatIdx]; }
		s.frameTint = frameTintOf(frameOf[i]);
	});
	return { states, specs, frameOf, sub };
}

function hpBeatData(frameData, pair, frameTint, schemeName) {
	const next = { ...frameData };
	const fromData = frameData[pair.from] || {};
	// A 全程不变（保持原色原可见）；击勾的视觉全部由 B 的进出表达（锤击=进环+深色闪现，勾回=淡出）
	// B 的锤击闪现 = 当前帧帧档色（与当帧新增音符完全一致；旧数据无帧色时回落 A 深一档）
	const bColor = frameTint
		? { name: schemeName, custom: frameTint }
		: ((() => { const deeper = deepenTint(fromData.color, 1 / 3); return deeper && fromData.color && typeof fromData.color === "object" ? { name: fromData.color.name, custom: deeper } : ((fromData.color && typeof fromData.color === "object") ? fromData.color : (fromData.color || "white")); })());
	next[pair.to] = {
		type: "note",
		color: bColor,
		color2: null,
		visibility: "visible",
		...(fromData.noteText ? { noteText: fromData.noteText } : {})
	};
	return next;
}
