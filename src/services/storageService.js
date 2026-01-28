import { 
    saveData as saveToBackend, 
    loadData as loadFromBackend,
    createDirectory as createDirectoryAPI,
    getDirectories as getDirectoriesAPI,
    updateDirectory as updateDirectoryAPI,
    deleteDirectory as deleteDirectoryAPI,
    createState as createStateAPI,
    getStates as getStatesAPI,
    updateState as updateStateAPI,
    deleteState as deleteStateAPI
} from '../utils/api';

/**
 * 存储服务 - 简化版
 * localStorage 仅用于保存当前编辑状态（刷新恢复）
 * 历史状态功能只在登录后可用
 */
class StorageService {
    constructor() {
        this.isAuthenticated = false;
        this.username = null;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1秒
    }

    /**
     * 重试机制
     */
    async retry(fn, retries = this.maxRetries) {
        try {
            return await fn();
        } catch (error) {
            if (retries > 0 && this.isRetryableError(error)) {
                await this.delay(this.retryDelay);
                return this.retry(fn, retries - 1);
            }
            throw error;
        }
    }

    /**
     * 判断错误是否可重试
     */
    isRetryableError(error) {
        // 网络错误、超时错误、5xx服务器错误可重试
        if (error.status === 0 || error.status === 408) {
            return true; // 网络错误或超时
        }
        if (error.status >= 500 && error.status < 600) {
            return true; // 服务器错误
        }
        return false;
    }

    /**
     * 延迟函数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 设置认证状态
     */
    setAuthState(isAuthenticated, username = null) {
        this.isAuthenticated = isAuthenticated;
        this.username = username;
    }

    /**
     * 保存所有数据（兼容接口，已废弃，建议使用增量更新方法）
     * @deprecated 使用增量更新方法替代
     */
    async saveAll(directories, states) {
        if (!this.isAuthenticated) {
            throw new Error('请先登录后再保存');
        }

        const response = await saveToBackend(directories, states);
        if (!response.success) {
            throw new Error(response.message || '保存到服务器失败');
        }
        return response;
    }

    // ========== 目录管理增量更新方法 ==========

    /**
     * 创建目录
     */
    async createDirectory(directory) {
        if (!this.isAuthenticated) {
            throw new Error('请先登录后再创建目录');
        }

        return this.retry(async () => {
            try {
                return await createDirectoryAPI(directory);
            } catch (error) {
                console.error('创建目录失败:', error);
                throw new Error(error.message || '创建目录失败');
            }
        });
    }

    /**
     * 获取所有目录
     */
    async getDirectories() {
        if (!this.isAuthenticated) {
            throw new Error('请先登录后再获取目录');
        }

        return this.retry(async () => {
            try {
                return await getDirectoriesAPI();
            } catch (error) {
                console.error('获取目录失败:', error);
                throw new Error(error.message || '获取目录失败');
            }
        });
    }

    /**
     * 更新目录
     */
    async updateDirectory(directoryId, data) {
        if (!this.isAuthenticated) {
            throw new Error('请先登录后再更新目录');
        }

        try {
            return await updateDirectoryAPI(directoryId, data);
        } catch (error) {
            console.error('更新目录失败:', error);
            throw new Error(error.message || '更新目录失败');
        }
    }

    /**
     * 删除目录
     */
    async deleteDirectory(directoryId) {
        if (!this.isAuthenticated) {
            throw new Error('请先登录后再删除目录');
        }

        return this.retry(async () => {
            try {
                return await deleteDirectoryAPI(directoryId);
            } catch (error) {
                console.error('删除目录失败:', error);
                throw new Error(error.message || '删除目录失败');
            }
        });
    }

    // ========== 状态管理增量更新方法 ==========

    /**
     * 创建状态
     */
    async createState(state) {
        if (!this.isAuthenticated) {
            throw new Error('请先登录后再创建状态');
        }

        return this.retry(async () => {
            try {
                return await createStateAPI(state);
            } catch (error) {
                console.error('创建状态失败:', error);
                throw new Error(error.message || '创建状态失败');
            }
        });
    }

    /**
     * 获取状态（可选按目录筛选）
     */
    async getStates(directoryId = null) {
        if (!this.isAuthenticated) {
            throw new Error('请先登录后再获取状态');
        }

        return this.retry(async () => {
            try {
                return await getStatesAPI(directoryId);
            } catch (error) {
                console.error('获取状态失败:', error);
                throw new Error(error.message || '获取状态失败');
            }
        });
    }

    /**
     * 更新状态
     */
    async updateState(stateId, data) {
        if (!this.isAuthenticated) {
            throw new Error('请先登录后再更新状态');
        }

        try {
            return await updateStateAPI(stateId, data);
        } catch (error) {
            console.error('更新状态失败:', error);
            throw new Error(error.message || '更新状态失败');
        }
    }

    /**
     * 删除状态
     */
    async deleteState(stateId) {
        if (!this.isAuthenticated) {
            throw new Error('请先登录后再删除状态');
        }

        return this.retry(async () => {
            try {
                return await deleteStateAPI(stateId);
            } catch (error) {
                console.error('删除状态失败:', error);
                throw new Error(error.message || '删除状态失败');
            }
        });
    }

    /**
     * 加载所有数据（只在已登录时可用）
     * 分别调用目录和状态接口，避免全量加载
     */
    async loadAll() {
        if (!this.isAuthenticated) {
            throw new Error('请先登录后再加载历史');
        }

        // 分别加载目录和状态，而不是使用全量接口
        try {
            const [directories, states] = await Promise.all([
                this.getDirectories(),
                this.getStates()
            ]);
            
            return {
                directories: directories || [],
                states: states || []
            };
        } catch (error) {
            console.error('加载数据失败:', error);
            throw new Error(error.message || '从服务器加载失败');
        }
    }

    /**
     * 保存当前编辑状态到 localStorage（刷新恢复用）
     */
    saveCurrentState(state) {
        try {
            localStorage.setItem('fretboard-current-state', JSON.stringify(state));
        } catch (error) {
            console.error('保存当前状态失败:', error);
        }
    }

    /**
     * 从 localStorage 加载当前编辑状态
     */
    loadCurrentState() {
        try {
            const savedState = localStorage.getItem('fretboard-current-state');
            return savedState ? JSON.parse(savedState) : null;
        } catch (error) {
            console.error('加载当前状态失败:', error);
            return null;
        }
    }

    /**
     * 清除当前编辑状态
     */
    clearCurrentState() {
        try {
            localStorage.removeItem('fretboard-current-state');
        } catch (error) {
            console.error('清除当前状态失败:', error);
        }
    }
}

export const storageService = new StorageService();
