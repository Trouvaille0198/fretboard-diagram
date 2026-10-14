// 核心动效不变量冒烟：四技法 × 场景矩阵，纯 Node 直跑（node scripts/smoke-core.mjs）
// 覆盖：状态序列 / B 颜色（帧位档·数据出生色）/ 半程前置亮 / 到达与回程时刻 /
//       fx 轨道对齐 / 瞬时目标音不提前亮 / 时钟单调性 / 多技法同帧并发同步
import { expandTimeline, stateClock } from "../src/utils/timeline.js";

const T = ["rgb(204, 224, 250)", "rgb(78, 149, 247)", "rgb(8, 70, 165)", "rgb(9, 46, 103)"];
let fail = 0, n = 0;
const A = (name, ok, detail) => { n++; if (!ok) { fail++; console.error(`  ✗ ${name}${detail ? "  [" + detail + "]" : ""}`); } };

const mk = (lit, extra) => {
	const data = {};
	Object.entries(lit).forEach(([id, v]) => {
		data[id] = typeof v === "string"
			? { type: "note", color: "white", color2: null, visibility: "transparent" }
			: { type: "note", color: { name: "navy", custom: v.c }, color2: null, visibility: "visible", birth: v.b };
	});
	return { data, startFret: 1, endFret: 13, visibility: "transparent", ...(extra || {}) };
};
const vis = (s, id) => (s.data[id] && s.data[id].visibility === "visible" ? s.data[id].color.custom : null);
const seq = (r, id) => r.states.map(s => (vis(s, id) ? "L" : "-")).join("");
const run = (frames, transitions, hold = 300, trans = 200) => expandTimeline(frames, transitions, hold, trans);

console.log("== sl 滑弦 ==");
{
	const r = run(
		[mk({ "f5-s2": { c: T[0], b: 0 } }), mk({ "f5-s2": "off", "f8-s2": { c: T[1], b: 1 } })],
		[{ technique: null, pairs: [{ from: "f5-s2", to: "f8-s2", technique: "sl" }] }]
	);
	const clock = stateClock(r.states, 300, 200);
	const bOn = r.states.findIndex(s => vis(s, "f8-s2") === T[1]);
	A("sl B=数据出生色且全程一色", r.states.slice(bOn).every(s => vis(s, "f8-s2") === null || vis(s, "f8-s2") === T[1]));
	A("sl A 终态灭", vis(r.states[r.states.length - 1], "f5-s2") === null);
	const fx = r.fx[0];
	A("sl B 半程前置亮（早于光点到达 ≥100ms）", clock.starts[bOn] < fx.t0 + fx.dur - 100, `B@${clock.starts[bOn]} dot@${fx.t0 + fx.dur}`);
	A("sl fx 从窗口出发", fx.t0 === 300 + 60);
}

console.log("== rt 原位滑弦 ==");
{
	const r = run(
		[mk({ "f5-s2": { c: T[0], b: 0 } }), mk({ "f5-s2": { c: T[0], b: 0 } })],
		[{ technique: null, pairs: [{ from: "f5-s2", to: "f6-s2", technique: "rt" }] }]
	);
	A("rt 状态序列 A-|A-|AB|-B|A-", seq(r, "f5-s2") === "LLL-L" && seq(r, "f6-s2") === "--LL-", seq(r, "f5-s2") + " / " + seq(r, "f6-s2"));
	const clock = stateClock(r.states, 300, 200);
	const bOn = r.states.findIndex(s => vis(s, "f6-s2"));
	const aOff = r.states.findIndex(s => !vis(s, "f5-s2"));
	const last = r.states.length - 1;
	A("rt B 半程亮", clock.starts[bOn] === 500, String(clock.starts[bOn]));
	A("rt A 到达灭", clock.starts[aOff] === 640, String(clock.starts[aOff]));
	A("rt A 回程半亮·B 同步灭（同一条边）", vis(r.states[last], "f5-s2") === T[0] && vis(r.states[last], "f6-s2") === null);
	A("rt fx 出+回双轨", r.fx.length === 2 && r.fx[1].t0 > r.fx[0].t0 + r.fx[0].dur - 50);
}

console.log("== hp 击勾 ==");
{
	const r = run(
		[mk({ "f5-s2": { c: T[0], b: 0 } }), mk({ "f5-s2": { c: T[0], b: 0 } })],
		[{ technique: null, pairs: [{ from: "f5-s2", to: "f6-s2", technique: "hp" }] }]
	);
	A("hp A 恒亮原色", r.states.every(s => vis(s, "f5-s2") === T[0]));
	A("hp B 闪现后灭", vis(r.states[r.states.length - 1], "f6-s2") === null && r.states.some(s => vis(s, "f6-s2")));
}

console.log("== pre 前置划弦 ==");
{
	const F = [mk({ "f4-s2": { c: T[0], b: 0 } }), mk({ "f4-s2": { c: T[0], b: 0 } })];
	F[1].preSlides = [{ from: "f1-s2", to: "f4-s2" }];
	const r = run(F, [{ technique: null, pairs: [] }]);
	const clock = stateClock(r.states, 300, 200);
	A("pre 目标恒亮（板面零改动）", r.states.every(s => vis(s, "f4-s2") === T[0]));
	A("pre 无瞬态滑行音状态", r.states.every(s => !vis(s, "f1-s2")));
	const fx = r.fx[0];
	A("pre fx=DOT 全程", fx.t0 === 360 && fx.dur === 300, `${fx.t0}/${fx.dur}`);
}

console.log("== 同帧四技并发 ==");
{
	const F = [
		mk({ "f3-s2": { c: T[0], b: 0 }, "f5-s2": { c: T[0], b: 0 }, "f7-s2": { c: T[0], b: 0 }, "f9-s2": { c: T[0], b: 0 } }),
		mk({ "f3-s2": "off", "f4-s2": { c: T[1], b: 1 }, "f5-s2": { c: T[0], b: 0 }, "f7-s2": { c: T[0], b: 0 }, "f9-s2": { c: T[0], b: 0 } }),
	];
	F[1].preSlides = [{ from: "f1-s2", to: "f9-s2" }];
	const r = run(F, [{ technique: null, pairs: [
		{ from: "f3-s2", to: "f4-s2", technique: "sl" },
		{ from: "f5-s2", to: "f6-s2", technique: "rt" },
		{ from: "f7-s2", to: "f8-s2", technique: "hp" },
	] }]);
	const clock = stateClock(r.states, 300, 200);
	const last = r.states[r.states.length - 1];
	A("并发终态：sl B 亮·A 灭", vis(last, "f4-s2") === T[1] && !vis(last, "f3-s2"));
	A("并发终态：rt 还原", vis(last, "f5-s2") === T[0] && !vis(last, "f6-s2"));
	A("并发终态：hp 还原", vis(last, "f7-s2") === T[0] && !vis(last, "f8-s2"));
	A("并发终态：pre B 灭", !vis(last, "f1-s2"));
	const bft = r.states.map(s => vis(s, "f6-s2")).filter(Boolean)[0];
	const bhp = r.states.map(s => vis(s, "f8-s2")).filter(Boolean)[0];
	A("并发 rt/hp B=帧位档（=当前帧新增音 f4 的色）", bft === T[1] && bhp === T[1], `${bft}/${bhp}`);
	A("并发出程 fx 同起点", r.fx.every(x => x.t0 === r.fx[0].t0 || x._rtBack));
}

console.log("== 多 pre 同帧同步 ==");
{
	const F = [mk({ "f4-s2": { c: T[0], b: 0 }, "f7-s2": { c: T[0], b: 0 }, "f10-s2": { c: T[0], b: 0 } }), mk({ "f4-s2": { c: T[0], b: 0 }, "f7-s2": { c: T[0], b: 0 }, "f10-s2": { c: T[0], b: 0 } })];
	F[1].preSlides = [{ from: "f1-s2", to: "f4-s2" }, { from: "f5-s2", to: "f7-s2" }, { from: "f8-s2", to: "f10-s2" }];
	const r = run(F, [{ technique: null, pairs: [] }]);
	const clock = stateClock(r.states, 300, 200);
	const ons = ["f1-s2", "f5-s2", "f8-s2"].map(id => clock.starts[r.states.findIndex(s => vis(s, id))]);
	const offs = ["f1-s2", "f5-s2", "f8-s2"].map(id => clock.starts[r.states.findIndex(s => !vis(s, id)) - 1]);
	A("多 pre B 同时亮", ons[0] === ons[1] && ons[1] === ons[2], ons.join(","));
	A("多 pre B 同时灭", offs[0] === offs[1] && offs[1] === offs[2], offs.join(","));
}

console.log("== 瞬时目标音混入帧数据（健壮性）==");
{
	const r = run(
		[mk({ "f5-s2": { c: T[0], b: 0 } }), mk({ "f5-s2": { c: T[0], b: 0 }, "f6-s2": { c: T[1], b: 1 } })],
		[{ technique: null, pairs: [{ from: "f5-s2", to: "f6-s2", technique: "rt" }] }]
	);
	const clock = stateClock(r.states, 300, 200);
	const bOn = r.states.findIndex(s => vis(s, "f6-s2"));
	A("rt B 混入数据也不提前亮（窗口态仍灭）", clock.starts[bOn] >= 500, String(clock.starts[bOn]));
}

console.log("== 时钟不变量 ==");
{
	const F = [
		mk({ "f3-s2": { c: T[0], b: 0 } }),
		mk({ "f3-s2": "off", "f4-s2": { c: T[1], b: 1 } }),
		mk({ "f3-s2": "off", "f4-s2": { c: T[1], b: 1 }, "f6-s2": { c: T[2], b: 2 } }),
	];
	F[2].preSlides = [{ from: "f1-s2", to: "f4-s2" }];
	const r = run(F, [
		{ technique: null, pairs: [{ from: "f3-s2", to: "f4-s2", technique: "sl" }] },
		{ technique: null, pairs: [] },
	]);
	const clock = stateClock(r.states, 300, 200);
	A("starts 严格单调不减", clock.starts.every((v, i) => i === 0 || v >= clock.starts[i - 1]));
	A("total ≥ 最后起点", clock.total >= clock.starts[clock.starts.length - 1]);
	A("frameOf 覆盖全部状态", r.frameOf.length === r.states.length && r.frameOf.every(f => f >= 0 && f < F.length));
	A("fx 轨道数 = 技法数", r.fx.length === 2, String(r.fx.length));
}

console.log(fail === 0 ? `===== 冒烟全部通过（${n} 项）=====` : `===== ${fail}/${n} 项失败 =====`);
process.exit(fail ? 1 : 0);
