import React from "react";
import { chordSignParts } from "../utils/chordLib";

// 8pu 式记号：级数数字装圆角框，质量后缀/变化音/转位小字跟在框外——
// 级数和后面的数字视觉分离，57b9b13 一眼读成 [5]7 b9b13
export function ChordSign({ chord, display = "degree", viewKey, compact }) {
	const parts = chordSignParts(chord, display, viewKey);
	if (!parts) return null;
	// 后缀以数字开头（57 的 7、59 的 9）才上标到右上；字母开头（5m7 的 m7）不冲突，正常大小写
	const sup = /^[0-9]/.test(parts.suffix);
	const cls = `csign ${sup ? "csign-sup" : ""} ${compact ? "csign-sm" : ""}`;
	if (parts.flat) return <span className={cls}><span className="csign-flat">{parts.flat}</span></span>;
	// 后缀拆两段：前导数字（7/9）用大号；余下（b9 的 b、♯13 的 ♯、m、dim…）保持小字
	const m = /^([0-9]+)(.*)$/.exec(parts.suffix || "");
	return (
		<span className={cls}>
			<span className="csign-deg">{parts.degree}</span>
			{m ? (
				<span className="csign-sfx"><span className="csign-num">{m[1]}</span>{m[2] ? <span>{m[2]}</span> : null}</span>
			) : parts.suffix ? <span className="csign-sfx">{parts.suffix}</span> : null}
			{parts.bass ? <span className="csign-bass">{parts.bass}</span> : null}
		</span>
	);
}
