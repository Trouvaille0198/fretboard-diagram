import React from 'react';
import { CONSTS } from '../constants';
import PianoKeyboard from '../PianoKeyboard';
import { ColorPalette } from './ColorPalette';
import { FretRangeSlider } from './FretRangeSlider';

export function FretboardMenu({
  selectedColorLevel,
  selectedColor,
  onSelectColor,
  enharmonic,
  onToggleEnharmonic,
  onToggleVisibility,
  connectionMode,
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
        <button 
          className={`button ${connectionMode ? 'selected' : ''}`} 
          onClick={onToggleConnectionMode}
          title="Connection Tool"
        >
          Connect
        </button>
        {onSaveState && <button className="button" onClick={onSaveState} title="Save current fretboard state">Save</button>}
        <button className="button" onClick={onReset}>Reset</button>
        <button className="button" onClick={onSaveSVG}>Download</button>
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
