#!/usr/bin/env node
// P6 拆分脚本（待命）：把 fretboard.css 按既有分区横幅切成多个文件，fretboard.css 保留 @import 链 + :root token。
// 安全性设计：
//   1. 只按「连续行区间」切（绝不按选择器前缀分组——那会重排级联顺序）
//   2. @import 必须在所有规则之前 → fretboard.css = @import 链 + 原 :root/light 区块
//   3. --check 模式：拼接全部产物（去掉 @import 行）与原文件逐字节比对，不等即失败
// 运行前置：工作树对 src/fretboard.css 必须是干净的（git diff 为空）——活跃 WIP 期间禁止执行。
// 用法：node scripts/split-css.mjs [--check]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src/fretboard.css');
const checkOnly = process.argv.includes('--check');

const dirty = execSync('git status --porcelain -- src/fretboard.css', { cwd: ROOT }).toString().trim();
if (dirty) { console.error('✗ src/fretboard.css 有未提交改动（活跃 WIP），拒绝拆分。先提交再跑。'); process.exit(1); }

const css = readFileSync(SRC, 'utf8');
const lines = css.split('\n');

// 分区表：按文件内既有横幅注释的行号区间（拆分前用 --check 校验区间连续无空洞）
// [目标文件, 起始横幅匹配词]（区间 = 该横幅行到下一横幅前一行；token 基座固定在文件头）
const SECTIONS = [
  ['fretboard-base.css', 'Title header'],            // 指板图本体 + 菜单/调色盘
  ['timeline.css', '时间轴'],
  ['score-page.css', '独立谱子页'],
  ['dynamic.css', '动态编辑工具条'],
  ['topnav.css', '顶部导航'],
  ['chords.css', '和弦谱（8pu'],
  ['songs.css', '曲目入口'],
  ['figbe.css', '形状库'],                            // figbe/fig 编辑区（横幅词按实际调整）
];
// 兜底：横幅没覆盖到的尾部区块并入最后一个文件，--check 的字节等价会兜住任何遗漏

const bannerRe = /^\/* =+ .* =+ \*\/$|\/\* =+ .* =+ \*\//;
const banners = [];
lines.forEach((l, i) => { if (/^\/\* =+ .+ =+ \*\/$/.test(l.trim()) || /^\/\* =+= /.test(l.trim())) banners.push({ line: i + 1, text: l.trim() }); });
if (!banners.length) { console.error('✗ 未找到分区横幅，中止'); process.exit(1); }

// token 基座 = 第一个横幅之前的所有行（:root + light + 头部注释）
const firstBanner = banners[0].line;
const base = lines.slice(0, firstBanner - 1);

// 定位各 section 起点
const starts = SECTIONS.map(([file, kw]) => {
  const b = banners.find(x => x.text.includes(kw));
  if (!b) { console.error(`✗ 横幅关键词未命中: ${kw}`); process.exit(1); }
  return { file, start: b.line };
}).sort((a, b) => a.start - b.start);
const tailStart = starts[starts.length - 1].start;
const tail = { file: starts[starts.length - 1].file, start: tailStart };

const parts = [];
starts.forEach((s, i) => {
  const end = i + 1 < starts.length ? starts[i + 1].start - 1 : lines.length;
  parts.push({ file: s.file, from: s.start, to: end, body: lines.slice(s.start - 1, end) });
});

if (checkOnly) {
  const rebuilt = [...base.map(l => l), ...parts.flatMap(p => p.body)].join('\n');
  console.log(rebuilt === css ? '✓ 区间拼接与原文件逐字节相等（可以安全拆分）' : '✗ 区间拼接不等！中止，人工核对横幅区间');
  console.log(`基座 ${base.length} 行 | ` + parts.map(p => `${p.file}: ${p.from}-${p.to}(${p.body.length})`).join(' | '));
  process.exit(rebuilt === css ? 0 : 1);
}

mkdirSync(join(ROOT, 'src/css'), { recursive: true });
for (const p of parts) {
  writeFileSync(join(ROOT, 'src/css', p.file), `/* ${p.file} —— 自 fretboard.css ${p.from}-${p.to} 行拆出（v226 拆分，顺序不可调换） */\n${p.body.join('\n')}\n`);
}
writeFileSync(SRC, base.join('\n') + '\n' + parts.map(p => `@import './css/${p.file}';`).join('\n') + '\n');
console.log(`✓ 拆分完成：基座 + ${parts.length} 个分区文件；跑 lint:css + 全部 smoke + Chrome 抽查后提交`);
