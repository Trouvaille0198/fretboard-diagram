import { useState, useEffect } from 'react';
import { login as apiLogin, logout as apiLogout, verifyToken, isLoggedIn, getCurrentUsername } from '../utils/api';

export function useAuth() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [username, setUsername] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // 自动验证 Token
    useEffect(() => {
        const checkAuth = async () => {
            if (isLoggedIn()) {
                try {
                    const response = await verifyToken();
                    if (response.valid) {
                        setIsAuthenticated(true);
                        setUsername(response.username);
                    } else {
                        setIsAuthenticated(false);
                        setUsername(null);
                    }
                } catch (error) {
                    console.error('Token 验证失败:', error);
                    setIsAuthenticated(false);
                    setUsername(null);
                }
            } else {
                setIsAuthenticated(false);
                setUsername(null);
            }
            setIsLoading(false);
        };

        checkAuth();
    }, []);

    // 登录方法
    const login = async (username) => {
        try {
            const response = await apiLogin(username);
            setIsAuthenticated(true);
            setUsername(response.username);
            return { success: true, message: response.message };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

    // 登出方法
    const logout = () => {
        apiLogout();
        setIsAuthenticated(false);
        setUsername(null);
    };

    return {
        isAuthenticated,
        username,
        isLoading,
        login,
        logout
    };
}
