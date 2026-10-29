import React from 'react';
import { CONSTS } from '../constants';
import { getLevel2Color, calculateConnectionColor, reduceColorSaturation, getPointOnNoteEdge, getColorName, getNoteSplitMode, resolveNoteColorValue } from '../utils';
import { buildConnectionPath, adaptiveArcCurvature } from '../utils/connectionUtils';
import { LEVEL1_COLORS, LEVEL2_COLORS, getLevel1FillColor } from '../colorConfig';
import { CONNECTION_PRESETS, matchConnectionPreset } from '../hooks/useConnectionState';
import { ConnectionPresetIcon } from './ConnectionPresetIcon';
import { useLanguage } from '../i18n';

const LEVEL1_COLOR_ORDER = Object.keys(LEVEL1_COLORS);
const LEVEL2_COLOR_ORDER = Object.keys(LEVEL2_COLORS);

// 箭头 marker：起点箭头朝外（指向起点音符），终点箭头朝前，与路径缩进配合
function ArrowMarkers({ idPrefix, arrowLength, startColor, endColor, showStart, showEnd }) {
  const markerSize = arrowLength * 1.25;
  const baseY = arrowLength * 0.375;

  return (
    <React.Fragment>
      {showStart && (
        <marker
          id={`arrowhead-start-${idPrefix}`}
          markerWidth={markerSize}
          markerHeight={markerSize}
          refX={String(arrowLength)}
          refY={String(baseY)}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d={`M0,${baseY} L${arrowLength},0 L${arrowLength},${arrowLength * 0.75} z`} fill={startColor} />
        </marker>
      )}
      {showEnd && (
        <marker
          id={`arrowhead-end-${idPrefix}`}
          markerWidth={markerSize}
          markerHeight={markerSize}
          refX="0"
          refY={String(baseY)}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d={`M${arrowLength},${baseY} L0,0 L0,${arrowLength * 0.75} z`} fill={endColor} />
        </marker>
      )}
    </React.Fragment>
  );
}

export const FretboardSVG = React.memo(function FretboardSVG({
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
  connectionPreset,
  previewHoverNote,
  editingNote,
  handleNoteClick,
  handleNoteMouseDown,
  onNoteMiddleDown,
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
  setSelectedConnection,
  hideInactiveNotes
}) {
  const { t } = useLanguage();
  const ts = t?.svg ?? {};
  const tc = t?.connection ?? {};

  const selectedConnectionData = selectedConnection ? connections[selectedConnection] : null;
  const activePreset = matchConnectionPreset(selectedConnectionData);

  // 工具栏里切换预设：只改这条连线，点一下到位（原来的"类型/箭头"要循环点好几下）
  const applyPresetToSelectedConnection = (preset) => {
    const connId = selectedConnection;
    if (!connId) return;
    if (buttonClickRef.current.preset) {
      return;
    }
    buttonClickRef.current.preset = true;
    setTimeout(() => {
      buttonClickRef.current.preset = false;
    }, 100);

    if (!dataRef.current?.connections?.[connId]) {
      return;
    }

    setData(prevData => {
      const conn = prevData.connections?.[connId];
      if (!conn) return prevData;

      const nextConnection = {
        ...conn,
        type: preset.type,
        arrowDirection: preset.arrowDirection,
        hasArrow: preset.arrowDirection !== 'none'
      };

      // 保留用户调过的弧度（含反向弧线），直线预设不动它，切回来还在
      if (preset.type === 'arc' && !(conn.type === 'arc' && conn.arcCurvature)) {
        nextConnection.arcCurvature = adaptiveArcCurvature(
          getNotePositionMemo(conn.startNoteId),
          getNotePositionMemo(conn.endNoteId),
          preset.arcCurvature
        );
      }

      // "无方向"预设同时去掉虚线，保证点一下就是实线
      if (preset.arrowDirection === 'none') {
        nextConnection.strokeDasharray = undefined;
      }

      return {
        ...prevData,
        connections: {
          ...prevData.connections,
          [connId]: nextConnection
        }
      };
    });

    setToolbarDropdown(null);
  };
  return (
    <svg
      ref={svgElementRef}
      id="fretboard-svg"
      className={connectionMode && connectionStartNote ? 'drag-connecting' : undefined}
      xmlns="http://www.w3.org/2000/svg"
      width={svgWidth}
      height={svgHeight}
      viewBox={`${svgViewBoxX} ${svgViewBoxY} ${svgViewBoxWidth} ${svgViewBoxHeight}`}
      onClick={handleSvgClick}
      onPointerMove={handleSvgMouseMove}
      onPointerDown={handleSvgMouseDown}
      onContextMenu={handleSvgContextMenu}
      onWheel={handleSvgWheel}
      onMouseDown={e => { if (e.button === 1) e.preventDefault(); }}
    >
      <defs>
        {/* 毛玻璃效果filter */}
        <filter id="glassmorphism" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" />
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
            let startColorName = gradientColors.start;
            let endColorName = gradientColors.end;

            // 处理自定义颜色对象（淡色版本）
            let startColorValue = null;
            let endColorValue = null;

            if (typeof startColorName === 'object' && startColorName.custom) {
              // 自定义颜色，直接使用 custom 颜色值
              startColorValue = startColorName.custom;
              startColorName = startColorName.name; // 用于判断 white/trans
            }

            if (typeof endColorName === 'object' && endColorName.custom) {
              // 自定义颜色，直接使用 custom 颜色值
              endColorValue = endColorName.custom;
              endColorName = endColorName.name; // 用于判断 white/trans
            }

            // 判断颜色是第一层级还是第二层级
            const isStartLevel1 = startColorName in LEVEL1_COLORS;
            const isEndLevel1 = endColorName in LEVEL1_COLORS;
            const startColor = startColorValue || (isStartLevel1 ? getLevel1FillColor(startColorName) : getLevel2Color(startColorName));
            const endColor = endColorValue || (isEndLevel1 ? getLevel1FillColor(endColorName) : getLevel2Color(endColorName));

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
          // 只有导出上下文（ScoreBoard 的 hideInactiveNotes）才隐藏未激活音——
          // 交互板必须保留全部音符点击目标（隐藏会让点音/手势不可用，编辑直接报废）
          if (hideInactiveNotes === true) {
            const nv = noteData.visibility || visibility;
            if (nv !== 'visible' && nv !== 'selected') return null;
          }
          const currentColor = noteData.color || 'white';
          const currentColor2 = noteData.color2 || null;
          const splitMode = getNoteSplitMode(noteData);

          const effectiveVisibility = selected?.id === note.id ? 'selected' : (noteData.visibility || visibility);
          const currentVisibility = effectiveVisibility;

          const isPreviewHover = connectionMode && connectionStartNote && previewHoverNote === note.id;

          // 当toggle处于hidden状态时，trans note显示为0.3透明度而不是完全隐藏
          const colorName = typeof currentColor === 'object' ? getColorName(currentColor) : currentColor;
          const isTransColor = colorName === 'trans';
          const shouldApplyTransparentStyle = visibility === 'hidden' && isTransColor;

          const colorClassName = getColorName(currentColor) || 'white';
          const className = `note ${colorClassName} ${currentVisibility} ${isPreviewHover ? 'preview-hover' : ''} ${shouldApplyTransparentStyle ? 'force-transparent' : ''}`;
          const color1IsWhite = !currentColor || getColorName(currentColor) === 'white';
          const hasColor2 = currentColor2 && currentColor2 !== null;
          const primaryFill = resolveNoteColorValue(currentColor, 1);
          const secondaryFill = resolveNoteColorValue(currentColor2, 2);
          const shouldSplitFill = !color1IsWhite && hasColor2 && secondaryFill;
          const fullFill = primaryFill || secondaryFill || undefined;
          const textColor = (hasColor2 && (color1IsWhite || shouldSplitFill)) ? 'white' : undefined;
          const secondaryHalfPath = (() => {
            switch (splitMode) {
              case 'rl':
                return `M 0 ${-CONSTS.circleRadius} A ${CONSTS.circleRadius} ${CONSTS.circleRadius} 0 0 0 0 ${CONSTS.circleRadius} Z`;
              case 'tb':
                return `M ${-CONSTS.circleRadius} 0 A ${CONSTS.circleRadius} ${CONSTS.circleRadius} 0 0 1 ${CONSTS.circleRadius} 0 Z`;
              case 'bt':
                return `M ${-CONSTS.circleRadius} 0 A ${CONSTS.circleRadius} ${CONSTS.circleRadius} 0 0 0 ${CONSTS.circleRadius} 0 Z`;
              case 'lr':
              default:
                return `M 0 ${-CONSTS.circleRadius} A ${CONSTS.circleRadius} ${CONSTS.circleRadius} 0 0 1 0 ${CONSTS.circleRadius} Z`;
            }
          })();

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
              data-color-name={currentColor && typeof currentColor === 'object' ? currentColor.name : currentColor}
              data-color-custom={currentColor && typeof currentColor === 'object' ? currentColor.custom : undefined}
              data-color2-name={currentColor2 && typeof currentColor2 === 'object' ? currentColor2.name : currentColor2}
              data-color2-custom={currentColor2 && typeof currentColor2 === 'object' ? currentColor2.custom : undefined}
              data-split-mode={hasColor2 ? splitMode : undefined}
              onClick={(e) => handleNoteClick(e, note.id)}
              onPointerDown={(e) => {
                if (e.button === 0) {
                  // 连线模式下按下可见音符 = 开始拖拽连线
                  handleNoteMouseDown(e, note.id);
                  return;
                }
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onNoteMiddleDown && onNoteMiddleDown(note.id)) {
                    return;
                  }
                  if (!shouldSplitFill) {
                    return;
                  }
                  setData(prevData => {
                    const prevNoteData = prevData[note.id] || {};
                    const splitModes = ['lr', 'rl', 'tb', 'bt'];
                    const currentMode = getNoteSplitMode(prevNoteData);
                    const currentIndex = splitModes.indexOf(currentMode);
                    const nextMode = splitModes[(currentIndex + 1) % splitModes.length];
                    return {
                      ...prevData,
                      [note.id]: {
                        ...prevNoteData,
                        type: prevNoteData.type || 'note',
                        splitMode: nextMode
                      }
                    };
                  });
                  return;
                }
              }}
              onMouseEnter={() => setHoveredNoteId(note.id)}
              onMouseLeave={() => setHoveredNoteId(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                className="note-circle"
                r={CONSTS.circleRadius}
                stroke={note.isOpen ? 'none' : undefined}
                fill={fullFill}
              />
              {shouldSplitFill && (
                <path
                  className="note-secondary-fill"
                  d={secondaryHalfPath}
                  fill={secondaryFill}
                  pointerEvents="none"
                />
              )}
              <text
                className="note-label"
                data-note={originalNoteName}
                style={{
                  opacity: editingNote === note.id ? 0 : 1,
                  fill: textColor,
                  filter: 'drop-shadow(0 0 1.6px rgb(0, 0, 1))'
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

          // 如果note被删除了（color是white且visibility不是visible），不渲染连线；
          // 例外：半音划音（ghost）的起点本来就是空音符，只检查终点
          const startIsDeleted = !conn.ghost && startNoteData.color === 'white' && startNoteData.visibility !== 'visible';
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

          // 检查起点和终点是否都是 trans note（用于设置连线透明度）
          const startColorName = typeof startColor === 'object' ? getColorName(startColor) : startColor;
          const endColorName = typeof endColor === 'object' ? getColorName(endColor) : endColor;
          const isTransConnection = (startColorName === 'trans' || endColorName === 'trans');
          const connectionOpacity = (visibility === 'hidden' && isTransConnection) ? 0.3 : undefined;

          // 计算连线颜色：如果是渐变ID，使用url引用；否则使用起点颜色
          const isGradient = conn.color && conn.color.startsWith('gradient-');
          let strokeColor = isGradient ? `url(#${conn.color})` : (conn.color || (startColorName === 'white' || startColorName === 'trans' ? '#aaaaaa' : reduceColorSaturation(startColor, 0.6)));

          // 如果启用了灰色效果，使用半透明灰色
          const isGrayed = conn.isGrayed || false;
          if (isGrayed) {
            strokeColor = 'rgba(200, 200, 200, 0.7)';
          }

          // 箭头颜色：每个箭头使用自己接触的note的颜色（降低饱和度）
          const getArrowColor = (color) => {
            const colorName = getColorName(color);
            if (colorName === 'white') return '#aaaaaa';
            if (colorName === 'trans') return '#aaaaaa';
            return reduceColorSaturation(color, 0.6);
          };
          let startArrowColor = getArrowColor(startColor);
          let endArrowColor = getArrowColor(endColor);

          // 如果启用了灰色效果，箭头也使用灰色
          if (isGrayed) {
            startArrowColor = 'rgba(200, 200, 200, 0.7)';
            endArrowColor = 'rgba(200, 200, 200, 0.7)';
          }

          // 计算边缘上的点，再由 buildConnectionPath 统一生成路径（直线/弧线、有无箭头）
          const hasArrowStart = conn.arrowDirection === 'start' || conn.arrowDirection === 'both';
          const hasArrowEnd = conn.arrowDirection === 'end' || conn.arrowDirection === 'both';
          const arrowLength = CONSTS.circleRadius * (2 / 3);

          const startEdge = getPointOnNoteEdge(startCenter.x, startCenter.y, endCenter.x, endCenter.y, CONSTS.circleRadius);
          const endEdge = getPointOnNoteEdge(endCenter.x, endCenter.y, startCenter.x, startCenter.y, CONSTS.circleRadius);

          const strokeWidth = conn.strokeWidth || 3;
          const path = buildConnectionPath(startEdge, endEdge, {
            type: conn.type,
            curvature: conn.arcCurvature,
            arrowDirection: conn.arrowDirection,
            arrowLength,
            strokeWidth,
            startCenter,
            endCenter
          });

          return (
            <g key={conn.id}>
              <ArrowMarkers
                idPrefix={conn.id}
                arrowLength={arrowLength}
                startColor={startArrowColor}
                endColor={endArrowColor}
                showStart={hasArrowStart}
                showEnd={hasArrowEnd}
              />
              <path
                d={path}
                className="connection"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={conn.strokeDasharray}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                markerStart={hasArrowStart ? `url(#arrowhead-start-${conn.id})` : undefined}
                markerEnd={hasArrowEnd ? `url(#arrowhead-end-${conn.id})` : undefined}
                onClick={(e) => handleConnectionClickMemo(e, conn.id)}
                onContextMenu={(e) => handleConnectionContextMenuMemo(e, conn.id)}
                onMouseEnter={() => setHoveredConnectionId(conn.id)}
                onMouseLeave={() => setHoveredConnectionId(null)}
                style={{
                  cursor: 'pointer',
                  strokeWidth: `${strokeWidth}px`,
                  strokeDasharray: conn.strokeDasharray || undefined,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                  opacity: connectionOpacity
                }}
              />
            </g>
          );
        })}
      </g>

      {/* 白色分隔描边 - 当note同时有第一层和第二层颜色时，在第一层和第二层之间添加白色描边 */}
      <g className="white-separator-strokes">
        {notes.map(note => {
          const noteData = data[note.id] || { type: 'note', color: 'white', visibility: visibility };
          const currentColor = noteData.color || 'white';
          const currentColor2 = noteData.color2 || null;
          const hasColor1 = currentColor && currentColor !== 'white';
          const hasColor2 = currentColor2 && currentColor2 !== null;

          // 只有当同时有第一层和第二层颜色时才显示白色分隔描边
          if (!hasColor1 || !hasColor2) return null;

          return (
            <circle
              key={`white-separator-${note.id}`}
              className="note-separator-stroke"
              cx={note.x}
              cy={note.y}
              r={CONSTS.circleRadius}
              stroke="white"
              strokeWidth="2"
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

            // 预览按当前预设绘制（形状 + 箭头），所见即所得
            const previewType = connectionPreset?.type || 'line';
            const previewArrowDirection = connectionPreset?.arrowDirection || 'none';
            const previewArrowLength = CONSTS.circleRadius * (2 / 3);
            const previewHasArrowStart = previewArrowDirection === 'start' || previewArrowDirection === 'both';
            const previewHasArrowEnd = previewArrowDirection === 'end' || previewArrowDirection === 'both';
            const previewPath = buildConnectionPath(
              { x: startEdgeX, y: startEdgeY },
              { x: endX, y: endY },
              {
                type: previewType,
                curvature: adaptiveArcCurvature(connectionStartPosition, mousePosition, connectionPreset?.arcCurvature ?? 0.7),
                arrowDirection: previewArrowDirection,
                arrowLength: previewArrowLength,
                strokeWidth: 3,
                startCenter: connectionStartPosition,
                endCenter: previewHoverNote ? notes.find(n => n.id === previewHoverNote) : null
              }
            );

            return (
              <g>
                <ArrowMarkers
                  idPrefix="preview"
                  arrowLength={previewArrowLength}
                  startColor={previewColor}
                  endColor={previewColor}
                  showStart={previewHasArrowStart}
                  showEnd={previewHasArrowEnd}
                />
                <path
                  className="connection-preview connection-preview-line"
                  d={previewPath}
                  stroke={previewColor}
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="5,5"
                  opacity={0.6}
                  pointerEvents="none"
                  markerStart={previewHasArrowStart ? 'url(#arrowhead-start-preview)' : undefined}
                  markerEnd={previewHasArrowEnd ? 'url(#arrowhead-end-preview)' : undefined}
                />
              </g>
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
          x={connectionToolbarPosition.x - 600}
          y={connectionToolbarPosition.y - 300}
          width="1200"
          height="800"
          className="connection-toolbar-container"
          style={{ overflow: 'visible', pointerEvents: 'none' }}
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
            style={{ position: 'relative', left: '50%', top: '300px', transform: 'translateX(-50%)' }}
          >
            <div className="toolbar-icons">
              {/* 预设按钮：形状和方向一次点到位，替代原来的"类型 + 箭头"两个循环按钮 */}
              <div className="toolbar-preset-group">
                {CONNECTION_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    className={`toolbar-icon-btn toolbar-preset-btn ${activePreset && activePreset.id === preset.id ? 'active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                      applyPresetToSelectedConnection(preset);
                    }}
                    title={tc.presetTitles?.[preset.id] ?? preset.id}
                  >
                    <ConnectionPresetIcon presetId={preset.id} width={26} height={14} />
                    <span className="toolbar-preset-label">{tc.presetLabels?.[preset.id] ?? preset.id}</span>
                  </button>
                ))}
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
                  title={ts.connWidth ?? 'Width'}
                >
                  {ts.connWidthBtn ?? '≡'}
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
                    title={ts.connCurvature ?? 'Curve'}
                  >
                    {ts.connCurvatureBtn ?? '⌒'}
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
                    title={ts.connReverse ?? 'Flip curve'}
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
                  title={ts.connGray ?? 'Frosted glass'}
                >
                  {ts.connGrayBtn ?? '◑'}
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
                title={ts.connDelete ?? 'Delete connection'}
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
);
