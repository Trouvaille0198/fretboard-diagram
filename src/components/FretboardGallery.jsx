import React from 'react';
import ReactDOM from 'react-dom';
import './FretboardGallery.css';
import { exportFretboardState, importFretboardState, copyToClipboard, readFromClipboard } from '../utils/fretboardShare';
import { parseSVGToFretboardState } from '../utils/svgImport';
import { exportAllData, importBatchData } from '../utils/fretboardHistory';
import { useLanguage } from '../i18n';

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
  onBatchImport,
  isOpen: controlledIsOpen,
  onOpenChange,
  hideToggleButton = false
}) {
  const { t } = useLanguage();
  const tg = t?.gallery ?? {};

  const [showImportDialog, setShowImportDialog] = React.useState(false);
  const [importText, setImportText] = React.useState('');
  const [editingId, setEditingId] = React.useState(null);
  const [editingName, setEditingName] = React.useState('');
  const [importMode, setImportMode] = React.useState('string'); // 'string', 'svg', 'json'
  const fileInputRef = React.useRef(null);
  const jsonFileInputRef = React.useRef(null);
  
  // 侧边栏展开/收起状态
  const [internalIsOpen, setInternalIsOpen] = React.useState(false);
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = onOpenChange ?? setInternalIsOpen;
  
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
          
          // 通过 onBatchImport 回调通知父组件添加回去
          const updatedStates = [lastDeleted, ...historyStates];
          if (onBatchImport) {
            onBatchImport({ 
              success: true, 
              historyStates: updatedStates,
              directories: directories,
              message: tg.undoDelete ?? 'Delete undone'
            });
          }
          
          // 移除历史记录中的最后一项
          setDeleteHistory(prev => prev.slice(0, -1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteHistory, directories, historyStates, onBatchImport]);
  
  // Tab 键切换侧边栏
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Tab' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        // 检查是否在输入框中
        const activeElement = document.activeElement;
        const isInputActive = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable
        );

        // 如果不在输入框中，则切换侧边栏
        if (!isInputActive) {
          e.preventDefault();
          setIsOpen(!isOpen);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);
  
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
      alert(tg.importNotInit ?? 'Import not initialized, please refresh the page');
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
        onImport({ success: true, data: importData, message: tg.importSuccess ?? 'Import successful!' });
        setShowImportDialog(false);
        setImportText('');
      } else {
        onImport({ success: false, message: tg.importParseFail ?? 'Import failed: data parse error' });
      }
    } catch (error) {
      // 确保错误通过 onImport 回调显示 Toast
      onImport({ success: false, message: error.message || (tg.importFail?.() ?? 'Import failed: unknown error') });
    }
  };

  const handleDialogImport = async () => {
    if (importMode === 'string') {
      const text = importText.trim();
      if (!text) {
        onImport({ success: false, message: tg.importEnterString ?? 'Please enter a share string' });
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
          onImport({ success: false, message: tg.importReadSvgFail ?? 'Failed to read SVG file' });
        };
        reader.readAsText(file);
      } else {
        onImport({ success: false, message: tg.importSelectSvg ?? 'Please select an SVG file' });
      }
    } else if (importMode === 'json') {
      if (jsonFileInputRef.current && jsonFileInputRef.current.files.length > 0) {
        const file = jsonFileInputRef.current.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const jsonData = JSON.parse(e.target.result);
            const result = importBatchData(jsonData, t);
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
            onImport({ success: false, message: tg.importJsonFail ? tg.importJsonFail(error.message) : 'JSON parse error: ' + error.message });
          }
        };
        reader.onerror = () => {
          onImport({ success: false, message: tg.importReadJsonFail ?? 'Failed to read JSON file' });
        };
        reader.readAsText(file);
      } else {
        onImport({ success: false, message: tg.importSelectJson ?? 'Please select a JSON file' });
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
      onImport({ success: false, message: tg.importSelectSvgFile ?? 'Please select an SVG file' });
      return;
    }

    // 使用 processImport 统一处理
    const reader = new FileReader();
    reader.onload = async (e) => {
      await processImport(e.target.result, true);
    };
    reader.onerror = () => {
      onImport({ success: false, message: tg.importReadSvgFail ?? 'Failed to read SVG file' });
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
    if (window.confirm(tg.confirmClearAll ?? 'Clear all states? This cannot be undone.')) {
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
        onImport({ success: true, message: tg.shareSuccess ?? 'Copied!' });
      }
    } catch (error) {
      console.error('Share failed:', error);
      if (onImport) {
        onImport({ success: false, message: tg.shareFail ? tg.shareFail(error.message) : error.message });
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
          onImport({ success: false, message: tg.dirExportEmpty ?? 'No states in this directory' });
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
        onImport({ success: true, message: tg.dirExportSuccess ? tg.dirExportSuccess(dirStates.length) : `Exported ${dirStates.length} states` });
      }
    } catch (error) {
      console.error('Export failed:', error);
      if (onImport) {
        onImport({ success: false, message: tg.dirExportFail ? tg.dirExportFail(error.message) : 'Export failed: ' + error.message });
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
  
  const handleDirectoryRenameConfirm = async (dir) => {
    const newName = editingDirectoryName.trim();
    if (newName && newName !== dir.name && onDirectoryRename) {
      const result = await onDirectoryRename(dir.id, newName);
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
    const confirmMsg = tg.confirmDeleteDir
      ? tg.confirmDeleteDir(dir.name, stateCount)
      : stateCount > 0
        ? `Delete "${dir.name}"? ${stateCount} state(s) will be moved to default.`
        : `Delete "${dir.name}"?`;
    
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
    const result = exportAllData(t);
    if (onImport) {
      onImport(result);
    }
  };

  return (
    <>
      {!hideToggleButton && (
        <button
          className={`gallery-toggle-btn ${isOpen ? 'open' : ''}`}
          onClick={() => {
            setIsOpen(!isOpen);
          }}
          title={isOpen ? (tg.toggleCloseTitle ?? 'Hide gallery') : (tg.toggleOpenTitle ?? 'Show gallery')}
        >
          {isOpen ? '«' : '»'}
        </button>
      )}

      <div className={`fretboard-gallery ${isOpen ? 'open' : ''}`}>
        <div className="gallery-header">
          <h3 className="gallery-title">{tg.title ?? 'State Gallery'}</h3>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button 
              className="gallery-export-btn"
              onClick={handleExportAll}
              title={tg.exportTitle ?? 'Export all'}
            >
              {tg.export ?? 'Export'}
            </button>
            <button 
              className="gallery-import-btn"
              onClick={handleImport}
              title={tg.importTitle ?? 'Import'}
            >
              {tg.import ?? 'Import'}
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
                  title={tg.deleteDirectoryTitle ?? 'Delete directory'}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            className="directory-tab-add"
            onClick={handleDirectoryCreate}
            title={tg.newDirectoryTitle ?? 'New directory'}
          >
            {tg.newDirectory ?? '+'}
          </button>
        </div>
      </div>
      
      {filteredStates.length === 0 ? (
        <div className="gallery-empty">{tg.empty ?? 'No saved states'}</div>
      ) : (
        <div className="gallery-grid">
        {filteredStates.map((stateSnapshot) => (
          <div
            key={stateSnapshot.id}
            className={`gallery-item ${selectedHistoryState && selectedHistoryState.id === stateSnapshot.id ? 'selected' : ''}`}
            onClick={(e) => handleThumbnailClick(stateSnapshot, e)}
            title={tg.applyHint ? tg.applyHint(stateSnapshot.name) : stateSnapshot.name}
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
                  {tg.noThumbnail ?? 'No thumbnail'}
                </div>
              )}
              <button
                className="gallery-delete-btn"
                onClick={(e) => handleDelete(e, stateSnapshot)}
                title={tg.deleteStateTitle ?? 'Delete'}
              >
                ×
              </button>
              <button
                className="gallery-share-btn"
                onClick={(e) => handleShare(e, stateSnapshot)}
                title={tg.shareStateTitle ?? 'Share'}
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
                  title={tg.renameHint ?? 'Double-click to rename'}
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
            <h3>{tg.importDialogTitle ?? 'Import Fretboard State'}</h3>
            <div style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  className={`mode-tab${importMode === 'string' ? ' active' : ''}`}
                  onClick={() => setImportMode('string')}
                >
                  {tg.tabString ?? 'Share string'}
                </button>
                <button
                  className={`mode-tab${importMode === 'svg' ? ' active' : ''}`}
                  onClick={() => setImportMode('svg')}
                >
                  {tg.tabSvg ?? 'SVG file'}
                </button>
                <button
                  className={`mode-tab${importMode === 'json' ? ' active' : ''}`}
                  onClick={() => setImportMode('json')}
                >
                  {tg.tabJson ?? 'JSON batch import'}
                </button>
              </div>
            </div>
            {importMode === 'string' ? (
              <>
                <p style={{ fontSize: '12px', color: 'var(--text-color)', opacity: 0.7, marginBottom: '10px' }}>
                  {tg.stringHint ?? 'Paste a share string (fretboard://...)'}
                </p>
                <textarea
                  className="import-textarea"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={tg.stringPlaceholder ?? 'Paste share string...'}
                  rows={4}
                  autoFocus
                />
              </>
            ) : importMode === 'json' ? (
              <>
                <p style={{ fontSize: '12px', color: 'var(--text-color)', opacity: 0.7, marginBottom: '10px' }}>
                  {tg.jsonHint ?? 'Select a previously exported JSON backup file'}
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
                  className="import-file-input"
                />
              </>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: 'var(--text-color)', opacity: 0.7, marginBottom: '10px' }}>
                  {tg.svgHint ?? 'Select a previously exported SVG file'}
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
                  className="import-file-input"
                />
              </>
            )}
            <div className="import-dialog-buttons">
              <button className="gallery-import-btn" onClick={handleDialogImport}>
                {tg.confirmImport ?? 'Import'}
              </button>
              <button className="gallery-clear-btn" onClick={handleDialogCancel}>
                {tg.cancel ?? 'Cancel'}
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
            {tg.contextExportDir ?? 'Export directory'}
          </div>
        </div>,
        document.body
      )}
      </div>
    </>
  );
}
