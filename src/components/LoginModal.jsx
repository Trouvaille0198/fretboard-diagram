import { useState } from 'react';
import './LoginModal.css';
import { useLanguage } from '../i18n';

export function LoginModal({ onLogin, onClose }) {
    const { t } = useLanguage();
    const tl = t?.login ?? {};
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showLimitAlert, setShowLimitAlert] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!username.trim()) {
            setError(tl.errorEmpty ?? 'Please enter a username');
            return;
        }

        if (username.length < 3 || username.length > 20) {
            setError(tl.errorLength ?? 'Username must be 3-20 characters');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            setError(tl.errorChars ?? 'Only letters, digits and underscores are allowed');
            return;
        }

        setIsLoading(true);
        const result = await onLogin(username);
        setIsLoading(false);

        if (result.success) {
            // login successful, modal closes automatically
        } else {
            if (result.message && (result.message.includes('用户数量超上限') || result.message.includes('user limit'))) {
                setShowLimitAlert(true);
            } else {
                setError(result.message || (tl.errorDefault ?? 'Login failed'));
            }
        }
    };

    return (
        <>
            <div className="login-modal-overlay" onClick={onClose}>
                <div className="login-modal" onClick={(e) => e.stopPropagation()}>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="close-button"
                            title={tl.close ?? 'Close'}
                        >
                            ×
                        </button>
                    )}
                    <h2>{tl.title ?? 'Login to Fretboard Diagram'}</h2>
                    <p className="login-description">
                        {tl.description ?? 'Enter a username to log in; an account will be created automatically on first use.'}
                    </p>
                    
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="username">{tl.usernameLabel ?? 'Username'}</label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder={tl.usernamePlaceholder ?? '3-20 chars, letters/digits/underscore'}
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
                                {isLoading ? (tl.submitting ?? 'Logging in...') : (tl.submit ?? 'Login')}
                            </button>
                        </div>
                    </form>

                    <div className="login-note">
                        <p>{tl.note ?? 'Remember your username — lost credentials cannot be recovered.'}</p>
                    </div>
                </div>
            </div>
            
            {showLimitAlert && (
                <div className="login-modal-overlay" onClick={() => setShowLimitAlert(false)}>
                    <div className="login-modal" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setShowLimitAlert(false)}
                            className="close-button"
                            title={tl.close ?? 'Close'}
                        >
                            ×
                        </button>
                        <h2>{tl.limitTitle ?? 'User Limit Reached'}</h2>
                        <p className="login-description" style={{ marginBottom: '20px' }}>
                            {tl.limitDesc ?? 'User limit reached. Please contact the author.'}
                        </p>
                        <div className="button-group">
                            <button 
                                onClick={() => setShowLimitAlert(false)}
                                className="btn-primary"
                            >
                                {tl.ok ?? 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
