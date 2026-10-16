import React, { useState } from "react";
import { formatName } from "../utils/chordLib";

// 质量按钮 —— 8pu 同款同序：M m 7 6 M7 m7 9（其余收进 ⋯）
const QUALITIES_MAIN = [
	{ q: "", label: "M" },
	{ q: "m", label: "m" },
	{ q: "7", label: "7" },
	{ q: "6", label: "6" },
	{ q: "maj7", label: "M7" },
	{ q: "m7", label: "m7" },
	{ q: "9", label: "9" }
];
const QUALITIES_MORE = [
	{ q: "sus4", label: "sus4" },
	{ q: "sus2", label: "sus2" },
	{ q: "add9", label: "add9" },
	{ q: "m6", label: "m6" },
	{ q: "dim", label: "dim" },
	{ q: "aug", label: "aug" }
];
const ACCS = [
	{ v: 0, label: "♮" },
	{ v: 1, label: "♯" },
	{ v: -1, label: "♭" }
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
export function ChordPopup({ song, viewKey, unit, typedHint, canSplit, onPatchUnit, onSetKind, onToggleSplit, onClose, t, tab: tabProp, onTab, hasAttach, onAttach, defaultQuality }) {
	const ts = t?.chords ?? {};
	const [tabLocal, setTabLocal] = useState("chord");
	const tab = tabProp ?? tabLocal;
	const setTab = onTab ?? setTabLocal; // 受控（C/B/R 快捷键切页签），否则自治
	const [showMore, setShowMore] = useState(false);
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
				<button onClick={onClose} title={ts.closePanel ?? "收起（Esc）"} className="cc-cp-back"><span>⌫</span></button>
			</div>

			{tab === "chord" ? (
				<>
					{/* 数字 1-7（每格下带当前调音名） */}
					<div className="cc-cp-degrees">
						{[1, 2, 3, 4, 5, 6, 7].map(d => {
							const demo = { degree: d, acc: 0, quality: "", bass: null };
							const on = hasChord && chord.degree === d;
							return (
								<button key={d} className={`cc-cp-deg ${on ? "on" : ""}`} onClick={() => setChord({ degree: d, acc: 0, quality: defaultQuality ? defaultQuality(d) : "", bass: null })}>
									<span>{d}</span>
									<small>{formatName(demo, key)}</small>
								</button>
							);
						})}
					</div>

					{/* 质量：M m 7 6 M7 m7 9 + ⋯ 更多 */}
					<div className="cc-cp-quals">
						{QUALITIES_MAIN.map(({ q, label }) => (
							<button key={q || "M"} className={hasChord && (chord.quality || "") === q ? "on" : ""} disabled={!hasChord}
								onClick={() => setChord({ quality: q })}>{label}</button>
						))}
						<button className={`cc-cp-morebtn ${showMore ? "on" : ""}`} onClick={() => setShowMore(v => !v)} title={ts.more ?? "更多"}>⋯</button>
					</div>
					{showMore ? (
						<div className="cc-cp-quals">
							{QUALITIES_MORE.map(({ q, label }) => (
								<button key={q} className={hasChord && (chord.quality || "") === q ? "on" : ""} disabled={!hasChord}
									onClick={() => setChord({ quality: q })}>{label}</button>
							))}
						</div>
					) : null}

					{/* 变音 ♮♯♭（独立一行，8pu 同款） */}
					<div className="cc-cp-accrow">
						{ACCS.map(({ v, label }) => (
							<button key={v} className={hasChord && (chord.acc || 0) === v ? "on" : ""} disabled={!hasChord}
								onClick={() => setChord({ acc: v })}>{label}</button>
						))}
						{typedHint ? <span className="cc-cp-typing">{typedHint}_</span> : null}
						{!hasChord && !typedHint ? <span className="cc-cp-hint">{ts.emptySlot ?? "按 1-7 或点上方数字"}</span> : null}
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

			{/* 底部页签：和弦(C) / 低音(B) / 节奏型(R) —— 8pu 同款 */}
			<div className="cc-cp-tabs">
					{onAttach ? (
						<button className={`cc-cp-attach ${hasAttach ? "has" : ""}`} disabled={!hasChord}
							title={hasAttach ? (ts.attachViewTip ?? "查看/更换该和弦的指法图") : (ts.attachTip ?? "给该和弦配一张指法图（静态/动图）")}
							onClick={onAttach}>🖼{hasAttach ? "✓" : ""}</button>
					) : null}
				<button className={tab === "chord" ? "on" : ""} onClick={() => setTab("chord")}>{ts.tabChord ?? "和弦"} <kbd>C</kbd></button>
				<button className={tab === "bass" ? "on" : ""} onClick={() => setTab("bass")}>{ts.bassLabel ?? "低音"} <kbd>B</kbd></button>
				<button className={tab === "rhythm" ? "on" : ""} onClick={() => setTab("rhythm")}>{ts.rhythmLabel ?? "节奏型"} <kbd>R</kbd></button>
			</div>
		</div>
	);
}
