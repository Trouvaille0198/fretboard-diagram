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
        fill: '#2c6cca',           // 音符填充色
        button: '#2c6cca'          // 调色盘按钮背景色
    },
    red: {
        fill: '#cd5c5c',           // 音符填充色
        button: '#cd5c5c'          // 调色盘按钮背景色
    },
    green: {
        fill: '#2bb046',             // 音符填充色
        button: '#2bb046'            // 调色盘按钮背景色
    },
    brown: {
        fill: '#f8bb24',             // 音符填充色
        button: '#f8bb24'            // 调色盘按钮背景色
    },
    gray: {
        fill: '#aaaaaa',             // 音符填充色（灰色）
        button: '#aaaaaa'            // 调色盘按钮背景色
    },
};

// 第二层级颜色配置（用于描边）
export const LEVEL2_COLORS = {
    orange: '#ff8c00',        // 橙色
    cyan: '#2c6cca',          // 蓝色
    pink: '#cd5c5c',          // 红色
    'grass-green': '#2bb046', // 绿色
    yellow: '#f8bb24',        // 黄色
    white: '#aaaaaa'          // 白色
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
    const [h, s, l] = rgbToHsl(r, g, b);
    const variants = [];

    // 生成5个版本：浓二档、浓一档、原色、淡一档、淡二档
    // 浓：增加饱和度，降低亮度（向色轮边缘移动）
    // 淡：降低饱和度，增加亮度（向色轮中心移动）
    const adjustments = [
        { s: 25, l: -35 },  // 浓二档
        { s: 20, l: -15 },   // 浓一档
        { s: 0, l: 10 },     // 原色
        { s: -20, l: 25 },  // 淡一档
        // { s: -30, l: 20 }   // 淡二档
    ];

    adjustments.forEach(({ s: sAdj, l: lAdj }) => {
        const newS = Math.max(0, Math.min(100, s + sAdj));
        const newL = Math.max(0, Math.min(100, l + lAdj));
        const [nr, ng, nb] = hslToRgb(h, newS, newL);
        variants.push(`rgb(${nr}, ${ng}, ${nb})`);
    });

    // 反转数组，使浅色在最上面（淡二档 -> 淡一档 -> 原色 -> 浓一档 -> 浓二档）
    return variants.reverse();
}

// RGB 转 HSL
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return [h * 360, s * 100, l * 100];
}

// HSL 转 RGB
function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
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
