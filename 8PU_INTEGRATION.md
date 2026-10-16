# 8pu 打谱 × 指板动图 串联调研

> 调研日期：2026-10-15。信息来源：8pu.cn 官网与官方文档（8pu.cn/docs）、我方代码盘点。
>
> **进展更新（2026-10-15）**：已按用户裁定**自建复刻 8pu 和弦谱**（v1 上线）：`#/chords` 路由整页——每拍和弦位/级数⇄音名/键盘输入/反拍拆分/反复跳房子/段落歌词/移调看谱/木吉他播放+节拍器/**MusicXML 双向互导**/**一键生成指板动图**（出生帧色+自动滑弦对，进动态模式精修导出）。详见 INTERACTION_GUIDE.md「和弦谱」章与 `scripts/smoke-chords.mjs`（123 项断言）。方案 A（MusicXML 桥）由此从"8pu→我们"单向导入升级为**平级互操作**：我们自产自销，同时保持与 8pu/MuseScore 的文件级互通。

## 一、8pu 打谱能力盘点

### 平台形态
- **Web**（8pu.cn，SPA）+ Windows/Mac 客户端 + iOS App，云端曲库、自动保存、跨设备同步。
- 定位：在线打谱平台（"全新定义的简谱制作平台"）。

### 谱种（当前已开放）
| 谱种 | 内容 | 与我们的关系 |
| --- | --- | --- |
| 简谱 | 数字谱（旋律、节奏、歌词） | 旋律→指板分镜的来源 |
| 功能简谱 | 数字谱 + 和弦级数（1/6m/4m…） | 级数与我们 `chordDisplay` 的 degree 模式同构 |
| 和弦谱 | 和弦进行 | 直接映射到小节 chord 字段 |
| 吉他谱 | 关键词/营销中出现，文档写"更多谱子类型正在设计开发中" | 未开放，暂不可依赖 |

### 编辑器能力
- 所见即所得（WYSIWYG）；输入：鼠标点虚拟钢琴、电脑键盘弹奏、**MIDI 键盘实时录入**。
- 多声部、连音、倚音、变调记号、反复/跳转记号；播放多音色、速度调节、节拍器、**移调试听**、和弦显示模式切换（级数⇄音名——和我们同款双显）。

### 文件与互操作（★ 关键结论）
| 格式 | 导入 | 导出 | 说明 |
| --- | --- | --- | --- |
| **8pux** | ✔ | ✔ | 专有项目文件（音符/和弦/歌词/样式），格式未公开 |
| **MusicXML** | ✔ | ✔ | **公开标准，唯一的正式数据桥** |
| **MIDI** | ✔ | ✔ | 公开标准，只有音高+时值，丢失和弦名/歌词/调号语义 |
| 音频 / PDF / PNG / 打印 | — | ✔ | 成品消费格式 |

### 分享与开放度
- 链接分享：`8pu.cn/s/xxxxx`，无需登录可看；分享版是**快照**，编辑后可手动更新。
- **没有公开 API**；文档无任何嵌入/iframe/第三方集成条目；分享页是 SPA 空壳，曲谱数据走私有接口异步加载。
- 另有"视频动态谱"功能（上传音频+关联曲谱→滚动谱视频）：与我们同赛道但媒介不同——他们是**谱面滚动+音频**，我们是**指板手法演示**，互补而非竞争。

**结论：8pu 是封闭花园 + 两个标准出口（MusicXML/MIDI）。任何数据级串联都应走文件格式，不碰私有接口。**

## 二、我方对接面盘点

| 模块 | 现状 | 位置 |
| --- | --- | --- |
| 动图系统 | clip = `{id, name, frames[], transitions[]}`，技法 sl/rt/hp/pre/bd/chain，导出 GIF/WebM/MP4/SMIL-SVG/JSON（`fretboard-clip-data` v1），localStorage+云同步 | `useDynamicMode.js`、`clipModel.js`、`timeline.js` |
| **SongScoreView** | **已按"8pu 式"设计的独立谱子页原型：小节（measureId 分组）+ 每小节 {chord, jianpu, lyrics} + 歌曲级 {bpm, beatsPerBar, isMinor} + 文本谱/动态谱两页签 + SVG/PNG 导出。但没接线——全仓库无 import 引用** | `SongScoreView.jsx`（挂起的原型） |
| 乐理基建 | `parseChordToken`/`chordDisplay`（级数⇄音名双向）、rootNote/enharmonic、computeNoteName（品+弦→音名） | `songStructure.js` |
| 分享 | `fretboard://` LZ-string（单板面）、clip JSON（动图） | `fretboardShare.js` |
| 缺口 | ① 无 pitch→(弦,品) 反向映射；② 无 MusicXML/MIDI 解析器；③ SongScoreView 未挂载；④ 歌曲视图帧与动图 clip 帧是两套数据 | — |

## 三、串联方案（按可行性排序）

### 方案 A（推荐主路径）：MusicXML 桥——8pu 打谱 → 导出 MusicXML → 导入自动生成分镜

```
8pu 编辑器（简谱/功能谱）
   └─导出→ score.musicxml
        └─我们导入→ ① 解析成 measures（旋律 pitch/时值 + harmony 和弦 + lyric 歌词 + 调号拍号）
                    ② 和弦→measureMeta.chord、歌词→lyrics（chordDisplay 直接可显）
                    ③ 旋律 pitch→指板位置【核心新算法】
                    ④ 分镜：每音/每拍/每和弦块一帧；同弦相邻自动标 sl（可选相邻弦同品标 bd）
                    ⑤ 产出：SongScoreView 小节结构 + 每小节动图 → 进 dynamic 模式微调
                                → 现有导出链路（GIF/WebM/SVG）免费获得
```

- **pitch→指板映射**（③）是唯一的核心新算法：MIDI 音高 → 候选 (弦,品) 集合，按"同弦延续优先 → 品位就近 → 品窗约束"贪心选择；开放弦与 12 品以上需规则兜底。`computeNoteName` 已有正向表，反向枚举即可。
- 优点：全走公开标准、离线可用、8pu 升级不影响我们。
- 落点：新增 `src/utils/musicxmlImport.js` + `pitchMap.js`；SongScoreView 谱头加"导入 MusicXML"；Fretboard.jsx 挂载 SongScoreView。
- 风险：8pu MusicXML 导出的**保真度需实测**（多声部、和弦谱、简谱八度点→octave、歌词对齐）——这是 Phase 1 前的第一个实验。

### 方案 A'：MIDI 桥（降级版）
同一管道，解析 MIDI（音高+时刻）。丢失和弦名/歌词/调号，和弦需自己 chordinfy（同时发声→和弦识别）。仅在拿不到 MusicXML 时兜底。

### 方案 B（反向）：我们导出 MusicXML → 8pu 精修/打印
SongScoreView 已有小节 jianpu 文本（"1 2 3 5"）+ chord + bpm/beatsPerBar/rootNote——足以生成基础 MusicXML（degree→pitch 用 rootNote + 大/小音阶，八度合理默认）。场景：动图教学演示→需要漂亮纸质谱→推回 8pu 排版打印。导出比导入简单得多，工作量小。**A+B = 完整双向 round-trip。**

### 方案 C（轻量元数据）：分享链接互链
8pu 分享链接 `8pu.cn/s/xxx` 存进 songMeta（谱头显示"在 8pu 查看↗"外链）；clip JSON 带来源标注。**不做数据抓取**（无 API，抓私有接口不稳也不合适）。几乎零成本，可与 A 并行。

### 不可行 / 不推荐
- **直连 8pu 私有 API / 爬分享页**：SPA+未公开接口，随时变。
- **iframe 嵌 8pu 编辑器**：官方无嵌入支持。
- **自建打谱编辑器**：8pu 已做得足够好；我们定位是指板动图，打谱交给 8pu，MusicXML 串联，各守强项。

## 四、落地路线

| 阶段 | 内容 | 量级 |
| --- | --- | --- |
| **实验（先行）** | 在 8pu 打一首功能谱 → 导出 MusicXML → 人工检查和弦/歌词/八度保真度 | 半天，决定 A 的映射细节 |
| Phase 1（MVP） | 挂载 SongScoreView + MusicXML 解析（旋律/和弦/歌词→小节）+ pitch→指板映射 + 每音一帧分镜 → dynamic 模式可编辑 | 中 |
| Phase 2 | 分镜策略可配（每拍/每音/每和弦块）+ 自动 sl/bd 标注 + 8pu 链接元数据（C） | 中 |
| Phase 3 | 反向 MusicXML 导出（B），完成 round-trip | 小 |

## 附：8pu 快照（2026-10）
- 文档：8pu.cn/docs（Starlight 站点）；入门 /guides/getting-started、导入导出 /guides/import_export、分享 /guides/share。
- 视频教程列表 /docs/getting-started/videos；FAQ /docs/getting-started/faq。
- 平台页 /docs/features/online（下载/同步）；iOS App Store id6752315068。
