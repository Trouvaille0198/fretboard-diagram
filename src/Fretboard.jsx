import React, { useState, useEffect, useRef, useCallback } from 'react';
import './fretboard.css';
import { CONSTS } from './constants';
import { updateNote, inlineCSS, noteToSolfege } from './utils';
import PianoKeyboard from './PianoKeyboard';

function Fretboard() {
  const [selected, setSelected] = useState(null);
  const [visibility, setVisibility] = useState('transparent');
  const [startFret, setStartFret] = useState(0);
  const [endFret, setEndFret] = useState(12);
  const [enharmonic, setEnharmonic] = useState(1); // 默认降号
  const [displayMode, setDisplayMode] = useState('note'); // 默认音名模式
  const [rootNote, setRootNote] = useState(null); // 默认不选中任何琴键
  const [data, setData] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [editableText, setEditableText] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [editableDivVisible, setEditableDivVisible] = useState(false);
  const [editableDivX, setEditableDivX] = useState(0);
  const [editableDivY, setEditableDivY] = useState(0);
  const [currentDateTime, setCurrentDateTime] = useState('');
  
  const svgElementRef = useRef(null);
  const notesElementRef = useRef(null);
  const editableDivRef = useRef(null);

  const numFrets = endFret - startFret;
  const fretboardWidth = CONSTS.fretWidth * numFrets;
  const svgWidth = fretboardWidth + 2 * CONSTS.offsetX;

  useEffect(() => {
    const initialEndFret = Math.min(
      Math.floor((window.innerWidth - 2 * CONSTS.offsetX) / CONSTS.fretWidth),
      12
    );
    setEndFret(initialEndFret);
  }, []);

  // 更新当前日期时间
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const year = String(now.getFullYear()).slice(-2);
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setCurrentDateTime(`${year}-${month}-${day} ${hours}:${minutes}:${seconds}`);
    };
    
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const computeNoteIndex = useCallback((fret, string) => {
    const interval = CONSTS.stringIntervals[string] + fret + 1;
    return interval % 12;
  }, []);

  const computeNoteName = useCallback((fret, string) => {
    const noteIndex = computeNoteIndex(fret, string);
    return CONSTS.notes[enharmonic][noteIndex];
  }, [enharmonic, computeNoteIndex]);

  const setFretWindow = useCallback((fretWindow) => {
    const start = fretWindow.start !== undefined ? fretWindow.start : startFret;
    const end = fretWindow.end !== undefined ? fretWindow.end : endFret;
    
    if (selected) {
      const noteElement = selected.element || document.getElementById(selected.id);
      if (noteElement) {
        updateNote(noteElement, data, { visibility: 'visible' });
        setData(prevData => {
          const newData = { ...prevData };
          if (selected.id in newData) {
            newData[selected.id] = { ...newData[selected.id], visibility: 'visible' };
          }
          return newData;
        });
      }
      setSelected(null);
    }
    
    setErrorMessage('');
    
    if (isNaN(start) || isNaN(end)) {
      return;
    }
    
    if (start < 0 || start > 22 || end < 1 || end > 22) {
      setErrorMessage("Invalid fret value(s)!");
      setStartFret(start);
      setEndFret(end);
      return;
    }
    if (end <= start) {
      setErrorMessage("End fret must not be smaller than start fret!");
      setStartFret(start);
      setEndFret(end);
      return;
    }
    if (end - start > 16) {
      setErrorMessage("Maximal number of displayable frets is 16, e.g., 1st to 16th or 4th to 19th!");
      setStartFret(start);
      setEndFret(end);
      return;
    }

    setStartFret(start);
    setEndFret(end);
  }, [startFret, endFret, selected, data]);

  const generateNotes = useCallback(() => {
    const notes = [];
    
    for (let j = 0; j < CONSTS.numStrings; j++) {
      const noteId = `o-s${j}`;
      const x = CONSTS.offsetX / 2;
      const y = CONSTS.offsetY + CONSTS.stringSpacing * j;
      const noteData = data[noteId] || {};
      
      let displayName;
      if (noteData.noteText) {
        // 如果用户手动编辑了文本，优先使用编辑的文本
        displayName = noteData.noteText;
      } else if (displayMode === 'solfege' && rootNote !== null) {
        // 唱名模式（需要选中根音）
        const noteIndex = computeNoteIndex(-1, j);
        displayName = noteToSolfege(noteIndex, rootNote, enharmonic);
      } else {
        // 音名模式
        displayName = computeNoteName(-1, j);
      }
      
      notes.push({
        id: noteId,
        x,
        y,
        noteName: displayName,
        isOpen: true,
        data: noteData
      });
    }
    
    for (let i = startFret; i < endFret; i++) {
      for (let j = 0; j < CONSTS.numStrings; j++) {
        const noteId = `f${i}-s${j}`;
        const x = CONSTS.offsetX + (CONSTS.fretWidth / 2) + CONSTS.fretWidth * (i - startFret);
        const y = CONSTS.offsetY + CONSTS.stringSpacing * j;
        const noteData = data[noteId] || {};
        
        let displayName;
        if (noteData.noteText) {
          // 如果用户手动编辑了文本，优先使用编辑的文本
          displayName = noteData.noteText;
        } else if (displayMode === 'solfege' && rootNote !== null) {
          // 唱名模式（需要选中根音）
          const noteIndex = computeNoteIndex(i, j);
          displayName = noteToSolfege(noteIndex, rootNote, enharmonic);
        } else {
          // 音名模式
          displayName = computeNoteName(i, j);
        }
        
        notes.push({
          id: noteId,
          x,
          y,
          noteName: displayName,
          isOpen: false,
          data: noteData
        });
      }
    }
    
    return notes;
  }, [startFret, endFret, data, computeNoteName, computeNoteIndex, displayMode, rootNote, enharmonic]);

  const generateMarkers = useCallback(() => {
    return CONSTS.markers
      .filter(i => i > startFret && i <= endFret)
      .map(i => ({
        x: CONSTS.offsetX + (i - 1 - startFret) * CONSTS.fretWidth + (CONSTS.fretWidth / 2),
        y: CONSTS.offsetY + CONSTS.fretHeight + CONSTS.stringSpacing,
        number: i
      }));
  }, [startFret, endFret]);

  const generateFretPath = useCallback(() => {
    let path = `M ${CONSTS.offsetX} ${CONSTS.offsetY}`;
    for (let i = startFret; i < endFret + 1; i++) {
      const factor = (i - startFret) % 2 === 0 ? 1 : -1;
      path += ` v ${factor * CONSTS.fretHeight}`;
      path += ` m ${CONSTS.fretWidth} 0`;
    }
    return path;
  }, [startFret, endFret]);

  const generateStringPath = useCallback((stringIndex) => {
    const y = CONSTS.offsetY + stringIndex * CONSTS.stringSpacing;
    return `M ${CONSTS.offsetX} ${y} h ${fretboardWidth}`;
  }, [fretboardWidth]);

  const notes = generateNotes();
  const markers = generateMarkers();
  const fretPath = generateFretPath();

  useEffect(() => {
    notes.forEach(note => {
      if (!(note.id in data)) {
        setData(prevData => ({
          ...prevData,
          [note.id]: { type: 'note', color: 'white', visibility: visibility }
        }));
      }
    });
    
    if (selected) {
      const noteIds = notes.map(n => n.id);
      if (!noteIds.includes(selected.id)) {
        setSelected(null);
      }
    }
  }, [notes, selected, data, visibility]);

  // 在DOM更新后，确保所有音符的类名正确应用（完全按照原始代码逻辑）
  useEffect(() => {
    if (notesElementRef.current) {
      notes.forEach(note => {
        const noteElement = document.getElementById(note.id);
        if (noteElement) {
          const noteData = data[note.id] || { type: 'note', color: 'white', visibility: visibility };
          updateNote(noteElement, data, { 
            type: noteData.type || 'note',
            color: noteData.color || 'white',
            visibility: noteData.visibility || visibility
          });
        }
      });
    }
  }, [notes, data, visibility]);

  const handleNoteClick = useCallback((event, noteId) => {
    event.stopPropagation();
    const noteElement = event.currentTarget;
    noteElement.focus();
    
    if (selected) {
      const prevElement = selected.element || document.getElementById(selected.id);
      if (prevElement) {
        updateNote(prevElement, data, { visibility: 'visible' });
        setData(prevData => {
          const newData = { ...prevData };
          if (selected.id in newData) {
            newData[selected.id] = { ...newData[selected.id], visibility: 'visible' };
          }
          return newData;
        });
      }
    }
    updateNote(noteElement, data, { visibility: 'selected' });
    setData(prevData => {
      const newData = { ...prevData };
      if (!(noteId in newData)) {
        newData[noteId] = {};
      }
      newData[noteId] = { ...newData[noteId], visibility: 'selected' };
      return newData;
    });
    setSelected({ id: noteId, element: noteElement });
    
    if (event.ctrlKey) {
      editNoteLabel(noteId, noteElement);
    }
  }, [selected, data]);

  const handleNoteDoubleClick = useCallback((event, noteId) => {
    event.stopPropagation();
    const noteElement = event.currentTarget;
    
    if (selected) {
      const prevElement = selected.element || document.getElementById(selected.id);
      if (prevElement) {
        updateNote(prevElement, data, { visibility: 'visible' });
        setData(prevData => {
          const newData = { ...prevData };
          if (selected.id in newData) {
            newData[selected.id] = { ...newData[selected.id], visibility: 'visible' };
          }
          return newData;
        });
      }
    }
    updateNote(noteElement, data, { visibility: 'selected' });
    setData(prevData => {
      const newData = { ...prevData };
      if (!(noteId in newData)) {
        newData[noteId] = {};
      }
      newData[noteId] = { ...newData[noteId], visibility: 'selected' };
      return newData;
    });
    setSelected({ id: noteId, element: noteElement });
    editNoteLabel(noteId, noteElement);
  }, [selected, data]);

  const editNoteLabel = useCallback((noteId, noteElement) => {
    const noteData = data[noteId] || {};
    const textElem = noteElement?.querySelector('text');
    // 优先使用手动编辑的文本，否则使用当前显示的文本（可能是唱名或音名）
    const noteName = noteData.noteText || textElem?.textContent || textElem?.getAttribute('data-note') || '';
    setEditableText(noteName);
    setEditingNote(noteId);
    
    const x = parseFloat(noteElement?.getAttribute('data-x') || '0');
    const y = parseFloat(noteElement?.getAttribute('data-y') || '0');
    setEditableDivX(x - CONSTS.circleRadius);
    setEditableDivY(y - CONSTS.circleRadius + 4);
    setEditableDivVisible(true);
  }, [data]);

  const finishEditing = useCallback(() => {
    if (editingNote) {
      const noteElement = document.getElementById(editingNote);
      if (noteElement) {
        if (editableText.trim()) {
          updateNote(noteElement, data, { noteText: editableText.trim() });
          setData(prevData => {
            const newData = { ...prevData };
            if (!(editingNote in newData)) {
              newData[editingNote] = {};
            }
            newData[editingNote] = { ...newData[editingNote], noteText: editableText.trim() };
            return newData;
          });
        } else {
          // 清空编辑文本时，删除 noteText，让 generateNotes 根据当前模式重新计算显示名称
          setData(prevData => {
            const newData = { ...prevData };
            if (editingNote in newData) {
              const noteData = { ...newData[editingNote] };
              delete noteData.noteText;
              newData[editingNote] = noteData;
            }
            return newData;
          });
        }
      }
    }
    setEditableDivVisible(false);
    setEditingNote(null);
    setEditableText('');
  }, [editingNote, editableText, data]);

  const deleteNote = useCallback(() => {
    if (selected) {
      const noteElement = selected.element || document.getElementById(selected.id);
      if (noteElement) {
        updateNote(noteElement, data, { 
          color: 'white', 
          visibility: visibility 
        });
        setData(prevData => {
          const newData = { ...prevData };
          if (selected.id in newData) {
            newData[selected.id] = { ...newData[selected.id], color: 'white', visibility: visibility };
            delete newData[selected.id].noteText;
          }
          return newData;
        });
        // 删除noteText后，让generateNotes重新计算显示名称
        // 不需要手动设置textContent，因为notes会重新生成并更新DOM
      }
      setSelected(null);
    }
  }, [selected, visibility, data]);

  const updateColor = useCallback((color) => {
    if (selected) {
      const noteElement = selected.element || document.getElementById(selected.id);
      if (noteElement) {
        updateNote(noteElement, data, { color });
        setData(prevData => {
          const newData = { ...prevData };
          if (selected.id in newData) {
            newData[selected.id] = { ...newData[selected.id], color };
          }
          return newData;
        });
      }
    }
  }, [selected, data]);

  const toggleVisibility = useCallback(() => {
    const newVisibility = visibility === 'hidden' ? 'transparent' : 'hidden';
    setVisibility(newVisibility);
    
    if (notesElementRef.current) {
      for (const note of notesElementRef.current.children) {
        const classVal = note.className?.baseVal || '';
        if (classVal.endsWith('visible') || classVal.endsWith('selected')) {
          continue;
        }
        updateNote(note, data, { visibility: newVisibility });
      }
    }
    
    setData(prevData => {
      const newData = { ...prevData };
      for (const [key, value] of Object.entries(newData)) {
        if (value.visibility !== 'visible' && value.visibility !== 'selected') {
          newData[key] = { ...value, visibility: newVisibility };
        }
      }
      return newData;
    });
  }, [visibility, data]);

  const toggleEnharmonic = useCallback(() => {
    setEnharmonic(prev => (prev + 1) % 2);
  }, []);

  const reset = useCallback(() => {
    if (window.confirm("Do you really want to reset your diagram?")) {
      setData({});
      if (notesElementRef.current) {
        for (const note of notesElementRef.current.children) {
          const textElem = note.querySelector('text');
          if (textElem) {
            textElem.textContent = textElem.getAttribute('data-note');
          }
          updateNote(note, data, { type: 'note', color: 'white', visibility: visibility });
        }
      }
      setSelected(null);
    }
  }, [visibility, data]);

  const saveSVG = useCallback(() => {
    if (selected) {
      const noteElement = selected.element || document.getElementById(selected.id);
      if (noteElement) {
        updateNote(noteElement, data, { visibility: 'visible' });
        setData(prevData => {
          const newData = { ...prevData };
          if (selected.id in newData) {
            newData[selected.id] = { ...newData[selected.id], visibility: 'visible' };
          }
          return newData;
        });
      }
      setSelected(null);
    }
    
    const svgCopy = inlineCSS(svgElementRef.current);
    const svgData = svgCopy.outerHTML;
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const link = document.createElement('a');
    link.href = svgUrl;
    link.download = 'fretboard-diagram.svg';
    link.click();
  }, [selected, data]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!selected) return;
      
      switch (event.code) {
        case 'Backspace':
        case 'Delete':
          deleteNote();
          break;
        case 'KeyB':
          updateColor('blue');
          break;
        case 'KeyD':
          updateColor('black');
          break;
        case 'KeyG':
          updateColor('green');
          break;
        case 'KeyW':
          updateColor('white');
          break;
        case 'KeyR':
          updateColor('red');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected, deleteNote, updateColor]);

  const handleSvgClick = useCallback(() => {
    if (selected) {
      const noteElement = selected.element || document.getElementById(selected.id);
      if (noteElement) {
        updateNote(noteElement, data, { visibility: 'visible' });
        setData(prevData => {
          const newData = { ...prevData };
          if (selected.id in newData) {
            newData[selected.id] = { ...newData[selected.id], visibility: 'visible' };
          }
          return newData;
        });
      }
      setSelected(null);
    }
  }, [selected, data]);

  const handleEditableKeyDown = useCallback((event) => {
    if (event.code === 'Enter') {
      event.preventDefault();
      event.target.blur();
    }
    event.stopPropagation();
  }, []);

  const handleEditableClick = useCallback((event) => {
    event.stopPropagation();
  }, []);

  useEffect(() => {
    if (editableDivVisible && editableDivRef.current) {
      editableDivRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(editableDivRef.current);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [editableDivVisible]);

  return (
    <>
      <div className="title-header">
        <h1>Fretboard Diagram Generator</h1>
        <div className="datetime">{currentDateTime}</div>
      </div>
      <figure id="fretboard-diagram-creator" className="half-full">
        <svg
          ref={svgElementRef}
          id="fretboard-svg"
          xmlns="http://www.w3.org/2000/svg"
          width={svgWidth}
          height={280}
          onClick={handleSvgClick}
        >
          <path className="frets" d={fretPath} />
          
          <g className="markers">
            {markers.map(marker => (
              <text key={marker.number} className="marker" x={marker.x} y={marker.y}>
                {marker.number}
              </text>
            ))}
          </g>
          
          <g className="strings">
            {Array.from({ length: CONSTS.numStrings }).map((_, i) => (
              <path
                key={i}
                className="string"
                d={generateStringPath(i)}
                style={{ strokeWidth: CONSTS.minStringSize * (i + 1) }}
              />
            ))}
          </g>
          
          <g className="notes" ref={notesElementRef}>
            {notes.map(note => {
              const noteData = data[note.id] || { type: 'note', color: 'white', visibility: visibility };
              const currentColor = noteData.color || 'white';
              const currentVisibility = selected?.id === note.id ? 'selected' : (noteData.visibility || visibility);
              const className = `note ${currentColor} ${currentVisibility}`;
              
              let originalNoteName = '';
              if (note.id.startsWith('o-s')) {
                const string = parseInt(note.id.substring(3));
                originalNoteName = computeNoteName(-1, string);
              } else if (note.id.startsWith('f') && note.id.includes('-s')) {
                const parts = note.id.substring(1).split('-s');
                const fret = parseInt(parts[0]);
                const string = parseInt(parts[1]);
                originalNoteName = computeNoteName(fret, string);
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
                  onDoubleClick={(e) => handleNoteDoubleClick(e, note.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    r={CONSTS.circleRadius}
                    stroke={note.isOpen ? 'none' : undefined}
                  />
                  <text data-note={originalNoteName}>
                    {note.noteName}
                  </text>
                </g>
              );
            })}
          </g>
          
          {errorMessage && (
            <text className="error" x={400} y={140} dangerouslySetInnerHTML={{ __html: errorMessage }} />
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
        </svg>
      </figure>

      <div className="menu">
        <div id="color-selector">
          <button title="blue" className="color blue" onClick={() => updateColor('blue')} />
          <button title="green" className="color green" onClick={() => updateColor('green')} />
          <button title="red" className="color red" onClick={() => updateColor('red')} />
          <button title="white" className="color white" onClick={() => updateColor('white')} />
          <button title="black" className="color black" onClick={() => updateColor('black')} />
          <button title="delete" id="delete-note" onClick={deleteNote}>X</button>
        </div>
        <div id="global-actions">
          <input
            id="start-fret"
            type="number"
            className="num-input"
            value={startFret + 1}
            min="1"
            max="22"
            maxLength={2}
            style={{ width: '5ch' }}
            autoComplete="off"
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value) && value >= 1 && value <= 22) {
                setFretWindow({ start: value - 1 });
              } else if (e.target.value === '') {
                return;
              } else {
                e.target.value = startFret + 1;
              }
            }}
          />
          <button
            id="enharmonic"
            style={{ width: '25px', textAlign: 'center' }}
            onClick={toggleEnharmonic}
          >
            {CONSTS.sign[enharmonic]}
          </button>
          <label className="mode-switch">
            <input
              type="checkbox"
              checked={displayMode === 'solfege'}
              onChange={(e) => {
                const newMode = e.target.checked ? 'solfege' : 'note';
                setDisplayMode(newMode);
                // 切换到唱名模式时，取消选中琴键
                if (newMode === 'solfege') {
                  setRootNote(null);
                }
              }}
            />
            <span>唱名</span>
          </label>
          <button className="button" onClick={toggleVisibility}>Toggle</button>
          <button className="button" onClick={saveSVG}>Save</button>
          <button className="button" onClick={reset}>Reset</button>
          <input
            id="end-fret"
            type="number"
            className="num-input"
            value={endFret}
            min="1"
            max="22"
            maxLength={2}
            style={{ width: '5ch' }}
            autoComplete="off"
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value) && value >= 1 && value <= 22) {
                setFretWindow({ end: value });
              } else if (e.target.value === '') {
                return;
              } else {
                e.target.value = endFret;
              }
            }}
          />
        </div>
        <div id="piano-keyboard-container">
          <PianoKeyboard
            enharmonic={enharmonic}
            selectedNote={rootNote}
            onNoteSelect={(noteIndex) => {
              setRootNote(noteIndex);
              if (noteIndex === null) {
                // 取消选中时，自动切换到音名模式
                setDisplayMode('note');
              } else {
                // 选中琴键时，自动切换到唱名模式
                setDisplayMode('solfege');
              }
            }}
          />
        </div>
      </div>
    </>
  );
}

export default Fretboard;
