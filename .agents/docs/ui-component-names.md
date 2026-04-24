# 页面组件命名

这份文档用于约定指板页面各个主要区域的中文称呼，方便后续沟通时快速对齐。组件名保留英文，便于直接对应代码。

## 主要区域

1. 主题切换按钮
   - 页面右上角的小圆形明暗主题切换按钮。
   - 来源：`src/Fretboard.jsx`

2. 顶部标题区
   - 页面顶部显示 `Fretboard Diagram Generator` 和当前时间的区域。
   - 来源：`src/Fretboard.jsx`

3. 指板主画布
   - 页面上半部分的大型指板显示区域。
   - 包含品格、琴弦、音符圆点、文字标签和连线。
   - 组件：`FretboardSVG`

4. 底部控制面板
   - 页面中下部的主控制区。
   - 组件：`FretboardMenu`

5. 调色板
   - 控制面板中的那排颜色按钮。
   - 组件：`ColorPalette`

6. 全局操作栏
   - 包含升降号切换、显示切换、保存、重置、SVG 导出或复制的按钮区。
   - 定义在 `FretboardMenu` 内部。

7. 连线工具栏
   - 包含 `Connect`、`Line` 或 `Arc`、箭头方向切换的那一排。
   - 定义在 `FretboardMenu` 内部。

8. 导出选项区
   - 包含品数、音符标签、裁切、仅复制、小调等勾选项的区域。
   - 定义在 `FretboardMenu` 内部。

9. 钢琴键盘
   - 控制面板右侧的键盘区域。
   - 组件：`PianoKeyboard`

10. 品位范围滑条
    - 钢琴键盘下方的双滑块范围选择器。
    - 组件：`FretRangeSlider`

11. 音阶卡片区
    - 页面底部显示当前调性和各级和弦的卡片区域。
    - 组件：`ScaleDisplay`

12. 指板堆
    - 页面左下角保存的指板快照堆栈。
    - 组件：`FretboardDock`

13. 提示消息
    - 页面上临时出现的成功或错误提示。
    - 组件：`Toast`

## 次要区域

1. 左侧历史侧边栏
    - 页面左侧滑出的历史记录或图库面板。
    - 组件：`FretboardGallery`
    - 如果处于收起状态，截图里可能不会显示出来。

## 推荐简称

- “指板主画布” = Fretboard canvas
- “底部控制面板” = Control panel
- “调色板” = Color palette
- “连线工具栏” = Connection toolbar
- “钢琴键盘” = Piano keyboard
- “品位范围滑条” = Fret range slider
- “音阶卡片区” = Scale display
- “指板堆” = Fretboard dock
- “左侧历史侧边栏” = History sidebar

## 沟通示例

- “把指板主画布放大一点”
- “把调色板移到右边”
- “连线工具栏默认展开”
- “钢琴键盘和品位范围滑条对齐”
- “指板堆不要挡住内容”
