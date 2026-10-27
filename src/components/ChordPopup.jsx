import React, { useState } from "react";
import { formatName, ALT_ORDER } from "../utils/chordLib";
import { ChordSign } from "./ChordSign";

// 质量按钮：常用族在前，扩展族在后（一次全部平铺，17 种三行放得下）
// 质量按族分组，一行一族（标签列 + 7 列对齐网格）：三 / 七 / 九 / 挂留
const QUALITY_GROUPS = [
	{ key: "qTriad", items: [
		{ q: "", label: "M" }, { q: "m", label: "m" }, { q: "5", label: "5" }, { q: "dim", label: "dim" }, { q: "aug", label: "aug" }
	] },
	{ key: "qSeventh", items: [
		{ q: "7", label: "7" }, { q: "m7", label: "m7" }, { q: "maj7", label: "maj7" },
		{ q: "m7-5", label: "m7-5" }, { q: "dim7", label: "dim7" }, { q: "6", label: "6" }, { q: "m6", label: "m6" }
	] },
	{ key: "qNinth", items: [
		{ q: "9", label: "9" }, { q: "m9", label: "m9" }, { q: "maj9", label: "maj9" }, { q: "add9", label: "add9" }
	] },
	{ key: "qSus", items: [
		{ q: "sus4", label: "sus4" }, { q: "sus2", label: "sus2" }
	] }
];
const ACCS = [
	{ v: 0, label: "♮" },
	{ v: 1, label: "♯" },
	{ v: -1, label: "♭" }
];
// 变化音（extension alterations）：可叠加，如 5 7 b9 b13 → 57b9b13
// 变化音按音级分行（五音/九音/十一音/十三音 × 降/原/升），可跨行叠加
const ALT_ROWS = [
	{ key: "q5th", toks: [{ tok: "b5", label: "♭5" }, { tok: "#5", label: "♯5" }] },
	{ key: "q9th", toks: [{ tok: "b9", label: "♭9" }, { tok: "9", label: "9" }, { tok: "#9", label: "♯9" }] },
	{ key: "q11th", toks: [{ tok: "b11", label: "♭11" }, { tok: "11", label: "11" }, { tok: "#11", label: "♯11" }] },
	{ key: "q13th", toks: [{ tok: "b13", label: "♭13" }, { tok: "13", label: "13" }, { tok: "#13", label: "♯13" }] }
];
const RHYTHMS = [
	{ id: null, label: "默认（扫弦）" },
	{ id: "ballad", label: "分解" },
	{ id: "block", label: "柱式" },
	{ id: "waltz", label: "华尔兹" },
	{ id: "rock8", label: "摇滚" },
	{ id: "bossa", label: "波萨" },
	{ id: "rumba", label: "伦巴" },
	{ id: "slow", label: "慢魂" }
];

// 8pu 式就地和弦面板（结构原样照抄）：
// 顶部动作条（休止符/— 延音/⇄拆分/✕删/⌫收起）+ 数字格(带音名) + 质量行 + 变音行 + 底部页签(和弦C/低音B/节奏型R)
export function ChordPopup({ song, viewKey, unit, typedHint, canSplit, onPatchUnit, onSetKind, onToggleSplit, onClose, t, tab: tabProp, onTab, hasAttach, onAttach, defaultQuality, keyHere }) {
	const ts = t?.chords ?? {};
	const [tabLocal, setTabLocal] = useState("chord");
	const [keyRowOpen, setKeyRowOpen] = useState(false);
	const tab = tabProp ?? tabLocal;
	const setTab = onTab ?? setTabLocal; // 受控（C/B/R 快捷键切页签），否则自治
	const chord = unit && unit.kind === "chord" ? unit.chord : null;
	const key = viewKey || song.key;
	const hasChord = !!chord;

	const setChord = (patch) => onPatchUnit({ kind: "chord", chord: { ...(chord || { degree: 1, acc: 0, quality: "", bass: null }), ...patch } });

	return (
		<div className="cc-cp">
			{/* 顶部动作条（8pu 同款） */}
			<div className="cc-cp-menu">
				<button onClick={onToggleSplit} disabled={!canSplit} title={ts.splitHint ?? "拆分当前拍（Enter）"}><span>⇄</span></button>
				<button className="danger" onClick={() => onSetKind("empty")} disabled={!unit || unit.kind === "empty"} title={ts.clearHint ?? "删（⌫）"}><span>✕</span></button>
				{onAttach ? (
					<button className={`cc-cp-attach cc-cp-back ${hasAttach ? "has" : ""}`} disabled={!(hasChord || unit?.kind === "hold")}
						title={hasAttach ? (ts.attachViewTip ?? "查看/编辑该拍的黑点指法小图") : (ts.attachTip ?? "给该拍画一张黑点指法小图（可挑选形状/手捏/存形状库）")}
						onClick={onAttach}>{ts.attachTab ?? "指法图"}{hasAttach ? " ✓" : ""}</button>
				) : null}
				{keyHere ? (
					<button className={`cc-cp-keytoggle ${keyRowOpen ? "on" : ""}`}
						title={ts.keyChangeTip ?? "从该拍所在小节起转调（之后的拍全部跟随，直到下一个转调；调回全局调 = 清除标记）"}
						onClick={() => setKeyRowOpen(v => !v)}>{ts.keyChange ?? "转调"}</button>
				) : null}
				<button onClick={onClose} title={ts.closePanel ?? "收起（Esc）"}><span>{ts.collapse ?? "收起"}</span></button>
			</div>

			{/* 转调行：该拍起生效（写进谱面，谱上角标标注）；调与全局相同时自动清除 */
			keyHere && keyRowOpen ? <div className="cc-cp-keyrow">{keyHere}</div> : null}

			{tab === "chord" ? (
				<>
					{/* 数字 1-7（每格下带当前调音名） */}
					<div className="cc-cp-degrees">
						{[1, 2, 3, 4, 5, 6, 7].map(d => {
							const demo = { degree: d, acc: 0, quality: "", bass: null };
							const on = hasChord && chord.degree === d;
							return (
								<button key={d} className={`cc-cp-deg ${on ? "on" : ""}`} onClick={() => setChord({ degree: d, acc: 0, quality: defaultQuality ? defaultQuality(d) : "", bass: null, alt: undefined })}>
									<span>{d}</span>
									<small>{formatName(demo, key)}</small>
								</button>
							);
						})}
					</div>

					{/* 质量表：一行一族，全部平铺（标签列 + 7 列对齐） */}
					<div className="cc-cp-table">
						{QUALITY_GROUPS.map(g => (
							<div className="cc-cp-qgroup" key={g.key}>
								<span className="cc-cp-qlabel">{ts[g.key] ?? g.key}</span>
								{g.items.map(({ q, label }) => (
									<button key={q || "M"} className={`cc-cp-q ${hasChord && (chord.quality || "") === q ? "on" : ""}`} disabled={!hasChord}
										onClick={() => setChord({ quality: q })}>{label}</button>
								))}
							</div>
						))}

						{/* 变音级：改变级数本身的升降（b3/#4 这类） */}
						<div className="cc-cp-qgroup">
							<span className="cc-cp-qlabel">{ts.qAcc ?? "变音级"}</span>
							{ACCS.map(({ v, label }) => (
								<button key={v} className={`cc-cp-q ${hasChord && (chord.acc || 0) === v ? "on" : ""}`} disabled={!hasChord}
									onClick={() => setChord({ acc: v })}>{label}</button>
							))}
							<span className="cc-cp-hint">
								{typedHint ? <span className="cc-cp-typing">{typedHint}_</span>
									: !hasChord ? (ts.emptySlot ?? "按 1-7 或点上方数字")
									: null}
							</span>
						</div>
					{/* 变化音按音级分行：跨行叠加（九音 ♭9 + 十三音 ♭13 = 7♭9♭13）；点数字格换级数会重置 */}
					{ALT_ROWS.map(row => (
						<div className="cc-cp-qgroup" key={row.key}>
							<span className="cc-cp-qlabel">{ts[row.key] ?? row.key}</span>
							{row.toks.map(({ tok, label }) => (
								<button key={tok} className={`cc-cp-q ${hasChord && (chord.alt || []).includes(tok) ? "on" : ""}`} disabled={!hasChord}
									title={ts.altTip ?? "变化音可叠加，如 7♭9♭13；再点一次取消"}
									onClick={() => {
										const cur = chord.alt || [];
										const next = cur.includes(tok) ? cur.filter(x => x !== tok) : [...cur, tok];
										setChord({ alt: ALT_ORDER.filter(t => next.includes(t)) });
									}}>{label}</button>
							))}
							{row.key === "q13th" && hasChord && (chord.alt || []).length ? <span className="cc-cp-typing cc-cp-alive"><ChordSign chord={chord} display="degree" viewKey={key} /></span> : null}
						</div>
					))}
					</div>
				</>
			) : tab === "bass" ? (
				/* 低音（转位）：— /1-/7 */
				<div className="cc-cp-degrees">
					<button className={`cc-cp-deg slim ${!hasChord || !chord.bass ? "on" : ""}`} disabled={!hasChord}
						onClick={() => hasChord && setChord({ bass: null })}>
						<span>—</span><small>{ts.none ?? "无"}</small>
					</button>
					{[1, 2, 3, 4, 5, 6, 7].map(d => (
						<button key={d} className={`cc-cp-deg slim ${hasChord && chord.bass && chord.bass.degree === d ? "on" : ""}`} disabled={!hasChord}
							onClick={() => hasChord && setChord({ bass: { degree: d, acc: chord.bass && chord.bass.degree === d ? (chord.bass.acc || 0) : 0 } })}>
							<span>/{d}</span>
							<small>{formatName({ degree: d, acc: 0, quality: "", bass: null }, key)}</small>
						</button>
					))}
				</div>
			) : (
				/* 节奏型 */
				<div className="cc-cp-rhythms">
					{RHYTHMS.map(r => (
						<button key={r.id || "def"} className={(r.id ? unit?.rhythm === r.id : !unit?.rhythm) ? "on" : ""}
							onClick={() => onPatchUnit({ rhythm: r.id })}>{r.label}</button>
					))}
				</div>
			)}

			{/* 底部页签：和弦(C) / 低音(B) / 节奏型(R) —— 8pu 同款（指法图入口在顶部动作条"收起"旁） */}
			<div className="cc-cp-tabs">
				<button className={tab === "chord" ? "on" : ""} onClick={() => setTab("chord")}>{ts.tabChord ?? "和弦"} <kbd>C</kbd></button>
				<button className={tab === "bass" ? "on" : ""} title={ts.bassTip ?? "低音（转位）"} onClick={() => setTab("bass")}>{ts.bassLabel ?? "低音"} <kbd>B</kbd></button>
				<button className={tab === "rhythm" ? "on" : ""} onClick={() => setTab("rhythm")}>{ts.rhythmLabel ?? "节奏型"} <kbd>R</kbd></button>
			</div>
		</div>
	);
}
