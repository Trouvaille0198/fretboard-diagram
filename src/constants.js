export const CONSTS = {
    offsetX: 40,
    offsetY: 30,
    stringIntervals: [24, 19, 15, 10, 5, 0],
    markers: [3, 5, 7, 9, 12, 15, 17, 19, 21],
    fretWidth: 70,
    stringSpacing: 40,
    minStringSize: 0.2,
    circleRadius: 18,
    notes: [
        ['E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#'],
        ['E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb']
    ],
    sign: ['♯', '♭'],
};

CONSTS.numStrings = CONSTS.stringIntervals.length;
CONSTS.fretHeight = (CONSTS.numStrings - 1) * CONSTS.stringSpacing;
