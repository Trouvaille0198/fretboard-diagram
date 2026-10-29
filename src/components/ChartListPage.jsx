import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n";
import { ChartListPanel } from "./ChartListPanel";
import { loadCharts, saveChart, deleteChart, createSong } from "../utils/chordChartModel";
import { packChart, unpackChartBundle, isChartPack } from "../utils/chartPack";
import { importMusicXml } from "../utils/musicxmlChart";
import { saveClip } from "../utils/clipModel";
import { trashList, trashPullCloud, trashRestoreCloud, trashPurgeCloud, trashClear, trashRemove, trashDaysLeft, TRASH_TTL_DAYS } from "../utils/trashModel";
import { authUser } from "../utils/authModel";
import { Toast } from "./Toast";

// 曲目列表页（#/chords）：顶上「和弦谱 · 和弦谱」tab 的落地面——先看库，点进某首才进编辑页。
// 与编辑页的约定：进入某首 = location.hash = '#/chords?id=<id>'。
export function ChartListPage() {
	const { t } = useLanguage();
	const ts = t?.chords ?? {};
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
		showToast((ts.trashRestored ?? "已还原「{n}」").replace("{n}", entry.name || ""));
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
		showToast(ts.trashCleared ?? "回收站已清空");
	};

	const enter = (id) => { window.location.hash = '#/chords?id=' + id; };
	const refresh = () => setCharts(loadCharts());

	// 登录后云端并入完成（fretboard:charts-synced）→ 刷新列表
	useEffect(() => {
		const onSync = () => refresh();
		window.addEventListener("fretboard:charts-synced", onSync);
		return () => window.removeEventListener("fretboard:charts-synced", onSync);
	}, []);

	// 从编辑页返回时，编辑器的最后一刻冲刷可能刚写完 localStorage：本页初始 state 读到的还是旧值，
	// 挂载后再读一次（编辑器卸载冲刷发生在本页挂载之后，见 ChordChartView 的 hashchange 冲刷）
	useEffect(() => {
		refresh();
	}, []);

	const newSong = () => {
		const base = ts.newSong ?? "新歌";
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
		const sn = createSong(`${src.name || "未命名"} ${ts.copySuffix ?? "副本"}`);
		saveChart({ ...copy, id: sn.id, createdAt: Date.now() });
		refresh();
		showToast((ts.duplicated ?? "已复制为「{n}」").replace("{n}", sn.name));
	};

	const removeChartById = (id) => {
		const target = charts.find(c => c.id === id);
		if (!target) return;
		setDialog({
			type: "confirm",
			title: ts.delSong ?? "删除这首歌",
			text: (ts.delConfirmOne ?? "删除「{n}」？（不可撤销）").replace("{n}", target.name || ""),
			onOk: () => {
				deleteChart(id);
				refresh();
				showToast((ts.deleted ?? "已删除「{n}」").replace("{n}", target.name || ""));
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
		showToast((ts.exportedOne ?? "已导出「{n}」").replace("{n}", target.name || ""));
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
				if (isChartPack(text)) {
					const { song: imported, clips } = unpackChartBundle(text);
					adoptImported(imported, clips);
					showToast(ts.importedPack ?? "已导入工程文件");
					return;
				}
				const imported = importMusicXml(text, file.name.replace(/\.musicxml$|\.xml$/i, ""));
				if (!imported) throw new Error(ts.importFail ?? "没解析出和弦骨架");
				adoptImported(imported, []);
				setDialog({ type: "alert", title: ts.importTitle ?? "导入", text: ts.importXmlWarn ?? "已导入 MusicXML。注意：配图、标色等应用私有内容 MusicXML 装不下。" });
			} catch (err) {
				setDialog({ type: "alert", title: ts.importTitle ?? "导入", text: (ts.importFailShort ?? "导入失败") + "：" + err.message });
			}
		};
		reader.readAsText(file);
	};

	const importCode = (code) => {
		try {
			const { song: imported, clips } = unpackChartBundle(code);
			adoptImported(imported, clips);
			showToast(ts.importedPack ?? "已导入工程文件");
		} catch (err) {
			setDialog({ type: "alert", title: ts.importCode ?? "从分享码导入", text: err.message });
		}
	};

	const currentId = null; // 列表页没有"正在编辑"，进入即离开列表

		return (
			<div className="cc-page">
	
			<div className="cc-body cc-songs-page">
				<ChartListPanel variant="page" charts={charts} currentId={currentId} t={t}
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
						title: ts.importCode ?? "从分享码导入",
						label: ts.importCodePh ?? "粘贴分享码（或直接粘贴工程文件内容）",
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
							<span className="cc-modal-title">🗑 {ts.trashTitle ?? "回收站"}<small className="cc-modal-sub"> · {ts.trashSub ? ts.trashSub(TRASH_TTL_DAYS) : `删除后保留 ${TRASH_TTL_DAYS} 天`}</small></span>
							<button className="cc-modal-x" onClick={() => setTrashOpen(false)}>✕</button>
						</div>
						<div className="cc-modal-body">
							{trashItems.length === 0 ? (
								<div className="cc-trash-empty">{ts.trashEmpty ?? "回收站是空的"}</div>
							) : (
								<div className="cc-trash-list">
									{trashItems.map(entry => (
										<div key={entry.tbl + "|" + entry.id} className="cc-trash-item">
											<span className={"cc-trash-kind " + entry.tbl}>{entry.tbl === "clips" ? (ts.trashKindClip ?? "动图") : (ts.trashKindSong ?? "曲目")}</span>
											<span className="cc-trash-name">{entry.name || entry.item?.name || "(未命名)"}</span>
											<span className="cc-trash-days">{ts.trashDaysLeft ? ts.trashDaysLeft(trashDaysLeft(entry)) : `${trashDaysLeft(entry)} 天后删除`}</span>
											<button className="button sm accent" onClick={() => restoreTrashItem(entry)}>{ts.trashRestore ?? "还原"}</button>
											<button className="button sm danger" title={ts.trashPurge ?? "永久删除"}
												onClick={() => purgeTrashItem(entry)}>✕</button>
										</div>
									))}
								</div>
							)}
						</div>
						<div className="cc-modal-foot">
							<button className="button sm" onClick={() => setTrashOpen(false)}>{ts.close ?? "关闭"}</button>
							{trashItems.length > 0 ? (
								<button className="button sm danger" onClick={() => {
									setDialog({
										type: "confirm",
										title: ts.trashClearAll ?? "清空回收站",
										text: ts.trashClearConfirm ?? "永久删除回收站里的全部条目？（不可还原）",
										onOk: () => clearTrash()
									});
								}}>{ts.trashClearAll ?? "清空回收站"}</button>
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
							{dialog.type !== "alert" ? <button className="button sm" onClick={() => setDialog(null)}>{ts.cancel ?? "取消"}</button> : null}
							{dialog.type === "confirm" ? (
								<button className="button sm danger" onClick={() => { const d = dialog; d.onOk?.(); setDialog(cur => (cur === d ? null : cur)); }}>{ts.ok ?? "确定"}</button>
							) : dialog.type !== "choose" ? (
								<button className="button sm accent" onClick={() => {
									const d = dialog;
									d.onOk?.(d.type === "prompt" ? (dialogInputRef.current ? dialogInputRef.current.value : "") : undefined);
									setDialog(cur => (cur === d ? null : cur));
								}}>{ts.ok ?? "确定"}</button>
							) : null}
						</div>
					</div>
				</div>
			) : null}
			{toast ? <Toast key={toast.key} message={toast.msg} onClose={() => setToast(null)} /> : null}
		</div>
	);
}
