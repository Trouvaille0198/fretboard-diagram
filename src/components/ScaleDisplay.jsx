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

  return (
    <section className="scale-display">
      <div className="scale-display-header">
        <div className="scale-display-title-wrap">
          <h3 className="scale-display-title">{rootNoteName} {scaleType}</h3>
        </div>
      </div>

      <div className="scale-display-grid">
        {scaleNotes.map((note, index) => (
          <article
            key={`${note.noteName}-${index}`}
            className="scale-degree-card"
          >
            <p className="scale-degree-index">{index + 1}</p>
            <p className="scale-degree-chord">
              <span className="scale-degree-note">{note.noteName}</span>
              <span className={`scale-degree-symbol`}>
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
