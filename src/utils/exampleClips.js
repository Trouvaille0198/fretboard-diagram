// 样式示例动图：每种技法/样式一张，一键载入指板堆供预览与续编学习
// 颜色约定与运行时一致：帧1底 = pale（浅），当前音 = vivid（强）

import { loadClips, persistClips } from './clipModel';
import { getLevel1FillColor, generateTintVariants } from '../colorConfig';
import { getT } from '../i18n/getT.js';
function tints(name) {
	return generateTintVariants(getLevel1FillColor(name));
}

function mkData(entries) {
	const data = {};
	entries.forEach(([id, color]) => {
		if (!color) return;
		data[id] = { type: 'note', color, color2: null, visibility: 'visible' };
	});
	return data;
}

const BASE = { startFret: 0, endFret: 12, enharmonic: 1, displayMode: 'note', rootNote: null, visibility: 'transparent' };

export function buildExampleClips() {
	const blue = tints('blue');
	const pale = { name: 'blue', custom: blue[0] };
	const vivid = { name: 'blue', custom: blue[1] };
	let seq = Date.now();

	const clip = (id, name, frames, transitions) => ({
		id: `example-${id}`,
		name,
		createdAt: seq++,
		frames: frames.map(f => ({ ...BASE, data: mkData(f) })),
		transitions
	});

	const c = getT().clips;
	return [
		clip('sl', c.sl,
			[[['f5-s2', pale], ['f5-s3', pale]], [['f8-s2', vivid], ['f8-s3', vivid]]],
			[{ technique: 'sl', pairs: [{ from: 'f5-s2', to: 'f8-s2' }, { from: 'f5-s3', to: 'f8-s3' }] }]
		),
		clip('rt', c.rt,
			[[['f5-s2', pale]], [['f5-s2', pale]]],
			[{ technique: 'rt', pairs: [{ from: 'f5-s2', to: 'f8-s2' }] }]
		),
		clip('add', c.add,
			[[['f5-s2', pale]], [['f5-s2', pale], ['f7-s2', vivid], ['f7-s3', vivid]]],
			[{ technique: null, pairs: [] }]
		),
		clip('del', c.del,
			[[['f5-s2', pale], ['f7-s2', vivid], ['f7-s3', vivid]], [['f5-s2', pale]]],
			[{ technique: null, pairs: [] }]
		),
		clip('melody', c.melody,
			[
				[['f5-s2', pale]],
				[['f5-s2', pale], ['f7-s2', vivid]],
				[['f5-s2', pale], ['f7-s2', vivid], ['f8-s2', vivid]],
				[['f5-s2', pale], ['f8-s2', vivid]]
			],
			[{ technique: null, pairs: [] }, { technique: null, pairs: [] }, { technique: null, pairs: [] }]
		),
		clip('emphasis', c.emphasis,
			[
				[['f5-s2', pale], ['f5-s3', pale], ['f5-s4', pale], ['f7-s2', pale]],
				[['f5-s2', pale], ['f5-s3', pale], ['f5-s4', pale], ['f7-s2', pale], ['f8-s2', vivid], ['f8-s3', vivid]]
			],
			[{ technique: null, pairs: [] }]
		)
	];}

// 注入示例（先清掉旧的示例，保留用户自己的动图）
// 用户"清空动图堆"后不再自动补回（显式点"示例"按钮才恢复）
export function ensureExampleClips(force = false) {
	let cleared = false;
	try { cleared = localStorage.getItem('fretboard-examples-cleared') === '1'; } catch (e) { /* ignore */ }
	if (cleared && !force) return loadClips();
	if (force) { try { localStorage.removeItem('fretboard-examples-cleared'); } catch (e) { /* ignore */ } }
	const existing = loadClips();
	const kept = existing.filter(c => !c.id.startsWith('example-'));
	const merged = [...buildExampleClips(), ...kept];
	persistClips(merged);
	return merged;
}
