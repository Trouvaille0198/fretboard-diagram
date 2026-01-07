const API_BASE_URL = '/api';
const TIMEOUT = 10000; // 10秒超时

class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

/**
 * 获取认证头
 */
function getAuthHeaders() {
    const token = localStorage.getItem('auth-token');
    if (token) {
        return {
            'Authorization': `Bearer ${token}`
        };
    }
    return {};
}

/**
 * 通用请求函数
 */
async function request(endpoint, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
                ...options.headers,
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new ApiError(
                errorData.detail || `请求失败: ${response.status}`,
                response.status
            );
        }

        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            throw new ApiError('请求超时', 408);
        }
        
        if (error instanceof ApiError) {
            throw error;
        }
        
        throw new ApiError(error.message || '网络请求失败', 0);
    }
}

/**
 * 用户登录
 */
export async function login(username) {
    const response = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username }),
    });
    
    // 保存 token
    if (response.token) {
        localStorage.setItem('auth-token', response.token);
        localStorage.setItem('auth-username', response.username);
    }
    
    return response;
}

/**
 * 验证 Token
 */
export async function verifyToken() {
    try {
        const response = await request('/auth/verify');
        return response;
    } catch (error) {
        if (error.status === 401) {
            // Token 无效，清除本地存储
            localStorage.removeItem('auth-token');
            localStorage.removeItem('auth-username');
        }
        throw error;
    }
}

/**
 * 保存数据到服务器
 */
export async function saveData(directories, states) {
    return await request('/data/save', {
        method: 'POST',
        body: JSON.stringify({ directories, states }),
    });
}

/**
 * 从服务器加载数据
 */
export async function loadData() {
    return await request('/data/load');
}

/**
 * 登出
 */
export function logout() {
    localStorage.removeItem('auth-token');
    localStorage.removeItem('auth-username');
}

/**
 * 获取当前用户名
 */
export function getCurrentUsername() {
    return localStorage.getItem('auth-username');
}

/**
 * 检查是否已登录
 */
export function isLoggedIn() {
    return !!localStorage.getItem('auth-token');
}
