import { saveData as saveToBackend, loadData as loadFromBackend } from '../utils/api';

/**
 * 存储服务 - 简化版
 * localStorage 仅用于保存当前编辑状态（刷新恢复）
 * 历史状态功能只在登录后可用
 */
class StorageService {
    constructor() {
        this.isAuthenticated = false;
        this.username = null;
    }

    /**
     * 设置认证状态
     */
    setAuthState(isAuthenticated, username = null) {
        this.isAuthenticated = isAuthenticated;
        this.username = username;
    }

    /**
     * 保存所有数据（只在已登录时可用）
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

    /**
     * 加载所有数据（只在已登录时可用）
     */
    async loadAll() {
        if (!this.isAuthenticated) {
            throw new Error('请先登录后再加载历史');
        }

        const response = await loadFromBackend();
        if (!response.success) {
            throw new Error(response.message || '从服务器加载失败');
        }
        return {
            directories: response.directories || [],
            states: response.states || []
        };
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
