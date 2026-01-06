// 颜色配置文件
// 在这里修改颜色配置，所有颜色都会自动应用

// 第一层级颜色配置（用于音符填充和调色盘按钮）
// 注意：顺序很重要，所有地方都会按照这个顺序
export const LEVEL1_COLORS = {
    trans: {
        fill: 'var(--background-color)',  // 音符填充色（透明色，黑色）
        button: 'var(--background-color)' // 调色盘按钮背景色
    },
    blue: {
        fill: 'steelblue',           // 音符填充色
        button: 'steelblue'          // 调色盘按钮背景色
    },
    green: {
        fill: '#00a080',             // 音符填充色（更绿的绿色）
        button: '#00a080'            // 调色盘按钮背景色
    },
    red: {
        fill: 'indianred',           // 音符填充色
        button: 'indianred'          // 调色盘按钮背景色
    },
    brown: {
        fill: '#8b4513',             // 音符填充色
        button: '#8b4513'            // 调色盘按钮背景色
    },
    gray: {
        fill: '#aaaaaa',             // 音符填充色（灰色）
        button: '#aaaaaa'            // 调色盘按钮背景色
    },
};

// 第二层级颜色配置（用于描边）
export const LEVEL2_COLORS = {
    yellow: '#ffd700',        // 黄色
    cyan: '#87ceeb',          // 淡青色
    pink: '#ffb6c1',          // 淡红色
    'grass-green': '#6b8e23', // 青草绿色
    orange: '#ff8c00',        // 亮橙色
    white: '#ffffff'          // 白色
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

// 生成颜色的淡色版本（5个从深到浅）
export function generateTintVariants(baseColor) {
    // 将颜色转为RGB
    const parseColor = (color) => {
        if (color === 'steelblue') return [70, 130, 180];
        if (color === 'indianred') return [205, 92, 92];
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

    const [r, g, b] = parseColor(baseColor);
    const variants = [];

    // 生成5个版本：第一个是原色，后面4个是淡色版本
    variants.push(`rgb(${r}, ${g}, ${b})`); // 原色

    // 生成4个淡色版本：混合白色的比例从20%到80%
    for (let i = 1; i < 5; i++) {
        const ratio = 0.2 * i; // 20%, 40%, 60%, 80%
        const nr = Math.round(r + (255 - r) * ratio);
        const ng = Math.round(g + (255 - g) * ratio);
        const nb = Math.round(b + (255 - b) * ratio);
        variants.push(`rgb(${nr}, ${ng}, ${nb})`);
    }

    return variants;
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
