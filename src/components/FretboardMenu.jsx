import React from 'react';
import { CONSTS } from '../constants';
import PianoKeyboard from '../PianoKeyboard';
import { ColorPalette } from './ColorPalette';
import { FretRangeSlider } from './FretRangeSlider';
import { CONNECTION_PRESETS } from '../hooks/useConnectionState';

export function FretboardMenu({
  selectedColorLevel,
  selectedColor,
  onSelectColor,
  enharmonic,
  onToggleEnharmonic,
  onToggleVisibility,
  connectionMode,
  connectionPreset,
  setConnectionPreset,
  onToggleConnectionMode,
  onSaveSVG,
  onSaveState,
  onReset,
  rootNote,
  onRootNoteSelect,
  displayMode,
  setDisplayMode,
  startFret,
  endFret,
  onFretWindowChange
}) {
  return (
    <div className="menu">
      <ColorPalette 
        selectedColorLevel={selectedColorLevel}
        selectedColor={selectedColor}
        onSelectColor={onSelectColor}
      />
      <div id="global-actions">
        <button
          id="enharmonic"
          style={{ width: '25px', textAlign: 'center' }}
          onClick={onToggleEnharmonic}
        >
          {CONSTS.sign[enharmonic]}
        </button>
        <button className="button" onClick={onToggleVisibility}>Toggle</button>
        {onSaveState && <button className="button" onClick={onSaveState} title="Save current fretboard state">Save</button>}
        <button className="button" onClick={onReset}>Reset</button>
        <button className="button" onClick={onSaveSVG}>Download</button>
      </div>
      {/* 连线工具区域 */}
      <div id="connection-tool-section" style={{ padding: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px'}}>
          <button 
            className={`button ${connectionMode ? 'selected' : ''}`} 
            onClick={onToggleConnectionMode}
            title="Connection Tool"
            style={{ marginRight: 'auto' }}
          >
            Connect
          </button>
          <button
            className={`button ${connectionPreset === 'preset1' ? 'selected' : ''}`}
            onClick={() => setConnectionPreset('preset1')}
            disabled={!connectionMode}
            title="直线，无箭头"
            style={{  padding: '4px 8px' }}
          >
            Line
          </button>
          <button
            className={`button ${connectionPreset === 'preset2' ? 'selected' : ''}`}
            onClick={() => setConnectionPreset('preset2')}
            disabled={!connectionMode}
            title="弧线，单箭头"
            style={{  padding: '4px 8px' }}
          >
            Arc
          </button>
        </div>
       
      </div>
      <div id="piano-keyboard-container">
        <PianoKeyboard
          enharmonic={enharmonic}
          selectedNote={rootNote}
          onNoteSelect={(noteIndex) => {
            onRootNoteSelect(noteIndex);
            if (noteIndex === null) {
              setDisplayMode('note');
            } else {
              setDisplayMode('solfege');
            }
          }}
        />
      </div>
      <FretRangeSlider 
        startFret={startFret}
        endFret={endFret}
        onFretWindowChange={onFretWindowChange}
      />
    </div>
  );
}
