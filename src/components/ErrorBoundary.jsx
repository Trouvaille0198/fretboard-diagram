import React from 'react';
import { getT } from '../i18n/getT';

const RESET_KEYS = [
    'fretboard-current-state',
    'fretboard-history',
    'fretboard-directories',
    'fretboard-current-directory',
    'fretboard-connection-preset'
];

// 渲染出错时兜底：整页不再白屏，提供重载/重置出口
export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('页面渲染出错:', error, info?.componentStack);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleReset = () => {
        const tf = getT().fretboard;
        const confirmed = window.confirm(tf.errResetConfirm);
        if (!confirmed) {
            return;
        }
        RESET_KEYS.forEach(key => {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                // 忽略清理失败
            }
        });
        window.location.reload();
    };

    render() {
        if (!this.state.error) {
            return this.props.children;
        }
        const tf = getT().fretboard;

        const panelStyle = {
            maxWidth: '460px',
            margin: '15vh auto 0',
            padding: '28px 26px',
            borderRadius: '16px',
            background: 'var(--app-panel-strong, rgba(18, 26, 33, 0.96))',
            color: 'var(--app-text, #e8eef4)',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)'
        };
        const buttonStyle = {
            margin: '0 6px',
            padding: '9px 18px',
            borderRadius: '999px',
            border: '1px solid color-mix(in srgb, var(--app-accent) 40%, transparent)',
            background: 'color-mix(in srgb, var(--app-accent) 14%, transparent)',
            color: 'var(--app-accent, #f3ba62)',
            fontSize: '14px',
            cursor: 'pointer'
        };

        return (
            <div style={panelStyle}>
                <div style={{ fontSize: '34px', marginBottom: '10px' }}>🎸</div>
                <h2 style={{ margin: '0 0 8px', fontSize: '18px' }}>
                    {tf.errTitle}
                </h2>
                <p style={{ margin: '0 0 18px', fontSize: '13px', opacity: 0.75, wordBreak: 'break-all' }}>
                    {String(this.state.error?.message || this.state.error)}
                </p>
                <div>
                    <button style={buttonStyle} onClick={this.handleReload}>{tf.errReload}</button>
                    <button style={{ ...buttonStyle, borderColor: 'color-mix(in srgb, var(--app-danger) 45%, transparent)', color: 'var(--app-danger, #ff8787)', background: 'color-mix(in srgb, var(--app-danger) 10%, transparent)' }} onClick={this.handleReset}>
                        {tf.errReset}
                    </button>
                </div>
            </div>
        );
    }
}