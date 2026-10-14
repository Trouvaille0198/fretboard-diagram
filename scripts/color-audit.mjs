// 多色系×多场景颜色审计
import { expandTimeline } from '../src/utils/timeline.js';
import { generateTintVariants, getLevel1FillColor } from '../src/colorConfig.js';
const SCHEMES = ['navy', 'crimson', 'green', 'blue', 'red', 'brown', 'gray'];
let fail = 0, n = 0;
const A = (name, ok, detail) => { n++; if (!ok) { fail++; console.log('  ✗', name, detail || ''); } };
for (const scheme of SCHEMES) {
  const T = generateTintVariants(getLevel1FillColor(scheme));
  const mk = (lit, b) => {
    const data = {};
    Object.entries(lit).forEach(([id, v]) => {
      data[id] = typeof v === 'string'
        ? { type: 'note', color: 'white', color2: null, visibility: 'transparent' }
        : { type: 'note', color: { name: scheme, custom: v.c }, color2: null, visibility: 'visible', birth: v.b };
    });
    return { data, startFret: 1, endFret: 13, visibility: 'transparent' };
  };
  const vis = (s, id) => (s.data[id] && s.data[id].visibility === 'visible' ? s.data[id].color.custom : null);
  // ① rt B 色 = 帧位档（帧2 无出生音 → 位置公式 t=1 = T[3]）
  let r = expandTimeline([mk({ 'f5-s2': { c: T[0], b: 0 } }), mk({ 'f5-s2': { c: T[0], b: 0 } })], [{ technique: null, pairs: [{ from: 'f5-s2', to: 'f6-s2', technique: 'rt' }] }], 300, 200);
  const rtB = r.states.map(s => vis(s, 'f6-s2')).filter(Boolean)[0];
  A(`${scheme} rt B=帧位档(无出生→位置t=1=deep)`, rtB === T[3], rtB);
  // ② rt B 色 = 帧位档（帧2 有出生音 f7 → 取 f7 的色）
  r = expandTimeline([mk({ 'f5-s2': { c: T[0], b: 0 } }), mk({ 'f5-s2': { c: T[0], b: 0 }, 'f7-s2': { c: T[1], b: 1 } })], [{ technique: null, pairs: [{ from: 'f5-s2', to: 'f6-s2', technique: 'rt' }] }], 300, 200);
  const rtB2 = r.states.map(s => vis(s, 'f6-s2')).filter(Boolean)[0];
  A(`${scheme} rt B=帧位档(有出生→同色)`, rtB2 === T[1], rtB2);
  // ③ sl B 保持数据出生色
  r = expandTimeline([mk({ 'f5-s2': { c: T[0], b: 0 } }), mk({ 'f5-s2': 'off', 'f8-s2': { c: T[2], b: 1 } })], [{ technique: null, pairs: [{ from: 'f5-s2', to: 'f8-s2', technique: 'sl' }] }], 300, 200);
  const slB = r.states.map(s => vis(s, 'f8-s2')).filter(Boolean);
  A(`${scheme} sl B=数据色全程一色`, slB.every(c => c === T[2]) && slB.length > 0, slB.join(','));
  // ④ pre 目标复亮=原色、滑行音=帧位档
  const F = [mk({ 'f4-s2': { c: T[1], b: 0 } }), mk({ 'f4-s2': { c: T[1], b: 0 } })];
  F[1].preSlides = [{ from: 'f1-s2', to: 'f4-s2' }];
  r = expandTimeline(F, [{ technique: null, pairs: [] }], 300, 200);
  const relit = vis(r.states[r.states.length - 1], 'f4-s2');
  A(`${scheme} pre: B 到达才亮原色`, (() => { const w = r.states.find(st => !vis(st, 'f4-s2')); const tail = r.states[r.states.length - 1]; return !!w && vis(tail, 'f4-s2') === T[1]; })());
  A(`${scheme} pre: 无瞬态滑行音`, r.states.every(st => !vis(st, 'f1-s2')));
  // ⑤ hp B 帧位档
  r = expandTimeline([mk({ 'f5-s2': { c: T[0], b: 0 } }), mk({ 'f5-s2': { c: T[0], b: 0 } })], [{ technique: null, pairs: [{ from: 'f5-s2', to: 'f6-s2', technique: 'hp' }] }], 300, 200);
  const hpB = r.states.map(s => vis(s, 'f6-s2')).filter(Boolean)[0];
  A(`${scheme} hp B=帧位档`, hpB === T[3], hpB);
  // ⑥ 并发四技各色不串（B 全部=帧位档，sl B=数据色）
  const F4 = [
    mk({ 'f3-s2': { c: T[0], b: 0 }, 'f5-s2': { c: T[0], b: 0 }, 'f7-s2': { c: T[0], b: 0 }, 'f9-s2': { c: T[0], b: 0 } }),
    mk({ 'f3-s2': 'off', 'f4-s2': { c: T[2], b: 1 }, 'f5-s2': { c: T[0], b: 0 }, 'f7-s2': { c: T[0], b: 0 }, 'f9-s2': { c: T[0], b: 0 } }),
  ];
  F4[1].preSlides = [{ from: 'f1-s2', to: 'f9-s2' }];
  r = expandTimeline(F4, [{ technique: null, pairs: [
    { from: 'f3-s2', to: 'f4-s2', technique: 'sl' },
    { from: 'f5-s2', to: 'f6-s2', technique: 'rt' },
    { from: 'f7-s2', to: 'f8-s2', technique: 'hp' }] }], 300, 200);
  const cSl = r.states.map(s => vis(s, 'f4-s2')).filter(Boolean)[0];
  const cRt = r.states.map(s => vis(s, 'f6-s2')).filter(Boolean)[0];
  const cHp = r.states.map(s => vis(s, 'f8-s2')).filter(Boolean)[0];

  A(`${scheme} 并发: slB=数据色 rtB/hpB=帧位档 pre无瞬态`, cSl === T[2] && cRt === T[2] && cHp === T[2] && r.states.every(st => !vis(st, 'f1-s2')), [cSl, cRt, cHp].join('|'));
  // ⑦ A 源音色全程不漂移（rt A 用上一帧原色）
  const aSeq = r.states.map(s => vis(s, 'f5-s2')).filter(Boolean);
  A(`${scheme} rt A 全程原色(pale)`, aSeq.every(c => c === T[0]), aSeq.join(','));
}
console.log(fail === 0 ? `===== 七色系颜色审计全部通过（${n} 项）=====` : `===== ${fail}/${n} 项失败 =====`);
process.exit(fail ? 1 : 0);
