# 指板图创建器功能文档

## 核心功能

### 1. 音符选择和交互

- **单击音符**：选中音符，显示为 `selected` 状态（虚线边框）
- **双击音符**：选中并进入编辑模式，可以修改音符标签
- **Ctrl+单击音符**：选中并进入编辑模式
- **点击背景**：取消当前选中的音符
- **键盘快捷键**（选中音符后）：
  - `B` - 设置为蓝色
  - `D` - 设置为黑色
  - `G` - 设置为绿色
  - `W` - 设置为白色
  - `R` - 设置为红色
  - `Delete` / `Backspace` - 删除音符（恢复为白色，恢复原始标签）

### 2. 音符状态管理

每个音符有三种状态属性：

- **type**: 固定为 `'note'`
- **color**: `'white'`, `'blue'`, `'green'`, `'red'`, `'black'`
- **visibility**: `'transparent'`, `'hidden'`, `'visible'`, `'selected'`

类名格式：`note {color} {visibility}`

### 3. 音符标签编辑

- 双击或 Ctrl+单击进入编辑模式
- 使用 `foreignObject` + `contentEditable div` 实现编辑
- 编辑时隐藏原始 `<text>` 元素，显示可编辑 div
- 按 Enter 或失去焦点完成编辑
- 空文本会恢复为原始音符名称

### 4. 可见性控制

- **Toggle 按钮**：切换未选中音符的可见性
  - `transparent` ↔ `hidden`
  - 已选中（`selected`）和已显示（`visible`）的音符不受影响

### 5. 品格范围设置

- **start-fret**: 起始品格（1-22）
- **end-fret**: 结束品格（1-22）
- 限制：最多显示 16 个品格
- 验证：end > start，范围在 1-22

### 6. 升降号切换

- 切换音符名称显示方式：♯ (升号) ↔ ♭ (降号)
- 影响所有音符的显示名称

### 7. 保存功能

- 保存为 SVG 文件
- 内联所有 CSS 样式
- 移除不可见元素（opacity: 0）

### 8. 重置功能

- 清除所有自定义设置
- 恢复所有音符为白色、原始标签
- 需要确认对话框

## 技术实现要点

### DOM 结构

- 每个音符是 `<g>` 元素，包含：
  - `<circle>` - 圆形背景
  - `<text>` - 音符标签
- 音符 ID 格式：
  - 开放弦：`o-s{stringIndex}`
  - 指板音符：`f{fret}-s{stringIndex}`

### 事件处理

- 音符点击：`event.stopPropagation()` 阻止冒泡
- SVG 背景点击：清除选择
- 键盘事件：全局监听，只在有选中音符时响应

### 类名生成

使用 `generateClassValue` 函数：

- 读取元素的 `className.baseVal`
- 按顺序替换：`[type, color, visibility]`
- 保持类名顺序一致

### 数据存储

- `data` 对象：以 noteId 为键，存储每个音符的状态
- `selected`：存储当前选中的 DOM 元素（不是 ID）
