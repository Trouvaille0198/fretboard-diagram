import { useState } from 'react';
import { createPortal } from 'react-dom';
import './LoginModal.css';
import { useLanguage, zh } from '../i18n';
import { login } from '../utils/authModel';

// 账号登录/注册弹窗：账号密码版本（数据存账号服务，跨设备/清缓存不丢）；
// 游客入口 = 维持现状（纯浏览器 localStorage，不上云）。
export function LoginModal({ onLoggedIn, onGuest, onClose }) {
    const { t } = useLanguage();
    const tl = t?.login ?? zh.login;
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
            setError(tl.errorChars);
            return;
        }
        if (password.length < 4 || password.length > 64) {
            setError(tl.errorPass);
            return;
        }
        setBusy(true);
        try {
            await login(username.trim(), password);
            onLoggedIn && onLoggedIn(username.trim());
        } catch (err) {
            setError(
                err.code === 'bad_auth' ? tl.errorAuth : tl.errorNet
            );
        } finally {
            setBusy(false);
        }
    };

    // portal 到 body：顶栏 .top-nav 有 backdrop-filter，会让其中 fixed 后代以顶栏为包含块（弹窗会飞出屏幕），
    // 挂到 document.body 才能稳定全屏居中
    return createPortal(
        <div className="login-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose && onClose(); }}>
            <div className="login-modal">
                <h2>{tl.titleLogin}</h2>
                <form className="login-form" onSubmit={submit}>
                    <label>{tl.username}
                        <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus />
                    </label>
                    <label>{tl.password}
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                    </label>
                    {error ? <div className="login-error">{error}</div> : null}
                    <button className="btn-primary" type="submit" disabled={busy}>
                        {busy ? tl.busy : tl.tabLogin}
                    </button>
                </form>
                <div className="login-alt">
                    <button className="btn-ghost" onClick={() => { onGuest && onGuest(); onClose && onClose(); }}>
                        {tl.guest}
                    </button>
                </div>
                <p className="login-note">{tl.note}</p>
            </div>
        </div>,
        document.body
    );
}
