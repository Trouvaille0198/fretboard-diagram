import React from 'react';
import ReactDOM from 'react-dom';
import './FretboardGallery.css';
import { exportFretboardState, importFretboardState, copyToClipboard, readFromClipboard } from '../utils/fretboardShare';

export function FretboardGallery({ historyStates, onRestore, onDelete, selectedHistoryState, onSelect, onClearAll, onImport }) {
  const [showImportDialog, setShowImportDialog] = React.useState(false);
  const [importText, setImportText] = React.useState('');

  const handleImport = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!onImport) {
      alert('导入功能未正确初始化，请刷新页面重试');
      return;
    }

    // 直接显示输入框，因为剪贴板API在很多情况下不可靠
    setShowImportDialog(true);
    setImportText('');
    
    // 尝试自动填充剪贴板内容（但不阻塞，不等待）
    readFromClipboard()
      .then(clipboardText => {
        if (clipboardText && clipboardText.trim()) {
          setImportText(clipboardText);
        }
      })
      .catch(() => {
        // 静默失败，用户可以在输入框中手动粘贴
      });
  };

  const processImport = async (shareString) => {
    try {
      // 直接使用本地解压缩
      const importData = importFretboardState(shareString);
      
      if (importData) {
        onImport({ success: true, data: importData, message: '导入成功！' });
        setShowImportDialog(false);
        setImportText('');
      } else {
        onImport({ success: false, message: '导入处理失败：数据解析异常' });
      }
    } catch (error) {
      // 确保错误通过 onImport 回调显示 Toast
      onImport({ success: false, message: error.message || '导入失败：未知错误' });
    }
  };

  const handleDialogImport = async () => {
    const text = importText.trim();
    if (!text) {
      onImport({ success: false, message: '请输入分享字符串' });
      return;
    }
    // processImport 内部已经处理了错误，不需要再 try-catch
    await processImport(text);
  };

  const handleDialogCancel = () => {
    setShowImportDialog(false);
    setImportText('');
  };

  if (!historyStates || historyStates.length === 0) {
    return (
      <div className="fretboard-gallery">
        <div className="gallery-header">
          <h3 className="gallery-title">历史状态</h3>
          <button 
            className="gallery-import-btn"
            onClick={handleImport}
            title="从剪贴板导入指板状态"
          >
            导入
          </button>
        </div>
        <div className="gallery-empty">暂无保存的状态</div>
      </div>
    );
  }

  const handleThumbnailClick = (stateSnapshot, e) => {
    // 如果按住 Ctrl 或 Cmd，只选中不恢复
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (onSelect) {
        onSelect(stateSnapshot);
      }
      return;
    }
    
    // 普通点击：恢复状态
    if (onRestore) {
      onRestore(stateSnapshot);
    }
    // 恢复后自动选中
    if (onSelect) {
      onSelect(stateSnapshot);
    }
  };

  const handleDelete = (e, stateSnapshot) => {
    e.stopPropagation(); // 阻止触发恢复
    if (onDelete) {
      onDelete(stateSnapshot);
    }
    // 如果删除的是选中的状态，清除选中
    if (selectedHistoryState && selectedHistoryState.id === stateSnapshot.id && onSelect) {
      onSelect(null);
    }
  };

  const handleClearAll = () => {
    if (window.confirm('确定要清空所有历史状态吗？此操作不可恢复。')) {
      if (onClearAll) {
        onClearAll();
      }
    }
  };

  const handleShare = async (e, stateSnapshot) => {
    e.stopPropagation(); // 阻止触发恢复
    try {
      // 直接使用本地压缩字符串
      const shareString = exportFretboardState(stateSnapshot);
      await copyToClipboard(shareString);
      if (onImport) {
        onImport({ success: true, message: '分享字符串已复制到剪贴板！' });
      }
    } catch (error) {
      console.error('分享失败:', error);
      if (onImport) {
        onImport({ success: false, message: '分享失败：' + error.message });
      }
    }
  };

  return (
    <div className="fretboard-gallery">
      <div className="gallery-header">
        <h3 className="gallery-title">历史状态</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            className="gallery-import-btn"
            onClick={handleImport}
            title="从剪贴板导入指板状态"
          >
            导入
          </button>
          <button 
            className="gallery-clear-btn"
            onClick={handleClearAll}
            title="清空所有历史状态"
          >
            清空
          </button>
        </div>
      </div>
      <div className="gallery-grid">
        {historyStates.map((stateSnapshot) => (
          <div
            key={stateSnapshot.id}
            className={`gallery-item ${selectedHistoryState && selectedHistoryState.id === stateSnapshot.id ? 'selected' : ''}`}
            onClick={(e) => handleThumbnailClick(stateSnapshot, e)}
            title={`点击恢复状态 - ${stateSnapshot.name}${selectedHistoryState && selectedHistoryState.id === stateSnapshot.id ? ' (已选中，保存将更新此状态)' : ''}`}
          >
            <div className="gallery-thumbnail-wrapper">
              {stateSnapshot.thumbnail ? (
                <img
                  src={stateSnapshot.thumbnail}
                  alt={stateSnapshot.name}
                  className="gallery-thumbnail"
                />
              ) : (
                <div className="gallery-thumbnail-placeholder">
                  无缩略图
                </div>
              )}
              <button
                className="gallery-delete-btn"
                onClick={(e) => handleDelete(e, stateSnapshot)}
                title="删除此状态"
              >
                ×
              </button>
              <button
                className="gallery-share-btn"
                onClick={(e) => handleShare(e, stateSnapshot)}
                title="分享此状态"
              >
                📤
              </button>
            </div>
            <div className="gallery-item-info">
              <div className="gallery-item-name">{stateSnapshot.name}</div>
            </div>
          </div>
        ))}
      </div>
      {showImportDialog && ReactDOM.createPortal(
        <div className="import-dialog-overlay" onClick={handleDialogCancel}>
          <div className="import-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>导入指板状态</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-color)', opacity: 0.7, marginBottom: '10px' }}>
              请粘贴分享字符串（格式：fretboard://...）
            </p>
            <textarea
              className="import-textarea"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="粘贴分享字符串..."
              rows={4}
              autoFocus
            />
            <div className="import-dialog-buttons">
              <button className="gallery-import-btn" onClick={handleDialogImport}>
                确认导入
              </button>
              <button className="gallery-clear-btn" onClick={handleDialogCancel}>
                取消
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
