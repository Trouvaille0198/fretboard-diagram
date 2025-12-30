import React from 'react';
import { CONSTS } from './constants';
import './fretboard.css';

function PianoKeyboard({ enharmonic, selectedNote, onNoteSelect }) {
  // 白键：C, D, E, F, G, A, B
  // 对应的音符索引：8, 10, 0, 1, 3, 5, 7
  const whiteKeys = [
    { noteIndex: 8, name: 'C' },
    { noteIndex: 10, name: 'D' },
    { noteIndex: 0, name: 'E' },
    { noteIndex: 1, name: 'F' },
    { noteIndex: 3, name: 'G' },
    { noteIndex: 5, name: 'A' },
    { noteIndex: 7, name: 'B' }
  ];

  // 黑键：C#, D#, F#, G#, A#
  // 对应的音符索引：9, 11, 6, 4, 2
  const blackKeys = [
    { noteIndex: 9, sharpName: 'C#', flatName: 'Db', position: 0 }, // 在C和D之间
    { noteIndex: 11, sharpName: 'D#', flatName: 'Eb', position: 1 }, // 在D和E之间
    { noteIndex: 6, sharpName: 'F#', flatName: 'Gb', position: 3 }, // 在F和G之间
    { noteIndex: 4, sharpName: 'G#', flatName: 'Ab', position: 4 }, // 在G和A之间
    { noteIndex: 2, sharpName: 'A#', flatName: 'Bb', position: 5 }  // 在A和B之间
  ];

  const handleKeyClick = (noteIndex) => {
    if (onNoteSelect) {
      // 如果点击的是已选中的琴键，则取消选中（传递 null）
      if (selectedNote === noteIndex) {
        onNoteSelect(null);
      } else {
        onNoteSelect(noteIndex);
      }
    }
  };

  return (
    <div className="piano-keyboard">
      <div className="piano-keys">
        {/* 渲染白键 */}
        {whiteKeys.map((key, index) => {
          const isSelected = selectedNote === key.noteIndex;
          return (
            <div
              key={key.noteIndex}
              className={`piano-key white-key ${isSelected ? 'selected' : ''}`}
              onClick={() => handleKeyClick(key.noteIndex)}
            >
              <span className="key-label">{key.name}</span>
            </div>
          );
        })}
        {/* 渲染黑键（绝对定位） */}
        {blackKeys.map((blackKey) => {
          const blackIsSelected = selectedNote === blackKey.noteIndex;
          const blackKeyName = enharmonic === 0 
            ? blackKey.sharpName 
            : blackKey.flatName;
          // 计算黑键的左侧位置
          // 白键宽度45px，白键右边距2px，容器padding 4px，黑键宽度28px
          // 黑键位于两个白键之间，计算方式：
          // 前一个白键的中心位置 + 白键宽度/2 + 间距/2 - 黑键宽度/2
          const whiteKeyWidth = 45;
          const whiteKeyMargin = 2;
          const containerPadding = 4;
          const blackKeyWidth = 28;
          
          // 前一个白键的左边缘位置
          const prevWhiteKeyLeft = containerPadding + blackKey.position * (whiteKeyWidth + whiteKeyMargin);
          // 前一个白键的中心位置
          const prevWhiteKeyCenter = prevWhiteKeyLeft + whiteKeyWidth / 2;
          // 黑键应该位于前一个白键右边缘和后一个白键左边缘的中间
          // 前一个白键右边缘 = prevWhiteKeyLeft + whiteKeyWidth
          // 后一个白键左边缘 = prevWhiteKeyLeft + whiteKeyWidth + whiteKeyMargin
          // 黑键中心 = (前一个白键右边缘 + 后一个白键左边缘) / 2
          const blackKeyCenter = prevWhiteKeyLeft + whiteKeyWidth + whiteKeyMargin / 2;
          // 黑键左边缘位置
          const leftPosition = blackKeyCenter - blackKeyWidth / 2;
          return (
            <div
              key={blackKey.noteIndex}
              className={`piano-key black-key ${blackIsSelected ? 'selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleKeyClick(blackKey.noteIndex);
              }}
              style={{ left: `${leftPosition}px` }}
            >
              <span className="key-label">{blackKeyName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PianoKeyboard;
