import WebSocket from "ws";
import fs from "fs";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const v = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const bws = new WebSocket(v.webSocketDebuggerUrl, { suppressOrigin: true });
await new Promise(r => bws.on("open", r));
let bid = 0; const bp = new Map();
bws.on("message", m => { const d = JSON.parse(m); if (d.id && bp.has(d.id)) { bp.get(d.id)(d); bp.delete(d.id); } });
const bs = (method, params = {}) => new Promise(r => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const tid = (await bs("Target.createTarget", { url: "http://localhost:4173/?v23=" + Date.now() + "#/" })).result.targetId;
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
// 在页面里导出 → 把 svg 文本取回来
const svgText = await ev(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const T = ['rgb(204, 224, 250)', 'rgb(78, 149, 247)', 'rgb(8, 70, 165)', 'rgb(9, 46, 103)'];
  const mk = (lit) => {
    const data = {};
    Object.entries(lit).forEach(([id, v]) => {
      data[id] = typeof v === 'string'
        ? { type: 'note', color: 'white', color2: null, visibility: 'transparent' }
        : { type: 'note', color: { name: 'navy', custom: v.c }, color2: null, visibility: 'visible', birth: v.b };
    });
    return { data, startFret: 1, endFret: 13, enharmonic: 1, displayMode: 'note', rootNote: null, visibility: 'transparent', frameTint: { name: 'navy', custom: T[3] } };
  };
  const F = [
    mk({ 'f3-s2': { c: T[0], b: 0 }, 'f5-s2': { c: T[0], b: 0 } }),
    mk({ 'f3-s2': 'off', 'f4-s2': { c: T[1], b: 1 }, 'f5-s2': { c: T[0], b: 0 } }),
  ];
  F[1].preSlides = [{ from: 'f1-s2', to: 'f5-s2' }];
  const clip = { id: 'svgT', name: 'svgT', createdAt: Date.now(), frames: F, transitions: [{ technique: null, pairs: [
    { from: 'f3-s2', to: 'f4-s2', technique: 'sl' },
    { from: 'f5-s2', to: 'f6-s2', technique: 'rt' }] }] };
  localStorage.setItem('fretboard-clips', JSON.stringify([clip, ...JSON.parse(localStorage.getItem('fretboard-clips') || '[]').filter(c => c.id !== 'svgT')]));
  location.href = '#/dynamic?c=svgT';
  await sleep(2500);
  let blob = null;
  const orig = URL.createObjectURL;
  URL.createObjectURL = function (b) { if (b.type.includes('svg')) blob = b; return orig.call(this, b); };
  [...document.querySelectorAll('button')].find(b => b.title && b.title.includes('动画 SVG'))?.click();
  const t0 = Date.now();
  while (Date.now() - t0 < 25000 && !blob) await sleep(400);
  URL.createObjectURL = orig;
  if (!blob) return null;
  localStorage.setItem('fretboard-clips', JSON.stringify(JSON.parse(localStorage.getItem('fretboard-clips') || '[]').filter(c => c.id !== 'svgT')));
  return await blob.text();
})()`);
if (!svgText) { console.log('no svg'); process.exit(1); }
console.log('svg bytes:', svgText.length, 'animates:', (svgText.match(/<animate/g) || []).length);
fs.writeFileSync('/tmp/anim.svg', svgText);
// 开个新标签直接打开 svg 文件路径（file:// 从 http 页面拿不到 blob——改 data url 太大；用 localhost 静态？直接把 svg 写到 vite preview? 简便：把 svg 塞进当前页面 document.write）
await bs("Target.activateTarget", { targetId: tid });
const shot = async () => (await send("Page.captureScreenshot", { format: "png" })).result?.data;
await send("Page.enable", {});
await ev(`document.open(); document.write(${JSON.stringify(svgText)}); document.close(); true`);
await sleep(700);
const s1 = await shot();
await sleep(900);
const s2 = await shot();
fs.writeFileSync('/tmp/anim_t1.png', Buffer.from(s1, 'base64'));
fs.writeFileSync('/tmp/anim_t2.png', Buffer.from(s2, 'base64'));
console.log('screenshots saved');
await bs("Target.closeTarget", { targetId: tid });
ws.close(); bws.close(); process.exit(0);
