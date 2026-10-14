// 动态素材导出：帧序列 + 过渡规格（transitionAnimator 内核）→ GIF / WebM
// GIF：gifenc 离线逐帧编码（时长精确）
// WebM：canvas.captureStream(0) + MediaRecorder 按计划时刻 requestFrame 实时录制
// 两者的子帧计划完全一致，与页面播放共用同一动效内核

import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { describeTransition, sampleTransition, elsToSvgString } from './transitionAnimator';
import { stateClock, END_PAUSE_MS } from './timeline';

function svgToImage(svgString) {
	return new Promise((resolve, reject) => {
		const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
		img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG 图片解码失败')); };
		img.src = url;
	});
}

// 子帧计划：绝对时间网格（fps 网格中点采样）。状态定位/fx 窗口全部由 stateClock 的唯一时刻表决定，
// 与页面播放共用同一时钟——导出画面 = 预览在该时刻的画面，按构造一致（不另起炉灶）。
function buildPlan(states, opts) {
	const holdMs = opts.holdMs ?? 500;
	const transMs = opts.transMs ?? 200;
	const fps = opts.fps ?? 20;
	const dt = 1000 / fps;
	const clock = stateClock(states, holdMs, transMs);
	const n = Math.max(1, Math.round((clock.total + END_PAUSE_MS) / dt)); // 尾部停顿与播放器同源
	const plan = [];
	for (let f = 0; f < n; f++) {
		const t = (f + 0.5) * dt;
		let board = 0;
		for (let k = states.length - 1; k >= 0; k--) {
			if (t >= clock.starts[k]) { board = k; break; }
		}
		plan.push({ board, t, delayMs: dt });
	}
	return plan;
}

async function renderSubframes({ states, specs, boardImages, viewBox, opts, onProgress }) {
	const plan = buildPlan(states, opts);
	const width = opts.width ?? 720;
	const [vx, vy, vw, vh] = String(viewBox).split(/\s+/).map(Number);
	const height = Math.round(width * vh / vw);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');

	const bg = opts.background || '#10161c';
	const descs = states.slice(0, -1).map((s, i) => describeTransition(states[i], states[i + 1], specs?.[i] || { technique: null, pairs: [] }));
	// 并发轨道：desc 用「该帧末态」自身做 prev/next（diff 为空，只有 pair 光点）——
	// 与播放器 TransitionFx 的 hintState 同构；绝不能用整段首尾态（全局 diff 会给每条轨道
	// 叠上所有中途增删音符的涟漪，即"无关音符起涟漪"的来源）
	const fxTrack = Array.isArray(opts.fx) ? opts.fx : [];
	const frameOf = Array.isArray(opts.frameOf) ? opts.frameOf : null;
	const fxDescs = fxTrack.map(fxi => {
		const hint = frameOf
			? states.filter((_, si) => frameOf[si] === fxi.frame).slice(-1)[0] || states[states.length - 1]
			: states[states.length - 1];
		return describeTransition(hint, hint, fxi.spec);
	});
	// 与播放器同源的进入切换窗口：状态 k 显示的前 enterOf(k) 毫秒内渲染 desc[k-1] 采样
	const clock = stateClock(states, opts.holdMs ?? 500, opts.transMs ?? 200);

	const subframes = [];
	for (let p = 0; p < plan.length; p++) {
		const item = plan[p];
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, width, height);
		ctx.drawImage(boardImages[item.board], 0, 0, width, height);
		const k = item.board;
		const enter = clock.enterOf(k - 1);
		if (k > 0 && enter > 0) {
			const tIn = item.t - clock.starts[k];
			if (tIn >= 0 && tIn < enter) {
				const fxSvg = elsToSvgString(sampleTransition(descs[k - 1], Math.min(1, tIn / enter), enter), viewBox, { labelColor: opts.labelColor, noteStyle: opts.noteStyle });
				const fxImg = await svgToImage(fxSvg);
				ctx.drawImage(fxImg, 0, 0, width, height);
			}
		}
		// 并发 fx 轨道：绝对时间在窗口内的轨迹叠加
		if (fxTrack.length) {
			let trackEls = [];
			fxTrack.forEach((fxi, k2) => {
				if (item.t < fxi.t0 || item.t > fxi.t0 + fxi.dur) return;
				const tt = (item.t - fxi.t0) / fxi.dur;
				trackEls = trackEls.concat(sampleTransition(fxDescs[k2], tt, fxi.dur));
			});
			if (trackEls.length) {
				const trackImg = await svgToImage(elsToSvgString(trackEls, viewBox, { labelColor: opts.labelColor, noteStyle: opts.noteStyle }));
				ctx.drawImage(trackImg, 0, 0, width, height);
			}
		}
		// 逐帧快照（不能复用同一 canvas——编码阶段再读会全部变成最后一帧，GIF 冻结的根因）
		const snap = document.createElement('canvas');
		snap.width = width; snap.height = height;
		snap.getContext('2d').drawImage(canvas, 0, 0);
		subframes.push({ canvas: snap, delayMs: item.delayMs });
		if (onProgress) onProgress(p + 1, plan.length);
	}
	return { subframes, width, height };
}

// GIF：离线编码，时长精确
export async function exportGifAnimation({ states, specs, boardImages, viewBox, opts, onProgress }) {
	const { subframes, width, height } = await renderSubframes({ states, specs, boardImages, viewBox, opts, onProgress });
	const gif = GIFEncoder();
	subframes.forEach((f, i) => {
		const data = f.canvas.getContext('2d').getImageData(0, 0, width, height).data;
		const palette = quantize(data, 256);
		const index = applyPalette(data, palette);
		gif.writeFrame(index, width, height, {
			palette,
			delay: Math.max(20, Math.round(f.delayMs)),
			repeat: i === 0 ? 0 : undefined // 0 = 无限循环
		});
	});
	gif.finish();
	return new Blob([gif.bytes()], { type: 'image/gif' });
}

// WebM：预渲染子帧到位图，再按计划时刻实时回放录制
export async function exportWebmAnimation({ states, specs, boardImages, viewBox, opts, onProgress }) {
	// 与 GIF 完全同一子帧渲染器（绝对时钟采样）——WebM=预览=GIF 三者同源
	const { subframes, width, height } = await renderSubframes({ states, specs, boardImages, viewBox, opts, onProgress });
	const totalMs = subframes.reduce((s, f) => s + f.delayMs, 0);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	ctx.drawImage(subframes[0].canvas, 0, 0);
	// 离屏挂载：部分浏览器要求画布已绘制才产出帧
	canvas.style.cssText = 'position:fixed;left:-99999px;top:0;';
	document.body.appendChild(canvas);

	const stream = canvas.captureStream(30);
	let mime = null;
	if (opts.preferMp4) {
		// MP4/H.264：微信等聊天软件原生自动播放（WebM 在多数聊天端不能直接播）
		for (const m of ['video/mp4;codecs=avc1.42E01E', 'video/mp4']) {
			if (MediaRecorder.isTypeSupported(m)) { mime = m; break; }
		}
	}
	if (!mime) {
		mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
			? 'video/webm;codecs=vp9'
			: 'video/webm';
	}
	const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
	const chunks = [];
	recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

	const done = new Promise(resolve => { recorder.onstop = () => resolve(); });
	recorder.start(200);

	// 实时回放：按累计时刻推进到当前子帧（30fps 流自动采样）
	const startWall = performance.now();
	await new Promise(resolve => {
		const tick = () => {
			const now = performance.now() - startWall;
			let acc = 0;
			let idx = 0;
			while (idx < subframes.length - 1 && acc + subframes[idx].delayMs <= now) {
				acc += subframes[idx].delayMs;
				idx++;
			}
			ctx.drawImage(subframes[idx].canvas, 0, 0);
			if (now >= totalMs) {
				resolve();
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await new Promise(r => setTimeout(r, 200)); // 收尾帧进流
	recorder.stop();
	await done;
	canvas.remove();
	return new Blob(chunks, { type: 'video/webm' });
}
