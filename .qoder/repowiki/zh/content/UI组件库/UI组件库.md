# UI组件库

<cite>
**本文档引用的文件**   
- [ColorPalette.jsx](file://src/components/ColorPalette.jsx)
- [FretRangeSlider.jsx](file://src/components/FretRangeSlider.jsx)
- [Toast.jsx](file://src/components/Toast.jsx)
- [PianoKeyboard.jsx](file://src/PianoKeyboard.jsx)
- [Toast.css](file://src/components/Toast.css)
- [colorConfig.js](file://src/colorConfig.js)
- [constants.js](file://src/constants.js)
- [fretboard.css](file://src/fretboard.css)
</cite>

## 目录
1. [调色盘组件 (ColorPalette)](#调色盘组件-colorpalette)
2. [品格范围滑块 (FretRangeSlider)](#品格范围滑块-fretrangeslider)
3. [用户反馈提示 (Toast)](#用户反馈提示-toast)
4. [钢琴键盘组件 (PianoKeyboard)](#钢琴键盘组件-pianokeyboard)
5. [可访问性考虑](#可访问性考虑)

## 调色盘组件 (ColorPalette)

`ColorPalette` 组件为用户提供了一组预定义的颜色选择，用于标记吉他指板上的音符。该组件分为两个层级：第一层颜色用于音符的填充色，第二层颜色用于描边。

### 视觉设计
调色盘由两行按钮组成：
- **第一行**：显示第一层级颜色（蓝色、绿色、红色、白色、黑色），每个按钮代表一个基础颜色。
- **第二行**：显示第二层级颜色（黄色、青色、粉色、草绿色、橙色、白色），这些颜色通常用于描边。

选中的颜色会通过一个细边框高亮显示。第一层级颜色的快捷键映射为：蓝色(B)、绿色(G)、红色(R)、白色(W)、黑色(D)。

### 交互行为
- **单击**：选择一个颜色。如果当前处于“异色模式”，则选择该颜色的默认变体。
- **双击**：进入“异色模式”，为当前颜色生成一系列深浅不同的变体，允许用户选择更浓或更淡的色调。
- **右键点击**：弹出确认对话框，询问是否将所有使用异色的音符替换为当前颜色对应的浓度。

### Props 接口
| 属性 | 类型 | 必需 | 描述 |
| :--- | :--- | :--- | :--- |
| `selectedColorLevel` | number | 是 | 当前选中的颜色层级 (1 或 2) |
| `selectedColor` | string \| object | 是 | 当前选中的颜色名称或自定义颜色对象 |
| `onSelectColor` | function | 是 | 颜色选择回调函数 `(level, colorName, customColor?) => void` |
| `onDoubleClickColor` | function | 否 | 双击颜色回调函数 `(level, colorName) => void` |
| `onReplaceAllTintNotes` | function | 否 | 替换所有异色音符的回调函数 `(targetColorName) => void` |

### 样式定制
颜色配置在 `colorConfig.js` 文件中集中管理。通过修改 `LEVEL1_COLORS` 和 `LEVEL2_COLORS` 对象，可以轻松更改整个应用的配色方案。组件使用 CSS 变量（如 `--color-level1-blue-fill`）来应用颜色，确保样式的一致性和可维护性。

**Section sources**
- [ColorPalette.jsx](file://src/components/ColorPalette.jsx#L1-L61)
- [colorConfig.js](file://src/colorConfig.js#L4-L41)
- [fretboard.css](file://src/fretboard.css#L272-L425)

## 品格范围滑块 (FretRangeSlider)

`FretRangeSlider` 组件允许用户通过拖动滑块来控制指板上显示的品格范围。

### 视觉设计
该组件包含一个双范围滑块，由两个独立的输入滑块（`<input type="range">`）组成，分别控制起始品格和结束品格。滑块下方有一个高亮区域，表示当前可见的品格范围。两个滑块的位置会显示对应的品格编号作为提示。

### 交互行为
- **拖动起始滑块**：调整指板的起始显示位置。滑块的值不能超过结束滑块的值。
- **拖动结束滑块**：调整指板的结束显示位置。滑块的值不能低于起始滑块的值。
- **实时反馈**：当用户拖动滑块时，高亮区域和提示数字会实时更新，提供即时的视觉反馈。

### Props 接口
| 属性 | 类型 | 必需 | 描述 |
| :--- | :--- | :--- | :--- |
| `startFret` | number | 是 | 当前起始品格 (0-22) |
| `endFret` | number | 是 | 当前结束品格 (0-22) |
| `onFretWindowChange` | function | 是 | 品格范围变化回调函数 `{ start?: number, end?: number } => void` |

### 样式定制
滑块的样式通过 CSS 进行了精细的控制，包括轨道、选中区域和提示框。高亮区域的宽度和位置通过内联样式动态计算，以确保其准确反映当前的品格范围。

**Section sources**
- [FretRangeSlider.jsx](file://src/components/FretRangeSlider.jsx#L1-L76)
- [fretboard.css](file://src/fretboard.css#L800-L811)

## 用户反馈提示 (Toast)

`Toast` 组件用于向用户提供短暂的操作反馈，例如“分享字符串已复制”。

### 视觉设计
提示框（Toast）位于屏幕右下角，具有以下视觉特征：
- **背景**：半透明的纯色背景，根据类型（info, success, error, warning）使用不同的主色调。
- **边框**：左侧有一条与主色调一致的竖线，用于增强视觉识别。
- **动画**：出现时从右向左滑入，消失时从左向右滑出。
- **响应式**：在移动设备上，提示框会占据屏幕宽度，以提供更好的用户体验。

### 交互行为
- **自动消失**：提示框在显示指定的持续时间后会自动淡出并消失。
- **手动关闭**：用户可以通过点击外部区域或等待动画完成来关闭提示框。
- **类型区分**：通过不同的颜色和图标（在代码中通过 `type` prop 控制）来区分信息、成功、错误和警告。

### Props 接口
| 属性 | 类型 | 必需 | 描述 |
| :--- | :--- | :--- | :--- |
| `message` | string | 是 | 要显示的消息文本 |
| `type` | string | 否 | 消息类型，可选值：`info`, `success`, `error`, `warning` (默认: `info`) |
| `duration` | number | 否 | 消息显示的持续时间（毫秒）(默认: 2000) |
| `onClose` | function | 否 | 提示框关闭时的回调函数 |

### 样式定制
样式在 `Toast.css` 中定义，使用 CSS 变量和动画来实现平滑的过渡效果。不同类型的提示框通过 CSS 类（如 `.toast.success`）来应用不同的背景色和边框色。

**Section sources**
- [Toast.jsx](file://src/components/Toast.jsx#L1-L61)
- [Toast.css](file://src/components/Toast.css#L1-L78)
- [FretboardGallery.jsx](file://src/components/FretboardGallery.jsx#L164-L167)

## 钢琴键盘组件 (PianoKeyboard)

`PianoKeyboard` 组件提供了一个交互式的钢琴键盘，用于选择音符作为指板的根音。

### 实现
该组件使用 HTML `div` 元素来模拟钢琴的黑白键：
- **白键**：使用 `div` 元素并排排列，具有圆角和阴影，模拟真实钢琴键的外观。
- **黑键**：使用 `div` 元素并使用 `position: absolute` 进行绝对定位，放置在两个白键之间。

### 视觉设计
- **白键**：白色背景，带有灰色边框，尺寸为 45px x 130px。
- **黑键**：深灰色背景，尺寸为 28px x 80px，位于白键上方。
- **选中状态**：被选中的琴键背景色会变为浅蓝色，并加粗边框。
- **悬停状态**：鼠标悬停时，琴键背景色会轻微变亮。

### 交互行为
- **点击**：点击一个琴键会选中该音符。如果再次点击同一个琴键，则取消选中。
- **升降号切换**：通过 `enharmonic` prop 控制显示升号（♯）还是降号（♭）。

### Props 接口
| 属性 | 类型 | 必需 | 描述 |
| :--- | :--- | :--- | :--- |
| `enharmonic` | number | 是 | 升降号模式 (0: 升号, 1: 降号) |
| `selectedNote` | number | 是 | 当前选中的音符索引 (0-11) |
| `onNoteSelect` | function | 是 | 音符选择回调函数 `(noteIndex: number) => void` |

### 样式定制
样式在 `fretboard.css` 中定义，通过 `.piano-key.white-key` 和 `.piano-key.black-key` 等类名精确控制每个琴键的外观。选中和悬停状态通过 `:hover` 和 `.selected` 类来实现。

**Section sources**
- [PianoKeyboard.jsx](file://src/PianoKeyboard.jsx#L1-L101)
- [fretboard.css](file://src/fretboard.css#L542-L640)
- [constants.js](file://src/constants.js#L1-L19)

## 可访问性考虑

本UI组件库在设计时考虑了基本的可访问性原则：
1. **键盘导航**：`ColorPalette` 和 `PianoKeyboard` 组件的按钮和琴键都是可聚焦的，用户可以通过 Tab 键进行导航。
2. **语义化标签**：所有交互元素都使用了适当的 HTML 元素（如 `button`），并提供了 `title` 属性作为工具提示，辅助技术可以读取这些信息。
3. **对比度**：组件的颜色方案（尤其是 `Toast` 和 `PianoKeyboard`）提供了足够的颜色对比度，确保在不同光照条件下都能清晰可见。
4. **焦点管理**：`Toast` 组件在显示时不会劫持键盘焦点，避免干扰用户的正常操作流程。
5. **响应式设计**：`Toast` 组件在移动设备上会自动调整布局，以适应较小的屏幕。