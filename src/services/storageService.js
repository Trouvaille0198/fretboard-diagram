/**
 * 存储服务 - 纯前端版本
 * 所有数据存储在 localStorage 中，无需后端
 */
class StorageService {
    constructor() {
        // localStorage 键名
        this.KEYS = {
            DIRECTORIES: "fretboard-directories",
            HISTORY: "fretboard-history",
            CURRENT_STATE: "fretboard-current-state",
            SETTINGS: "fretboard-settings",
        };

        // 默认目录
        this.DEFAULT_DIRECTORIES = [
            { id: "default", name: "默认", isDefault: true },
        ];
    }

    /**
     * 初始化默认目录
     */
    _initDirectories() {
        if (!localStorage.getItem(this.KEYS.DIRECTORIES)) {
            localStorage.setItem(
                this.KEYS.DIRECTORIES,
                JSON.stringify(this.DEFAULT_DIRECTORIES),
            );
        }
    }

    // ========== 目录管理 ==========

    /**
     * 获取所有目录
     */
    getDirectories() {
        this._initDirectories();
        try {
            const data = localStorage.getItem(this.KEYS.DIRECTORIES);
            return data ? JSON.parse(data) : [...this.DEFAULT_DIRECTORIES];
        } catch (error) {
            console.error("获取目录失败:", error);
            return [...this.DEFAULT_DIRECTORIES];
        }
    }

    /**
     * 创建目录
     */
    createDirectory(directory) {
        const dirs = this.getDirectories();
        dirs.push(directory);
        localStorage.setItem(this.KEYS.DIRECTORIES, JSON.stringify(dirs));
        return directory;
    }

    /**
     * 更新目录
     */
    updateDirectory(directoryId, data) {
        const dirs = this.getDirectories();
        const index = dirs.findIndex((d) => d.id === directoryId);
        if (index !== -1) {
            dirs[index] = { ...dirs[index], ...data };
            localStorage.setItem(this.KEYS.DIRECTORIES, JSON.stringify(dirs));
            return dirs[index];
        }
        throw new Error("目录不存在");
    }

    /**
     * 删除目录
     */
    deleteDirectory(directoryId) {
        const dirs = this.getDirectories();
        const filtered = dirs.filter((d) => d.id !== directoryId);
        localStorage.setItem(this.KEYS.DIRECTORIES, JSON.stringify(filtered));
        return { success: true };
    }

    // ========== 状态管理 ==========

    /**
     * 获取所有状态（可选按目录筛选）
     */
    getStates(directoryId = null) {
        try {
            const data = localStorage.getItem(this.KEYS.HISTORY);
            const states = data ? JSON.parse(data) : [];

            if (directoryId) {
                return states.filter((s) => s.directoryId === directoryId);
            }
            return states;
        } catch (error) {
            console.error("获取状态失败:", error);
            return [];
        }
    }

    /**
     * 创建状态
     */
    createState(state) {
        const states = this.getStates();
        states.unshift(state); // 添加到开头

        // 限制最大数量
        if (states.length > 50) {
            states.length = 50;
        }

        localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(states));
        return state;
    }

    /**
     * 更新状态
     */
    updateState(stateId, data) {
        const states = this.getStates();
        const index = states.findIndex((s) => s.id === stateId);

        if (index !== -1) {
            states[index] = { ...states[index], ...data };
            localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(states));
            return states[index];
        }
        throw new Error("状态不存在");
    }

    /**
     * 删除状态
     */
    deleteState(stateId) {
        const states = this.getStates();
        const filtered = states.filter((s) => s.id !== stateId);
        localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(filtered));
        return { success: true };
    }

    /**
     * 加载所有数据（目录和状态）
     */
    loadAll() {
        return {
            directories: this.getDirectories(),
            states: this.getStates(),
        };
    }

    /**
     * 批量保存（用于导入功能）
     */
    saveAll(directories, states) {
        localStorage.setItem(
            this.KEYS.DIRECTORIES,
            JSON.stringify(directories),
        );

        // 限制状态数量
        const limitedStates = states.length > 50 ? states.slice(0, 50) : states;
        localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(limitedStates));

        return { success: true };
    }

    // ========== 当前编辑状态 ==========

    /**
     * 保存当前编辑状态（用于刷新恢复）
     */
    saveCurrentState(state) {
        try {
            localStorage.setItem(
                this.KEYS.CURRENT_STATE,
                JSON.stringify(state),
            );
        } catch (error) {
            console.error("保存当前状态失败:", error);
        }
    }

    /**
     * 从 localStorage 加载当前编辑状态
     */
    loadCurrentState() {
        try {
            const savedState = localStorage.getItem(this.KEYS.CURRENT_STATE);
            return savedState ? JSON.parse(savedState) : null;
        } catch (error) {
            console.error("加载当前状态失败:", error);
            return null;
        }
    }

    /**
     * 清除当前编辑状态
     */
    clearCurrentState() {
        try {
            localStorage.removeItem(this.KEYS.CURRENT_STATE);
        } catch (error) {
            console.error("清除当前状态失败:", error);
        }
    }
}

export const storageService = new StorageService();
