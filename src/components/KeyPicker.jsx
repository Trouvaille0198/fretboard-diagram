import { UiSelect } from "./UiSelect";
import { KEY_LETTERS, keyLabelText } from "../utils/chordChartModel.js";

// 调选择器（全应用唯一实现）：
//   [1 = B♯ ▾] 下拉只列 7 个自然音 C D E F G A B——主音选"音名"
//   [♭] [♯]    给当前音加/去升降号（B +♯ = B♯，不跳到别的音名；升降号范围 -1~+1）
//   [大调/小调] 单按钮：显示当前调式，点击即切换
//   [×]        清除转调标记（回原调/跟随前段）——仅 marked 时显示
// props:
//   letter (0-6) / acc (-1|0|1) / minor   当前生效调的拼写（小节标记优先，否则全局调）
//   marked                                是否带转调标记（true 才显示 ×）
//   onChange(letter, acc, minor)          主音/升降号/调式任意变化；音高由调用方按 keyPcOf 换算
//   onClear()                             清除标记
export function KeyPicker({ letter, acc, minor, marked, onChange, onClear, disabled, title }) {
	const accI = acc || 0;
	const setAcc = (d) => onChange(letter, Math.max(-1, Math.min(1, accI + d)), minor);
	return (
		<span className="cc-key-stepper" role="group" aria-label={title}>
			<UiSelect value={letter} disabled={disabled} menuClassName="ui-grid" className="cc-key-root" menuAbsolute
				options={KEY_LETTERS.map((k, i) => ({ value: i, label: k }))}
				title="主音：C D E F G A B"
				onChange={li => onChange(li, accI, minor)}>
				<span className="cc-key-root-txt">1 =</span>
				<b>{KEY_LETTERS[letter] ?? "C"}{accI > 0 ? "♯" : accI < 0 ? "♭" : ""}</b>
				<i className="ui-select-arrow">▾</i>
			</UiSelect>
			<button type="button" className={`cc-key-mode${minor ? " minor" : ""}`} disabled={disabled}
				title="点击在大调/小调之间切换" onClick={() => onChange(letter, accI, !minor)}>
				{minor ? "小调" : "大调"}
			</button>
			<button type="button" disabled={disabled} title={accI <= -1 ? "已是降号" : "加降号（♭）"} onClick={() => setAcc(-1)}>♭</button>
			<button type="button" disabled={disabled} title={accI >= 1 ? "已是升号" : "加升号（♯）"} onClick={() => setAcc(1)}>♯</button>
			{marked && onClear ? (
				<button type="button" className="cc-key-clear" title="清除转调（跟随前段/回原调）" onClick={onClear}>×</button>
			) : null}
			<span className="cc-key-pc" hidden>{keyLabelText(letter, accI, minor)}</span>
		</span>
	);
}
