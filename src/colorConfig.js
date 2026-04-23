// 颜色配置文件
// 在这里修改颜色配置，所有颜色都会自动应用

// 第一层级颜色配置（用于音符填充和调色盘按钮）
// 注意：顺序很重要，所有地方都会按照这个顺序
// ColorBrewer Dark2 qualitative palette — 感知等距、色相均匀分布
// blue(H:243°) / red(H:328°) / green(H:163°) / brown(H:26°) / gray(中性)
export const LEVEL1_COLORS = {
    trans: {
        fill: 'var(--background-color)',  // 音符填充色（透明色，黑色）
        button: 'var(--background-color)' // 调色盘按钮背景色
    },
    navy: {
        fill: '#2c6cca',           // 经典蓝（提亮版）
        button: '#2c6cca'
    },
    crimson: {
        fill: '#cd5c5c',           // 经典红（提亮版）
        button: '#cd5c5c'
    },
    green: {
        fill: '#1b9e77',           // Dark2 #1 青绿（H:163°）
        button: '#1b9e77'
    },
    blue: {
        fill: '#7570b3',           // Dark2 #3 紫蓝（H:243°）
        button: '#7570b3'
    },
    red: {
        fill: '#e7298a',           // Dark2 #4 洋红（H:328°）
        button: '#e7298a'
    },
    brown: {
        fill: '#d95f02',           // Dark2 #2 橙（H:26°）
        button: '#d95f02'
    },
    gray: {
        fill: '#666666',           // Dark2 #8 中性灰
        button: '#666666'
    },
};

// 第二层级颜色配置（用于描边）
export const LEVEL2_COLORS = {
    orange: '#d95f02',        // Dark2 橙
    cyan:   '#7570b3',        // Dark2 紫蓝
    pink:   '#e7298a',        // Dark2 洋红
    'grass-green': '#1b9e77', // Dark2 青绿
    yellow: '#e6ab02',        // Dark2 #6 琥珀黄（与 orange 形成暖色对）
    white:  '#666666'         // Dark2 中性灰
};

const PRESET_TINT_VARIANTS = {
    // 每个基色用不同的明度/饱和度节奏，避免整套音符只是“同一层级换色相”。
    '#7570b3': ['rgb(201, 196, 233)', 'rgb(132, 122, 214)', 'rgb(73, 61, 171)', 'rgb(42, 34, 103)'],
    '#e7298a': ['rgb(245, 185, 218)', 'rgb(244, 82, 170)', 'rgb(211, 16, 121)', 'rgb(122, 9, 68)'],
    '#1b9e77': ['rgb(174, 236, 216)', 'rgb(59, 206, 162)', 'rgb(13, 146, 108)', 'rgb(8, 86, 64)'],
    '#d95f02': ['rgb(246, 198, 154)', 'rgb(255, 141, 36)', 'rgb(203, 84, 0)', 'rgb(108, 42, 0)'],
    '#e6ab02': ['rgb(250, 227, 157)', 'rgb(255, 204, 27)', 'rgb(196, 142, 0)', 'rgb(96, 70, 0)'],
    '#2c6cca': ['rgb(181, 210, 246)', 'rgb(63, 137, 242)', 'rgb(18, 88, 194)', 'rgb(9, 46, 103)'],
    '#cd5c5c': ['rgb(241, 190, 190)', 'rgb(228, 109, 109)', 'rgb(187, 46, 46)', 'rgb(101, 20, 20)'],
    '#666666': ['rgb(200, 203, 208)', 'rgb(124, 131, 140)', 'rgb(78, 84, 92)', 'rgb(36, 40, 46)']
};

// 获取第一层级颜色（用于音符填充）
export function getLevel1FillColor(colorName) {
    return LEVEL1_COLORS[colorName]?.fill || 'white';
}

// 获取第一层级颜色（用于调色盘按钮）
export function getLevel1ButtonColor(colorName) {
    return LEVEL1_COLORS[colorName]?.button || 'white';
}

// 获取第二层级颜色（用于描边）
export function getLevel2Color(colorName) {
    return LEVEL2_COLORS[colorName] || '#ffffff';
}

// 生成颜色的四档 tint，从浅亮到深沉。
export function generateTintVariants(baseColor) {
    // 将颜色转为RGB
    const parseColor = (color) => {
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            return [
                parseInt(hex.slice(0, 2), 16),
                parseInt(hex.slice(2, 4), 16),
                parseInt(hex.slice(4, 6), 16)
            ];
        }
        return [128, 128, 128];
    };

    const mixRgb = (source, target, ratio) => [
        Math.round(source[0] + (target[0] - source[0]) * ratio),
        Math.round(source[1] + (target[1] - source[1]) * ratio),
        Math.round(source[2] + (target[2] - source[2]) * ratio)
    ];

    const toRgbString = ([red, green, blue]) => `rgb(${red}, ${green}, ${blue})`;
    const normalizedColor = baseColor.toLowerCase();

    if (PRESET_TINT_VARIANTS[normalizedColor]) {
        return PRESET_TINT_VARIANTS[normalizedColor];
    }

    const baseRgb = parseColor(baseColor);

    // fallback 拉开明度差，减少“不同色相但同一明暗模板”的撞脸感。
    const pale = mixRgb(baseRgb, [255, 255, 255], 0.48);
    const vivid = mixRgb(baseRgb, [255, 255, 255], 0.12);
    const rich = mixRgb(baseRgb, [0, 0, 0], 0.32);
    const deep = mixRgb(baseRgb, [0, 0, 0], 0.6);

    return [pale, vivid, rich, deep].map(toRgbString);
}

// 初始化CSS变量（在组件挂载时调用）
export function initColorCSSVariables() {
    const root = document.documentElement;

    // 设置第一层级颜色的CSS变量
    Object.keys(LEVEL1_COLORS).forEach(colorName => {
        const color = LEVEL1_COLORS[colorName];
        root.style.setProperty(`--color-level1-${colorName}-fill`, color.fill);
        root.style.setProperty(`--color-level1-${colorName}-button`, color.button);
    });

    // 设置第二层级颜色的CSS变量
    Object.keys(LEVEL2_COLORS).forEach(colorName => {
        const colorValue = LEVEL2_COLORS[colorName];
        // CSS变量名保持原样（支持连字符）
        root.style.setProperty(`--color-level2-${colorName}`, colorValue);
    });
}
