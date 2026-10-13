// 样式示例动图：每种技法/样式一张，一键载入指板堆供预览与续编学习
// 颜色约定与运行时一致：帧1底 = pale（浅），当前音 = vivid（强）

import { loadClips, persistClips } from './clipModel';
import { getLevel1FillColor, generateTintVariants } from '../colorConfig';
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

	return [
		clip('sl', '示例·滑弦 sl（A→B）',
			[[['f5-s2', pale], ['f5-s3', pale]], [['f8-s2', vivid], ['f8-s3', vivid]]],
			[{ technique: 'sl', pairs: [{ from: 'f5-s2', to: 'f8-s2' }, { from: 'f5-s3', to: 'f8-s3' }] }]
		),
		clip('rt', '示例·原位滑弦 sl↺（A→B→A）',
			[[['f5-s2', pale]], [['f5-s2', pale]]],
			[{ technique: 'rt', pairs: [{ from: 'f5-s2', to: 'f8-s2' }] }]
		),
		clip('add', '示例·新增音符（纯 diff，无需标注）',
			[[['f5-s2', pale]], [['f5-s2', pale], ['f7-s2', vivid], ['f7-s3', vivid]]],
			[{ technique: null, pairs: [] }]
		),
		clip('del', '示例·删除音符（纯 diff，无需标注）',
			[[['f5-s2', pale], ['f7-s2', vivid], ['f7-s3', vivid]], [['f5-s2', pale]]],
			[{ technique: null, pairs: [] }]
		),
		clip('melody', '示例·单音旋律（逐帧增删）',
			[
				[['f5-s2', pale]],
				[['f5-s2', pale], ['f7-s2', vivid]],
				[['f5-s2', pale], ['f7-s2', vivid], ['f8-s2', vivid]],
				[['f5-s2', pale], ['f8-s2', vivid]]
			],
			[{ technique: null, pairs: [] }, { technique: null, pairs: [] }, { technique: null, pairs: [] }]
		),
		clip('emphasis', '示例·和弦强调音（浅底+强色）',
			[
				[['f5-s2', pale], ['f5-s3', pale], ['f5-s4', pale], ['f7-s2', pale]],
				[['f5-s2', pale], ['f5-s3', pale], ['f5-s4', pale], ['f7-s2', pale], ['f8-s2', vivid], ['f8-s3', vivid]]
			],
			[{ technique: null, pairs: [] }]
		)
	];}

// 注入示例（先清掉旧的示例，保留用户自己的动图）
export function ensureExampleClips() {
	const existing = loadClips();
	const kept = existing.filter(c => !c.id.startsWith('example-'));
	const merged = [...buildExampleClips(), ...kept];
	persistClips(merged);
	return merged;
}
