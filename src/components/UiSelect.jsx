import { useEffect, useRef, useState } from "react";

// 统一的应用内下拉（替代原生 select）：原生 select 的弹出列表由浏览器绘制（白底），不跟深色主题，
// 与谱面里的自绘面板/菜单两套观感。这里做成「按钮 + 应用面板样式的选项列表」一个组件，全应用复用。
// 列表在原地展开（不走绝对定位）——小节工具行是 overflow-x 容器，绝对弹层会被裁。
// props:
//   value / options([{value,label}] 或原始值) / onChange(value)
//   disabled / title / ariaLabel / className(触发器附加类) / menuClassName(列表附加类)
//   children = 自定义触发器内容（默认「当前项 + ▾」）
//   menuAbsolute = 菜单绝对定位悬浮在触发器下方（默认原地展开——工具栏 overflow 容器里悬浮会被裁；
//                  但在转调选择器这类紧凑行里，原地展开会把兄弟组件挤开，用悬浮）
export function UiSelect({ value, options, onChange, disabled = false, title, ariaLabel, className = "", menuClassName = "", menuAbsolute = false, children }) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);
	const boxRef = useRef(null);
	const btnRef = useRef(null);
	const opts = (options || []).map(o => (typeof o === "object" && o !== null ? o : { value: o, label: String(o) }));
	const curIdx = opts.findIndex(o => o.value === value);
	const cur = curIdx >= 0 ? opts[curIdx] : null;

	useEffect(() => {
		if (!open) return;
		setActive(curIdx);
		const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [open, curIdx]);

	const close = () => { setOpen(false); btnRef.current?.focus(); };
	const commit = (i) => {
		const o = opts[i];
		if (!o) return;
		if (o.value !== value) onChange?.(o.value);
		close();
	};
	const onKey = (e) => {
		if (disabled) return;
		if (!open) {
			if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
			return;
		}
		if (e.key === "Escape") { e.preventDefault(); close(); return; }
		if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(opts.length - 1, (a < 0 ? curIdx : a) + 1)); return; }
		if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, (a < 0 ? curIdx : a) - 1)); return; }
		if (e.key === "Home") { e.preventDefault(); setActive(0); return; }
		if (e.key === "End") { e.preventDefault(); setActive(opts.length - 1); return; }
		if (e.key === "Enter" || e.key === " ") { e.preventDefault(); commit(active < 0 ? curIdx : active); return; }
		if (e.key === "Tab") setOpen(false);
	};

	return (
		<span className={`ui-select${open ? " open" : ""}${disabled ? " disabled" : ""}${menuAbsolute ? " menu-absolute" : ""}${className ? " " + className : ""}`} ref={boxRef}>
			<button ref={btnRef} type="button" className="ui-select-btn" title={title} aria-label={ariaLabel} aria-haspopup="listbox"
				aria-expanded={open} disabled={disabled} onClick={() => setOpen(v => !v)} onKeyDown={onKey}>
				{children ?? (<><span className="ui-select-label">{cur ? cur.label : ""}</span><i className="ui-select-arrow">▾</i></>)}
			</button>
			{open && !disabled ? (
				<span className={`ui-select-menu${menuClassName ? " " + menuClassName : ""}`} role="listbox">
					{opts.map((o, i) => (
						<button key={`${String(o.value)}-${i}`} type="button" role="option" aria-selected={o.value === value}
							className={`ui-select-item${o.value === value ? " on" : ""}${i === active ? " act" : ""}`}
							onMouseEnter={() => setActive(i)}
							onClick={() => commit(i)}>{o.label}</button>
					))}
				</span>
			) : null}
		</span>
	);
}