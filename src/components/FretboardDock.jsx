import React from 'react';
import './FretboardDock.css';

export function FretboardDock({
  historyStates = [],
  currentDirectoryId = 'default',
  selectedHistoryState,
  onRestore,
  onDelete,
  onClear,
}) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const collapseTimerRef = React.useRef(null);

  const openDock = React.useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setIsExpanded(true);
  }, []);

  const scheduleCloseDock = React.useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
    }
    collapseTimerRef.current = setTimeout(() => {
      setIsExpanded(false);
      collapseTimerRef.current = null;
    }, 180);
  }, []);

  React.useEffect(() => () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
    }
  }, []);

  const dockStates = historyStates.filter(
    (state) => state.directoryId === currentDirectoryId
  );
  const latestState = dockStates[0] || null;
  const stackCountLabel = dockStates.length > 99 ? '99+' : String(dockStates.length);

  return (
    <div
      className={`fretboard-dock ${isExpanded ? 'expanded' : ''}`}
      onMouseEnter={openDock}
      onMouseLeave={scheduleCloseDock}
    >
      <div
        className={`dock-stack ${isExpanded ? 'visible' : ''}`}
      >
        {dockStates.length === 0 ? (
          <div className="dock-empty">按 Ctrl+S 把当前指板加入指板堆</div>
        ) : (
          dockStates.map((stateSnapshot, index) => {
            const depth = dockStates.length - index - 1;
            const curveOffset = Math.min(depth * 10, 42);
            const liftOffset = depth * 4;
            const tilt = Math.min(depth * 1.5, 6);

            return (
              <div
                key={stateSnapshot.id}
                className={`dock-item ${selectedHistoryState?.id === stateSnapshot.id ? 'selected' : ''}`}
                title={`${stateSnapshot.name} · 点击应用，右键删除`}
                style={{
                  '--dock-depth': depth,
                  '--dock-curve-offset': `${curveOffset}px`,
                  '--dock-lift-offset': `${liftOffset}px`,
                  '--dock-tilt': `${tilt}deg`
                }}
              >
                <button
                  className="dock-item-apply"
                  onClick={() => onRestore?.(stateSnapshot)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onDelete?.(stateSnapshot);
                  }}
                  title={`应用：${stateSnapshot.name}`}
                >
                  {stateSnapshot.thumbnail ? (
                    <img
                      src={stateSnapshot.thumbnail}
                      alt={stateSnapshot.name}
                      className="dock-item-thumbnail"
                    />
                  ) : (
                    <div className="dock-item-placeholder">无缩略图</div>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="dock-bar">
        <div className="dock-meta-col">
          <div className="dock-meta">
            <div className="dock-title">指板堆</div>
            <div className="dock-subtitle">
              {dockStates.length === 0 ? '空堆' : `当前 ${stackCountLabel} 张`}
            </div>
          </div>

          <button
            className="dock-clear-btn"
            onClick={onClear}
            title="清空当前指板堆"
          >
            Clear
          </button>
        </div>

        <button
          className="dock-primary"
          onClick={() => latestState && onRestore?.(latestState)}
          title={latestState ? `应用最近快照：${latestState.name}` : '指板堆'}
        >
          <span className="dock-stack-shadow dock-stack-shadow-back" />
          <span className="dock-stack-shadow dock-stack-shadow-mid" />
          <span className="dock-primary-face">
            {latestState?.thumbnail ? (
              <img
                src={latestState.thumbnail}
                alt={latestState.name}
                className="dock-preview"
              />
            ) : (
              <span className="dock-label">指板堆</span>
            )}
          </span>
          {dockStates.length > 0 && (
            <span className="dock-count-badge">{stackCountLabel}</span>
          )}
        </button>
      </div>
    </div>
  );
}
