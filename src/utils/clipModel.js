// 动图（Clip）模型与本地存储：指板堆的唯一数据单元
// Clip = 帧序列（板面状态）+ 每步过渡规格（技法语义）

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
		debouncePush();
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
	if (existing !== -1) clips[existing] = clip;
	else clips.unshift(clip);
	persistClips(clips);
	return clip;
}

export function deleteClip(id) {
	persistClips(loadClips().filter(c => c.id !== id));
}

export function renameClip(id, name) {
	const clips = loadClips();
	const clip = clips.find(c => c.id === id);
	if (clip) {
		clip.name = name;
		persistClips(clips);
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

// ============ 云同步（登录后自动） ============

let pushTimer = null;

function debouncePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushClips, 1500);
}

export async function pushClips() {
    try {
        const { saveClips } = await import('./api');
        await saveClips(loadClips());
    } catch (error) {
        // 未登录/离线时静默跳过，本地为准
    }
}

export async function pullClips() {
    try {
        const { loadClips } = await import('./api');
        const remote = await loadClips();
        if (!Array.isArray(remote) || !remote.length) return loadClips();
        const local = loadClips();
        const byId = new Map(local.map(c => [c.id, c]));
        remote.forEach(c => {
            if (!c || !c.id) return;
            byId.set(c.id, c); // 服务端版本优先
        });
        const merged = [...byId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        persistClips(merged);
        return merged;
    } catch (error) {
        return loadClips();
    }
}
