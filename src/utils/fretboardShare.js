import LZString from 'lz-string';

// 分享字符串前缀，用于识别
const SHARE_PREFIX = 'fretboard://';
const CURRENT_VERSION = 1;

/**
 * 将指板状态序列化为可分享的字符串
 * @param {Object} stateSnapshot - 指板状态快照对象
 * @returns {string} 压缩后的分享字符串
 */
export function exportFretboardState(stateSnapshot) {
    try {
        if (!stateSnapshot || !stateSnapshot.state) {
            throw new Error('无效的状态数据');
        }

        // 构建要序列化的数据对象
        const exportData = {
            version: CURRENT_VERSION,
            name: stateSnapshot.name || null, // 包含名称
            state: {
                data: stateSnapshot.state.data || {},
                startFret: stateSnapshot.state.startFret ?? 0,
                endFret: stateSnapshot.state.endFret ?? 15,
                enharmonic: stateSnapshot.state.enharmonic ?? 1,
                displayMode: stateSnapshot.state.displayMode ?? 'note',
                rootNote: stateSnapshot.state.rootNote ?? null,
                visibility: stateSnapshot.state.visibility ?? 'transparent'
            }
        };

        // 将对象转换为JSON字符串
        const jsonString = JSON.stringify(exportData);

        // 使用LZ-String压缩到URI编码格式（比Base64更短）
        const compressed = LZString.compressToEncodedURIComponent(jsonString);

        // 添加前缀
        return SHARE_PREFIX + compressed;
    } catch (error) {
        console.error('导出状态失败:', error);
        throw new Error('导出失败：' + error.message);
    }
}

/**
 * 解析分享字符串并返回状态对象
 * @param {string} shareString - 分享字符串
 * @returns {Object|null} 解析后的状态对象，失败返回null
 */
export function importFretboardState(shareString) {
    try {
        if (!shareString || typeof shareString !== 'string') {
            throw new Error('无效的分享字符串');
        }

        // 检查前缀
        if (!shareString.startsWith(SHARE_PREFIX)) {
            throw new Error('不支持的分享字符串格式');
        }

        // 移除前缀
        const compressed = shareString.substring(SHARE_PREFIX.length);

        if (!compressed) {
            throw new Error('分享字符串为空');
        }

        // 解压缩（支持两种格式：URI编码和Base64，向后兼容）
        let jsonString = LZString.decompressFromEncodedURIComponent(compressed);
        if (!jsonString) {
            // 如果URI编码失败，尝试Base64（向后兼容）
            jsonString = LZString.decompressFromBase64(compressed);
        }

        if (!jsonString) {
            throw new Error('解压缩失败，可能数据已损坏');
        }

        // 解析JSON
        const importData = JSON.parse(jsonString);

        // 验证版本和数据结构
        if (!importData.version || !importData.state) {
            throw new Error('无效的数据格式');
        }

        // 检查版本兼容性（当前只支持版本1）
        if (importData.version !== CURRENT_VERSION) {
            throw new Error(`不支持的版本：${importData.version}，当前版本：${CURRENT_VERSION}`);
        }

        // 验证必需字段
        const state = importData.state;
        if (typeof state.startFret !== 'number' || typeof state.endFret !== 'number') {
            throw new Error('无效的品范围数据');
        }

        return importData;
    } catch (error) {
        console.error('导入状态失败:', error);
        throw error;
    }
}

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} 成功返回true，失败返回false
 */
export async function copyToClipboard(text) {
    try {
        // 使用现代的 Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        } else {
            // 降级方案：使用传统的 execCommand
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            try {
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                return successful;
            } catch (err) {
                document.body.removeChild(textArea);
                throw err;
            }
        }
    } catch (error) {
        console.error('复制到剪贴板失败:', error);
        throw new Error('复制失败：' + error.message);
    }
}

/**
 * 从剪贴板读取文本
 * @returns {Promise<string>} 剪贴板内容
 */
export async function readFromClipboard() {
    try {
        // 使用现代的 Clipboard API
        if (navigator.clipboard && navigator.clipboard.readText) {
            try {
                const text = await navigator.clipboard.readText();
                return text || '';
            } catch (clipboardError) {
                // 如果是权限错误，给出更明确的提示
                if (clipboardError.name === 'NotAllowedError' || clipboardError.name === 'SecurityError') {
                    throw new Error('剪贴板访问被拒绝。请确保：1) 使用HTTPS访问 2) 浏览器允许剪贴板权限');
                }
                throw clipboardError;
            }
        } else {
            // 降级方案：提示用户手动粘贴
            throw new Error('浏览器不支持自动读取剪贴板。请手动复制分享字符串，然后使用 Ctrl+V 粘贴到输入框');
        }
    } catch (error) {
        // 重新抛出错误，让调用者处理
        throw error;
    }
}
