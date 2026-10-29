// 动图（Clip）模型与本地存储：指板堆的唯一数据单元
// Clip = 帧序列（板面状态）+ 每步过渡规格（技法语义）

import { sameContent, queuePush, queueDelete, setApplier, setPuller, setConflictHandler, outboxPending } from "./syncEngine.js";
import { trashPut } from "./trashModel.js";

const CLIPS_KEY = "fretboard-clips";

export const TECHNIQUES = [];

export function loadClips() {
	try {
		const raw = localStorage.getItem(CLIPS_KEY);
		const clips = raw ? JSON.parse(raw) : [];
		return Array.isArray(clips) ? clips.filter(c => c && Array.isArray(c.frames) && c.frames.length) : [];
	} catch (error) {
		console.error("读取动图失败:", error);
		return [];
	}
}

export function persistClips(clips) {
	try {
		// 滚动备份最近 3 份：任何误删/覆盖都能从 bak 里找回
		for (let i = 2; i >= 1; i--) {
			const cur = localStorage.getItem(`fretboard-clips-bak-${i}`);
			if (cur) localStorage.setItem(`fretboard-clips-bak-${i + 1}`, cur);
		}
		const prev = localStorage.getItem(CLIPS_KEY);
		if (prev) localStorage.setItem("fretboard-clips-bak-1", prev);
		localStorage.setItem(CLIPS_KEY, JSON.stringify(clips));
	} catch (error) {
		console.error("保存动图失败:", error);
	}
}

export function loadBackupClips() {
	for (let i = 1; i <= 3; i++) {
		try {
			const raw = localStorage.getItem(`fretboard-clips-bak-${i}`);
			if (!raw) continue;
			const clips = JSON.parse(raw);
			if (Array.isArray(clips) && clips.length) return clips;
		} catch (error) { /* 尝试下一份 */ }
	}
	return null;
}

export function saveClip(clip) {
	const clips = loadClips();
	const existing = clips.findIndex(c => c.id === clip.id);
	// 内容判脏：内容一样就不是改动（"只是打开了一下"不再触发写盘与下发）
	if (existing !== -1 && sameContent(clips[existing], clip)) return clips[existing];
	const stamped = { ...clip, updatedAt: Date.now() };
	if (existing !== -1) clips[existing] = stamped;
	else clips.unshift(stamped);
	persistClips(clips);
	queuePush("clips", stamped); // 登录用户进离线队列异步下发
	return stamped;
}

export function deleteClip(id) {
	// 删除＝先进回收站（10 天可还原），不是立即丢弃
	const target = loadClips().find(c => c.id === id);
	if (target) trashPut("clips", target);
	persistClips(loadClips().filter(c => c.id !== id));
	queueDelete("clips", id);
}

export function renameClip(id, name) {
	const clips = loadClips();
	const clip = clips.find(c => c.id === id);
	if (clip) {
		clip.name = name;
		saveClip(clip); // 走统一保存路径：判脏 + 入队下发
	}
}

export function newClipId() {
	return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 音符 id → 弦号（f5-s2 / o-s3）
export function stringOfNote(noteId) {
	if (noteId.startsWith("o-s")) return parseInt(noteId.slice(3), 10);
	const match = noteId.match(/-s(\d+)$/);
	return match ? parseInt(match[1], 10) : null;
}

// 历史遗留：旧动图数据里可能存有 h/p/mv/hp 技法标识，动画内核兼容读取；工具栏只提供 sl / rt

// ===== 云端同步落地 =====

// 服务端确认下发后：把新版本号写回本地（否则下一次下发会自己跟自己冲突）
setApplier("clips", (serverItem) => {
	const clips = loadClips();
	const i = clips.findIndex(c => c.id === serverItem.id);
	if (i === -1) return;
	clips[i] = { ...clips[i], rev: serverItem.rev };
	persistClips(clips);
});

// 增量拉取落地：只接 rev 更大的行 + 墓碑；本地有未下发编辑则本地赢
setPuller("clips", (data) => {
	const clips = loadClips();
	const byId = new Map(clips.map(c => [c.id, c]));
	const pending = new Set(outboxPending("clips").map(e => e.id));
	let changed = false;
	(data.items || []).forEach(remote => {
		if (!remote || !remote.id) return;
		if (pending.has(remote.id)) return;
		const local = byId.get(remote.id);
		if (local && (local.rev || 0) >= (remote.rev || 0)) return;
		byId.set(remote.id, remote);
		changed = true;
	});
	(data.deleted || []).forEach(d => {
		if (!d || !d.id) return;
		if (pending.has(d.id)) return;
		if (byId.has(d.id)) { byId.delete(d.id); changed = true; }
	});
	if (!changed) return;
	persistClips([...byId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
	window.dispatchEvent(new CustomEvent("fretboard:clips-synced"));
});

// 冲突：云端版本为准，本地被拒的版本另存副本
setConflictHandler("clips", (entry, serverItem) => {
	const clips = loadClips();
	const i = clips.findIndex(c => c.id === entry.id);
	if (i !== -1 && serverItem) clips[i] = serverItem;
	const copy = {
		...entry.item,
		id: newClipId(),
		name: `${entry.item.name || "未命名"}（冲突副本）`,
		createdAt: Date.now(),
		updatedAt: Date.now()
	};
	clips.unshift(copy);
	persistClips(clips);
	window.dispatchEvent(new CustomEvent("fretboard:clips-synced"));
	window.dispatchEvent(new CustomEvent("fretboard:toast", {
		detail: { msg: `「${entry.item.name}」云端已有更新版本，已采用云端版本；你的改动另存为「${copy.name}」` }
	}));
});

// ============ 云同步 ============
// 下发/拉取统一走 syncEngine 的离线队列与增量拉取：
// 旧实现在这里批量 POST /api/data/clips —— 服务端从来没有这个路由（404 被静默吞掉），
// 也就是动图堆的批量同步一直是坏的；现在统一为「逐条 PUT + ?since= 增量拉取」。
