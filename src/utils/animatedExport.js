// 动态素材导出：帧序列 + 过渡规格（transitionAnimator 内核）→ GIF / WebM
// GIF：gifenc 离线逐帧编码（时长精确）
// WebM：canvas.captureStream(0) + MediaRecorder 按计划时刻 requestFrame 实时录制
// 两者的子帧计划完全一致，与页面播放共用同一动效内核

import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { describeTransition, sampleTransition, elsToSvgString } from './transitionAnimator';

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

// 子帧计划：[帧1停留] [1→2过渡] [帧2停留] ... [末帧停留]
// hold 期间只有底图；trans 期间底图=下一帧 + 动效层采样
function buildPlan(states, opts) {
	const holdMs = opts.holdMs ?? 500;
	const transMs = opts.transMs ?? 300;
	const fps = opts.fps ?? 20;
	const dt = 1000 / fps;

	const plan = [];
	let tAbs = 0;
	states.forEach((state, i) => {
		const h = Number(state.holdMs) > 0 ? Number(state.holdMs) : holdMs;
		const hSteps = Math.max(1, Math.round(h / dt));
		const hMs = Math.max(dt, Math.round(h / hSteps));
		for (let s = 0; s < hSteps; s++) plan.push({ board: i, descIndex: -1, t: 0, delayMs: hMs, transMs: 0, tAbs: tAbs + hMs * s });
		tAbs += hMs * hSteps;
		if (i < states.length - 1) {
			const tr = Number(state.transMs) > 0 ? Number(state.transMs) : transMs;
			const steps = Math.max(2, Math.round(tr / dt));
			const stepMs = tr / steps;
			for (let s = 0; s < steps; s++) {
				plan.push({ board: i + 1, descIndex: i, t: (s + 1) / steps, delayMs: stepMs, transMs: tr, tAbs: tAbs + stepMs * (s + 1) });
			}
			tAbs += tr;
		}
	});
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
	// 并发轨道：desc 用同帧数据取音符位置/颜色（prevState=当帧基态）
	const fxTrack = Array.isArray(opts.fx) ? opts.fx : [];
	const fxDescs = fxTrack.map(fxi => describeTransition(states[0], states[states.length - 1], fxi.spec));

	const subframes = [];
	for (let p = 0; p < plan.length; p++) {
		const item = plan[p];
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, width, height);
		ctx.drawImage(boardImages[item.board], 0, 0, width, height);
		if (item.descIndex >= 0) {
			const fxSvg = elsToSvgString(sampleTransition(descs[item.descIndex], item.t, item.transMs), viewBox, { labelColor: opts.labelColor, noteStyle: opts.noteStyle });
			const fxImg = await svgToImage(fxSvg);
			ctx.drawImage(fxImg, 0, 0, width, height);
		}
		// 并发 fx 轨道：绝对时间在窗口内的轨迹叠加
		if (fxTrack.length && item.tAbs !== undefined) {
			let trackEls = [];
			fxTrack.forEach((fxi, k) => {
				if (item.tAbs < fxi.t0 || item.tAbs > fxi.t0 + fxi.dur) return;
				const tt = (item.tAbs - fxi.t0) / fxi.dur;
				trackEls = trackEls.concat(sampleTransition(fxDescs[k], tt, fxi.dur));
			});
			if (trackEls.length) {
				const trackImg = await svgToImage(elsToSvgString(trackEls, viewBox, { labelColor: opts.labelColor, noteStyle: opts.noteStyle }));
				ctx.drawImage(trackImg, 0, 0, width, height);
			}
		}
		subframes.push({ canvas: ctx.getImageData(0, 0, width, height), delayMs: item.delayMs });
		if (onProgress) onProgress(p + 1, plan.length);
	}
	return { subframes, width, height };
}

// GIF：离线编码，时长精确
export async function exportGifAnimation({ states, specs, boardImages, viewBox, opts, onProgress }) {
	const { subframes, width, height } = await renderSubframes({ states, specs, boardImages, viewBox, opts, onProgress });
	const gif = GIFEncoder();
	subframes.forEach((f, i) => {
		const palette = quantize(f.canvas.data, 256);
		const index = applyPalette(f.canvas.data, palette);
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
	const plan = buildPlan(states, opts);
	const width = opts.width ?? 720;
	const [vx, vy, vw, vh] = String(viewBox).split(/\s+/).map(Number);
	const height = Math.round(width * vh / vw);
	const bg = opts.background || '#10161c';

	// 预先把所有子帧画到独立位图（回放阶段只做 drawImage，保证不掉帧）
	const subframes = [];
	const descs = states.slice(0, -1).map((s, i) => describeTransition(states[i], states[i + 1], specs?.[i] || { technique: null, pairs: [] }));
	// 并发轨道：desc 用同帧数据取音符位置/颜色（prevState=当帧基态）
	const fxTrack = Array.isArray(opts.fx) ? opts.fx : [];
	const fxDescs = fxTrack.map(fxi => describeTransition(states[0], states[states.length - 1], fxi.spec));
	for (let p = 0; p < plan.length; p++) {
		const item = plan[p];
		const c = document.createElement('canvas');
		c.width = width;
		c.height = height;
		const cx = c.getContext('2d');
		cx.fillStyle = bg;
		cx.fillRect(0, 0, width, height);
		cx.drawImage(boardImages[item.board], 0, 0, width, height);
		if (item.descIndex >= 0) {
			const fxImg = await svgToImage(
				elsToSvgString(sampleTransition(descs[item.descIndex], item.t, item.transMs), viewBox, { labelColor: opts.labelColor, noteStyle: opts.noteStyle })
			);
			cx.drawImage(fxImg, 0, 0, width, height);
		}
		subframes.push({ canvas: c, delayMs: item.delayMs });
		if (onProgress) onProgress(p + 1, plan.length);
	}

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
	const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
		? 'video/webm;codecs=vp9'
		: 'video/webm';
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
