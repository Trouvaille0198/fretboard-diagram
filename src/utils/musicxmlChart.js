// 和弦谱 ⇄ MusicXML（与 8pu / MuseScore 等互通；导入忽略旋律声部只取和声骨架）
// 无依赖：导出拼 XML 字符串；导入用轻量标签扫描器（覆盖 MusicXML 常规子集）

import {
	formatName, chordFromNameToken, KIND_TO_QUALITY, QUALITY_TO_KIND, resolvedQuality
} from "./chordLib.js";
import { createMeasure, createSong } from "./chordChartModel.js";

const PC_TO_FIFTHS_MAJOR = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: 7, 5: -1, 10: -2, 3: -3, 8: -4 };
const FIFTHS_TO_PC_MAJOR = Object.fromEntries(Object.entries(PC_TO_FIFTHS_MAJOR).map(([pc, f]) => [f, Number(pc)]));

// 歌词/段落里的 XML 特殊字符
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ============ 导出 ============

// 和弦 → <harmony> 内容（root/kind/bass；词表外 quality 用 kind="other" + text；半拍和声带 offset）
function harmonyXml(chord, key) {
	if (!chord) return "";
	const name = formatName(chord, key);
	const m = /^([A-G])([#b]?)(.*)$/.exec(name) || [null, "C", "", ""];
	const step = m[1];
	const alter = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
	const quality = resolvedQuality(chord, key);
	const kind = QUALITY_TO_KIND[quality] || "other";
	const kindText = QUALITY_TO_KIND[quality] ? "" : ` text="${esc(quality)}"`;
	let xml = `      <harmony print-frame="no">\n        <root>\n          <root-step>${step}</root-step>\n`;
	if (alter) xml += `          <root-alter>${alter}</root-alter>\n`;
	xml += `        </root>\n        <kind${kindText}>${kind}</kind>\n`;
	if (chord.bass) {
		const bassName = formatName({ ...chord, quality: "" }, key).split("/")[1] || "";
		const bm = /^([A-G])([#b]?)$/.exec(bassName);
		if (bm) {
			xml += `        <bass>\n          <bass-step>${bm[1]}</bass-step>\n`;
			const bAlter = bm[2] === "#" ? 1 : bm[2] === "b" ? -1 : 0;
			if (bAlter) xml += `          <bass-alter>${bAlter}</bass-alter>\n`;
			xml += `        </bass>\n`;
		}
	}
	// 变化音（b9/#9/b11/#11/b13/#13）→ MusicXML degree（可叠加，7b9b13 原样表达）
	for (const tok of chord.alt || []) {
		const d = ALT_TO_DEGREE[tok];
		if (!d) continue;
		xml += `        <degree><degree-value>${d[0]}</degree-value><degree-alter>${d[1]}</degree-alter><degree-type>add</degree-type></degree>\n`;
	}
	xml += `      </harmony>\n`;
	return xml;
}

// 变化音记号 → MusicXML degree（度数, 变化量）
const ALT_TO_DEGREE = { b5: [5, -1], "#5": [5, 1], b9: [9, -1], "9": [9, 0], "#9": [9, 1], b11: [11, -1], "11": [11, 0], "#11": [11, 1], b13: [13, -1], "13": [13, 0], "#13": [13, 1] };
const DEGREE_TO_ALT = Object.fromEntries(Object.entries(ALT_TO_DEGREE).map(([k, v]) => [v.join(":"), k]));

const BARLINE_XML = {
	single: null,
	double: `      <barline location="right"><bar-style>light-light</bar-style></barline>\n`,
	repeatEnd: `      <barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>\n`,
	final: `      <barline location="right"><bar-style>light-heavy</bar-style></barline>\n`
};

export function exportMusicXml(song, keyAtFn) {
	// keyAtFn：按小节取生效调（谱中转调 + 全局移调都会体现在导出的调号与和弦音名上）
	const keyOf = typeof keyAtFn === "function" ? keyAtFn : (() => song.key || { root: 0, minor: false });
	const keyXml = (k) => `<key><fifths>${PC_TO_FIFTHS_MAJOR[k.minor ? (k.root + 3) % 12 : k.root] ?? 0}</fifths><mode>${k.minor ? "minor" : "major"}</mode></key>`;
	let out = `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0">\n`;
	out += `  <work><work-title>${esc(song.name)}</work-title></work>\n`;
	out += `  <part-list><score-part id="P1"><part-name>Chord Chart</part-name></score-part></part-list>\n  <part id="P1">\n`;
	let lastKey = null;
	(song.measures || []).forEach((m, i) => {
		const key = keyOf(i);
		out += `    <measure number="${i + 1}">\n`;
		const keyChanged = !lastKey || key.root !== lastKey.root || !!key.minor !== !!lastKey.minor;
		if (i === 0) {
			out += `      <attributes>\n        <divisions>2</divisions>\n        ${keyXml(key)}\n`;
			out += `        <time><beats>${song.timeSig}</beats><beat-type>4</beat-type></time>\n      </attributes>\n`;
			out += `      <sound tempo="${song.bpm || 72}"/>\n`;
		} else if (keyChanged) {
			out += `      <attributes>\n        ${keyXml(key)}\n      </attributes>\n`;
		}
		lastKey = key;
		if (m.repeatStart) out += `      <barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>\n`;
		if (m.section) out += `      <direction placement="above"><direction-type><words>${esc(m.section)}</words></direction-type></direction>\n`;
		if (m.house) out += `      <direction placement="above"><direction-type><words>${m.house}.</words></direction-type></direction>\n`;
		if (m.lyrics) out += `      <direction placement="below"><direction-type><words>${esc(m.lyrics)}</words></direction-type></direction>\n`;
		(m.slots || []).forEach(slot => {
			const units = slot.split ? slot.split : [slot];
			units.forEach((u, h) => {
				if (u.kind === "chord" && u.chord) {
					out += harmonyXml(u.chord, key);
				}
				// 每单元一个对应时值的隐形休止符撑住节拍
				const dur = slot.split ? 1 : 2;
				out += `      <note><rest/><duration>${dur}</duration><type>${slot.split ? "eighth" : "quarter"}</type></note>\n`;
			});
		});
		out += BARLINE_XML[m.endBar] || "";
		out += `    </measure>\n`;
	});
	out += `  </part>\n</score-partwise>\n`;
	return out;
}

// ============ 导入 ============

// 轻量 XML 扫描器：{ tag, children:[], text } 树（覆盖常规 MusicXML；容错：坏标签跳过）
export function parseXml(text) {
	const src = String(text || "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[\s\S]*?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
	const root = { tag: "#root", children: [], text: "" };
	const stack = [root];
	const re = /<\/?([A-Za-z-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
	let m;
	while ((m = re.exec(src))) {
		if (m[4] !== undefined) {
			stack[stack.length - 1].text += m[4];
			continue;
		}
		const [, tag, attrsRaw, selfClose] = m;
		if (m[0][1] === "/") {
			// 闭合：弹到匹配层（容错未闭合）
			for (let k = stack.length - 1; k > 0; k--) {
				if (stack[k].tag === tag) { stack.length = k; break; }
			}
			continue;
		}
		const attrs = {};
		(attrsRaw || "").replace(/([\w:-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; });
		const node = { tag, attrs, children: [], text: "" };
		stack[stack.length - 1].children.push(node);
		if (!selfClose) stack.push(node);
	}
	return root;
}

const kids = (n, tag) => (n ? n.children.filter(c => c.tag === tag) : []);
const kid = (n, tag) => (n ? kids(n, tag)[0] : undefined);
const num = (v, d) => (v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);

const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function harmonyToChord(h, key) {
	const rootStep = kid(kid(h, "root"), "root-step");
	if (!rootStep) return null;
	const rootAlter = kid(kid(h, "root"), "root-alter");
	const kindNode = kid(h, "kind");
	const kind = (kindNode && kindNode.text.trim()) || "major";
	let quality = KIND_TO_QUALITY[kind] ?? "";
	if (kind === "other" && kindNode && kindNode.attrs && kindNode.attrs.text) {
		quality = kindNode.attrs.text;
	}
	let token = rootStep.text.trim() + ((rootAlter && num(rootAlter.text, 0)) > 0 ? "#" : (rootAlter && num(rootAlter.text, 0)) < 0 ? "b" : "");
	if (quality) token += quality;
	const bassStep = kid(kid(h, "bass"), "bass-step");
	if (bassStep) {
		const bassAlter = kid(kid(h, "bass"), "bass-alter");
		token += "/" + bassStep.text.trim() + ((bassAlter && num(bassAlter.text, 0)) > 0 ? "#" : (bassAlter && num(bassAlter.text, 0)) < 0 ? "b" : "");
	}
	const chord = chordFromNameToken(token, key);
	if (chord) {
		// 变化音 degree → alt（只认 9/11/13 的升降；其余 degree 忽略）
		const alts = [];
		for (const deg of kids(h, "degree")) {
			const val = num(kid(deg, "degree-value") && kid(deg, "degree-value").text, 0);
			const alter = num(kid(deg, "degree-alter") && kid(deg, "degree-alter").text, 0);
			const tok = DEGREE_TO_ALT[`${val}:${alter}`];
			if (tok && !alts.includes(tok)) alts.push(tok);
		}
		if (alts.length) chord.alt = alts;
	}
	return chord;
}

// MusicXML 文本 → song（null=解析不出和弦骨架）
export function importMusicXml(text, fallbackName = "导入谱") {
	const root = parseXml(text);
	const part = kid(root, "score-partwise") || root;
	const measures = kids(kid(part, "part") || part, "measure");
	if (!measures.length) return null;

	const song = createSong(fallbackName);
	let key = { root: 0, minor: false };
	let divisions = 2;

	// 调号/拍号/时值单位：找第一个带 attributes 的 measure
	for (const m of measures) {
		const attrs = kid(m, "attributes");
		if (!attrs) continue;
		divisions = Math.max(1, num(kid(attrs, "divisions") && kid(attrs, "divisions").text, 2));
		const keyNode = kid(attrs, "key");
		if (keyNode) {
			const fifths = num(kid(keyNode, "fifths") && kid(keyNode, "fifths").text, 0);
			const mode = (kid(keyNode, "mode") && kid(keyNode, "mode").text.trim()) || "major";
			let pc = FIFTHS_TO_PC_MAJOR[fifths] ?? 0;
			if (mode === "minor") pc = (pc - 3 + 12) % 12;
			key = { root: pc, minor: mode === "minor" };
		}
		const timeNode = kid(attrs, "time");
		if (timeNode) song.timeSig = Math.max(2, Math.min(6, num(kid(timeNode, "beats") && kid(timeNode, "beats").text, 4)));
		break;
	}
	const tempoNode = measures.flatMap(m => kids(m, "sound"))[0];
	if (tempoNode && tempoNode.attrs && tempoNode.attrs.tempo) song.bpm = Math.max(30, Math.min(240, Math.round(Number(tempoNode.attrs.tempo) || 72)));
	const titleNode = kid(kid(root, "work") || kid(part, "work"), "work-title");
	if (titleNode && titleNode.text.trim()) song.name = titleNode.text.trim();

	song.key = key;
	song.measures = [];

	measures.forEach((m) => {
		const measure = createMeasure(song.timeSig);
		// 谱中转调：小节带新 <key> → 该小节起记 keyRoot/keyMinor，后续和弦按新调落级数
		const attrs2 = kid(m, "attributes");
		const keyNode2 = attrs2 && kid(attrs2, "key");
		if (keyNode2) {
			const fifths2 = num(kid(keyNode2, "fifths") && kid(keyNode2, "fifths").text, 0);
			const mode2 = (kid(keyNode2, "mode") && kid(keyNode2, "mode").text.trim()) || "major";
			let pc2 = FIFTHS_TO_PC_MAJOR[fifths2] ?? 0;
			if (mode2 === "minor") pc2 = (pc2 - 3 + 12) % 12;
			if (pc2 !== key.root || (mode2 === "minor") !== key.minor) {
				key = { root: pc2, minor: mode2 === "minor" };
				measure.keyRoot = key.root;
				measure.keyMinor = key.minor;
			}
		}
		// 小节线
		kids(m, "barline").forEach(b => {
			const loc = (b.attrs && b.attrs.location) || "right";
			const repeat = kid(b, "repeat");
			const dirAttr = repeat && repeat.attrs && repeat.attrs.direction;
			if (loc === "left" && dirAttr === "forward") measure.repeatStart = true;
			if (loc === "right") {
				if (dirAttr === "backward") measure.endBar = "repeatEnd";
				else {
					const style = kid(b, "bar-style");
					if (style && /light-heavy|heavy-heavy/.test(style.text)) measure.endBar = "final";
					else if (style && /light-light/.test(style.text)) measure.endBar = "double";
				}
			}
		});
		// 方向词：段落/房子/歌词
		kids(m, "direction").forEach(d => {
			const words = kid(kid(d, "direction-type"), "words");
			if (!words) return;
			const w = words.text.trim();
			const placement = (d.attrs && d.attrs.placement) || "above";
			const houseMatch = /^([12])\.$/.exec(w);
			if (houseMatch) measure.house = Number(houseMatch[1]);
			else if (placement === "below" && !measure.lyrics) measure.lyrics = w;
			else if (!measure.section) measure.section = w;
		});
		// 和声骨架：按音符时值推算落点（divisions 为一拍的时值单位）
		let pos = 0;
		m.children.forEach(c => {
			if (c.tag === "harmony") {
				const chord = harmonyToChord(c, key);
				const offsetNode = kid(c, "offset");
				const offsetBeats = offsetNode ? num(offsetNode.text, 0) / divisions : 0;
				const at = pos + (offsetBeats > 0.25 ? offsetBeats : 0);
				const si = Math.floor(at);
				if (chord && si >= 0 && si < song.timeSig) {
					const slot = measure.slots[si] || (measure.slots[si] = { kind: "empty" });
					if (at % 1 !== 0) {
						slot.split = [
							slot.kind === "chord" ? { ...slot } : { kind: "empty" },
							{ kind: "chord", chord }
						];
						slot.kind = "chord";
					} else if (slot.split) {
						slot.split[0] = { kind: "chord", chord };
					} else {
						slot.kind = "chord";
						slot.chord = chord;
					}
				}
			} else if (c.tag === "note") {
				const dur = num(kid(c, "duration") && kid(c, "duration").text, divisions);
				pos += dur / divisions;
			}
		});
		song.measures.push(measure);
	});

	if (!song.measures.length) return null;
	return song;
}
