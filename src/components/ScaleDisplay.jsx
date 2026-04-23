import React from 'react';
import { getScaleDisplay } from '../utils/scaleCalculator';
import './ScaleDisplay.css';

export function ScaleDisplay({ rootNote, isMinor, enharmonic }) {
  if (rootNote === null || rootNote === undefined) {
    return null;
  }

  const scaleNotes = getScaleDisplay(rootNote, isMinor, enharmonic);
  const rootNoteName = scaleNotes[0]?.noteName || '';
  const scaleType = isMinor ? 'Minor' : 'Major';
  const accidentalHint = enharmonic === 0 ? 'Sharp Spelling' : 'Flat Spelling';

  return (
    <section className="scale-display">
      <div className="scale-display-header">
        <div className="scale-display-title-wrap">
          <p className="scale-display-kicker">Scale</p>
          <h3 className="scale-display-title">{rootNoteName} {scaleType}</h3>
        </div>
        <span className="scale-display-hint">{accidentalHint}</span>
      </div>

      <div className="scale-display-grid">
        {scaleNotes.map((note, index) => (
          <article
            key={`${note.noteName}-${index}`}
            className={`scale-degree-card ${index === 0 ? 'is-root' : ''}`}
          >
            <p className="scale-degree-index">{index + 1}</p>
            <p className="scale-degree-chord">
              <span className="scale-degree-note">{note.noteName}</span>
              <span className={`scale-degree-symbol ${note.chordSymbol === 'dim' ? 'is-diminished' : ''}`}>
                {note.chordSymbol}
              </span>
            </p>
            <p className="scale-degree-roman">
              {note.solfege}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
