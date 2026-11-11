import React, { useMemo, useState } from "react";
import { fmt, zh } from "../i18n";

// 曲目面板：一处看全部谱子（名称/调/拍号/速度/小节数/更新时间），并就地新建、重命名、复制、删除、导入导出。
// 之前这些只能挤在工具行「⋯」菜单里的一个 <select>，且预览态不可用——所以看起来像"没有曲目列表"。
export function ChartListPanel({ charts, currentId, onOpen, onNew, onDuplicate, onDelete, onRename, onImport, onImportCode, onExport, onTrash, onClose, t, variant,
	sel, selMode, onToggleSelMode, onToggleSel, onSelectAll, onClearSel, onExportSel, onDeleteSel }) {
	const ts = t?.chords ?? zh.chords;
	const [q, setQ] = useState("");
	const [editingId, setEditingId] = useState(null);
	const [draft, setDraft] = useState("");

	const PC_KEY = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
	const relTime = (ts0) => {
		if (!ts0) return ts.never;
		const d = Date.now() - ts0;
		if (d < 60000) return ts.justNow;
		if (d < 3600000) return `${Math.floor(d / 60000)} ${ts.minAgo}`;
		if (d < 86400000) return `${Math.floor(d / 3600000)} ${ts.hourAgo}`;
		const days = Math.floor(d / 86400000);
		if (days < 30) return `${days} ${ts.dayAgo}`;
		return new Date(ts0).toLocaleDateString();
	};

	// 最近改动的排前面：列表本身要能当"我最近在写什么"用
	const list = useMemo(() => {
		const arr = [...charts].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
		const kw = q.trim().toLowerCase();
		return kw ? arr.filter(c => (c.name || "").toLowerCase().includes(kw)) : arr;
	}, [charts, q]);

	const commitRename = (id) => {
		const v = draft.trim();
		if (v) onRename(id, v);
		setEditingId(null);
	};

	const page = variant === "page";
	return (
		<div className={page ? "cc-songs-page-box" : "cc-modal-mask"} onMouseDown={e => { if (!page && e.target === e.currentTarget) onClose(); }}>
			<div className={page ? "cc-songs-page-box-inner" : "cc-modal cc-songs"}>
				<div className="cc-modal-head">
					<span className="cc-modal-title">{ts.songsTitle}<small className="cc-modal-sub"> · {charts.length} {ts.songsUnit}</small></span>
					{page ? null : <button className="cc-modal-x" onClick={onClose}>✕</button>}
				</div>
				<div className="cc-modal-body">
					<div className="cc-songs-actions">
						<button className="button sm accent" onClick={onNew}>＋ {ts.newSong}</button>
						<button className="button sm" onClick={onImport}>⇪ {ts.importBtn}</button>
						<button className="button sm" onClick={onImportCode}>{ts.importCode}</button>
						{onTrash ? <button className="button sm" onClick={onTrash} title={ts.trashTip}>🗑 {ts.trashBtn}</button> : null}
						{/* 勾选框不常驻：点「批量管理」进入勾选模式，行首才出现勾选框（退出即收） */}
						{page && onToggleSel ? (
							<button className={`button sm${selMode ? " accent" : ""}`} onClick={onToggleSelMode}
								title={ts.batchModeTip}>
								{selMode ? ts.exitBatch : ts.batchMode}
							</button>
						) : null}
						<span className="cc-flex" />
						<input className="cc-songs-search" value={q} onChange={e => setQ(e.target.value)} placeholder={ts.searchPh} />
					</div>

					{list.length === 0 ? (
						<div className="cc-songs-empty">
							{charts.length === 0 ? ts.noSongs : ts.noMatch}
						</div>
					) : (
						<>
							{/* 批量操作条：勾选模式期间常驻（0 首时也可全选）；批量导出/删除至少勾一首才可用 */}
							{page && selMode ? (
								<div className="cc-songs-batch">
									<span className="cc-songs-batch-n">{fmt(ts.selectedN, { n: sel ? sel.size : 0 })}</span>
									<button className="button sm" onClick={onSelectAll}>{ts.selectAll}</button>
									<button className="button sm" onClick={onClearSel}>{ts.clearSel}</button>
									<span className="cc-flex" />
									<button className="button sm accent" disabled={!sel || !sel.size} onClick={onExportSel}>⇩ {ts.batchExport}</button>
									<button className="button sm danger" disabled={!sel || !sel.size} onClick={onDeleteSel}>{ts.batchDel}</button>
								</div>
							) : null}
							<div className="cc-songs-list">
								{list.map(c => {
									const cur = c.id === currentId;
									const n = (c.measures || []).length;
									const chords = (c.measures || []).reduce((a, m) => a + (m.slots || []).reduce((b, sl) => b + (sl.split ? sl.split.filter(u => u.kind === "chord").length : (sl.kind === "chord" ? 1 : 0)), 0), 0);
									return (
									<div key={c.id} className={`cc-song-row ${cur ? "cur" : ""} ${selMode && sel?.has(c.id) ? "checked" : ""}`}
										onClick={() => {
											if (editingId === c.id) return;
											// 勾选模式下点行 = 切换勾选（不误进曲子）；正常模式点行 = 打开
											if (selMode) onToggleSel(c.id, !sel?.has(c.id));
											else onOpen(c.id);
										}}>
										{page && selMode ? (
											<input type="checkbox" className="cc-song-check" title={ts.checkTip}
												checked={sel?.has(c.id) || false}
												onClick={e => e.stopPropagation()}
												onChange={e => onToggleSel(c.id, e.target.checked)} />
										) : null}
											<div className="cc-song-main">
											{editingId === c.id ? (
												<input autoFocus className="cc-song-rename" value={draft}
													onChange={e => setDraft(e.target.value)}
													onClick={e => e.stopPropagation()}
													onBlur={() => commitRename(c.id)}
													onKeyDown={e => {
														if (e.key === "Enter") { e.preventDefault(); commitRename(c.id); }
														if (e.key === "Escape") { e.preventDefault(); setEditingId(null); }
													}} />
											) : (
												<div className="cc-song-name" title={ts.renameTip}
													onDoubleClick={e => { e.stopPropagation(); setEditingId(c.id); setDraft(c.name || ""); }}>
													{c.name || ts.untitled}
													{cur ? <span className="cc-song-cur">{ts.current}</span> : null}
												</div>
											)}
											<div className="cc-song-meta">
												<span>1 = {PC_KEY[c.key?.root ?? 0]}{c.key?.minor ? "m" : ""}</span>
												<span>{c.timeSig ?? 4}/4</span>
												<span>♩={c.bpm ?? 72}</span>
												<span>{fmt(ts.measuresUnit, { n })}</span>
												<span>{chords} {ts.chordsUnit}</span>
												<span className="cc-song-time">{relTime(c.updatedAt)}</span>
											</div>
										</div>
										<div className="cc-song-btns" onClick={e => e.stopPropagation()}>
											<button className="button sm" title={ts.rename}
												onClick={() => { setEditingId(c.id); setDraft(c.name || ""); }}>✎</button>
											<button className="button sm" title={ts.duplicate}
												onClick={() => onDuplicate(c.id)}>⧉</button>
											<button className="button sm" title={ts.exportOne}
												onClick={() => onExport(c.id)}>⇩</button>
											<button className="button sm danger" title={ts.delSong}
												onClick={() => onDelete(c.id)}>✕</button>
										</div>
									</div>
									);
								})}
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}