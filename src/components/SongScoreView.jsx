import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScoreBoard, TransitionFx, exportSheetImage } from './ScorePieces';
import { deriveMeasures, flattenFrames, readMeasureMeta, writeMeasureMeta, chordDisplay } from '../utils/songStructure';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SONG_META_KEY = 'fretboard-song-meta';

function readSongMeta() {
	try {
		return JSON.parse(localStorage.getItem(SONG_META_KEY) || '{}');
	} catch (error) {
		return {};
	}
}

// 独立谱子页（8pu 式）：谱头 + 文本谱/动态谱两个页签
export function SongScoreView({
	historyStates,
	setHistoryStates,
	currentDirectoryId,
	directoryName,
	selectedHistoryState,
	rootNote,
	enharmonic,
	onApplyFrame,
	onAddFrame,
	onExit,
	t
}) {
	const ts = t?.score ?? {};
	const [tab, setTab] = useState('text'); // 'text' | 'dynamic'
	const [meta, setMeta] = useState(() => readMeasureMeta());
	const [songMeta, setSongMeta] = useState(() => readSongMeta());
	const [editingChord, setEditingChord] = useState(null);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);
	const [cursorFrameId, setCursorFrameId] = useState(() => selectedHistoryState?.id ?? null);
	const sheetRef = useRef(null);

	const measures = useMemo(() => deriveMeasures(historyStates, currentDirectoryId), [historyStates, currentDirectoryId]);
	const flat = useMemo(() => flattenFrames(measures), [measures]);
	const cursorIndex = flat.findIndex(p => p.frame.id === cursorFrameId);
	const cursor = cursorIndex >= 0 ? flat[cursorIndex] : null;
	const stage = cursor || flat[0] || null;
	const prev = cursorIndex > 0 ? flat[cursorIndex - 1] : null;

	// 歌曲级设置（BPM/拍号/小调），按目录存
	const song = songMeta[currentDirectoryId] || {};
	const songPatch = (patch) => setSongMeta(prevMeta => {
		const next = { ...prevMeta, [currentDirectoryId]: { ...(prevMeta[currentDirectoryId] || {}), ...patch } };
		try { localStorage.setItem(SONG_META_KEY, JSON.stringify(next)); } catch (e) { /* 忽略 */ }
		return next;
	});
	const bpm = song.bpm ?? 70;
	const beatsPerBar = song.beatsPerBar ?? 4;
	const isMinor = song.isMinor ?? false;

	const updateMeta = (measureId, patch) => {
		setMeta(prev => {
			const next = { ...prev, [measureId]: { ...(prev[measureId] || {}), ...patch } };
			writeMeasureMeta(next);
			return next;
		});
	};

	// 播放推进
	useEffect(() => {
		if (!playing || !stage) return;
		const timer = setTimeout(() => {
			const next = flat[cursorIndex + 1];
			if (next) setCursorFrameId(next.frame.id);
			else setPlaying(false);
		}, 900 / speed);
		return () => clearTimeout(timer);
	}, [playing, stage, cursorIndex, flat, speed]);

	// 播放时滚动跟随
	useEffect(() => {
		if (!playing || !cursor) return;
		const card = sheetRef.current?.querySelector(`[data-frame="${cursor.frame.id}"]`);
		card?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
	}, [cursor, playing]);

	const cycleTechnique = (frame) => {
		const cycle = [null, 'sl', 'h', 'p'];
		setHistoryStates(prevStates => prevStates.map(x => (x.id === frame.id
			? { ...x, enterTechnique: cycle[(cycle.indexOf(x.enterTechnique || null) + 1) % cycle.length] || undefined }
			: x)));
	};

	const moveFrame = (frameId, dir) => {
		setHistoryStates(prevStates => {
			const chrono = prevStates.slice().reverse();
			const i = chrono.findIndex(x => x.id === frameId);
			const j = i + dir;
			if (i === -1 || j < 0 || j >= chrono.length) return prevStates;
			if (chrono[j].measureId !== chrono[i].measureId) return prevStates;
			const a = prevStates.findIndex(x => x.id === frameId);
			const b = prevStates.findIndex(x => x.id === chrono[j].id);
			const arr = prevStates.slice();
			[arr[a], arr[b]] = [arr[b], arr[a]];
			return arr;
		});
	};

	const deleteFrame = (frameId) => setHistoryStates(prevStates => prevStates.filter(x => x.id !== frameId));

	const keyName = rootNote !== null && rootNote !== undefined
		? (NOTE_NAMES_FLAT[enharmonic] || NOTE_NAMES_FLAT)[rootNote] ?? String(rootNote)
		: 'C';

	const exportSheet = (format) => {
		window.__exportFormat = format;
		exportSheetImage({ timelineEl: sheetRef.current, measures, meta, rootNote, isMinor, enharmonic, directoryName, t: ts });
	};

	if (!measures.length) {
		return (
			<div className="sc-page">
				<div className="sc-header"><button className="button" onClick={onExit}>← {ts.back ?? 'Back'}</button></div>
				<div className="sc-empty">{ts.emptyHint ?? 'No measures yet. Press Ctrl+S in the editor.'}</div>
			</div>
		);
	}

	// 小节卡（文本谱用）
	const measureCard = (measure, m) => {
		const m0 = meta[measure.id] || {};
		const chordInfo = chordDisplay(m0.chord, rootNote, isMinor, enharmonic);
		return (
			<section className="sc-measure" key={measure.id}>
				<div className="sc-measure-head">
					<span className="sc-no">{m + 1}</span>
					{editingChord === measure.id ? (
						<input
							className="sc-chord-input"
							autoFocus
							defaultValue={m0.chord || ''}
							placeholder="1 / 6m / Am"
							onBlur={e => { updateMeta(measure.id, { chord: e.target.value.trim() }); setEditingChord(null); }}
							onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
						/>
					) : (
						<button className="sc-chord" title={ts.chordTitle ?? 'Chord'} onClick={() => setEditingChord(measure.id)}>
							{chordInfo.text || (ts.chordPlaceholder ?? '+')}
						</button>
					)}
					<button className="sc-add" title={ts.addFrameTitle ?? 'Append editor state as new frame'} onClick={() => onAddFrame(measure.id)}>＋</button>
				</div>
				<div className="sc-frames" data-measure={measure.id}>
					{measure.frames.map((frame, f) => (
						<div
							key={frame.id}
							data-frame={frame.id}
							className={`score-mini ${tab === 'dynamic' && stage?.frame.id === frame.id ? 'active' : ''}`}
							onClick={() => { setCursorFrameId(frame.id); setPlaying(false); if (tab === 'text') { onApplyFrame(frame); } }}
							title={tab === 'text' ? (ts.editFrame ?? 'Edit this frame') : (ts.jumpTo ?? 'Jump')}
						>
							<div className="score-mini-board">
								<ScoreBoard snapshot={frame} />
								<span className="score-mini-index">{f + 1}</span>
								{f > 0 && (
									<button
										className={`score-mini-tech ${frame.enterTechnique ? 'on' : ''}`}
										title={ts.techTitle ?? 'none/sl/h/p'}
										onClick={e => { e.stopPropagation(); cycleTechnique(frame); }}
									>
										{frame.enterTechnique || '·'}
									</button>
								)}
							</div>
							<div className="score-mini-bar" onClick={e => e.stopPropagation()}>
								<button title={ts.moveEarlier ?? 'Earlier'} onClick={() => moveFrame(frame.id, -1)}>◀</button>
								<button title={ts.moveLater ?? 'Later'} onClick={() => moveFrame(frame.id, 1)}>▶</button>
								<button className="score-mini-del" title={ts.deleteFrame ?? 'Delete'} onClick={() => deleteFrame(frame.id)}>×</button>
							</div>
						</div>
					))}
				</div>
				<div className="sc-fields">
					<input className="sc-field" defaultValue={m0.jianpu || ''} placeholder={ts.jianpuPlaceholder ?? '1 2 3 5'}
						onBlur={e => updateMeta(measure.id, { jianpu: e.target.value })} />
					<input className="sc-field" defaultValue={m0.lyrics || ''} placeholder={ts.lyricsPlaceholder ?? '歌词'}
						onBlur={e => updateMeta(measure.id, { lyrics: e.target.value })} />
				</div>
			</section>
		);
	};

	return (
		<div className="sc-page">
			{/* 谱头（8pu 式）：返回 | 歌名 | 1=C 4/4 ♩=70 | 页签 | 导出 */}
			<header className="sc-header">
				<button className="button sc-back" onClick={onExit}>← {ts.back ?? 'Back'}</button>
				<h1 className="sc-title">{directoryName || ts.untitled || 'Untitled'}</h1>
				<div className="sc-song-meta">
					<label>1 = <select value={rootNote ?? 0} disabled><option>{keyName}</option></select></label>
					<label><select className="sc-beats" value={beatsPerBar} onChange={e => songPatch({ beatsPerBar: parseInt(e.target.value, 10) })}>
						{[2, 3, 4, 6].map(b => <option key={b} value={b}>{b}/4</option>)}
					</select></label>
					<label className="sc-bpm">♩=
						<input type="number" min="30" max="240" value={bpm}
							onChange={e => songPatch({ bpm: parseInt(e.target.value, 10) || 70 })} />
					</label>
					<label className="sc-minor">
						<input type="checkbox" checked={isMinor} onChange={e => songPatch({ isMinor: e.target.checked })} />
						{ts.minor ?? 'm'}
					</label>
				</div>
				<div className="sc-tabs">
					<button className={`sc-tab ${tab === 'text' ? 'on' : ''}`} onClick={() => { setTab('text'); setPlaying(false); }}>{ts.tabText ?? '文本谱'}</button>
					<button className={`sc-tab ${tab === 'dynamic' ? 'on' : ''}`} onClick={() => setTab('dynamic')}>{ts.tabDynamic ?? '动态谱'}</button>
				</div>
				<div className="sc-actions">
					<button className="button" onClick={() => exportSheet('svg')}>{ts.exportSvg ?? 'SVG'}</button>
					<button className="button" onClick={() => exportSheet('png')}>{ts.exportPng ?? 'PNG'}</button>
				</div>
			</header>

			{tab === 'text' && (
				<div className="sc-sheet" ref={sheetRef}>
					{measures.map(measureCard)}
				</div>
			)}

			{tab === 'dynamic' && (
				<div className="sc-dynamic">
					<div className="sc-stage-wrap">
						<div className="sc-stage">
							{stage && <ScoreBoard snapshot={stage.frame} className="sc-stage-board" />}
							{stage && prev && (
								<TransitionFx
									prevState={prev.frame.state}
									nextState={stage.frame.state}
									technique={stage.frame.enterTechnique}
									durationMs={Math.round(450 / speed)}
								/>
							)}
						</div>
						<div className="sc-stage-info">
							<span>{(ts.measureLabel ?? ((n) => `M${n}`))(cursorIndex + 1)} · {(ts.frameLabel ?? ((a, b) => `${a}/${b}`))((cursor?.f ?? 0) + 1, cursor?.measure.frames.length ?? 1)}</span>
							<button className="button" onClick={() => onApplyFrame(stage.frame)}>✎ {ts.editFrame ?? 'Edit'}</button>
						</div>
					</div>

					<div className="sc-timeline">
						<div className="sc-tl-controls">
							<button className={`sc-tl-play ${playing ? 'on' : ''}`} onClick={() => {
								if (playing) { setPlaying(false); return; }
								const startIdx = flat.findIndex(p => p.frame.id === (cursorFrameId ?? selectedHistoryState?.id));
								const entry = startIdx >= 0 && startIdx < flat.length - 1 ? flat[startIdx] : flat[0];
								if (entry) { setCursorFrameId(entry.frame.id); setPlaying(true); }
							}}>{playing ? '⏹' : '▶'}</button>
							<select value={speed} onChange={e => setSpeed(parseFloat(e.target.value))}>
								<option value={0.5}>0.5×</option>
								<option value={1}>1×</option>
								<option value={2}>2×</option>
							</select>
						</div>
						<div className="sc-tl-strip" ref={sheetRef}>
							{measures.map((measure, m) => {
								const m0 = meta[measure.id] || {};
								const chordInfo = chordDisplay(m0.chord, rootNote, isMinor, enharmonic);
								return (
									<div key={measure.id} className={`sc-tl-measure ${cursor?.measure.id === measure.id ? 'current' : ''}`}>
										<div className="sc-tl-label"><b>{m + 1}</b>{chordInfo.primary || ''}</div>
										{measure.frames.map((frame, f) => (
											<div
												key={frame.id}
												data-frame={frame.id}
												className={`sc-tl-frame ${stage?.frame.id === frame.id ? 'active' : ''}`}
												onClick={() => { setCursorFrameId(frame.id); setPlaying(false); }}
												title={`帧 ${f + 1}`}
											>
												<ScoreBoard snapshot={frame} />
											</div>
										))}
									</div>
								);
							})}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
