# 前端样式规范（STYLE_GUIDE）

> v225 起生效。提交前自查：`node scripts/lint-css.mjs` + smoke 全绿（见 AGENTS.md）。
> lint 是硬门：token 等值裸写 / token 基色 rgba / 裸 z-index≥30 / 悬空 var() 都会挡提交。

## 1. 颜色：一切走 token

- **token 定义只在一个地方**：`src/fretboard.css` 的 `:root`（暗色默认）+ `html[data-theme="light"]`（亮色覆写）。
- **新颜色**：先问"是不是既有 token 的变体"。alpha 变体一律 `color-mix` 派生，不建新 token：
  ```css
  color-mix(in srgb, var(--app-accent) 14%, transparent)   /* = rgba(243,186,98,.14) */
  color-mix(in srgb, #fff 6%, transparent)                 /* 白色低透明叠加 */
  ```
- **token 命名**：全局 `--app-*`；和弦谱域 `--cc-*`（在 .cc-page/:root 定义）；JS 注入 `--color-level*`（colorConfig.js）。
- **亮色主题**：新组件必须两个主题都过一遍。覆写写在全局 light 块，不私自开局部 light 块。
- **var() 回退**：变量保证有定义（:root 兜底）就不写回退值。活回退（变量可能未定义）才写 `var(--x, fallback)`。
- **字面色白名单**：`#fff`/`#000`/`white`/`black`/`transparent`。其余字面必须 `/* lint-allow-color 原因 */`。
- **导出/画布域**（SVG 导出、canvas 绘制、无 CSS 上下文）：常量集中在 `src/colorConfig.js` 的
  `CANVAS_COLORS` / `ANIM_FX_COLORS` / `SECTION_TINTS`，不在业务文件里散写。

## 2. z-index：分层表 + 语义 token

- 全局层级只用 `:root` 的 `--z-*`。**同值即同层**，互叠顺序靠 DOM。
- **段位约定**：十位=页内浮层（30~90）| 百位=菜单/吸顶（300~600）| 千位=chrome·遮罩（900~2000）| 万位=模态顶层（9999~10100）。
- 数值只允许两种场景裸写：组件内微堆叠（≤10）、连接线工具条历史组（101–104，勿模仿）。
- 新层级：先看分层表有没有合适的；确实要新层，在对应段位加 token 并注明用途，不要拍数值。

## 3. 前缀分区（BEM 之外的本文约定）

| 前缀 | 域 | 主场文件（v227 P6 拆分后） |
|---|---|---|
| （token） | :root 表 + light 主题 | `src/css/tokens-base.css` |
| `.menu-*` | 菜单面板/调色盘 | `src/css/menu-panel.css` |
| `.score-fx` | 过渡特效层（TransitionFx 兜底容器） | `src/css/seq-score.css` |
| `.tl-*` | 时间轴 | `src/css/timeline.css` |
| `.dyn-*` | 动效编辑/播放 | `src/css/dynamic.css` / DynamicToolbar |
| `.top-*` | 顶部导航 | `src/css/topnav.css` / TopNav |
| `.cc-*` | 和弦谱页 | `src/css/chords.css` + `chords-v24.css` / ChordChartView |
| （曲目） | 曲目入口/小控件 | `src/css/songs.css` |
| `.stitch-*` | 拼接坞 | `src/css/stitch.css` / StitchDock |
| `.figbe-*` | 形状库/fig 编辑 | `src/css/figbe.css` / FigBoardEditor |
| （杂项浮层） | 回收站/同步徽标/¶钮 | `src/css/overlays-misc.css` |
| 组件私有 | 新组件 | 与组件同目录的 `X.css`（参考 Toast/LoginModal） |

`fretboard.css` 现在是 **manifest**（纯 @import 链，顺序 = 原级联顺序，**不可调换**）。新域样式进对应分区文件；新组件放组件旁独立 CSS，**不要**往 manifest 加 import 之外的东西。

## 4. 内联 style 纪律

- **动态值**（JS 计算的坐标/尺寸/进度）可以内联。
- **静态样式**进 CSS 类。颜色/层级内联一律 var()（见 1、2）。
- 导出/画布字符串色 → colorConfig.js 常量（见 1）。

## 5. 版本链

- `index.html → main.jsx?v=N`、`main.jsx → fretboard.css?v=N`，大改 bump 同步；顶栏水印 vN。
- `fretboard.css`（manifest）只在 `main.jsx` 引入一次（Fretboard/PianoKeyboard 不许再 import，会双份注入）；改 token 进 `src/css/tokens-base.css`。
- 组件 CSS 不带版本参数（Vite 构建自带 hash）。

## 6. !important 政策（P4 定案）

- **新增 `!important` 必须带 `/* lint-allow-important 理由 */`**，理由只有三种合法：
  1. `对抗内联`：CSS 要赢 JS/SVG 内联样式（opacity/stroke/cursor 等，唯一手段）。
  2. `断点承载层`：媒体查询里压制更晚/更强的复合选择器（实证：删了移动端布局会变）。
  3. `防御性覆写`：压制同文件更晚的同属性规则（dropdown 定位类）。
- 存量 102 处已全部分类标注（fretboard.css 79 + FretboardGallery.css 23——后者是死代码文件，未被任何组件加载）。
- 想去掉某处：先跑页内剥离探针（CSSOM 逐条去 important + 全元素 computed diff，见 v225 提交记录），**移动端视口必须测**——桌面零差异不代表断点内零差异。

## 7. 工具

- `npm run lint:css`（或 `node scripts/lint-css.mjs`）：硬规则（颜色/z/悬空/!important）+ 设计色存量清单（`--colors` 看明细）。
- 改"存量设计色"（lint 警告清单里的）必须带前后视觉对比，不允许顺手改色。
- lint 的 JS_INJECTED 白名单：新增 `setProperty("--x")` 时同步维护。
