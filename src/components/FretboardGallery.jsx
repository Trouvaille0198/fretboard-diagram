import React from 'react';
import ReactDOM from 'react-dom';
import './FretboardGallery.css';
import { exportFretboardState, importFretboardState, copyToClipboard, readFromClipboard } from '../utils/fretboardShare';
import { parseSVGToFretboardState } from '../utils/svgImport';
import { exportAllData, importBatchData } from '../utils/fretboardHistory';

export function FretboardGallery({ 
  historyStates, 
  onRestore, 
  onDelete, 
  selectedHistoryState, 
  onSelect, 
  onClearAll, 
  onImport, 
  onRename,
  // 目录管理
  directories = [],
  currentDirectoryId = 'default',
  onDirectoryChange,
  onDirectoryCreate,
  onDirectoryRename,
  onDirectoryDelete,
  onExportAll,
  onBatchImport
}) {
  const [showImportDialog, setShowImportDialog] = React.useState(false);
  const [importText, setImportText] = React.useState('');
  const [editingId, setEditingId] = React.useState(null);
  const [editingName, setEditingName] = React.useState('');
  const [importMode, setImportMode] = React.useState('string'); // 'string', 'svg', 'json'
  const fileInputRef = React.useRef(null);
  const jsonFileInputRef = React.useRef(null);
  
  // 侧边栏展开/收起状态
  const [isOpen, setIsOpen] = React.useState(false);
  
  // 删除历史记录（用于撤销）
  const [deleteHistory, setDeleteHistory] = React.useState([]);
  
  // 右键菜单状态
  const [contextMenu, setContextMenu] = React.useState(null);
  const [contextMenuDirectory, setContextMenuDirectory] = React.useState(null);
  
  // Ctrl+Z 撤销删除
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (deleteHistory.length > 0) {
          e.preventDefault();
          // 恢复最后删除的状态
          const lastDeleted = deleteHistory[deleteHistory.length - 1];
          const existingHistory = localStorage.getItem('fretboard-history');
          let historyArray = [];
          if (existingHistory) {
            historyArray = JSON.parse(existingHistory);
          }
          // 添加回去
          historyArray.unshift(lastDeleted);
          localStorage.setItem('fretboard-history', JSON.stringify(historyArray));
          
          // 更新状态
          if (onBatchImport) {
            onBatchImport({ 
              success: true, 
              historyStates: historyArray,
              directories: directories,
              message: '已撤销删除' 
            });
          }
          
          // 移除历史记录中的最后一项
          setDeleteHistory(prev => prev.slice(0, -1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteHistory, directories, onBatchImport]);
  
  // 点击外部区域关闭侧边栏
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      const gallery = document.querySelector('.fretboard-gallery');
      const toggleBtn = document.querySelector('.gallery-toggle-btn');
      
      // 如果点击的不是侧边栏内部或切换按钮，则关闭侧边栏
      if (gallery && !gallery.contains(event.target) && 
          toggleBtn && !toggleBtn.contains(event.target)) {
        setIsOpen(false);
      }
    };

    // 延迟添加事件监听，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen]);
  
  // 关闭右键菜单
  React.useEffect(() => {
    const handleClick = () => setContextMenu(null);
    const handleScroll = () => setContextMenu(null);
    
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      document.addEventListener('scroll', handleScroll, true);
    }
    
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);
  
  // 目录编辑状态
  const [editingDirectoryId, setEditingDirectoryId] = React.useState(null);
  const [editingDirectoryName, setEditingDirectoryName] = React.useState('');
  const [hoveredDirectoryId, setHoveredDirectoryId] = React.useState(null);

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

  const processImport = async (shareString, isSvg = false) => {
    try {
      let importData;
      if (isSvg) {
        importData = await parseSVGToFretboardState(shareString);
      } else {
        importData = importFretboardState(shareString);
      }
      
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
    if (importMode === 'string') {
      const text = importText.trim();
      if (!text) {
        onImport({ success: false, message: '请输入分享字符串' });
        return;
      }
      await processImport(text);
    } else if (importMode === 'svg') {
      if (fileInputRef.current && fileInputRef.current.files.length > 0) {
        const file = fileInputRef.current.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
          await processImport(e.target.result, true);
        };
        reader.onerror = () => {
          onImport({ success: false, message: '读取SVG文件失败' });
        };
        reader.readAsText(file);
      } else {
        onImport({ success: false, message: '请选择一个SVG文件' });
      }
    } else if (importMode === 'json') {
      if (jsonFileInputRef.current && jsonFileInputRef.current.files.length > 0) {
        const file = jsonFileInputRef.current.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const jsonData = JSON.parse(e.target.result);
            const result = importBatchData(jsonData);
            if (result.success && onBatchImport) {
              onBatchImport(result);
            } else {
              onImport(result);
            }
            if (result.success) {
              setShowImportDialog(false);
              setImportText('');
              setImportMode('string');
            }
          } catch (error) {
            onImport({ success: false, message: 'JSON解析失败：' + error.message });
          }
        };
        reader.onerror = () => {
          onImport({ success: false, message: '读取JSON文件失败' });
        };
        reader.readAsText(file);
      } else {
        onImport({ success: false, message: '请选择一个JSON文件' });
      }
    }
  };

  const handleDialogCancel = () => {
    setShowImportDialog(false);
    setImportText('');
    setImportMode('string');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.svg')) {
      onImport({ success: false, message: '请选择 SVG 文件' });
      return;
    }

    // 使用 processImport 统一处理
    const reader = new FileReader();
    reader.onload = async (e) => {
      await processImport(e.target.result, true);
    };
    reader.onerror = () => {
      onImport({ success: false, message: '读取SVG文件失败' });
    };
    reader.readAsText(file);
  };

  const emptyStateContent = !historyStates || historyStates.length === 0;
  
  // 过滤当前目录下的状态
  const filteredStates = historyStates.filter(state => state.directoryId === currentDirectoryId);

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
    
    // 记录到删除历史
    setDeleteHistory(prev => [...prev, stateSnapshot]);
    
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

  const handleNameDoubleClick = (e, stateSnapshot) => {
    e.stopPropagation(); // 阻止触发恢复
    setEditingId(stateSnapshot.id);
    setEditingName(stateSnapshot.name);
    // 延迟执行，确保input已经渲染
    setTimeout(() => {
      const input = document.querySelector('.gallery-item-name-input');
      if (input) {
        input.select();
      }
    }, 0);
  };

  const handleNameChange = (e) => {
    setEditingName(e.target.value);
  };

  const handleNameKeyDown = (e, stateSnapshot) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameConfirm(stateSnapshot);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingId(null);
      setEditingName('');
    }
  };

  const handleNameBlur = (stateSnapshot) => {
    handleRenameConfirm(stateSnapshot);
  };

  const handleRenameConfirm = (stateSnapshot) => {
    const newName = editingName.trim();
    if (newName && newName !== stateSnapshot.name && onRename) {
      onRename(stateSnapshot, newName);
    }
    setEditingId(null);
    setEditingName('');
  };
  
  // 目录操作处理函数
  const handleDirectoryClick = (dirId) => {
    if (editingDirectoryId) return; // 编辑中不切换
    if (onDirectoryChange) {
      onDirectoryChange(dirId);
    }
  };
  
  // 右键目录
  const handleDirectoryContextMenu = (e, dir) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuDirectory(dir);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };
  
  // 导出当前目录的状态
  const handleExportDirectory = () => {
    try {
      const dirStates = historyStates.filter(state => state.directoryId === contextMenuDirectory.id);
      
      if (dirStates.length === 0) {
        if (onImport) {
          onImport({ success: false, message: '该目录下没有状态' });
        }
        return;
      }
      
      const exportData = {
        version: '1.0',
        exportTime: new Date().toISOString(),
        directories: [contextMenuDirectory],
        historyStates: dirStates
      };
      
      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contextMenuDirectory.name}_${new Date().getTime()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      if (onImport) {
        onImport({ success: true, message: `已导出 ${dirStates.length} 个状态` });
      }
    } catch (error) {
      console.error('导出失败:', error);
      if (onImport) {
        onImport({ success: false, message: '导出失败：' + error.message });
      }
    }
    setContextMenu(null);
  };
  
  const handleDirectoryDoubleClick = (e, dir) => {
    e.stopPropagation();
    if (dir.isDefault) return; // 默认目录不能重命名
    setEditingDirectoryId(dir.id);
    setEditingDirectoryName(dir.name);
    // 延迟执行，确保input已经渲染
    setTimeout(() => {
      const input = document.querySelector('.directory-tab-input');
      if (input) {
        input.select();
      }
    }, 0);
  };
  
  const handleDirectoryNameChange = (e) => {
    setEditingDirectoryName(e.target.value);
  };
  
  const handleDirectoryNameKeyDown = (e, dir) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDirectoryRenameConfirm(dir);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingDirectoryId(null);
      setEditingDirectoryName('');
    }
  };
  
  const handleDirectoryNameBlur = (dir) => {
    handleDirectoryRenameConfirm(dir);
  };
  
  const handleDirectoryRenameConfirm = (dir) => {
    const newName = editingDirectoryName.trim();
    if (newName && newName !== dir.name && onDirectoryRename) {
      const result = onDirectoryRename(dir.id, newName);
      if (!result.success && onImport) {
        onImport({ success: false, message: result.message });
      }
    }
    setEditingDirectoryId(null);
    setEditingDirectoryName('');
  };
  
  const handleDirectoryDelete = (e, dir) => {
    e.stopPropagation();
    if (dir.isDefault) return;
    
    const stateCount = historyStates.filter(s => s.directoryId === dir.id).length;
    const confirmMsg = stateCount > 0 
      ? `确认删除目录 "${dir.name}"？\n该目录下的 ${stateCount} 个状态将移至 default 目录。`
      : `确认删除目录 "${dir.name}"？`;
    
    if (window.confirm(confirmMsg)) {
      if (onDirectoryDelete) {
        onDirectoryDelete(dir.id);
      }
    }
  };
  
  const handleDirectoryCreate = () => {
    if (onDirectoryCreate) {
      onDirectoryCreate();
    }
  };
  
  const handleExportAll = () => {
    const result = exportAllData();
    if (onImport) {
      onImport(result);
    }
  };

  return (
    <>
      {/* 侧边栏切换按钮 */}
      <button 
        className={`gallery-toggle-btn ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? '隐藏历史状态' : '显示历史状态'}
      >
        {isOpen ? '«' : '»'}
      </button>

      <div className={`fretboard-gallery ${isOpen ? 'open' : ''}`}>
        <div className="gallery-header">
          <h3 className="gallery-title">历史状态</h3>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button 
              className="gallery-export-btn"
              onClick={handleExportAll}
              title="导出所有目录和状态"
            >
              导出
            </button>
            <button 
              className="gallery-import-btn"
              onClick={handleImport}
              title="从剪贴板导入指板状态"
            >
              导入
            </button>
          </div>
        </div>
      
      {/* 目录标签栏 */}
      <div className="directory-tabs">
        <div className="tabs-container">
          {directories.map((dir) => (
            <div
              key={dir.id}
              className={`directory-tab ${dir.id === currentDirectoryId ? 'active' : ''}`}
              onClick={() => handleDirectoryClick(dir.id)}
              onDoubleClick={(e) => handleDirectoryDoubleClick(e, dir)}
              onContextMenu={(e) => handleDirectoryContextMenu(e, dir)}
              onMouseEnter={() => setHoveredDirectoryId(dir.id)}
              onMouseLeave={() => setHoveredDirectoryId(null)}
              title={dir.name}
            >
              {editingDirectoryId === dir.id ? (
                <input
                  type="text"
                  className="directory-tab-input"
                  value={editingDirectoryName}
                  onChange={handleDirectoryNameChange}
                  onKeyDown={(e) => handleDirectoryNameKeyDown(e, dir)}
                  onBlur={() => handleDirectoryNameBlur(dir)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span className="directory-tab-name">{dir.name}</span>
              )}
              {!dir.isDefault && hoveredDirectoryId === dir.id && !editingDirectoryId && (
                <button
                  className="directory-tab-close"
                  onClick={(e) => handleDirectoryDelete(e, dir)}
                  title="删除目录"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            className="directory-tab-add"
            onClick={handleDirectoryCreate}
            title="新建目录"
          >
            +
          </button>
        </div>
      </div>
      
      {filteredStates.length === 0 ? (
        <div className="gallery-empty">暂无保存的状态</div>
      ) : (
        <div className="gallery-grid">
        {filteredStates.map((stateSnapshot) => (
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
              {editingId === stateSnapshot.id ? (
                <input
                  type="text"
                  className="gallery-item-name-input"
                  value={editingName}
                  onChange={handleNameChange}
                  onKeyDown={(e) => handleNameKeyDown(e, stateSnapshot)}
                  onBlur={() => handleNameBlur(stateSnapshot)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <div 
                  className="gallery-item-name"
                  onDoubleClick={(e) => handleNameDoubleClick(e, stateSnapshot)}
                  title="双击重命名"
                >
                  {stateSnapshot.name}
                </div>
              )}
            </div>
          </div>
        ))}
        </div>
      )}
      {showImportDialog && ReactDOM.createPortal(
        <div className="import-dialog-overlay" onClick={handleDialogCancel}>
          <div className="import-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>导入指板状态</h3>
            <div style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <button
                  className={importMode === 'string' ? 'gallery-import-btn' : 'gallery-clear-btn'}
                  onClick={() => setImportMode('string')}
                  style={{ flex: 1 }}
                >
                  分享字符串
                </button>
                <button
                  className={importMode === 'svg' ? 'gallery-import-btn' : 'gallery-clear-btn'}
                  onClick={() => setImportMode('svg')}
                  style={{ flex: 1 }}
                >
                  SVG 文件
                </button>
                <button
                  className={importMode === 'json' ? 'gallery-import-btn' : 'gallery-clear-btn'}
                  onClick={() => setImportMode('json')}
                  style={{ flex: 1 }}
                >
                  JSON 批量导入
                </button>
              </div>
            </div>
            {importMode === 'string' ? (
              <>
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
              </>
            ) : importMode === 'json' ? (
              <>
                <p style={{ fontSize: '12px', color: 'var(--text-color)', opacity: 0.7, marginBottom: '10px' }}>
                  选择之前导出的 JSON 备份文件进行批量导入
                </p>
                <input
                  ref={jsonFileInputRef}
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    if (e.target.files.length > 0) {
                      setImportText(e.target.files[0].name); // 显示文件名
                    } else {
                      setImportText('');
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--text-color)',
                    borderRadius: '4px',
                    background: 'var(--background-color)',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                    marginBottom: '10px'
                  }}
                />
              </>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: 'var(--text-color)', opacity: 0.7, marginBottom: '10px' }}>
                  选择之前导出的 SVG 文件进行导入
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".svg"
                  onChange={(e) => {
                    if (e.target.files.length > 0) {
                      setImportText(e.target.files[0].name); // 显示文件名
                    } else {
                      setImportText('');
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--text-color)',
                    borderRadius: '4px',
                    background: 'var(--background-color)',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                    marginBottom: '10px'
                  }}
                />
              </>
            )}
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
      
      {/* 右键菜单 */}
      {contextMenu && contextMenuDirectory && ReactDOM.createPortal(
        <div 
          className="directory-context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 100000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={handleExportDirectory}>
            导出该目录状态
          </div>
        </div>,
        document.body
      )}
      </div>
    </>
  );
}
