import { UiSelect } from "./UiSelect";

const PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// 调选择器（全应用唯一实现，别处复用本组件）：
//   [1 = B ▾] 主音 12 音下拉（♭/♯ 在列表里自然存在，不需另设半音钮——保留 ♭/♯ 是为了快速步进）
//   [大调/小调] 单按钮：显示当前调式，点击即切换
//   [♭] [♯] 相对降/升半音
//   [×] 清除转调标记（回原调/跟随前段）——仅 marked 时显示
// props:
//   root / minor          当前生效调（小节标记优先，否则全局调——由调用方算好传入）
//   marked                是否带转调标记（true 才显示 ×）
//   onChange(root, minor) 任意改动（选主音/切调式/步进半音）——注意：转回原调也是 onChange，
//                         调用方据此写入"等于原调的标记"来结束转调段；× 才是"清除标记"
//   onClear()             清除标记
//   disabled
export function KeyPicker({ root, minor, marked, onChange, onClear, disabled, title }) {
	return (
		<span className="cc-key-stepper" role="group" aria-label={title}>
			<UiSelect value={root} disabled={disabled} menuClassName="ui-grid" className="cc-key-root" menuAbsolute
				options={PC.map((k, pc) => ({ value: pc, label: k }))}
				title="主音：点开选 12 个音"
				onChange={pc => onChange(pc, minor)}>
				<span className="cc-key-root-txt">1 =</span><b>{PC[root] ?? "C"}{minor ? "m" : ""}</b><i className="ui-select-arrow">▾</i>
			</UiSelect>
			<button type="button" className={`cc-key-mode${minor ? " minor" : ""}`} disabled={disabled}
				title="点击在大调/小调之间切换" onClick={() => onChange(root, !minor)}>
				{minor ? "小调" : "大调"}
			</button>
			<button type="button" disabled={disabled} title="降半音（降调）" onClick={() => onChange((root + 11) % 12, minor)}>♭</button>
			<button type="button" disabled={disabled} title="升半音（升调）" onClick={() => onChange((root + 1) % 12, minor)}>♯</button>
			{marked && onClear ? (
				<button type="button" className="cc-key-clear" title="清除转调（跟随前段/回原调）" onClick={onClear}>×</button>
			) : null}
		</span>
	);
}
