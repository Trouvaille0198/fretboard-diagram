import React from 'react';
import { CONSTS } from '../constants';
import { getLevel2Color, calculateConnectionColor, reduceColorSaturation, calculateArcPath, getPointOnNoteEdge, getPointOnPathAtDistance } from '../utils';
import { LEVEL1_COLORS, LEVEL2_COLORS, getLevel1FillColor } from '../colorConfig';

const LEVEL1_COLOR_ORDER = Object.keys(LEVEL1_COLORS);
const LEVEL2_COLOR_ORDER = Object.keys(LEVEL2_COLORS);

export function FretboardSVG({
  svgElementRef,
  svgWidth,
  svgHeight,
  svgViewBoxX,
  svgViewBoxY,
  svgViewBoxWidth,
  svgViewBoxHeight,
  handleSvgClick,
  handleSvgMouseMove,
  handleSvgMouseDown,
  handleSvgContextMenu,
  handleSvgWheel,
  fretPath,
  markers,
  generateStringPathMemo,
  notes,
  notesElementRef,
  data,
  visibility,
  selected,
  connectionMode,
  connectionStartNote,
  previewHoverNote,
  editingNote,
  handleNoteClick,
  setPreviewHoverNote,
  setUseColor2Level,
  setHoveredNoteId,
  setHoveredConnectionId,
  computeNoteNameMemo,
  connections,
  getNotePositionMemo,
  handleConnectionClickMemo,
  handleConnectionContextMenuMemo,
  connectionStartPosition,
  mousePosition,
  useColor2Level,
  editableDivVisible,
  editableDivX,
  editableDivY,
  editableDivRef,
  editableText,
  finishEditing,
  handleEditableKeyDown,
  handleEditableClick,
  setEditableText,
  connectionToolbarVisible,
  selectedConnection,
  connectionToolbarPosition,
  toolbarRef,
  toolbarDropdown,
  toolbarDropdownDirection,
  setToolbarDropdown,
  setToolbarDropdownDirection,
  detectDropdownDirection,
  dataRef,
  buttonClickRef,
  setData,
  setConnectionToolbarVisible,
  setSelectedConnection
}) {
  return (
    <svg
      ref={svgElementRef}
      id="fretboard-svg"
      xmlns="http://www.w3.org/2000/svg"
      width={svgWidth}
      height={svgHeight}
      viewBox={`${svgViewBoxX} ${svgViewBoxY} ${svgViewBoxWidth} ${svgViewBoxHeight}`}
      onClick={handleSvgClick}
      onMouseMove={handleSvgMouseMove}
      onMouseDown={handleSvgMouseDown}
      onContextMenu={handleSvgContextMenu}
      onWheel={handleSvgWheel}
    >
      <defs>
        {/* 毛玻璃效果filter */}
        <filter id="glassmorphism" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.8"/>
          <feColorMatrix 
            type="matrix" 
            values="0.5 0.5 0.5 0 0
                    0.5 0.5 0.5 0 0
                    0.5 0.5 0.5 0 0
                    0 0 0 0.9 0"/>
        </filter>
        {/* 渐变定义 */}
        {Object.values(connections).map(conn => {
          // 如果连线使用渐变（color以gradient-开头），创建渐变定义
          if (conn.color && conn.color.startsWith('gradient-')) {
            // 如果没有gradientColors，尝试从conn中获取
            const gradientColors = conn.gradientColors || { start: 'white', end: 'white' };
            const startColorName = gradientColors.start;
            const endColorName = gradientColors.end;
            
            // 判断颜色是第一层级还是第二层级
            const isStartLevel1 = startColorName in LEVEL1_COLORS;
            const isEndLevel1 = endColorName in LEVEL1_COLORS;
            const startColor = isStartLevel1 ? getLevel1FillColor(startColorName) : getLevel2Color(startColorName);
            const endColor = isEndLevel1 ? getLevel1FillColor(endColorName) : getLevel2Color(endColorName);
            
            // 获取起点和终点的位置，用于设置渐变方向
            const startNotePos = getNotePositionMemo(conn.startNoteId);
            const endNotePos = getNotePositionMemo(conn.endNoteId);
            
            if (!startNotePos || !endNotePos) {
              return null;
            }
            
            // 计算边缘点（与连线渲染时使用的相同）
            const startEdge = getPointOnNoteEdge(startNotePos.x, startNotePos.y, endNotePos.x, endNotePos.y, CONSTS.circleRadius);
            const endEdge = getPointOnNoteEdge(endNotePos.x, endNotePos.y, startNotePos.x, startNotePos.y, CONSTS.circleRadius);
            
            // 对于所有连线，都使用 userSpaceOnUse 和实际坐标（边缘点）
            const gradientUnits = "userSpaceOnUse";
            const gradientX1 = startEdge.x;
            const gradientY1 = startEdge.y;
            const gradientX2 = endEdge.x;
            const gradientY2 = endEdge.y;
            
            const finalStartColor = startColorName === 'white' || startColorName === 'trans' ? '#aaaaaa' : startColor;
            const finalEndColor = endColorName === 'white' || endColorName === 'trans' ? '#aaaaaa' : endColor;
            const safeStartColor = finalStartColor || '#aaaaaa';
            const safeEndColor = finalEndColor || '#aaaaaa';
            const finalStartColorStr = String(safeStartColor);
            const finalEndColorStr = String(safeEndColor);
            const gradientId = conn.color;
            
            return (
              <linearGradient 
                key={conn.id} 
                id={gradientId} 
                x1={gradientX1} 
                y1={gradientY1} 
                x2={gradientX2} 
                y2={gradientY2}
                gradientUnits={gradientUnits}
              >
                <stop offset="0%" stopColor={finalStartColorStr} />
                <stop offset="100%" stopColor={finalEndColorStr} />
              </linearGradient>
            );
          }
          return null;
        })}
      </defs>
      
      <path className="frets" d={fretPath} />
      
      <g className="markers">
        {markers.map(marker => (
          <text key={`${marker.position}-${marker.number}`} className="marker" x={marker.x} y={marker.y}>
            {marker.number}
          </text>
        ))}
      </g>
      
      <g className="strings" style={{ pointerEvents: 'none' }}>
        {Array.from({ length: CONSTS.numStrings }).map((_, i) => (
          <path
            key={i}
            className="string"
            d={generateStringPathMemo(i)}
            style={{ strokeWidth: `${CONSTS.minStringSize * (i + 1)}px` }}
          />
        ))}
      </g>
      
      <g className="notes" ref={notesElementRef}>
        {notes.map(note => {
          const noteData = data[note.id] || { type: 'note', color: 'white', visibility: visibility };
          const currentColor = noteData.color || 'white';
          const currentColor2 = noteData.color2 || null;
          const currentVisibility = selected?.id === note.id ? 'selected' : (noteData.visibility || visibility);
          const isPreviewHover = connectionMode && connectionStartNote && previewHoverNote === note.id;
          const className = `note ${currentColor} ${currentVisibility} ${isPreviewHover ? 'preview-hover' : ''}`;
          
          // 根据 color2 设置描边颜色
          let hasColor2 = currentColor2 && currentColor2 !== null;
          let strokeColor = note.isOpen ? 'none' : undefined;
          let strokeWidth = undefined;
          if (hasColor2) {
            strokeColor = getLevel2Color(currentColor2);
            strokeWidth = '3.5';
          }
          
          // 如果note只有color2（没有color1或color1是white），设置文本颜色为白色
          const color1IsWhite = !currentColor || currentColor === 'white';
          const textColor = (hasColor2 && color1IsWhite) ? 'white' : undefined;
          
          let originalNoteName = '';
          if (note.id.startsWith('o-s')) {
            const string = parseInt(note.id.substring(3));
            originalNoteName = computeNoteNameMemo(-1, string);
          } else if (note.id.startsWith('f') && note.id.includes('-s')) {
            const parts = note.id.substring(1).split('-s');
            const fret = parseInt(parts[0]);
            const string = parseInt(parts[1]);
            originalNoteName = computeNoteNameMemo(fret, string);
          }
          
          return (
            <g
              key={note.id}
              id={note.id}
              className={className}
              transform={`translate(${note.x}, ${note.y})`}
              data-x={note.x}
              data-y={note.y}
              data-open={note.isOpen}
              onClick={(e) => handleNoteClick(e, note.id)}
              onMouseDown={(e) => {
                // 如果是中键，在连线模式下处理颜色切换
                if (e.button === 1 && connectionMode && connectionStartNote) {
                  const noteData = data[note.id] || { type: 'note', color: 'white', visibility: visibility };
                  const hasColor2 = noteData.color2 && noteData.color2 !== null;
                  
                  // 只有当note有两层颜色时才能切换
                  if (hasColor2) {
                    e.preventDefault();
                    e.stopPropagation();
                    // 确保previewHoverNote设置正确
                    if (previewHoverNote !== note.id) {
                      setPreviewHoverNote(note.id);
                    }
                    // 全局切换颜色层级
                    setUseColor2Level(prev => !prev);
                    return false;
                  }
                }
              }}
              onMouseEnter={() => setHoveredNoteId(note.id)}
              onMouseLeave={() => setHoveredNoteId(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* 填充的circle */}
              <circle
                r={CONSTS.circleRadius}
                stroke={note.isOpen ? 'none' : undefined}
              />
              <text 
                data-note={originalNoteName}
                style={{ 
                  opacity: editingNote === note.id ? 0 : 1,
                  fill: textColor,
                  stroke: textColor
                }}
              >
                {note.noteName}
              </text>
            </g>
          );
        })}
      </g>
      
      {/* 连线渲染 - 放在最后，确保在最上层 */}
      <g className="connections">
        {Object.values(connections).map(conn => {
          const startCenter = getNotePositionMemo(conn.startNoteId);
          const endCenter = getNotePositionMemo(conn.endNoteId);
          
          // 如果起点或终点note不存在，不渲染连线
          if (!startCenter || !endCenter) {
            return null;
          }
          
          // 获取起点和终点的note数据，用于检查是否被删除
          const startNoteData = data[conn.startNoteId] || { type: 'note', color: 'white', visibility: visibility };
          const endNoteData = data[conn.endNoteId] || { type: 'note', color: 'white', visibility: visibility };
          
          // 如果note被删除了（color是white且visibility不是visible），不渲染连线
          const startIsDeleted = startNoteData.color === 'white' && startNoteData.visibility !== 'visible';
          const endIsDeleted = endNoteData.color === 'white' && endNoteData.visibility !== 'visible';
          if (startIsDeleted || endIsDeleted) {
            return null;
          }
          
          // 从gradientColors中获取实际使用的颜色（如果存在）
          let startColor = startNoteData.color || 'white';
          let endColor = endNoteData.color || 'white';
          
          if (conn.gradientColors) {
            startColor = conn.gradientColors.start || startColor;
            endColor = conn.gradientColors.end || endColor;
          }
          
          // 如果从gradientColors获取的颜色还是'white'，尝试从DOM元素中提取
          if (startColor === 'white') {
            const startNoteElement = document.getElementById(conn.startNoteId);
            if (startNoteElement) {
              const classList = startNoteElement.className?.baseVal?.split(' ') || startNoteElement.className?.split(' ') || [];
              const colorClass = classList.find(cls => LEVEL1_COLOR_ORDER.includes(cls) || cls in LEVEL2_COLORS);
              if (colorClass) {
                startColor = colorClass;
              }
            }
          }
          
          if (endColor === 'white') {
            const endNoteElement = document.getElementById(conn.endNoteId);
            if (endNoteElement) {
              const classList = endNoteElement.className?.baseVal?.split(' ') || endNoteElement.className?.split(' ') || [];
              const colorClass = classList.find(cls => LEVEL1_COLOR_ORDER.includes(cls) || cls in LEVEL2_COLORS);
              if (colorClass) {
                endColor = colorClass;
              }
            }
          }
          
          // 计算连线颜色：如果是渐变ID，使用url引用；否则使用起点颜色
          const isGradient = conn.color && conn.color.startsWith('gradient-');
          let strokeColor = isGradient ? `url(#${conn.color})` : (conn.color || (startColor === 'white' || startColor === 'trans' ? '#aaaaaa' : reduceColorSaturation(startColor, 0.6)));
          
          // 如果启用了灰色效果，使用半透明灰色
          const isGrayed = conn.isGrayed || false;
          if (isGrayed) {
            strokeColor = 'rgba(200, 200, 200, 0.7)';
          }
          
          // 箭头颜色：每个箭头使用自己接触的note的颜色（降低饱和度）
          const getArrowColor = (colorName) => {
            if (colorName === 'white') return '#aaaaaa';
            if (colorName === 'trans') return '#aaaaaa';
            return reduceColorSaturation(colorName, 0.6);
          };
          let startArrowColor = getArrowColor(startColor);
          let endArrowColor = getArrowColor(endColor);
          
          // 如果启用了灰色效果，箭头也使用灰色
          if (isGrayed) {
            startArrowColor = 'rgba(200, 200, 200, 0.7)';
            endArrowColor = 'rgba(200, 200, 200, 0.7)';
          }
          
          // 计算边缘上的点
          const hasArrowStart = conn.arrowDirection === 'start' || conn.arrowDirection === 'both';
          const hasArrowEnd = conn.arrowDirection === 'end' || conn.arrowDirection === 'both';
          const arrowLength = CONSTS.circleRadius * (2/3);
          
          // 先计算圆边线上的点
          const startEdge = getPointOnNoteEdge(startCenter.x, startCenter.y, endCenter.x, endCenter.y, CONSTS.circleRadius);
          const endEdge = getPointOnNoteEdge(endCenter.x, endCenter.y, startCenter.x, startCenter.y, CONSTS.circleRadius);
          
          const strokeWidth = conn.strokeWidth || 3;
          
          // 计算实际的路径端点
          let pathStartX = startEdge.x;
          let pathStartY = startEdge.y;
          let pathEndX = endEdge.x;
          let pathEndY = endEdge.y;
          
          // 对于无箭头的情况，端点需要稍微向外偏移，以补偿strokeLinecap的影响
          if (!hasArrowStart) {
            const dx = startEdge.x - startCenter.x;
            const dy = startEdge.y - startCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > 0) {
              const unitX = dx / distance;
              const unitY = dy / distance;
              pathStartX = startEdge.x + unitX * (strokeWidth / 2);
              pathStartY = startEdge.y + unitY * (strokeWidth / 2);
            }
          }
          
          if (!hasArrowEnd) {
            const dx = endEdge.x - endCenter.x;
            const dy = endEdge.y - endCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > 0) {
              const unitX = dx / distance;
              const unitY = dy / distance;
              pathEndX = endEdge.x + unitX * (strokeWidth / 2);
              pathEndY = endEdge.y + unitY * (strokeWidth / 2);
            }
          }
          
          const markerStart = (conn.arrowDirection === 'start' || conn.arrowDirection === 'both') ? `url(#arrowhead-start-${conn.id})` : undefined;
          const markerEnd = (conn.arrowDirection === 'end' || conn.arrowDirection === 'both') ? `url(#arrowhead-end-${conn.id})` : undefined;
          
          if (conn.type === 'arc') {
            // 对于弧线，需要沿着路径计算缩进点
            if (hasArrowStart || hasArrowEnd) {
              const fullPathString = calculateArcPath(startEdge.x, startEdge.y, endEdge.x, endEdge.y, conn.arcCurvature);
              
              if (hasArrowStart) {
                const startOffsetPoint = getPointOnPathAtDistance(fullPathString, arrowLength);
                pathStartX = startOffsetPoint.x;
                pathStartY = startOffsetPoint.y;
              }
              
              if (hasArrowEnd) {
                const svgNS = 'http://www.w3.org/2000/svg';
                const tempPath = document.createElementNS(svgNS, 'path');
                tempPath.setAttribute('d', fullPathString);
                const totalLength = tempPath.getTotalLength();
                const endOffsetPoint = getPointOnPathAtDistance(fullPathString, totalLength - arrowLength);
                pathEndX = endOffsetPoint.x;
                pathEndY = endOffsetPoint.y;
              }
            }
            
            const path = calculateArcPath(pathStartX, pathStartY, pathEndX, pathEndY, conn.arcCurvature);
            return (
              <g key={conn.id}>
                {(conn.arrowDirection === 'start' || conn.arrowDirection === 'both') && (
                  <marker
                    id={`arrowhead-start-${conn.id}`}
                    markerWidth={arrowLength * 1.25}
                    markerHeight={arrowLength * 1.25}
                    refX={String(arrowLength)}
                    refY={String(arrowLength * 0.375)}
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d={`M0,${arrowLength * 0.375} L${arrowLength},0 L${arrowLength},${arrowLength * 0.75} z`} fill={startArrowColor} />
                  </marker>
                )}
                {(conn.arrowDirection === 'end' || conn.arrowDirection === 'both') && (
                  <marker
                    id={`arrowhead-end-${conn.id}`}
                    markerWidth={arrowLength * 1.25}
                    markerHeight={arrowLength * 1.25}
                    refX="0"
                    refY={String(arrowLength * 0.375)}
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d={`M${arrowLength},${arrowLength * 0.375} L0,0 L0,${arrowLength * 0.75} z`} fill={endArrowColor} />
                  </marker>
                )}
                <path
                  d={path}
                  className="connection"
                  stroke={strokeColor}
                  strokeWidth={conn.strokeWidth || 3}
                  fill="none"
                  markerStart={markerStart}
                  markerEnd={markerEnd}
                  onClick={(e) => handleConnectionClickMemo(e, conn.id)}
                  onContextMenu={(e) => handleConnectionContextMenuMemo(e, conn.id)}
                  onMouseEnter={() => setHoveredConnectionId(conn.id)}
                  onMouseLeave={() => setHoveredConnectionId(null)}
                  style={{ 
                    cursor: 'pointer',
                    strokeWidth: `${conn.strokeWidth || 3}px`
                  }}
                />
              </g>
            );
          } else {
            // 对于直线
            if (hasArrowStart || hasArrowEnd) {
              const linePathString = `M ${startEdge.x} ${startEdge.y} L ${endEdge.x} ${endEdge.y}`;
              
              if (hasArrowStart) {
                const startOffsetPoint = getPointOnPathAtDistance(linePathString, arrowLength);
                pathStartX = startOffsetPoint.x;
                pathStartY = startOffsetPoint.y;
              }
              
              if (hasArrowEnd) {
                const svgNS = 'http://www.w3.org/2000/svg';
                const tempPath = document.createElementNS(svgNS, 'path');
                tempPath.setAttribute('d', linePathString);
                const totalLength = tempPath.getTotalLength();
                const endOffsetPoint = getPointOnPathAtDistance(linePathString, totalLength - arrowLength);
                pathEndX = endOffsetPoint.x;
                pathEndY = endOffsetPoint.y;
              }
            }
            
            return (
              <g key={conn.id}>
                {(conn.arrowDirection === 'start' || conn.arrowDirection === 'both') && (
                  <marker
                    id={`arrowhead-start-${conn.id}`}
                    markerWidth={arrowLength * 1.25}
                    markerHeight={arrowLength * 1.25}
                    refX={String(arrowLength)}
                    refY={String(arrowLength * 0.375)}
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d={`M0,${arrowLength * 0.375} L${arrowLength},0 L${arrowLength},${arrowLength * 0.75} z`} fill={startArrowColor} />
                  </marker>
                )}
                {(conn.arrowDirection === 'end' || conn.arrowDirection === 'both') && (
                  <marker
                    id={`arrowhead-end-${conn.id}`}
                    markerWidth={arrowLength * 1.25}
                    markerHeight={arrowLength * 1.25}
                    refX="0"
                    refY={String(arrowLength * 0.375)}
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d={`M${arrowLength},${arrowLength * 0.375} L0,0 L0,${arrowLength * 0.75} z`} fill={endArrowColor} />
                  </marker>
                )}
                <line
                  x1={pathStartX}
                  y1={pathStartY}
                  x2={pathEndX}
                  y2={pathEndY}
                  className="connection"
                  stroke={strokeColor}
                  strokeWidth={conn.strokeWidth || 3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerStart={markerStart}
                  markerEnd={markerEnd}
                  onClick={(e) => handleConnectionClickMemo(e, conn.id)}
                  onContextMenu={(e) => handleConnectionContextMenuMemo(e, conn.id)}
                  onMouseEnter={() => setHoveredConnectionId(conn.id)}
                  onMouseLeave={() => setHoveredConnectionId(null)}
                  style={{ 
                    cursor: 'pointer',
                    strokeWidth: `${conn.strokeWidth || 3}px`,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round'
                  }}
                />
              </g>
            );
          }
        })}
      </g>
      
      {/* 第二层颜色描边 - 放在连线之后，确保覆盖连线 */}
      <g className="color2-strokes">
        {notes.map(note => {
          const noteData = data[note.id] || { type: 'note', color: 'white', visibility: visibility };
          const currentColor2 = noteData.color2 || null;
          const hasColor2 = currentColor2 && currentColor2 !== null;
          
          if (!hasColor2) return null;
          
          const strokeColor = getLevel2Color(currentColor2);
          
          return (
            <circle
              key={`color2-${note.id}`}
              cx={note.x}
              cy={note.y}
              r={CONSTS.circleRadius}
              stroke={strokeColor}
              strokeWidth="3.5"
              fill="none"
              pointerEvents="none"
            />
          );
        })}
      </g>
      
      {/* 预览线 */}
      {connectionMode && connectionStartNote && connectionStartPosition && mousePosition && (
        <g className="connection-preview">
          {(() => {
            let startNoteData = data[connectionStartNote] || { type: 'note', color: 'white', visibility: visibility };
            let endNoteData = null;
            
            // 处理起点note的颜色（考虑全局颜色层级）
            const startColor1IsWhite = !startNoteData.color || startNoteData.color === 'white';
            if (startNoteData.color2 && startNoteData.color2 !== null) {
              if (startColor1IsWhite) {
                startNoteData = { ...startNoteData, color: startNoteData.color2 };
              } else if (useColor2Level) {
                startNoteData = { ...startNoteData, color: startNoteData.color2 };
              }
            }
            
            // 如果有预览悬停的note，获取其数据（考虑color2切换）
            if (previewHoverNote && previewHoverNote !== connectionStartNote) {
              endNoteData = data[previewHoverNote] || { type: 'note', color: 'white', visibility: visibility };
              
              const color1IsWhite = !endNoteData.color || endNoteData.color === 'white';
              if (endNoteData.color2 && endNoteData.color2 !== null) {
                if (color1IsWhite) {
                  endNoteData = { ...endNoteData, color: endNoteData.color2 };
                } else if (useColor2Level) {
                  endNoteData = { ...endNoteData, color: endNoteData.color2 };
                }
              }
            }
            
            // 计算预览线颜色
            let previewColor;
            if (endNoteData) {
              const tempConnectionId = 'preview-temp';
              previewColor = calculateConnectionColor(startNoteData, endNoteData, tempConnectionId);
              
              if (previewColor.startsWith('gradient-')) {
                previewColor = startNoteData.color === 'white' || startNoteData.color === 'trans'
                  ? '#aaaaaa' 
                  : reduceColorSaturation(startNoteData.color, 0.6);
              }
            } else {
              previewColor = startNoteData.color === 'white' || startNoteData.color === 'trans'
                ? '#aaaaaa' 
                : reduceColorSaturation(startNoteData.color, 0.6);
            }
            
            let endX, endY;
            let startEdgeX = connectionStartPosition.x;
            let startEdgeY = connectionStartPosition.y;
            
            if (previewHoverNote) {
              const hoveredNote = notes.find(n => n.id === previewHoverNote);
              if (hoveredNote) {
                const startEdge = getPointOnNoteEdge(
                  connectionStartPosition.x, 
                  connectionStartPosition.y, 
                  hoveredNote.x, 
                  hoveredNote.y, 
                  CONSTS.circleRadius
                );
                startEdgeX = startEdge.x;
                startEdgeY = startEdge.y;
                
                const endEdge = getPointOnNoteEdge(
                  hoveredNote.x, 
                  hoveredNote.y, 
                  connectionStartPosition.x, 
                  connectionStartPosition.y, 
                  CONSTS.circleRadius
                );
                endX = endEdge.x;
                endY = endEdge.y;
              } else {
                const startEdge = getPointOnNoteEdge(
                  connectionStartPosition.x, 
                  connectionStartPosition.y, 
                  mousePosition.x, 
                  mousePosition.y, 
                  CONSTS.circleRadius
                );
                startEdgeX = startEdge.x;
                startEdgeY = startEdge.y;
                endX = mousePosition.x;
                endY = mousePosition.y;
              }
            } else {
              const startEdge = getPointOnNoteEdge(
                connectionStartPosition.x, 
                connectionStartPosition.y, 
                mousePosition.x, 
                mousePosition.y, 
                CONSTS.circleRadius
              );
              startEdgeX = startEdge.x;
              startEdgeY = startEdge.y;
              endX = mousePosition.x;
              endY = mousePosition.y;
            }
            
            return (
              <line
                x1={startEdgeX}
                y1={startEdgeY}
                x2={endX}
                y2={endY}
                className="connection-preview"
                stroke={previewColor}
                strokeWidth={3}
                strokeDasharray="5,5"
                opacity={0.6}
                pointerEvents="none"
              />
            );
          })()}
        </g>
      )}
      
      {editableDivVisible && (
        <foreignObject
          x={editableDivX}
          y={editableDivY}
          width={2 * CONSTS.circleRadius}
          height={2 * CONSTS.circleRadius}
          className="visible"
        >
          <div
            ref={editableDivRef}
            contentEditable="true"
            suppressContentEditableWarning={true}
            onBlur={finishEditing}
            onKeyDown={handleEditableKeyDown}
            onClick={handleEditableClick}
            onInput={(e) => setEditableText(e.target.textContent)}
            id="editable-div"
            style={{
              textAlign: 'center',
              fontSize: '18px',
              width: '100%',
              height: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent'
            }}
          >
            {editableText}
          </div>
        </foreignObject>
      )}
      
      {/* 连线工具栏 */}
      {connectionToolbarVisible && selectedConnection && connections[selectedConnection] && (
        <foreignObject
          x={connectionToolbarPosition.x - 300}
          y={connectionToolbarPosition.y - 300}
          width="1200"
          height="800"
          className="connection-toolbar-container"
          style={{ overflow: 'visible', pointerEvents: 'all' }}
        >
          <div
            ref={toolbarRef}
            className="connection-toolbar"
            onClick={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              if (e.target.closest('.toolbar-icon-btn')) {
                e.stopPropagation();
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            style={{ position: 'relative', left: '300px', top: '300px' }}
          >
            <div className="toolbar-icons">
              {/* 类型按钮 */}
              <div className="toolbar-icon-wrapper">
                <button
                  className={`toolbar-icon-btn ${connections[selectedConnection]?.type === 'arc' ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    const connId = selectedConnection;
                    if (!connId) return;
                    if (buttonClickRef.current.type) {
                      return;
                    }
                    buttonClickRef.current.type = true;
                    setTimeout(() => {
                      buttonClickRef.current.type = false;
                    }, 100);
                    const currentData = dataRef.current;
                    const currentConn = currentData?.connections?.[connId];
                    if (!currentConn) {
                      return;
                    }
                    const currentType = currentConn.type || 'line';
                    setData(prevData => {
                      const newData = { ...prevData };
                      if (!newData.connections) {
                        newData.connections = {};
                      }
                      if (newData.connections[connId]) {
                        if (currentType === 'line') {
                          const newArcCurvature = (currentConn.arcCurvature === 0 || currentConn.arcCurvature < 0) 
                            ? 0.7 
                            : (currentConn.arcCurvature || 0.7);
                          newData.connections[connId] = {
                            ...newData.connections[connId],
                            type: 'arc',
                            arcCurvature: newArcCurvature
                          };
                        } else {
                          newData.connections[connId] = {
                            ...newData.connections[connId],
                            type: 'line'
                          };
                        }
                      }
                      return newData;
                    });
                  }}
                  title="类型"
                >
                  {connections[selectedConnection]?.type === 'line' ? '线' : '弧'}
                </button>
              </div>

              {/* 箭头按钮 */}
              <div className="toolbar-icon-wrapper">
                <button
                  className="toolbar-icon-btn"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    const connId = selectedConnection;
                    if (!connId) return;
                    if (buttonClickRef.current.arrow) {
                      return;
                    }
                    buttonClickRef.current.arrow = true;
                    setTimeout(() => {
                      buttonClickRef.current.arrow = false;
                    }, 100);
                    const currentData = dataRef.current;
                    const currentConn = currentData?.connections?.[connId];
                    if (!currentConn) {
                      return;
                    }
                    const currentDirection = currentConn.arrowDirection || 'none';
                    let nextDirection;
                    switch (currentDirection) {
                      case 'none':
                        nextDirection = 'start';
                        break;
                      case 'start':
                        nextDirection = 'end';
                        break;
                      case 'end':
                        nextDirection = 'both';
                        break;
                      case 'both':
                        nextDirection = 'none';
                        break;
                      default:
                        nextDirection = 'none';
                    }
                    setData(prevData => {
                      const newData = { ...prevData };
                      if (!newData.connections) {
                        newData.connections = {};
                      }
                      if (newData.connections[connId]) {
                        newData.connections[connId] = {
                          ...newData.connections[connId],
                          arrowDirection: nextDirection
                        };
                      }
                      return newData;
                    });
                  }}
                  title="箭头"
                >
                  {(() => {
                    const arrowDir = connections[selectedConnection]?.arrowDirection || 'none';
                    if (arrowDir === 'none') return '无';
                    if (arrowDir === 'start') return '←';
                    if (arrowDir === 'end') return '→';
                    if (arrowDir === 'both') return '⇄';
                    return '无';
                  })()}
                </button>
              </div>

              {/* 粗细按钮 */}
              <div className="toolbar-icon-wrapper">
                <button
                  className="toolbar-icon-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const direction = detectDropdownDirection(e.currentTarget, toolbarRef, svgElementRef);
                    setToolbarDropdownDirection(direction);
                    setToolbarDropdown(toolbarDropdown === 'width' ? null : 'width');
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  title="粗细"
                >
                  粗
                </button>
                {toolbarDropdown === 'width' && (
                  <div 
                    className={`toolbar-dropdown toolbar-dropdown-${toolbarDropdownDirection}`}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <div className="toolbar-slider-wrapper">
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        value={connections[selectedConnection].strokeWidth || 3}
                        onChange={(e) => {
                          setData(prevData => {
                            const newData = { ...prevData };
                            if (newData.connections && newData.connections[selectedConnection]) {
                              newData.connections[selectedConnection] = {
                                ...newData.connections[selectedConnection],
                                strokeWidth: parseInt(e.target.value)
                              };
                            }
                            return newData;
                          });
                        }}
                      />
                      <span>{connections[selectedConnection].strokeWidth || 3}px</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 弧度按钮（仅弧线时显示） */}
              {connections[selectedConnection].type === 'arc' && (
                <div className="toolbar-icon-wrapper">
                  <button
                    className="toolbar-icon-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const direction = detectDropdownDirection(e.currentTarget, toolbarRef, svgElementRef);
                      setToolbarDropdownDirection(direction);
                      setToolbarDropdown(toolbarDropdown === 'curvature' ? null : 'curvature');
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    title="弧度"
                  >
                    弯
                  </button>
                  {toolbarDropdown === 'curvature' && (
                    <div 
                      className={`toolbar-dropdown toolbar-dropdown-${toolbarDropdownDirection}`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <div className="toolbar-slider-wrapper">
                        <input
                          type="range"
                          min="-2"
                          max="2"
                          step="0.1"
                          value={connections[selectedConnection].arcCurvature}
                          onChange={(e) => {
                            setData(prevData => {
                              const newData = { ...prevData };
                              if (newData.connections && newData.connections[selectedConnection]) {
                                newData.connections[selectedConnection] = {
                                  ...newData.connections[selectedConnection],
                                  arcCurvature: parseFloat(e.target.value)
                                };
                              }
                              return newData;
                            });
                          }}
                        />
                        <span>{connections[selectedConnection].arcCurvature >= 0 ? '+' : ''}{connections[selectedConnection].arcCurvature.toFixed(1)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 反转弧度按钮（仅弧线时显示） */}
              {connections[selectedConnection].type === 'arc' && (
                <div className="toolbar-icon-wrapper">
                  <button
                    className="toolbar-icon-btn"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                      const connId = selectedConnection;
                      if (!connId) return;
                      if (buttonClickRef.current.reverseCurvature) {
                        return;
                      }
                      buttonClickRef.current.reverseCurvature = true;
                      setTimeout(() => {
                        buttonClickRef.current.reverseCurvature = false;
                      }, 100);
                      const currentData = dataRef.current;
                      const currentConn = currentData?.connections?.[connId];
                      if (!currentConn) {
                        return;
                      }
                      const currentCurvature = currentConn.arcCurvature || 0;
                      setData(prevData => {
                        const newData = { ...prevData };
                        if (!newData.connections) {
                          newData.connections = {};
                        }
                        if (newData.connections[connId]) {
                          newData.connections[connId] = {
                            ...newData.connections[connId],
                            arcCurvature: -currentCurvature
                          };
                        }
                        return newData;
                      });
                    }}
                    title="反转弧度"
                  >
                    ↻
                  </button>
                </div>
              )}

              {/* 灰色毛玻璃效果按钮 */}
              <div className="toolbar-icon-wrapper">
                <button
                  className={`toolbar-icon-btn ${connections[selectedConnection].isGrayed ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    const connId = selectedConnection;
                    if (!connId) return;
                    if (buttonClickRef.current.grayed) {
                      return;
                    }
                    buttonClickRef.current.grayed = true;
                    setTimeout(() => {
                      buttonClickRef.current.grayed = false;
                    }, 100);
                    const currentData = dataRef.current;
                    const currentConn = currentData?.connections?.[connId];
                    if (!currentConn) {
                      return;
                    }
                    const currentIsGrayed = currentConn.isGrayed || false;
                    setData(prevData => {
                      const newData = { ...prevData };
                      if (!newData.connections) {
                        newData.connections = {};
                      }
                      if (newData.connections[connId]) {
                        newData.connections[connId] = {
                          ...newData.connections[connId],
                          isGrayed: !currentIsGrayed
                        };
                      }
                      return newData;
                    });
                  }}
                  title="灰色毛玻璃效果"
                >
                  灰
                </button>
              </div>

              {/* 删除按钮 */}
              <button
                className="toolbar-icon-btn delete-icon-btn"
                onClick={() => {
                  setData(prevData => {
                    const newData = { ...prevData };
                    if (newData.connections) {
                      delete newData.connections[selectedConnection];
                    }
                    return newData;
                  });
                  setConnectionToolbarVisible(false);
                  setSelectedConnection(null);
                }}
                title="删除连线"
              >
                ×
              </button>
            </div>
          </div>
        </foreignObject>
      )}
    </svg>
  );
}
