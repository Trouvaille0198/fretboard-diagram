// 拼接区纯逻辑冒烟：node scripts/smoke-stitch.mjs（无需浏览器）
// 覆盖：Y 向几何恒定 / 裁剪框（垂直截断含钳制）/ 拼接布局（从左到右 + 指板上下对齐 + 分割线）/ 存储往返 + 滚动备份 / 颜色透明度换算
import {
	loadStitch,
	persistStitch,
	newStitchId,
	stitchCropBox,
	stitchFrame,
	stitchLayout,
	stitchScale,
	withAlpha,
	unifySchemeOf,
	unifyStitchState,
} from "../src/utils/stitchModel.js";
import { tintAt } from "../src/colorConfig.js";
import { boardGeometry } from "../src/utils/fretboardCalculations.js";
import { CONSTS } from "../src/constants.js";

// node 无 localStorage：装一个内存版
const store = new Map();
globalThis.localStorage = {
	getItem: (k) => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => store.set(k, String(v)),
	removeItem: (k) => store.delete(k),
};

let fail = 0, n = 0;
const A = (name, ok, detail) => {
	n++;
	console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok || !detail ? "" : "  [" + detail + "]"}`);
	if (!ok) fail++;
};
const closeTo = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const mkState = (startFret, endFret, colored = []) => ({
	startFret, endFret, enharmonic: 1, displayMode: "note", rootNote: null, visibility: "transparent",
	data: Object.fromEntries(colored.map((id) => [id, { type: "note", color: "blue", visibility: "visible" }])),
});
const stringY = (j) => CONSTS.offsetY + CONSTS.stringSpacing * j; // 指板上第 j 弦的纵坐标（恒定）

console.log("拼接区 stitchModel 冒烟");

// 1. Y 向几何恒定：不同品窗的整板框 y/h 完全一致（拼接对齐的前提）
{
	const gs = [boardGeometry(0, 4), boardGeometry(3, 7), boardGeometry(5, 12)];
	const ok = gs.every((g) => g.svgViewBoxY === gs[0].svgViewBoxY && g.svgViewBoxHeight === gs[0].svgViewBoxHeight);
	A("Y 向几何恒定（跨品窗）", ok);
}

// 2. 裁剪框
{
	const geo = boardGeometry(0, 4);
	const full = { x: geo.svgViewBoxX, y: geo.svgViewBoxY, w: geo.svgViewBoxWidth, h: geo.svgViewBoxHeight };
	A("无截断开关 → 不裁剪", stitchCropBox(mkState(0, 4), { horizontalCrop: false, verticalCrop: false }, full) === null);
	A("空板 + 截断开 → null", stitchCropBox(mkState(0, 4, []), { horizontalCrop: true, verticalCrop: true }, full) === null);

	// 垂直截断：只亮 2/3 弦 → 裁掉上下留白，剩余部分 y 偏移在整框内
	const st = mkState(0, 4, ["f1-s2", "f2-s3"]);
	const box = stitchCropBox(st, { horizontalCrop: false, verticalCrop: true, includeMarkers: true }, full);
	const okBox = box && box.y > full.y && box.y + box.h < full.y + full.h && closeTo(box.x, full.x) && closeTo(box.w, full.w);
	A("垂直截断：上下留白裁掉，左右不动", okBox, JSON.stringify(box));

	// 品数标尺关：pad 收窄 → 框更紧（更小）
	const boxNoMk = stitchCropBox(st, { horizontalCrop: false, verticalCrop: true, includeMarkers: false }, full);
	A("垂直截断：关品数标尺 → pad 更小（框更紧）", boxNoMk && boxNoMk.h < box.h, `${box?.h} → ${boxNoMk?.h}`);

	// 极端：音贴边 → 钳制在整框内
	const stEdge = mkState(0, 4, ["f1-s0", "f2-s5"]);
	const boxEdge = stitchCropBox(stEdge, { horizontalCrop: true, verticalCrop: true }, full);
	const inFull = boxEdge.x >= full.x - 1e-6 && boxEdge.y >= full.y - 1e-6
		&& boxEdge.x + boxEdge.w <= full.x + full.w + 1e-6 && boxEdge.y + boxEdge.h <= full.y + full.h + 1e-6;
	A("截断框始终钳制在整框内", inFull, JSON.stringify(boxEdge));
}

// 3. 拼接布局：三张（不同品窗 + 一张垂直截断）
{
	const items = [
		{ id: "a", state: mkState(0, 4, ["f1-s1", "f2-s2"]), opts: { horizontalCrop: false, verticalCrop: false, includeMarkers: true, showNotes: true } },
		{ id: "b", state: mkState(4, 8, ["f5-s2", "f6-s3"]), opts: { horizontalCrop: true, verticalCrop: true, includeMarkers: true, showNotes: true } },
		{ id: "c", state: mkState(8, 12, ["f9-s0"]), opts: { horizontalCrop: false, verticalCrop: false, includeMarkers: true, showNotes: true } },
	];
	const L = stitchLayout(items, { gap: 26 });

	A("段数齐", L.segs.length === 3 && L.dividers.length === 2);
	const xOrdered = L.segs[0].x === 0 && L.segs[1].x > L.segs[0].x + L.segs[0].w - 1e-6 && L.segs[2].x > L.segs[1].x + L.segs[1].w - 1e-6;
	A("从左到右按加入顺序排布", xOrdered, L.segs.map((s) => s.x.toFixed(1)).join(","));
	const widthOk = closeTo(L.w, L.segs.reduce((s, g) => s + g.w, 0) + 2 * L.gap);
	A("总宽 = Σ段宽 + 段间留白", widthOk, `${L.w}`);

	// 核心不变量：任意段里第 j 弦落到画布上的 y 坐标处处相等（真·指板对齐）
	const canvasStringY = (seg, j) => seg.y + (stringY(j) - seg.vb.y);
	let alignOk = true, alignDetail = "";
	for (let j = 0; j < CONSTS.numStrings; j++) {
		const ys = L.segs.map((s) => canvasStringY(s, j));
		if (!ys.every((y) => closeTo(y, ys[0], 0.01))) { alignOk = false; alignDetail = `弦${j}: ${ys.map((y) => y.toFixed(2)).join(",")}`; break; }
	}
	A("指板上下对齐（截断段按位置归位）", alignOk, alignDetail);

	// 垂直截断段（b）确实比整框矮，且 y>0（内容整体靠下时上移量正确）
	const segB = L.segs[1];
	A("垂直截断段：窗口变矮且带正偏移", segB.h < L.segs[0].h && segB.y > 0, `h=${segB.h.toFixed(1)} y=${segB.y.toFixed(1)}`);

	// 分割线位于留白中央
	const divOk = L.dividers.every((dx, i) => closeTo(dx, L.segs[i].x + L.segs[i].w + L.gap / 2));
	A("分割线位于段间留白中央", divOk);
	A("单段无分割线", stitchLayout([items[0]]).dividers.length === 0);
	A("空列表零尺寸", (() => { const e = stitchLayout([]); return e.w === 0 && e.segs.length === 0; })());

	// 分辨率：钳制范围内
	const k = stitchScale(L);
	A("输出分辨率在安全范围", k > 0 && k <= 2.5, `k=${k.toFixed(2)}`);
	const kWide = stitchScale({ w: 99999, h: 412 });
	A("超宽拼接自动降分辨率", kWide <= 2.5 && 99999 * kWide <= 8192 + 1, `k=${kWide}`);
}

// 4. 存储往返 + 滚动备份
{
	store.clear();
	const a = { id: newStitchId(), createdAt: 1, state: mkState(0, 4, ["f1-s1"]), opts: { horizontalCrop: false, verticalCrop: false } };
	const b = { id: newStitchId(), createdAt: 2, state: mkState(4, 8, ["f5-s1"]), opts: { horizontalCrop: true, verticalCrop: true, includeMarkers: false, showNotes: false } };
	persistStitch([a]);
	persistStitch([a, b]);
	const loaded = loadStitch();
	A("存储往返：条目数与内容一致", loaded.length === 2 && loaded[1].id === b.id && loaded[1].opts.includeMarkers === false && loaded[1].state.data["f5-s1"].visibility === "visible");
	const bak1 = JSON.parse(store.get("fretboard-stitch-bak-1"));
	A("滚动备份 bak-1 = 上一版内容", Array.isArray(bak1) && bak1.length === 1 && bak1[0].id === a.id);
	persistStitch([]);
	A("清空后可读回空数组", loadStitch().length === 0);
	store.set("fretboard-stitch", "not-json{{{");
	A("坏数据容错（回落空表）", Array.isArray(loadStitch()) && loadStitch().length === 0);
}

// 5. 颜色透明度换算
{
	A("withAlpha：#hex", withAlpha("#dfe7ee", 0.5) === "rgba(223, 231, 238, 0.5)");
	A("withAlpha：rgb()", withAlpha("rgb(10, 20, 30)", 0.25) === "rgba(10, 20, 30, 0.25)");
	A("withAlpha：不认识的格式原样返回", withAlpha("var(--x)", 0.5) === "var(--x)");
}

// 6. 统一色系（仅拼接渲染）：判定 + 重涂
{
	const item = (lit) => ({ id: "x", state: mkState(0, 4, Object.keys(lit)), opts: {} });
	// 用真实 data 结构构造
	const mkIt = (entries) => ({
		id: "x",
		state: { startFret: 0, endFret: 4, enharmonic: 1, displayMode: "note", rootNote: null, visibility: "transparent", data: entries },
		opts: {},
	});
	const note = (name, custom) => ({ type: "note", color: { name, custom }, color2: null, visibility: "visible" });
	A("统一色系：单色系第一张 → 有效", unifySchemeOf([mkIt({ a: note("navy", "#111"), b: note("navy", "#222") })]) === "navy");
	A("统一色系：多色系 → null", unifySchemeOf([mkIt({ a: note("navy", "#111"), b: note("crimson", "#222") })]) === null);
	A("统一色系：全透明/白 → null", unifySchemeOf([mkIt({ a: { type: "note", color: "trans", color2: null, visibility: "visible" }, b: { type: "note", color: "white", color2: null, visibility: "transparent" } })]) === null);
	A("统一色系：透明色不算色系色", unifySchemeOf([mkIt({ a: note("navy", "#111"), t: { type: "note", color: "trans", color2: null, visibility: "visible" } })]) === "navy");
	A("统一色系：空列表 → null", unifySchemeOf([]) === null);

	const items = [
		mkIt({ a: note("navy", "旧1"), t: { type: "note", color: "trans", color2: null, visibility: "visible" } }),
		mkIt({ b: note("crimson", "旧2"), w: { type: "note", color: "white", color2: null, visibility: "transparent" } }),
		mkIt({ c: note("green", "旧3") }),
	];
	const s0 = unifyStitchState(items, 0), s1 = unifyStitchState(items, 1), s2 = unifyStitchState(items, 2);
	A("重涂：第 0 张 = 色系最浅档", s0.data.a.color.name === "navy" && s0.data.a.color.custom === tintAt("navy", 0), JSON.stringify(s0.data.a.color));
	A("重涂：第 1 张 = 中间档(线性)", s1.data.b.color.custom === tintAt("navy", 0.5) && s1.data.b.color.name === "navy");
	A("重涂：第 2 张 = 最深档", s2.data.c.color.custom === tintAt("navy", 1));
	A("重涂：透明音不动", s0.data.t.color === "trans");
	A("重涂：白色不动", s1.data.w.color === "white");
	A("重涂：其他色系名也统一为第一张的色系", s1.data.b.color.name === "navy" && s2.data.c.color.name === "navy");
	A("重涂：不改写条目快照", items[0].state.data.a.color.custom === "旧1");
	const bad = [mkIt({ a: note("navy", "#111"), b: note("crimson", "#222") })];
	A("重涂：多色系时原样返回", unifyStitchState(bad, 0) === bad[0].state);
	const one = [mkIt({ a: note("navy", "#111") })];
	A("重涂：单张 = 最浅档", unifyStitchState(one, 0).data.a.color.custom === tintAt("navy", 0));
}

// 7. stitchFrame：full/vb 关系
{
	const it = { state: mkState(0, 4, ["f1-s1"]), opts: { horizontalCrop: false, verticalCrop: false } };
	const f = stitchFrame(it);
	A("不截断时 vb = full", f.vb === f.full);
	const it2 = { state: mkState(0, 4, ["f1-s1", "f3-s4"]), opts: { horizontalCrop: true, verticalCrop: true } };
	const f2 = stitchFrame(it2);
	A("截断时 vb 在 full 内且更小", f2.vb.w <= f2.full.w && f2.vb.h <= f2.full.h && f2.vb.x >= f2.full.x && f2.vb.y >= f2.full.y);
}

console.log(`\n${fail ? `✗ ${fail}/${n} 项失败` : `全部 ${n} 项通过`}`);
process.exit(fail ? 1 : 0);
