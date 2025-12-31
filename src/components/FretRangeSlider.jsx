import React from 'react';

export function FretRangeSlider({ startFret, endFret, onFretWindowChange }) {
  return (
    <div className="fret-range-slider-wrapper">
      <div className="dual-range-slider">
        <div className="dual-range-inputs-container">
          <div className="dual-range-track" />
          
          <div 
            className="dual-range-selected"
            style={{
              left: `calc(9px + ${(startFret / 22) * 100}% - ${(startFret / 22) * 18}px)`,
              width: `calc(${((endFret - startFret) / 22) * 100}% - ${((endFret - startFret) / 22) * 18}px)`
            }}
          />
          
          <div 
            className="fret-value-tooltip"
            style={{
              left: `calc(9px + ${(startFret / 22) * 100}% - ${(startFret / 22) * 18}px)`,
              transform: 'translateX(-50%)'
            }}
          >
            {startFret + 1}
          </div>
          
          <div 
            className="fret-value-tooltip"
            style={{
              left: `calc(9px + ${(endFret / 22) * 100}% - ${(endFret / 22) * 18}px)`,
              transform: 'translateX(-50%)'
            }}
          >
            {endFret}
          </div>
          
          <input
            type="range"
            className="dual-range-input dual-range-input-min"
            min="0"
            max="22"
            step="1"
            value={startFret}
            onChange={(e) => {
              const newStart = parseInt(e.target.value);
              if (newStart < endFret) {
                onFretWindowChange({ start: newStart });
              } else {
                onFretWindowChange({ start: endFret - 1 });
              }
            }}
          />
          
          <input
            type="range"
            className="dual-range-input dual-range-input-max"
            min="0"
            max="22"
            step="1"
            value={endFret}
            onChange={(e) => {
              const newEnd = parseInt(e.target.value);
              if (newEnd > startFret) {
                onFretWindowChange({ end: newEnd });
              } else {
                onFretWindowChange({ end: startFret + 1 });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
