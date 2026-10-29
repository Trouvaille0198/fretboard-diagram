// 同步引擎纯逻辑冒烟：内容哈希判脏 / 版本新旧判定 / 稳定序列化
// 纯 Node 直跑：node scripts/smoke-sync.mjs
import { stableStringify, contentHash, sameContent, remoteIsNewer, cleanForHash } from "../src/utils/syncEngine.js";

let fail = 0, n = 0;
const A = (name, ok, detail) => { n++; if (!ok) { fail++; console.error(`  ✗ ${name}${detail ? "  [" + detail + "]" : ""}`); } };

console.log("== syncEngine：稳定序列化 ==");
A("键序不同 → 同一字符串", stableStringify({ b: 1, a: 2 }) === stableStringify({ a: 2, b: 1 }));
A("数组保序", stableStringify([1, 2]) !== stableStringify([2, 1]));
A("嵌套对象键序无关", stableStringify({ x: { q: 1, p: 2 } }) === stableStringify({ x: { p: 2, q: 1 } }));

console.log("== syncEngine：内容哈希判脏 ==");
const song = { id: "c1", name: "歌", measures: [{ id: "m1", slots: [{ kind: "chord", chord: { degree: 1 } }] }] };
A("同内容 → 同哈希", contentHash(song) === contentHash(JSON.parse(JSON.stringify(song))));
A("改名字 → 哈希不同", contentHash(song) !== contentHash({ ...song, name: "歌2" }));
A("改和弦 → 哈希不同", contentHash(song) !== contentHash({
	...song, measures: [{ id: "m1", slots: [{ kind: "chord", chord: { degree: 2 } }] }]
}));
A("时间戳/版本号不参与哈希", contentHash(song) === contentHash({ ...song, updatedAt: 999, rev: 42 }));
A("哈希剔除易变字段", !("updatedAt" in cleanForHash({ a: 1, updatedAt: 2, rev: 3 })));

console.log("== syncEngine：sameContent ==");
A("仅时间戳不同 → 视为同内容", sameContent(song, { ...song, updatedAt: 111 }));
A("仅版本号不同 → 视为同内容", sameContent(song, { ...song, rev: 77 }));
A("内容不同 → 不算同内容", !sameContent(song, { ...song, name: "别的" }));
A("一边为空 → 不算同内容", !sameContent(null, song) && !sameContent(song, null));

console.log("== syncEngine：远端版本新旧判定 ==");
A("rev 更大 → 更新", remoteIsNewer({ rev: 5, name: "a" }, { rev: 4, name: "b" }));
A("rev 更小 → 不更新", !remoteIsNewer({ rev: 3, name: "a" }, { rev: 4, name: "b" }));
A("rev 相等但内容不同 → 不采纳（同一版）", !remoteIsNewer({ rev: 4, name: "云端版", updatedAt: 999 }, { rev: 4, name: "本地版", updatedAt: 100 }));
A("内容相同 → 无需采纳（不触发）", !remoteIsNewer({ rev: 9, name: "a" }, { rev: 4, name: "a" }));
A("都无 rev 时退回 updatedAt", remoteIsNewer({ updatedAt: 200, name: "a" }, { updatedAt: 100, name: "b" }));
A("都无 rev 且远端更旧 → 不更新", !remoteIsNewer({ updatedAt: 100, name: "a" }, { updatedAt: 200, name: "b" }));
A("存储里没有 → 不采纳", !remoteIsNewer(null, { rev: 1, name: "a" }));

console.log(`\n${fail ? "✗ " + fail + " 项失败" : "✓ 全部 " + n + " 项断言通过"}\n`);
process.exit(fail ? 1 : 0);
