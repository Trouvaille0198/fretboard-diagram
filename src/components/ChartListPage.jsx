import React, { useEffect, useRef, useState } from "react";
import { useLanguage, fmt, zh } from "../i18n";
import { ChartListPanel } from "./ChartListPanel";
import { loadCharts, saveChart, saveCharts, deleteChart, createSong } from "../utils/chordChartModel";
import { packChart, packChartsBundle, unpackChartBundle, unpackChartsBundle, isChartPack, isChartsBundle } from "../utils/chartPack";
import { importMusicXml } from "../utils/musicxmlChart";
import { saveClip } from "../utils/clipModel";
import { trashList, trashPullCloud, trashRestoreCloud, trashPurgeCloud, trashClear, trashRemove, trashDaysLeft, TRASH_TTL_DAYS } from "../utils/trashModel";
import { authUser } from "../utils/authModel";
import { Toast } from "./Toast";

// 曲目列表页（#/chords）：顶上「和弦谱 · 和弦谱」tab 的落地面——先看库，点进某首才进编辑页。
// 与编辑页的约定：进入某首 = location.hash = '#/chords?id=<id>'。
export function ChartListPage() {
	const { t } = useLanguage();
	const ts = t?.chords ?? zh.chords;
	const [charts, setCharts] = useState(() => loadCharts());
	const [dialog, setDialog] = useState(null); // {type:'prompt'|'confirm'|'alert', ...} 应用内对话框
	const dialogInputRef = useRef(null);
	const fileRef = useRef(null);
	const [toast, setToast] = useState(null);
	const showToast = (msg) => setToast({ msg, key: Date.now() });
	const [trashOpen, setTrashOpen] = useState(false);
	const [trashItems, setTrashItems] = useState([]);

	// 回收站：打开时先读本地，登录用户再拉云端合并（云端是权威副本）
	const openTrash = async () => {
		setTrashOpen(true);
		setTrashItems(trashList());
		try { if (authUser()) setTrashItems(await trashPullCloud()); } catch (e) { /* 云端不可达：本地这份也能用 */ }
	};
	// 还原：云端先写回（清墓碑，否则本地的重新保存会被拦），再落本地
	const restoreTrashItem = async (entry) => {
		try { if (authUser()) await trashRestoreCloud(entry.tbl, entry.id); } catch (e) { /* 云端失败：本地照样还原 */ }
		if (entry.tbl === "charts") saveChart(entry.item);
		else saveClip(entry.item);
		trashRemove(entry.tbl, entry.id);
		setTrashItems(trashList());
		refresh();
		showToast(fmt(ts.trashRestored, { n: entry.name || "" }));
	};
	// 永久删除单条（已在回收站，无需再确认）
	const purgeTrashItem = async (entry) => {
		try { if (authUser()) await trashPurgeCloud(entry.tbl, entry.id); } catch (e) { /* 云端失败：仅清本地 */ }
		trashRemove(entry.tbl, entry.id);
		setTrashItems(trashList());
	};
	// 清空（有确认弹窗，见 dialog confirm）
	const clearTrash = async () => {
		for (const entry of trashItems) {
			try { if (authUser()) await trashPurgeCloud(entry.tbl, entry.id); } catch (e) { /* 尽力而为 */ }
		}
		trashClear();
		setTrashItems([]);
		showToast(ts.trashCleared);
	};

	const enter = (id) => { window.location.hash = '#/chords?id=' + id; };
	const refresh = () => setCharts(loadCharts());

	// 登录后云端并入完成（fretboard:charts-synced）→ 刷新列表
	useEffect(() => {
		const onSync = () => refresh();
		window.addEventListener("fretboard:charts-synced", onSync);
		return () => window.removeEventListener("fretboard:charts-synced", onSync);
	}, []);

	// 本机存储写满（persistCharts 广播）：导入/编辑都要让人知道"没存上"，而不是刷新后凭空消失
	useEffect(() => {
		const onFull = () => showToast(ts.storageFull);
		window.addEventListener("fretboard:storage-full", onFull);
		return () => window.removeEventListener("fretboard:storage-full", onFull);
	}, []);

	// 从编辑页返回时，编辑器的最后一刻冲刷可能刚写完 localStorage：本页初始 state 读到的还是旧值，
	// 挂载后再读一次（编辑器卸载冲刷发生在本页挂载之后，见 ChordChartView 的 hashchange 冲刷）
	useEffect(() => {
		refresh();
	}, []);

	const newSong = () => {
		const base = ts.newSong;
		const used = charts.filter(c => (c.name || "").startsWith(base)).length;
		const saved = saveChart(createSong(used ? `${base} ${used + 1}` : base));
		enter(saved.id);
	};

	const renameChart = (id, name) => {
		const src = charts.find(c => c.id === id);
		if (!src) return;
		saveChart({ ...src, name });
		refresh();
	};

	const duplicateChart = (id) => {
		const src = charts.find(c => c.id === id);
		if (!src) return;
		const copy = JSON.parse(JSON.stringify(src));
		const sn = createSong(`${src.name || ts.untitled} ${ts.copySuffix}`);
		saveChart({ ...copy, id: sn.id, createdAt: Date.now() });
		refresh();
		showToast(fmt(ts.duplicated, { n: sn.name }));
	};

	const removeChartById = (id) => {
		const target = charts.find(c => c.id === id);
		if (!target) return;
		setDialog({
			type: "confirm",
			title: ts.delSong,
			text: fmt(ts.delConfirmOne, { n: target.name || "" }),
			onOk: () => {
				deleteChart(id);
				refresh();
				showToast(fmt(ts.deleted, { n: target.name || "" }));
			}
		});
	};

	const exportChartById = (id) => {
		const target = charts.find(c => c.id === id);
		if (!target) return;
		const blob = new Blob([packChart(target)], { type: "text/plain;charset=utf-8" });
		const name = `${target.name || "chord-chart"}.fbchart`;
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = name;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
		showToast(fmt(ts.exportedOne, { n: target.name || "" }));
	};

	// —— 批量操作（列表页勾选）：勾选状态在本页，面板只负责画勾选框和操作条 ——
	// 勾选框不常驻：点「批量管理」进入勾选模式，退出即收起
	const [sel, setSel] = useState(() => new Set());
	const [selMode, setSelMode] = useState(false);
	const toggleSelMode = () => { setSelMode(v => { if (v) setSel(new Set()); return !v; }); };
	const toggleSel = (id, on) => setSel(prev => {
		const next = new Set(prev);
		if (on) next.add(id); else next.delete(id);
		return next;
	});
	const selectAll = () => setSel(new Set(charts.map(c => c.id)));
	const clearSel = () => setSel(new Set());

	const removeCharts = () => {
		const ids = charts.filter(c => sel.has(c.id));
		if (!ids.length) return;
		setDialog({
			type: "confirm",
			title: ts.batchDel,
			text: fmt(ts.batchDelConfirm, { n: ids.length }),
			onOk: () => {
				ids.forEach(c => deleteChart(c.id));
				setSel(new Set());
				refresh();
				showToast(fmt(ts.batchDeleted, { n: ids.length }));
			}
		});
	};

	const exportCharts = () => {
		const targets = charts.filter(c => sel.has(c.id));
		if (!targets.length) return;
		const blob = new Blob([packChartsBundle(targets)], { type: "application/json;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = fmt(ts.batchFilename, { n: targets.length });
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
		showToast(fmt(ts.batchExported, { n: targets.length }));
	};

	// 导入完成后的公共路径：落盘（含内嵌动图）→ 进编辑页
	const adoptImported = (imported, clips) => {
		(clips || []).forEach(c => saveClip(c));
		const saved = saveChart(imported);
		refresh();
		enter(saved.id);
	};

	const importFile = (e) => {
		const file = e.target.files && e.target.files[0];
		e.target.value = "";
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = String(reader.result);
			try {
				if (isChartsBundle(text)) {
					// 批量工程包：整批一次落盘（逐首 saveChart 会把全库 JSON 写 N 遍，大库直接爆配额），留在列表页
					const items = unpackChartsBundle(text);
					items.forEach(({ clips }) => (clips || []).forEach(c => saveClip(c)));
					saveCharts(items.map(x => x.song));
					refresh();
					showToast(fmt(ts.importedN, { n: items.length }));
					return;
				}
				if (isChartPack(text)) {
					const { song: imported, clips } = unpackChartBundle(text);
					adoptImported(imported, clips);
					showToast(ts.importedPack);
					return;
				}
				const imported = importMusicXml(text, file.name.replace(/\.musicxml$|\.xml$/i, ""));
				if (!imported) throw new Error(ts.importFail);
				adoptImported(imported, []);
				setDialog({ type: "alert", title: ts.importTitle, text: ts.importXmlWarn });
			} catch (err) {
				setDialog({ type: "alert", title: ts.importTitle, text: `${ts.importFailShort}：${err.message}` });
			}
		};
		reader.readAsText(file);
	};

	const importCode = (code) => {
		try {
			const { song: imported, clips } = unpackChartBundle(code);
			adoptImported(imported, clips);
			showToast(ts.importedPack);
		} catch (err) {
			setDialog({ type: "alert", title: ts.importCode, text: err.message });
		}
	};

	const currentId = null; // 列表页没有"正在编辑"，进入即离开列表

		return (
			<div className="cc-page">
	
			<div className="cc-body cc-songs-page">
				<ChartListPanel variant="page" charts={charts} currentId={currentId} t={t}
					sel={sel} selMode={selMode} onToggleSelMode={toggleSelMode} onToggleSel={toggleSel} onSelectAll={selectAll} onClearSel={clearSel}
					onExportSel={exportCharts} onDeleteSel={removeCharts}
					onOpen={enter}
					onNew={newSong}
					onDuplicate={duplicateChart}
					onRename={renameChart}
					onDelete={removeChartById}
					onExport={exportChartById}
					onImport={() => fileRef.current?.click()}
					onTrash={openTrash}
					onImportCode={() => setDialog({
						type: "prompt", multiline: true,
						title: ts.importCode,
						label: ts.importCodePh,
						value: "",
						onOk: (v) => { const code = String(v || "").trim(); if (code) importCode(code); }
					})}
					onClose={() => { }} />
			</div>
			<input ref={fileRef} type="file" accept=".fbchart,.musicxml,.xml,.txt" style={{ display: "none" }} onChange={importFile} />
			{trashOpen ? (
				<div className="cc-modal-mask" onMouseDown={e => { if (e.target === e.currentTarget) setTrashOpen(false); }}>
					<div className="cc-modal cc-dialog cc-trash-modal">
						<div className="cc-modal-head">
							<span className="cc-modal-title">🗑 {ts.trashTitle}<small className="cc-modal-sub"> · {ts.trashSub(TRASH_TTL_DAYS)}</small></span>
							<button className="cc-modal-x" onClick={() => setTrashOpen(false)}>✕</button>
						</div>
						<div className="cc-modal-body">
							{trashItems.length === 0 ? (
								<div className="cc-trash-empty">{ts.trashEmpty}</div>
							) : (
								<div className="cc-trash-list">
									{trashItems.map(entry => (
										<div key={entry.tbl + "|" + entry.id} className="cc-trash-item">
											<span className={"cc-trash-kind " + entry.tbl}>{entry.tbl === "clips" ? ts.trashKindClip : ts.trashKindSong}</span>
											<span className="cc-trash-name">{entry.name || entry.item?.name || ts.untitled}</span>
											<span className="cc-trash-days">{ts.trashDaysLeft(trashDaysLeft(entry))}</span>
											<button className="button sm accent" onClick={() => restoreTrashItem(entry)}>{ts.trashRestore}</button>
											<button className="button sm danger" title={ts.trashPurge}
												onClick={() => purgeTrashItem(entry)}>✕</button>
										</div>
									))}
								</div>
							)}
						</div>
						<div className="cc-modal-foot">
							<button className="button sm" onClick={() => setTrashOpen(false)}>{ts.close}</button>
							{trashItems.length > 0 ? (
								<button className="button sm danger" onClick={() => {
									setDialog({
										type: "confirm",
										title: ts.trashClearAll,
										text: ts.trashClearConfirm,
										onOk: () => clearTrash()
									});
								}}>{ts.trashClearAll}</button>
							) : null}
						</div>
					</div>
				</div>
			) : null}
			{dialog ? (
				<div className="cc-modal-mask" onMouseDown={e => { if (e.target === e.currentTarget) setDialog(null); }}>
					<div className="cc-modal cc-dialog">
						<div className="cc-modal-head">
							<span className="cc-modal-title">{dialog.title}</span>
							<button className="cc-modal-x" onClick={() => setDialog(null)}>✕</button>
						</div>
						<div className="cc-modal-body">
							{dialog.type === "prompt" ? (
								dialog.multiline ? (
									<textarea ref={dialogInputRef} autoFocus className="cc-dialog-input cc-dialog-area" defaultValue={dialog.value || ""}
										rows={4} placeholder={dialog.label}
										onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setDialog(null); } }} />
								) : (
									<input ref={dialogInputRef} autoFocus className="cc-dialog-input" defaultValue={dialog.value || ""}
										placeholder={dialog.label}
										onKeyDown={e => {
											if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); dialog.onOk?.(e.target.value); setDialog(null); }
											if (e.key === "Escape") { e.stopPropagation(); setDialog(null); }
										}} />
								)
							) : <div className="cc-dialog-text">{dialog.text}</div>}
						</div>
						<div className="cc-modal-foot">
							{dialog.type !== "alert" ? <button className="button sm" onClick={() => setDialog(null)}>{ts.cancel}</button> : null}
							{dialog.type === "confirm" ? (
								<button className="button sm danger" onClick={() => { const d = dialog; d.onOk?.(); setDialog(cur => (cur === d ? null : cur)); }}>{ts.ok}</button>
							) : dialog.type !== "choose" ? (
								<button className="button sm accent" onClick={() => {
									const d = dialog;
									d.onOk?.(d.type === "prompt" ? (dialogInputRef.current ? dialogInputRef.current.value : "") : undefined);
									setDialog(cur => (cur === d ? null : cur));
								}}>{ts.ok}</button>
							) : null}
						</div>
					</div>
				</div>
			) : null}
			{toast ? <Toast key={toast.key} message={toast.msg} onClose={() => setToast(null)} /> : null}
		</div>
	);
}
