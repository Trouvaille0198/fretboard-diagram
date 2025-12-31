import React, { useEffect, useState, useRef } from 'react';
import './Toast.css';

export function Toast({ message, type = 'info', duration = 2000, onClose }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const onCloseRef = useRef(onClose);
  const timerRef = useRef(null);

  // 更新 onClose ref，避免依赖变化导致 effect 重新运行
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // 清除之前的计时器
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (message) {
      setVisible(true);
      setExiting(false);
      
      timerRef.current = setTimeout(() => {
        setExiting(true);
        timerRef.current = setTimeout(() => {
          setVisible(false);
          if (onCloseRef.current) {
            onCloseRef.current();
          }
          timerRef.current = null;
        }, 300); // 动画时间
      }, duration);
    } else {
      setVisible(false);
      setExiting(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [message, duration]);

  if (!message || !visible) {
    return null;
  }

  return (
    <div className={`toast ${type} ${exiting ? 'exiting' : ''}`}>
      <div className="toast-content">
        {message}
      </div>
    </div>
  );
}
