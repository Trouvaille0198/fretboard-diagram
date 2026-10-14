import WebSocket from "ws";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const v = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const bws = new WebSocket(v.webSocketDebuggerUrl, { suppressOrigin: true });
await new Promise(r => bws.on("open", r));
let bid = 0; const bp = new Map();
bws.on("message", m => { const d = JSON.parse(m); if (d.id && bp.has(d.id)) { bp.get(d.id)(d); bp.delete(d.id); } });
const bs = (method, params = {}) => new Promise(r => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const tid = (await bs("Target.createTarget", { url: "http://localhost:4173/?v71=" + Date.now() + "#/dynamic?c=clip-1791961420033-ogwxp7" })).result.targetId;
for (let i = 0; i < 3; i++) { await bs("Target.activateTarget", { targetId: tid }); await sleep(400); }
await sleep(4500);
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
const out = await ev(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const btn = t => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t); if (b) b.click(); return !!b; };
  const loopBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '↻');
  if (loopBtn && !loopBtn.className.includes('on')) loopBtn.click();
  await sleep(300);
  const samples = [];
  btn('▶');
  const T0 = performance.now();
  const iv = setInterval(() => {
    const t = performance.now() - T0;
    const fx = document.querySelector('.stage-fx-layer');
    const moving = fx ? [...fx.querySelectorAll('circle')].find(c => Math.abs((parseFloat(c.getAttribute('r'))||0) - 20) < 3) : null;
    const gB = document.querySelector('.fretboard-stage-wrap svg #f8-s0');
    samples.push({ t: Math.round(t), mov: moving ? 1 : 0, bOp: gB ? +(parseFloat(getComputedStyle(gB).opacity) || 0).toFixed(2) : 0 });
  }, 16);
  await sleep(1500);
  clearInterval(iv); btn('⏹');
  return samples.filter(s => s.t >= 260 && s.t <= 480);
})()`, 15000);
console.log('交接区复检 (fx在=1, 板面B透明度):');
out.forEach(s => console.log(' ', s.t + 'ms fx:' + s.mov + ' B:' + s.bOp));
// 剪贴板 SVG 探索
const clip = await ev(`(async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="red"><animate attributeName="r" values="8;3;8" dur="1s" repeatCount="indefinite"/></circle></svg>';
  const res = {};
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/svg+xml': new Blob([svg], { type: 'image/svg+xml' }) })]); res.svgOnly = 'OK'; } catch (e) { res.svgOnly = e.name + ':' + String(e.message).slice(0, 50); }
  try {
    const cv = document.createElement('canvas'); cv.width = 20; cv.height = 20;
    const png = await new Promise(r => cv.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png, 'image/svg+xml': new Blob([svg], { type: 'image/svg+xml' }) })]);
    res.pngPlusSvg = 'OK';
  } catch (e) { res.pngPlusSvg = e.name; }
  return res;
})()`, 15000);
console.log('剪贴板 SVG:', JSON.stringify(clip, null, 1));
await bs("Target.closeTarget", { targetId: tid });
ws.close(); bws.close(); process.exit(0);
