# 项目规约

## 浏览器 / Chrome 使用规矩（硬性，违反即事故）

1. **禁止新建 Chrome 窗口或实例。** 测试一律复用已开的浏览器：
   - 自动化测试只用调试端口 **9223** 上已运行的实例（专用 profile `Chroly/browser-profile`）。
   - 启动前必须先探活：`sh scripts/ensure-testchrome.sh`（内部已实现"活着就复用，死了才拉起"），**不允许**直接调 `chrome.exe --remote-debugging-port=...`。
   - 需要给用户看效果时，往**用户当前已有的 Chrome 窗口**开新标签页（`chrome.exe "url"` 会自动复用已运行实例），绝不带 `--user-data-dir` 另起实例。
2. 测试结束必须 `agent-browser close` 收拾干净（关标签/会话，不关用户的浏览器）。
3. 曾经的教训：一轮需求里反复 `chrome.exe about:blank` 启动，因 Chrome 同 profile 单例机制，每次都往用户桌面塞一个空白标签页，攒了"一万个窗口"，用户震怒。此规约因此而生。

## 开发环境

- Vite dev server：端口 5173；`vite.config.js` 已强制 `no-store`（WSL 下文件监视失效 + Chrome 304 缓存会喂旧模块，导致"改了不生效"）。
- 版本链：`index.html` 引 `main.jsx?v=N`、`main.jsx` 引 `fretboard.css?v=N`，大改后同步 bump（顶栏水印 vN 供用户自查）。
- 纯逻辑测试：`node scripts/smoke-chords.mjs`（和弦谱）+ `node scripts/smoke-core.mjs`（动效内核），提交前全绿。
- 测试浏览器探活脚本：`scripts/ensure-testchrome.sh`。

## 代码约定

- 组件按 i18n 分块取词：`const ts = t?.chords ?? {}` + `ts.xxx ?? "中文默认"` 双兜底。
- 和弦谱数据模型在 `src/utils/chordChartModel.js`（localStorage `fretboard-chordcharts`，滚动备份 ×3）。
- 打谱页（`#/chords`）的 7 个工具页签**永远不变**：预览是其中之一，内容区单独渲染预览子栏（文本谱/动态谱），不换 tab 栏。
