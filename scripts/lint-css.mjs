// CSS 样式纪律 lint：token 化/分层/悬空变量/!important 四类规则（零依赖，配合提交前全绿）
// 规则细则见 STYLE_GUIDE.md；违例 = 退出码 1
// 用法：node scripts/lint-css.mjs [--strict-important]（P4 清完 !important 后去掉 flag 转常开）
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const strictImportant = process.argv.includes('--strict-important');

// JS 运行时注入的变量（colorConfig.js initColorCSSVariables 22 个 + ChordChartView 2 个），
// CSS 里裸引用不算悬空；新增 setProperty 时同步维护这里
const JS_INJECTED = [/^--color-level[12]-/, '--cc-toolbar-h', '--cc-cross-w'];
// 色彩源文件本体（颜色就住在这）：整体豁免
const COLOR_SOURCE = new Set(['src/colorConfig.js']);

const problems = [];
const warn = [];
const addProblem = (file, line, no, msg) => problems.push(`${file}:${no}: ${msg}\n    | ${line.trim().slice(0, 120)}`);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : walk(p);
    return /\.(css|jsx|js)$/.test(name) ? [p] : [];
});
const files = walk(join(ROOT, 'src')).sort();

// ---------- 规则实现 ----------
const defined = new Set(); // CSS 自定义属性定义（先全量收集，再查悬空）
const hexMap = new Map();  // 精确色值 -> token 名（自动反向映射，与 :root 永远同步）
const baseMap = new Map(); // rgb 基色 -> token 名（rgba 同基色变体必须 color-mix 派生）
const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
const hexToRgb = (h) => {
    h = h.replace('#', '');
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};
for (const f of files.filter(f => f.endsWith('.css'))) {
    const css = readFileSync(f, 'utf8');
    for (const m of css.matchAll(/(--[\w-]+)\s*:\s*(#[\da-f]{3,8}|rgba?\([^)]+\))\s*;/g)) {
        const [, name, val] = m;
        defined.add(name);
        const v = norm(val);
        if (v.startsWith('#')) {
            const rgb = hexToRgb(v);
            const trivial = rgb[0] === rgb[1] && rgb[1] === rgb[2]; // 纯白/纯黑/灰阶泛用值不映射（撞车误报）
            if (!trivial && !hexMap.has(v)) hexMap.set(v, name); // first-wins：同名值多 token 时取更基础的那个（accent 先于 warning 定义）
            if (!trivial && !baseMap.has(String(rgb))) baseMap.set(String(rgb), name);
        } else {
            const mm = v.match(/rgba?\((\d+),(\d+),(\d+),(\d*\.?\d+)\)/);
            if (mm && mm[4] === '1') hexMap.set(v, name); // 全不透明 rgb() 才算等值
        }
    }
    for (const m of css.matchAll(/(--[\w-]+)\s*:\s*var\(/g)) defined.add(m[1]);
    for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
}

for (const f of files) {
    const rel = f.slice(ROOT.length);
    if (COLOR_SOURCE.has(rel)) continue;
    const isCss = f.endsWith('.css');
    const lines = readFileSync(f, 'utf8').split('\n');

    lines.forEach((line, i) => {
        const no = i + 1;
        const allowed = (tag) => line.includes(`lint-allow-${tag}`); // 注释里带标签即可（可附原因）
        const t = line.trimStart();
        if (t.startsWith('/*') || t.startsWith('*') || t.startsWith('//')) return; // 注释行不检查
        const isTokenDef = /^[^{}]*--[\w-]+\s*:/.test(line) && !t.startsWith('//');

        // ① 颜色纪律（自动三档）：
        //    精确命中 token 值 → 硬违例（必须 var(--x)）
        //    rgba 基色命中 token 基色 → 硬违例（必须 color-mix(var(--x) α%) 派生，保值）
        //    未识别颜色 → 警告（存量设计色 / 新颜色请确认是否建 token；改动需带视觉对比）
        if (!isTokenDef && !allowed('color') && !line.includes('var(')) {
            const literalOk = (s) => /^#(fff|000)\b/i.test(s) || ['white', 'black', 'transparent', 'currentcolor'].includes(s.toLowerCase());
            for (const m of line.matchAll(/#[\da-f]{3,8}\b|rgba?\(\s*\d[\d\s,.]*\)/gi)) {
                const tok = m[0];
                if (literalOk(tok)) continue;
                const nv = norm(tok);
                const mm = nv.match(/rgba?\((\d+),(\d+),(\d+)/);
                const baseHit = mm && baseMap.has(`${+mm[1]},${+mm[2]},${+mm[3]}`) ? baseMap.get(`${+mm[1]},${+mm[2]},${+mm[3]}`) : null;
                const exactHit = hexMap.has(nv) ? hexMap.get(nv) : null;
                if (exactHit || baseHit) {
                    // CSS：必须 var()/color-mix；JS：导出字符串无 DOM 上下文不能 var()，降为警告走 colorConfig 常量
                    if (isCss) addProblem(rel, line, no, exactHit ? `裸颜色 ${tok} 与 token 等值：必须写 var(${exactHit})` : `rgba 基色(${mm.slice(1, 4).join(',')}) = token 基色：必须 color-mix(in srgb, var(${baseHit}) α%, transparent) 派生`);
                    else warn.push(`${rel}:${no}: JS 裸颜色 ${tok} 命中 ${exactHit || baseHit}（DOM 样式用 var()；导出/画布常量挪 colorConfig.js） | ${line.trim().slice(0, 90)}`);
                    break;
                }
                if (isCss) warn.push(`${rel}:${no}: 未识别颜色 ${tok}（存量设计色或新颜色——若属固定设计请保留，若会复用请建 token） | ${line.trim().slice(0, 90)}`);
                else if (/style|boxShadow|background|border|color\s*:|fill|stroke/i.test(line)) warn.push(`${rel}:${no}: JS 内联裸颜色 ${tok}（画布/导出常量应进 colorConfig.js；DOM 样式应 var()） | ${line.trim().slice(0, 90)}`);
                break; // 每行只报一次
            }
        }

        // ② z-index 纪律：数值只允许组件内微堆叠（≤10）与连接线工具条历史组（101-104）；≥30 必须 var(--z-*)
        for (const m of line.matchAll(/z-index:\s*(\d+)|zIndex:\s*'?(\d+)/g)) {
            const v = +(m[1] ?? m[2]);
            if (v > 10 && ![101, 102, 103, 104].includes(v)) addProblem(rel, line, no, `裸 z-index: ${v}：全局层级必须用 :root 的 --z-* token（组件内微堆叠 ≤10 除外）`);
        }

        // ③ 悬空 var()：无回退引用必须能解析（CSS 定义 ∪ JS 注入白名单）
        if (!isCss || true) {
            for (const m of line.matchAll(/var\((--[\w-]+)\)/g)) {
                const ok = defined.has(m[1]) || JS_INJECTED.some(p => typeof p === 'string' ? p === m[1] : p.test(m[1]));
                if (!ok) addProblem(rel, line, no, `悬空 var(${m[1]})：变量既无 CSS 定义也不在 JS 注入白名单（lint-css.mjs 的 JS_INJECTED）`);
            }
        }

        // ④ !important：逐个清零中（--strict-important 时违例；否则计数警告）
        if (/!important/.test(line) && !allowed('important')) {
            (strictImportant ? problems : warn).push(strictImportant
                ? `${rel}:${no}: !important 需清除或加 /* lint-allow-important */ 注明存在理由\n    | ${line.trim().slice(0, 120)}`
                : `${rel}:${no}: !important ×1（P4 清理目标）`);
        }
    });
}

// ---------- 汇总 ----------
const imp = warn.filter(w => w.includes('!important'));
const colorWarn = warn.filter(w => !w.includes('!important'));
console.log(`lint-css：扫描 ${files.length} 个文件`);
if (imp.length) console.log(`⚠ !important 残留 ${imp.length} 处（宽松计数；P4 清完后 --strict-important 转违例）`);
if (colorWarn.length && process.argv.includes('--colors')) colorWarn.forEach(w => console.log('⚠', w));
else if (colorWarn.length) console.log(`⚠ 未识别颜色（存量设计色清单）${colorWarn.length} 处（--colors 查看；改动需带视觉对比）`);
for (const p of problems) console.log('✗', p);
console.log(problems.length ? `\n✗ ${problems.length} 处违例` : imp.length || colorWarn.length ? `\n✓ 硬性规则全过（警告 ${imp.length + colorWarn.length} 处）` : `\n✓ 全部通过`);
process.exit(problems.length ? 1 : 0);
