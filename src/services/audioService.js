// 吉他音频服务 - 使用 Tone.js 合成吉他音色
// 临时使用合成音色，后续可替换为 SFZ 采样

class AudioService {
    constructor() {
        this.context = null;
        this.synth = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            const Tone = await import('tone');
            this.Tone = Tone;

            // 使用真实吉他采样 - nbrosowsky/tonejs-instruments
            // 木吉他采样，覆盖吉他音域
            this.sampler = new Tone.Sampler({
                urls: {
                    'A2': 'A2.mp3',
                    'A3': 'A3.mp3',
                    'A4': 'A4.mp3',
                    'A5': 'A5.mp3',
                    'C3': 'C3.mp3',
                    'C4': 'C4.mp3',
                    'C5': 'C5.mp3',
                    'D#3': 'Ds3.mp3',
                    'D#4': 'Ds4.mp3',
                    'D#5': 'Ds5.mp3',
                    'F#2': 'Fs2.mp3',
                    'F#3': 'Fs3.mp3',
                    'F#4': 'Fs4.mp3',
                    'F#5': 'Fs5.mp3',
                },
                release: 1,
                baseUrl: 'https://cdn.jsdelivr.net/gh/nbrosowsky/tonejs-instruments@master/samples/guitar-acoustic/',
                onload: () => {
                    console.log('Guitar sampler loaded');
                }
            }).toDestination();

            this.initialized = true;
            console.log('Guitar sampler initialized');
        } catch (error) {
            console.error('Failed to initialize sampler:', error);
            this.initNativeAudio();
        }
    }

    initNativeAudio() {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.initialized = true;
    }

    // 将音符名称转换为频率
    noteToFrequency(noteName) {
        // 移除升降号，统一处理
        const noteMap = {
            'C': 0, 'C#': 1, 'Db': 1,
            'D': 2, 'D#': 3, 'Eb': 3,
            'E': 4,
            'F': 5, 'F#': 6, 'Gb': 6,
            'G': 7, 'G#': 8, 'Ab': 8,
            'A': 9, 'A#': 10, 'Bb': 10,
            'B': 11
        };

        // 提取音符名和八度
        let baseName = noteName.replace(/[0-9]/g, '');
        let octave = parseInt(noteName.match(/[0-9]+/)?.[0]) || 4;

        // 处理带升降号的音符
        if (baseName.length > 1) {
            // 已经是 C#, Db 等格式
        }

        const semitone = noteMap[baseName];
        if (semitone === undefined) {
            console.warn('Unknown note:', noteName);
            return 440; // 默认 A4
        }

        // A4 = 440Hz, 计算公式: f = 440 * 2^((n-49)/12)
        // C4 = A4 下 9 个半音
        const noteNumber = (octave - 4) * 12 + semitone - 9;
        return 440 * Math.pow(2, noteNumber / 12);
    }

    // 计算吉他音符的八度
    // 吉他标准调弦 (从低到高): E2, A2, D3, G3, B3, E4
    getNoteWithOctave(fret, string) {
        // string: 0-5 (从最细弦到最粗弦)
        // fret: -1 表示空弦, 0-24 表示品位

        const openStringNotes = [
            { note: 'E', octave: 4 },  // 1弦 (最细)
            { note: 'B', octave: 3 },  // 2弦
            { note: 'G', octave: 3 },  // 3弦
            { note: 'D', octave: 3 },  // 4弦
            { note: 'A', octave: 2 },  // 5弦
            { note: 'E', octave: 2 },  // 6弦 (最粗)
        ];

        if (string < 0 || string >= 6) {
            console.warn('Invalid string:', string);
            return 'A4';
        }

        const baseNote = openStringNotes[string];
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // 找到基础音符在音阶中的位置
        let baseIndex = noteNames.indexOf(baseNote.note);
        if (baseIndex === -1) {
            // 处理降号
            const flatMap = { 'Db': 1, 'Eb': 3, 'Gb': 6, 'Ab': 8, 'Bb': 10 };
            baseIndex = flatMap[baseNote.note] || 0;
        }

        // 计算品位后的音符
        const totalSemitones = baseIndex + (fret + 1); // fret=-1 表示空弦，所以 +1
        const newIndex = totalSemitones % 12;
        const octaveChange = Math.floor(totalSemitones / 12);
        const newOctave = baseNote.octave + octaveChange;

        return `${noteNames[newIndex]}${newOctave}`;
    }

    async playNote(noteName, duration = 0.5) {
        if (!this.initialized) {
            await this.init();
        }

        console.log('Playing note:', noteName, 'sampler:', !!this.sampler);

        try {
            if (this.sampler && this.Tone) {
                await this.Tone.start();
                console.log('Triggering sampler');
                this.sampler.triggerAttackRelease(noteName, duration);
            } else if (this.context) {
                console.log('Using native audio');
                this.playNativeNote(noteName, duration);
            }
        } catch (error) {
            console.error('Failed to play note:', error);
        }
    }

    // 播放指定品位和弦的音符
    async playFretNote(fret, string, duration = 0.5) {
        const noteWithOctave = this.getNoteWithOctave(fret, string);
        await this.playNote(noteWithOctave, duration);
    }

    playNativeNote(noteName, duration) {
        const frequency = this.noteToFrequency(noteName);

        // 确保 context 存在且已恢复
        if (!this.context) {
            this.initNativeAudio();
        }

        // 恢复 AudioContext（如果被暂停）
        if (this.context.state === 'suspended') {
            this.context.resume().catch(err => {
                console.warn('Failed to resume audio context:', err);
            });
        }

        const now = this.context.currentTime;

        // 创建振荡器
        const oscillator = this.context.createOscillator();
        const gainNode = this.context.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.context.destination);

        // 设置音色参数（模拟吉他拨弦）
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(frequency, now);

        // 包络：快速起音，中速衰减
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01); // 10ms 起音
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    dispose() {
        if (this.sampler) {
            this.sampler.dispose();
        }
        if (this.context) {
            this.context.close();
        }
        this.initialized = false;
    }
}

// 单例模式
const audioService = new AudioService();
export default audioService;
