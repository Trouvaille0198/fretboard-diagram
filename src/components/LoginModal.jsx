import { useState } from 'react';
import './LoginModal.css';

export function LoginModal({ onLogin, onClose }) {
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // 前端验证
        if (!username.trim()) {
            setError('请输入用户名');
            return;
        }

        if (username.length < 3 || username.length > 20) {
            setError('用户名必须为 3-20 个字符');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            setError('用户名只能包含字母、数字和下划线');
            return;
        }

        setIsLoading(true);
        const result = await onLogin(username);
        setIsLoading(false);

        if (result.success) {
            // 登录成功，模态框会自动关闭
        } else {
            setError(result.message || '登录失败');
        }
    };

    return (
        <div className="login-modal-overlay" onClick={onClose}>
            <div className="login-modal" onClick={(e) => e.stopPropagation()}>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="close-button"
                        title="关闭"
                    >
                        ×
                    </button>
                )}
                <h2>登录到 Fretboard Diagram</h2>
                <p className="login-description">
                    输入用户名即可登录，首次使用会自动创建账号
                </p>
                
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="username">用户名</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="3-20个字符，字母数字下划线"
                            disabled={isLoading}
                            autoFocus
                        />
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <div className="button-group">
                        <button 
                            type="submit" 
                            className="btn-primary"
                            disabled={isLoading}
                        >
                            {isLoading ? '登录中...' : '登录'}
                        </button>
                    </div>
                </form>

                <div className="login-note">
                    <p>请记住您的用户名，丢失后无法找回数据</p>
                </div>
            </div>
        </div>
    );
}
