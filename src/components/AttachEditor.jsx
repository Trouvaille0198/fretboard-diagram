import React, { useEffect, useMemo, useState } from "react";
import { ScoreBoard } from "./ScorePieces";
import { loadClips } from "../utils/clipModel";

// 配图选择弹窗：静态=进普通编辑器画一张板；动图=进动图编辑器（新建或续编）
// value = song.image：{kind:'board',frame} | {kind:'clip',id} | null
export function AttachPicker({ value, subtitle, onPickStatic, onPickClip, onRemove, onClose, t }) {
	const ts = t?.chords ?? {};
	return (
		<div className="cc-modal-mask" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
			<div className="cc-modal">
				<div className="cc-modal-head">
					<span className="cc-modal-title">{value ? (ts.editAttach ?? "编辑配图") : (ts.attachImage ?? "添加配图")}{subtitle ? <small className="cc-modal-sub"> · {subtitle}</small> : null}</span>
					<button className="cc-modal-x" onClick={onClose}>✕</button>
				</div>
				<div className="cc-modal-body">
					<div className="cc-ap-grid">
						<button className="cc-ap-item" onClick={onPickStatic}>
							<span className="cc-ap-icon">板</span>
							<b>{ts.attachStatic ?? "静态配图"}</b>
							<small>{(value?.kind === "board" ? ts.attachContinue : ts.attachStaticHint) ?? "用普通编辑器画一张指板"}</small>
						</button>
						<button className="cc-ap-item" onClick={onPickClip}>
							<span className="cc-ap-icon">动</span>
							<b>{ts.attachAnim ?? "动图配图"}</b>
							<small>{(value?.kind === "clip" ? ts.attachContinue : ts.attachAnimHint) ?? "用动图编辑器做一段动画"}</small>
						</button>
					</div>
				</div>
				{value ? (
					<div className="cc-modal-foot">
						<button className="cc-ap-remove" onClick={onRemove}>🗑 {ts.removeImage ?? "移除配图"}</button>
					</div>
				) : null}
			</div>
		</div>
	);
}

// 配图槽内容渲染：board=静态板快照；clip=指板堆动图帧步进循环
export function AttachView({ data }) {
	const clips = useMemo(() => (data?.kind === "clip" ? loadClips() : []), [data?.kind, data?.id]);
	const clip = data?.kind === "clip" ? clips.find(c => c.id === data.id) : null;
	const [fi, setFi] = useState(0);

	useEffect(() => {
		if (!clip || !clip.frames || clip.frames.length < 2) return;
		const id = setInterval(() => setFi(i => (i + 1) % clip.frames.length), 650);
		return () => clearInterval(id);
	}, [clip?.id, clip?.frames?.length]);

	if (data?.kind === "board" && data.frame) {
		return <ScoreBoard snapshot={{ state: data.frame }} />;
	}
	if (clip && clip.frames?.length) {
		return <ScoreBoard snapshot={{ state: clip.frames[Math.min(fi, clip.frames.length - 1)] }} />;
	}
	return null;
}
