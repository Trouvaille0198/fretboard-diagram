// 音阶计算工具

// 自然大调音程结构（全全半全全全半）
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

// 自然小调音程结构（全半全全半全全）
const NATURAL_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

// 索引：0=E, 1=F, 2=F#, 3=G, 4=G#, 5=A, 6=A#, 7=B, 8=C, 9=C#, 10=D, 11=D#
const NOTE_NAMES_SHARP = ['E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#'];
const NOTE_NAMES_FLAT = ['E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb'];

// 罗马级数基名
const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const NATURAL_SEMITONES = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

// 提供两套候选根音拼写，由算法自动评估哪套不会产生双升/双降
const ROOT_CANDIDATES_BY_SEMITONE = {
  0: { sharp: 'C', flat: 'C' },
  1: { sharp: 'C#', flat: 'Db' },
  2: { sharp: 'D', flat: 'D' },
  3: { sharp: 'D#', flat: 'Eb' },
  4: { sharp: 'E', flat: 'E' },
  5: { sharp: 'F', flat: 'F' },
  6: { sharp: 'F#', flat: 'Gb' },
  7: { sharp: 'G', flat: 'G' },
  8: { sharp: 'G#', flat: 'Ab' },
  9: { sharp: 'A', flat: 'A' },
  10: { sharp: 'A#', flat: 'Bb' },
  11: { sharp: 'B', flat: 'B' }
};

function toCSemitone(noteIndex) {
  // 当前索引以 E 为 0，这里转成以 C 为 0 的半音索引
  return (noteIndex + 4) % 12;
}

function getChordSymbol(thirdSemitone, fifthSemitone) {
  if (thirdSemitone === 4 && fifthSemitone === 7) return '';      // 大三和弦
  if (thirdSemitone === 3 && fifthSemitone === 7) return 'm';     // 小三和弦
  if (thirdSemitone === 3 && fifthSemitone === 6) return 'dim';   // 减三和弦
  if (thirdSemitone === 4 && fifthSemitone === 8) return 'aug';   // 增三和弦
  return '';
}

function getScale(rootNote, intervals) {
  return intervals.map(interval => (rootNote + interval) % 12);
}

function spellingDiff(letter, targetSemitone) {
  const natural = NATURAL_SEMITONES[letter];
  return (targetSemitone - natural + 12) % 12;
}

function spellByDiff(letter, diff) {
  if (diff === 0) return letter;
  if (diff === 1) return `${letter}#`;
  if (diff === 2) return `${letter}##`;
  if (diff === 11) return `${letter}b`;
  if (diff === 10) return `${letter}bb`;
  return null;
}

function chooseRootSpelling(rootSemitone, enharmonic) {
  const candidates = ROOT_CANDIDATES_BY_SEMITONE[rootSemitone];
  // 严格跟随用户的升降号切换偏好，保证 UI 切换后音阶展示同步变化
  return enharmonic === 0 ? candidates.sharp : candidates.flat;
}

function fallbackNoteName(noteIndex, enharmonic) {
  const map = enharmonic === 0 ? NOTE_NAMES_SHARP : NOTE_NAMES_FLAT;
  return map[noteIndex];
}

// 计算音阶中每个音的完整信息
export function getScaleDisplay(rootNote, isMinor = false, enharmonic = 1) {
  if (rootNote === null || rootNote === undefined) {
    return [];
  }

  const intervals = isMinor ? NATURAL_MINOR_INTERVALS : MAJOR_SCALE_INTERVALS;
  const scale = getScale(rootNote, intervals);
  const scaleNotes = [];

  const rootSemitone = toCSemitone(rootNote);
  const rootSpelling = chooseRootSpelling(rootSemitone, enharmonic);
  const rootLetter = rootSpelling[0];
  const rootLetterIndex = LETTERS.indexOf(rootLetter);

  for (let i = 0; i < 7; i++) {
    const noteIndex = scale[i];
    const thirdIndex = scale[(i + 2) % 7];
    const fifthIndex = scale[(i + 4) % 7];

    // 计算根音到三音、根音到五音的半音数
    const thirdSemitone = (thirdIndex - noteIndex + 12) % 12;
    const fifthSemitone = (fifthIndex - noteIndex + 12) % 12;

    const noteSemitone = toCSemitone(noteIndex);
    const expectedLetter = LETTERS[(rootLetterIndex + i) % 7];
    const diff = spellingDiff(expectedLetter, noteSemitone);
    const spelledName = spellByDiff(expectedLetter, diff);

    const isMajorThird = thirdSemitone === 4;
    const isDiminished = thirdSemitone === 3 && fifthSemitone === 6;

    const solfege = isDiminished
      ? `${ROMAN_NUMERALS[i].toLowerCase()}°`
      : (isMajorThird ? ROMAN_NUMERALS[i] : ROMAN_NUMERALS[i].toLowerCase());

    scaleNotes.push({
      noteIndex,
      noteName: spelledName || fallbackNoteName(noteIndex, enharmonic),
      chordSymbol: getChordSymbol(thirdSemitone, fifthSemitone),
      solfege,
      isMajor: isMajorThird
    });
  }

  return scaleNotes;
}

// 获取自然大调
export function getMajorScale(rootNote) {
  return getScale(rootNote, MAJOR_SCALE_INTERVALS);
}

// 获取自然小调
export function getNaturalMinorScale(rootNote) {
  return getScale(rootNote, NATURAL_MINOR_INTERVALS);
}
