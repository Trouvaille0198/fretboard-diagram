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
    cyan: '#7570b3',        // Dark2 紫蓝
    pink: '#e7298a',        // Dark2 洋红
    'grass-green': '#1b9e77', // Dark2 青绿
    yellow: '#e6ab02',        // Dark2 #6 琥珀黄（与 orange 形成暖色对）
    white: '#666666'         // Dark2 中性灰
};

const PRESET_TINT_VARIANTS = {
    // 每个基色用不同的明度/饱和度节奏，避免整套音符只是“同一层级换色相”。
    '#7570b3': ['rgb(220, 216, 242)', 'rgb(132, 122, 214)', 'rgb(73, 61, 171)', 'rgb(42, 34, 103)'],
    '#e7298a': ['rgb(250, 210, 232)', 'rgb(244, 82, 170)', 'rgb(211, 16, 121)', 'rgb(122, 9, 68)'],
    '#1b9e77': ['rgb(198, 243, 228)', 'rgb(59, 206, 162)', 'rgb(13, 146, 108)', 'rgb(8, 86, 64)'],
    '#d95f02': ['rgb(251, 217, 186)', 'rgb(255, 141, 36)', 'rgb(203, 84, 0)', 'rgb(108, 42, 0)'],
    '#e6ab02': ['rgb(252, 235, 186)', 'rgb(255, 204, 27)', 'rgb(196, 142, 0)', 'rgb(96, 70, 0)'],
    '#2c6cca': ['rgb(204, 224, 250)', 'rgb(78, 149, 247)', 'rgb(8, 70, 165)', 'rgb(9, 46, 103)'],
    '#cd5c5c': ['rgb(247, 210, 210)', 'rgb(228, 109, 109)', 'rgb(187, 46, 46)', 'rgb(101, 20, 20)'],
    '#666666': ['rgb(220, 223, 228)', 'rgb(124, 131, 140)', 'rgb(78, 84, 92)', 'rgb(36, 40, 46)']
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


// —— 动态帧色阶：在 4 档 tint（pale→vivid→rich→deep）上按 t∈[0,1] 连续插值 ——

function parseRgbString(str) {
    if (typeof str !== 'string') return null;
    let m = str.match(/^#([0-9a-f]{6})$/i);
    if (m) {
        const hex = m[1];
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
    m = str.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    return null;
}

// 取色系在色阶位置 t 的颜色：t=0=pale（帧1），t=1=deep（末帧），中间线性插值
export function tintAt(colorName, t) {
    const tints = generateTintVariants(getLevel1FillColor(colorName));
    const stops = tints.map(parseRgbString).filter(Boolean);
    if (!stops.length) return '#ffffff';
    const clamped = Math.max(0, Math.min(1, Number(t) || 0));
    const seg = clamped * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(seg));
    const local = seg - i;
    const a = stops[i], b = stops[i + 1];
    const mixed = [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * local));
    return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

// 估计一个颜色在 4 档色阶上的位置 t（用于换色系原位映射）；离色阶太远/无法定位返回 null
export function tintPosition(tints, custom) {
    const idx = tints.indexOf(custom);
    if (idx >= 0) return idx / (tints.length - 1);
    const target = parseRgbString(custom);
    if (!target) return null;
    const stops = tints.map(parseRgbString).filter(Boolean);
    if (stops.length < 2) return null;
    let best = null, bestDist = Infinity;
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ap = [target[0] - a[0], target[1] - a[1], target[2] - a[2]];
        const abLen2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
        if (abLen2 === 0) continue;
        const localRaw = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / abLen2;
        const local = Math.max(0, Math.min(1, localRaw));
        const proj = [a[0] + ab[0] * local, a[1] + ab[1] * local, a[2] + ab[2] * local];
        const dist = Math.hypot(target[0] - proj[0], target[1] - proj[1], target[2] - proj[2]);
        if (dist < bestDist) { bestDist = dist; best = (i + local) / (stops.length - 1); }
    }
    if (best === null || bestDist > 60) return null; // 离色阶太远：非本体系颜色，不动它
    return best;
}


// 瞬时目标音（rt/hp 的 B）取比源音深一档：色阶位置 +1/4 步，最深处不再加深
export function deepenTint(colorObj, step = 0.25) {
	if (!colorObj || typeof colorObj !== 'object' || !colorObj.custom) return null;
	const name = colorObj.name || 'navy';
	const tints = generateTintVariants(getLevel1FillColor(name));
	const t = tintPosition(tints, colorObj.custom);
	if (t === null) return null;
	return tintAt(name, Math.min(1, t + step));
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
