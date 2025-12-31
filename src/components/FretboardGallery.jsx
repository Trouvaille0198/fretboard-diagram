import React from 'react';
import './FretboardGallery.css';

export function FretboardGallery({ historyStates, onRestore, onDelete, selectedHistoryState, onSelect, onClearAll }) {
  if (!historyStates || historyStates.length === 0) {
    return (
      <div className="fretboard-gallery">
        <div className="gallery-header">
          <h3 className="gallery-title">历史状态</h3>
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

  return (
    <div className="fretboard-gallery">
      <div className="gallery-header">
        <h3 className="gallery-title">历史状态</h3>
        <button 
          className="gallery-clear-btn"
          onClick={handleClearAll}
          title="清空所有历史状态"
        >
          清空
        </button>
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
            </div>
            <div className="gallery-item-info">
              <div className="gallery-item-name">{stateSnapshot.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
