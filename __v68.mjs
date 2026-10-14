import WebSocket from "ws";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const v = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const bws = new WebSocket(v.webSocketDebuggerUrl, { suppressOrigin: true });
await new Promise(r => bws.on("open", r));
let bid = 0; const bp = new Map();
bws.on("message", m => { const d = JSON.parse(m); if (d.id && bp.has(d.id)) { bp.get(d.id)(d); bp.delete(d.id); } });
const bs = (method, params = {}) => new Promise(r => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const tid = (await bs("Target.createTarget", { url: "http://localhost:4173/?v68=" + Date.now() + "#/" })).result.targetId;
for (let i = 0; i < 2; i++) { await bs("Target.activateTarget", { targetId: tid }); await sleep(300); }
await sleep(3500);
const list0 = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const ws = new WebSocket(list0.find(t => t.id === tid).webSocketDebuggerUrl, { suppressOrigin: true });
await new Promise(r => ws.on("open", r));
let id = 0; const p = new Map();
ws.on("message", m => { const d = JSON.parse(m); if (d.id && p.has(d.id)) { p.get(d.id)(d); p.delete(d.id); } });
const ev = (expression) => new Promise((res, rej) => {
  const i = ++id;
  p.set(i, r => { if (r.exceptionDetails) rej(new Error(String(r.exceptionDetails.exception?.description || "").slice(0, 300))); else res(r.result?.result?.value); });
  ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
});
// 实测 Chrome 剪贴板对各类型的支持（需文档聚焦）
const out = await ev(`(async () => {
  const results = {};
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4" fill="red"><animate attributeName="r" values="4;1;4" dur="1s" repeatCount="indefinite"/></circle></svg>';
  for (const type of ['image/svg+xml', 'image/gif', 'image/webp']) {
    try {
      const blob = new Blob([svg], { type });
      await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      results[type] = 'OK';
    } catch (e) { results[type] = e.name + ': ' + String(e.message).slice(0, 60); }
  }
  return results;
})()`, 15000);
console.log('Chrome 剪贴板写类型实测:', JSON.stringify(out, null, 1));
await bs("Target.closeTarget", { targetId: tid });
ws.close(); bws.close(); process.exit(0);
