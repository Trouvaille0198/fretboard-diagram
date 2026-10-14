import WebSocket from "ws";
import fs from "fs";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const v = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const bws = new WebSocket(v.webSocketDebuggerUrl, { suppressOrigin: true });
await new Promise(r => bws.on("open", r));
let bid = 0; const bp = new Map();
bws.on("message", m => { const d = JSON.parse(m); if (d.id && bp.has(d.id)) { bp.get(d.id)(d); bp.delete(d.id); } });
const bs = (method, params = {}) => new Promise(r => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const tid = (await bs("Target.createTarget", { url: "http://localhost:4173/?v53=" + Date.now() + "#/" })).result.targetId;
for (let i = 0; i < 3; i++) { await bs("Target.activateTarget", { targetId: tid }); await sleep(400); }
await sleep(4000);
const list0 = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const ws = new WebSocket(list0.find(t => t.id === tid).webSocketDebuggerUrl, { suppressOrigin: true });
await new Promise(r => ws.on("open", r));
let id = 0; const p = new Map();
ws.on("message", m => { const d = JSON.parse(m); if (d.id && p.has(d.id)) { p.get(d.id)(d); p.delete(d.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = (expression) => new Promise((res, rej) => {
  const i = ++id;
  p.set(i, r => { if (r.exceptionDetails) rej(new Error(String(r.exceptionDetails.exception?.description || "").slice(0, 300))); else res(r.result?.result?.value); });
  ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
});
const jsonText = fs.readFileSync('/tmp/user1.json', 'utf8');
await ev(`(() => {
  const d = ${JSON.stringify(jsonText)};
  const clip = JSON.parse(d).clip;
  clip.id = 'user1'; clip.name = 'user1'; clip.createdAt = Date.now();
  localStorage.setItem('fretboard-clips', JSON.stringify([clip, ...JSON.parse(localStorage.getItem('fretboard-clips') || '[]').filter(c => c.id !== 'user1')]));
  location.hash = '#/dynamic?c=user1';
  location.reload();
  return true;
})()`, 8000);
await sleep(4500);
// 进编辑态跳到帧4（pre 帧），截图编辑板 + 缩略图区
await ev(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const edit = [...document.querySelectorAll('button')].find(b => (b.title||'').includes('编辑'));
  edit?.click();
  await sleep(800);
  const key = (code, k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true }));
  key('KeyD', 'd'); await sleep(600); key('KeyD', 'd'); await sleep(600); key('KeyD', 'd'); await sleep(800);
  return document.querySelector('.dyn-badge')?.textContent;
})()`, 8000);
await send("Page.enable", {});
await sleep(400);
const s = (await send("Page.captureScreenshot", { format: "png" })).result?.data;
fs.writeFileSync('/tmp/editframe4.png', Buffer.from(s, 'base64'));
console.log('screenshot saved');
await bs("Target.closeTarget", { targetId: tid });
ws.close(); bws.close(); process.exit(0);
