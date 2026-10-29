// 客户端标识：这台设备/这个浏览器的稳定 id。
// 用途：服务端广播变更时带上写入方的 clientId，各端据此精确跳过"自己写的"，
// 不再像旧实现那样靠 2.5 秒时间窗去猜（时间窗会把并发的他人改动也误吞掉）。
const KEY = "fretboard-client-id";

let cached = null;

export function clientId() {
	if (cached) return cached;
	try {
		let id = localStorage.getItem(KEY);
		if (!id) {
			id = "c-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
			localStorage.setItem(KEY, id);
		}
		cached = id;
		return id;
	} catch (e) { return "c-anon"; }
}
