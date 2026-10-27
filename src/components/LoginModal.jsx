import { useState } from 'react';
import { useLanguage } from '../i18n';
import { login, register } from '../utils/authModel';

// 账号登录/注册弹窗：账号密码版本（数据存账号服务，跨设备/清缓存不丢）；
// 游客入口 = 维持现状（纯浏览器 localStorage，不上云）。
export function LoginModal({ onLoggedIn, onGuest, onClose }) {
    const { t } = useLanguage();
    const tl = t?.login ?? {};
    const [mode, setMode] = useState('login'); // login | register
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
            if (mode === 'register') await register(username.trim(), password);
            else await login(username.trim(), password);
            onLoggedIn && onLoggedIn(username.trim());
        } catch (err) {
            setError(
                err.code === 'exists' ? (tl.errorExists ?? '用户名已被注册') :
                err.code === 'bad_auth' ? (tl.errorAuth ?? '用户名或密码不对') :
                err.code === 'bad_name' || err.code === 'bad_pass' ? (tl.errorForm ?? '用户名/密码格式不对') :
                (tl.errorNet ?? '连不上账号服务（npm run server）')
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="login-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose && onClose(); }}>
            <div className="login-modal">
                <h2>{mode === 'login' ? (tl.titleLogin ?? '登录账号') : (tl.titleRegister ?? '注册账号')}</h2>
                <div className="login-tabs">
                    <button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(''); }}>{tl.tabLogin ?? '登录'}</button>
                    <button className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setError(''); }}>{tl.tabRegister ?? '注册'}</button>
                </div>
                <form className="login-form" onSubmit={submit}>
                    <label>{tl.username ?? '用户名'}
                        <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus />
                    </label>
                    <label>{tl.password ?? '密码'}
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                    </label>
                    {error ? <div className="login-error">{error}</div> : null}
                    <button className="btn-primary" type="submit" disabled={busy}>
                        {busy ? (tl.busy ?? '请稍候…') : (mode === 'login' ? (tl.tabLogin ?? '登录') : (tl.tabRegister ?? '注册'))}
                    </button>
                </form>
                <div className="login-alt">
                    <button className="btn-ghost" onClick={() => { onGuest && onGuest(); onClose && onClose(); }}>
                        {tl.guest ?? '游客进入（数据只存本浏览器）'}
                    </button>
                </div>
                <p className="login-note">{tl.note ?? '注册后曲目自动云端同步，换设备/清缓存不丢；游客数据在登录时并入账号。'}</p>
            </div>
        </div>
    );
}
