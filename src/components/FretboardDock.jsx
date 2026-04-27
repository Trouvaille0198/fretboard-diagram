import React from 'react';
import './FretboardDock.css';

export function FretboardDock({
  historyStates = [],
  currentDirectoryId = 'default',
  selectedHistoryState,
  onRestore,
  onDelete,
  onClear,
  t,
}) {
  const td = t?.dock ?? {};

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
          <div className="dock-empty">{td.emptyHint ?? 'Press Ctrl+S to save'}</div>
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
                title={td.itemTitle ? td.itemTitle(stateSnapshot.name) : `${stateSnapshot.name} · click to apply`}
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
                  title={td.applyTitle ? td.applyTitle(stateSnapshot.name) : stateSnapshot.name}
                >
                  {stateSnapshot.thumbnail ? (
                    <img
                      src={stateSnapshot.thumbnail}
                      alt={stateSnapshot.name}
                      className="dock-item-thumbnail"
                    />
                  ) : (
                    <div className="dock-item-placeholder">{t?.gallery?.noThumbnail ?? 'No thumbnail'}</div>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="dock-bar">
        <div className="dock-primary-col">
          <button
            className="dock-primary"
            onClick={() => latestState && onRestore?.(latestState)}
            title={latestState ? (td.applyLatestTitle ? td.applyLatestTitle(latestState.name) : latestState.name) : (td.fallbackTitle ?? 'Stack')}
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
                <span className="dock-label">{td.label ?? 'Stack'}</span>
              )}
            </span>
            {dockStates.length > 0 && (
              <span className="dock-count-badge">{stackCountLabel}</span>
            )}
          </button>

          <button
            className="dock-clear-btn"
            onClick={onClear}
            title={td.clearTitle ?? 'Clear current stack'}
          >
            {td.clear ?? 'Clear'}
          </button>
        </div>
      </div>
    </div>
  );
}
