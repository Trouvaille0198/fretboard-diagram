// 核心动效不变量冒烟：四技法 × 场景矩阵，纯 Node 直跑（node scripts/smoke-core.mjs）
// 覆盖：状态序列 / B 颜色（帧位档·数据出生色）/ 半程前置亮 / 到达与回程时刻 /
//       fx 轨道对齐 / 瞬时目标音不提前亮 / 时钟单调性 / 多技法同帧并发同步
import { expandTimeline, stateClock, BEND_OUT, BEND_HOLD, BEND_BACK, BEND_TOTAL } from "../src/utils/timeline.js";
import { describeTransition, sampleTransition } from "../src/utils/transitionAnimator.js";

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
	return { data, startFret: 1, endFret: 13, visibility: "transparent", enharmonic: 0, ...(extra || {}) };
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
	A("sl B 抵达点亮（=移动音符到达时刻，fx 多停 100ms 盖板面渐入）", clock.starts[bOn] === fx.t0 + fx.dur - 100, `B@${clock.starts[bOn]} 到达@${fx.t0 + fx.dur - 100}`);
	A("sl A 出发即离场（窗开启态已灭，由移动音符本体表达）", vis(r.states[1], "f5-s2") === null, "窗开A=" + vis(r.states[1], "f5-s2"));
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
	A("pre B 到达才亮（窗开不显示）", (() => {
		const win = r.states.find(s => !vis(s, "f4-s2"));
		const tail = r.states[r.states.length - 1];
		return !!win && vis(tail, "f4-s2") === T[0];
	})());
	A("pre 无瞬态滑行音状态", r.states.every(s => !vis(s, "f1-s2")));
	const fx = r.fx[0];
	A("pre fx=DOT+100 overlap", fx.t0 === 360 && fx.dur === 400, `${fx.t0}/${fx.dur}`);
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

console.log("== bd 推弦 ==");
{
	// 3弦2品同款：f5-s2（3弦）→ f5-s3（4弦，同品邻弦，向下推）
	const r = run(
		[mk({ "f5-s2": { c: T[0], b: 0 } }), mk({ "f5-s2": { c: T[0], b: 0 } })],
		[{ technique: null, pairs: [{ from: "f5-s2", to: "f5-s3", technique: "bd" }] }]
	);
	const clock = stateClock(r.states, 300, 200);
	A("bd A 窗开熄灭（交给 fx 音符），TOTAL 时刻原色复亮", seq(r, "f5-s2") === "L-L", seq(r, "f5-s2"));
	A("bd A 复亮=原色", vis(r.states[r.states.length - 1], "f5-s2") === T[0]);
	A("bd 目标音 B 全程不亮", r.states.every(s => vis(s, "f5-s3") === null));
	const fx = r.fx[0];
	A("bd fx=BEND_TOTAL+100（尾部停 A 盖复亮渐入）", fx.spec.pairs[0].technique === "bd" && fx.dur === BEND_TOTAL + 100 && fx.dur === BEND_OUT + BEND_HOLD + BEND_BACK + 100, `${fx.dur}`);
	const relight = r.states.findIndex((s, i) => i > 1 && vis(s, "f5-s2") === T[0]);
	A("bd A 复亮与 fx 弹回同刻", clock.starts[relight] === fx.t0 + BEND_TOTAL, `复亮@${clock.starts[relight]} 回位@${fx.t0 + BEND_TOTAL}`);
	// 动画轨迹：弯弓（慢出）→ 搭箭（停在半程）→ 放箭（急回+微过冲）→ 尾驻 A
	const hint = r.states.filter((_, si) => r.frameOf[si] === 1).slice(-1)[0];
	const desc = describeTransition(hint, hint, fx.spec);
	const yOf = t => { const el = sampleTransition(desc, t, fx.dur).find(e => e.kind === "note"); return el ? el.y : null; };
	const A_Y = 30 + 60 * 2, AMP = 30; // s2 弦 y=150；推向 s3 半程=30px
	A("bd 出发在 A 原位", yOf(0) === A_Y, String(yOf(0)));
	A("bd 满弓停在半程（搭箭屏息）", yOf((BEND_OUT + BEND_HOLD / 2) / fx.dur) === A_Y + AMP, String(yOf((BEND_OUT + BEND_HOLD / 2) / fx.dur)));
	const yMid = yOf((BEND_OUT + BEND_HOLD + BEND_BACK * 0.5) / fx.dur);
	A("bd 放箭半程已弹回越过原位（急回+过冲）", yMid !== null && yMid < A_Y, String(yMid));
	A("bd 尾驻回到 A 原位", yOf(1) === A_Y, String(yOf(1)));
	A("bd 音符带音名标签", sampleTransition(desc, 0.3, fx.dur).some(e => e.kind === "label"));
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
