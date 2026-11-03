import React, { useMemo, useState } from "react";

// 曲目面板：一处看全部谱子（名称/调/拍号/速度/小节数/更新时间），并就地新建、重命名、复制、删除、导入导出。
// 之前这些只能挤在工具行「⋯」菜单里的一个 <select>，且预览态不可用——所以看起来像"没有曲目列表"。
export function ChartListPanel({ charts, currentId, onOpen, onNew, onDuplicate, onDelete, onRename, onImport, onImportCode, onExport, onTrash, onClose, t, variant,
	sel, selMode, onToggleSelMode, onToggleSel, onSelectAll, onClearSel, onExportSel, onDeleteSel }) {
	const ts = t?.chords ?? {};
	const [q, setQ] = useState("");
	const [editingId, setEditingId] = useState(null);
	const [draft, setDraft] = useState("");

	const PC_KEY = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
	const relTime = (ts0) => {
		if (!ts0) return ts.never ?? "未保存";
		const d = Date.now() - ts0;
		if (d < 60000) return ts.justNow ?? "刚刚";
		if (d < 3600000) return `${Math.floor(d / 60000)} ${ts.minAgo ?? "分钟前"}`;
		if (d < 86400000) return `${Math.floor(d / 3600000)} ${ts.hourAgo ?? "小时前"}`;
		const days = Math.floor(d / 86400000);
		if (days < 30) return `${days} ${ts.dayAgo ?? "天前"}`;
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
					<span className="cc-modal-title">{ts.songsTitle ?? "曲目"}<small className="cc-modal-sub"> · {charts.length} {ts.songsUnit ?? "首"}</small></span>
					{page ? null : <button className="cc-modal-x" onClick={onClose}>✕</button>}
				</div>
				<div className="cc-modal-body">
					<div className="cc-songs-actions">
						<button className="button sm accent" onClick={onNew}>＋ {ts.newSong ?? "新歌"}</button>
						<button className="button sm" onClick={onImport}>⇪ {ts.importBtn ?? "导入文件"}</button>
						<button className="button sm" onClick={onImportCode}>{ts.importCode ?? "从分享码导入"}</button>
						{onTrash ? <button className="button sm" onClick={onTrash} title={ts.trashTip ?? "删除的曲目在这里保留 10 天，可还原"}>🗑 {ts.trashBtn ?? "回收站"}</button> : null}
						{/* 勾选框不常驻：点「批量管理」进入勾选模式，行首才出现勾选框（退出即收） */}
						{page && onToggleSel ? (
							<button className={`button sm${selMode ? " accent" : ""}`} onClick={onToggleSelMode}
								title={ts.batchModeTip ?? "勾选多首后批量导出 / 批量删除"}>
								{selMode ? (ts.exitBatch ?? "✓ 退出勾选") : (ts.batchMode ?? "☑ 批量管理")}
							</button>
						) : null}
						<span className="cc-flex" />
						<input className="cc-songs-search" value={q} onChange={e => setQ(e.target.value)} placeholder={ts.searchPh ?? "搜索曲目名"} />
					</div>

					{list.length === 0 ? (
						<div className="cc-songs-empty">
							{charts.length === 0 ? (ts.noSongs ?? "还没有曲目，点「新歌」开始一首") : (ts.noMatch ?? "没有匹配的曲目")}
						</div>
					) : (
						<>
							{/* 批量操作条：勾选模式期间常驻（0 首时也可全选）；批量导出/删除至少勾一首才可用 */}
							{page && selMode ? (
								<div className="cc-songs-batch">
									<span className="cc-songs-batch-n">{(ts.selectedN ?? "已选 {n} 首").replace("{n}", String(sel ? sel.size : 0))}</span>
									<button className="button sm" onClick={onSelectAll}>{ts.selectAll ?? "全选"}</button>
									<button className="button sm" onClick={onClearSel}>{ts.clearSel ?? "清空"}</button>
									<span className="cc-flex" />
									<button className="button sm accent" disabled={!sel || !sel.size} onClick={onExportSel}>⇩ {ts.batchExport ?? "批量导出"}</button>
									<button className="button sm danger" disabled={!sel || !sel.size} onClick={onDeleteSel}>{ts.batchDel ?? "批量删除"}</button>
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
											<input type="checkbox" className="cc-song-check" title={ts.checkTip ?? "勾选后用上方批量操作"}
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
												<div className="cc-song-name" title={ts.renameTip ?? "双击重命名"}
													onDoubleClick={e => { e.stopPropagation(); setEditingId(c.id); setDraft(c.name || ""); }}>
													{c.name || (ts.untitled ?? "未命名")}
													{cur ? <span className="cc-song-cur">{ts.current ?? "正在编辑"}</span> : null}
												</div>
											)}
											<div className="cc-song-meta">
												<span>1 = {PC_KEY[c.key?.root ?? 0]}{c.key?.minor ? "m" : ""}</span>
												<span>{c.timeSig ?? 4}/4</span>
												<span>♩={c.bpm ?? 72}</span>
												<span>{(ts.measuresUnit ?? "{n} 小节").replace("{n}", String(n))}</span>
												<span>{chords} {ts.chordsUnit ?? "个和弦"}</span>
												<span className="cc-song-time">{relTime(c.updatedAt)}</span>
											</div>
										</div>
										<div className="cc-song-btns" onClick={e => e.stopPropagation()}>
											<button className="button sm" title={ts.rename ?? "重命名"}
												onClick={() => { setEditingId(c.id); setDraft(c.name || ""); }}>✎</button>
											<button className="button sm" title={ts.duplicate ?? "复制为新曲目"}
												onClick={() => onDuplicate(c.id)}>⧉</button>
											<button className="button sm" title={ts.exportOne ?? "导出这首的工程文件"}
												onClick={() => onExport(c.id)}>⇩</button>
											<button className="button sm danger" title={ts.delSong ?? "删除"}
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