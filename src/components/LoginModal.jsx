import { useState } from 'react';
import { createPortal } from 'react-dom';
import './LoginModal.css';
import { useLanguage } from '../i18n';
import { login } from '../utils/authModel';

// 账号登录/注册弹窗：账号密码版本（数据存账号服务，跨设备/清缓存不丢）；
// 游客入口 = 维持现状（纯浏览器 localStorage，不上云）。
export function LoginModal({ onLoggedIn, onGuest, onClose }) {
    const { t } = useLanguage();
    const tl = t?.login ?? {};
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
            setError(tl.errorChars ?? '用户名 3-20 位，仅字母/数字/下划线');
            return;
        }
        if (password.length < 4 || password.length > 64) {
            setError(tl.errorPass ?? '密码 4-64 位');
            return;
        }
        setBusy(true);
        try {
            await login(username.trim(), password);
            onLoggedIn && onLoggedIn(username.trim());
        } catch (err) {
            setError(
                err.code === 'bad_auth' ? (tl.errorAuth ?? '用户名或密码不对') :
                (tl.errorNet ?? '连不上账号服务（npm run server）')
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
                <h2>{tl.titleLogin ?? '登录账号'}</h2>
                <form className="login-form" onSubmit={submit}>
                    <label>{tl.username ?? '用户名'}
                        <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus />
                    </label>
                    <label>{tl.password ?? '密码'}
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                    </label>
                    {error ? <div className="login-error">{error}</div> : null}
                    <button className="btn-primary" type="submit" disabled={busy}>
                        {busy ? (tl.busy ?? '请稍候…') : (tl.tabLogin ?? '登录')}
                    </button>
                </form>
                <div className="login-alt">
                    <button className="btn-ghost" onClick={() => { onGuest && onGuest(); onClose && onClose(); }}>
                        {tl.guest ?? '游客进入（数据只存本浏览器）'}
                    </button>
                </div>
                <p className="login-note">{tl.note ?? '登录后曲目自动云端同步（SQLite），换设备/清缓存不丢；游客数据在登录时并入账号。'}</p>
            </div>
        </div>,
        document.body
    );
}
