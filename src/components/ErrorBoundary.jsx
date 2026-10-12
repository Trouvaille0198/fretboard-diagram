import React from 'react';

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
        const confirmed = window.confirm('将清除本地保存的指板数据并重置页面，确定吗？');
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

        const panelStyle = {
            maxWidth: '460px',
            margin: '15vh auto 0',
            padding: '28px 26px',
            borderRadius: '16px',
            background: 'rgba(18, 26, 33, 0.96)',
            color: '#e8eef4',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)'
        };
        const buttonStyle = {
            margin: '0 6px',
            padding: '9px 18px',
            borderRadius: '999px',
            border: '1px solid rgba(243, 186, 98, 0.4)',
            background: 'rgba(243, 186, 98, 0.14)',
            color: '#f3ba62',
            fontSize: '14px',
            cursor: 'pointer'
        };

        return (
            <div style={panelStyle}>
                <div style={{ fontSize: '34px', marginBottom: '10px' }}>🎸</div>
                <h2 style={{ margin: '0 0 8px', fontSize: '18px' }}>
                    页面出错了 / Something went wrong
                </h2>
                <p style={{ margin: '0 0 18px', fontSize: '13px', opacity: 0.75, wordBreak: 'break-all' }}>
                    {String(this.state.error?.message || this.state.error)}
                </p>
                <div>
                    <button style={buttonStyle} onClick={this.handleReload}>重新加载 / Reload</button>
                    <button style={{ ...buttonStyle, borderColor: 'rgba(255, 107, 107, 0.45)', color: '#ff8787', background: 'rgba(255, 107, 107, 0.1)' }} onClick={this.handleReset}>
                        清除数据并重置 / Reset
                    </button>
                </div>
            </div>
        );
    }
}