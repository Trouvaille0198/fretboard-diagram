#!/usr/bin/env node
// P6 拆分：把 fretboard.css 按「连续行区间」切成多个文件（级联顺序绝不重排）。
// 安全设计：
//   1. 只按行区间切；fretboard.css = 原 :root/light 基座 + @import 链（@import 必须在规则前，基座无规则只有注释+变量定义，合法）
//   2. --check：区间连续性 + 逐字节等价校验，不等即拒绝
//   3. WIP 守卫：fretboard.css 有未提交改动时拒绝执行

// 用法：node scripts/split-css.mjs [--check]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src/fretboard.css');
const checkOnly = process.argv.includes('--check');

const dirty = execSync('git status --porcelain -- src/fretboard.css', { cwd: ROOT }).toString().trim();
if (dirty) { console.error('✗ src/fretboard.css 有未提交改动，先提交再拆。'); process.exit(1); }

const css = readFileSync(SRC, 'utf8');
const lines = css.split('\n');

// [文件名, 起始行]（行号为 v227 提交后的实测值；区间 = 起始行到下一区间前一行，末区间到文件尾）
const SECTIONS = [
  ['tokens-base.css', 1],    // 头注释 + :root token 表 + light 主题 + html/body 基础（fretboard.css 变 manifest）
  ['menu-panel.css', 669],    // 菜单面板样式层（.menu/.menu-left/调色盘/移动端断点）
  ['seq-score.css', 1906],    // 序列谱视图
  ['timeline.css', 2296],     // 时间轴
  ['score-page.css', 2546],   // 独立谱子页
  ['dynamic.css', 2889],      // 动态编辑工具条
  ['topnav.css', 3450],       // 顶部导航
  ['chords.css', 3576],       // 和弦谱主区（含页面级强调色/UiSelect/工具行控件规格——按区间归属，语义混合已注释）
  ['songs.css', 6437],        // 曲目入口 + 小控件基线
  ['chords-v24.css', 6744],   // 谱头 + v24 紧凑重设计
  ['stitch.css', 7501],       // 拼接区
  ['figbe.css', 7867],        // 指法小图 + 编辑大弹窗（形状库）
  ['overlays-misc.css', 8456],// 回收站/同步徽标/¶钮/实时分享提示
];

const parts = SECTIONS.map(([file, start], i) => {
  const end = i + 1 < SECTIONS.length ? SECTIONS[i + 1][1] - 1 : lines.length;
  return { file, from: start, to: end, body: lines.slice(start - 1, end) };
});

// 校验：区间拼接必须与原文件逐字节相等（连续无缝 + 无丢失）
const rebuilt = parts.flatMap(p => p.body).join('\n');
const contiguous = rebuilt === css;
if (!contiguous) {
  console.error('✗ 区间拼接与原文件不等（行号表过期或有空洞），重新对表：');
  console.error('   ' + parts.map(p => `${p.file}: ${p.from}-${p.to}`).join(' | '));
  process.exit(1);
}
console.log('✓ 字节级等价确认：' + parts.map(p => `${p.file}: ${p.from}-${p.to}(${p.body.length}行)`).join(' | '));
if (checkOnly) { console.log('✓ --check 通过，可执行实际拆分'); process.exit(0); }

mkdirSync(join(ROOT, 'src/css'), { recursive: true });
for (const p of parts) {
  writeFileSync(join(ROOT, 'src/css', p.file), `/* ${p.file} —— 自 fretboard.css ${p.from}-${p.to} 行拆出（v227 P6）；@import 顺序 = 原级联顺序，不可调换 */\n${p.body.join('\n')}\n`);
}
writeFileSync(SRC, `/* fretboard.css —— v227 P6 拆分后成为 manifest：全部样式按原级联顺序 @import（顺序不可调换）。\n   token 表在 css/tokens-base.css；新增域样式进对应分区文件或组件旁 CSS（见 STYLE_GUIDE）。 */\n` + parts.map(p => `@import './css/${p.file}';`).join('\n') + '\n');
console.log(`✓ 拆分完成：fretboard.css(manifest) + src/css/ 下 ${parts.length} 个分区文件`);
console.log('  验证清单：npm run lint:css → 全部 smoke → Chrome 双主题抽查 → 提交');
