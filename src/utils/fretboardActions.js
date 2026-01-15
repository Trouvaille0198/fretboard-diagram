import { updateNote, inlineCSS } from "../utils";
import { LEVEL1_COLORS, LEVEL2_COLORS, getLevel2Color } from "../colorConfig";
import { CONSTS } from "../constants";

const LEVEL1_COLOR_ORDER = Object.keys(LEVEL1_COLORS);
const LEVEL2_COLOR_ORDER = Object.keys(LEVEL2_COLORS);

// 显示图片让用户手动复制的辅助函数
function showImageForManualCopy(img, dataUrl, setToastMessage, setToastType) {
	// 创建遮罩层
	const overlay = document.createElement("div");
	overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  `;

	// 创建图片容器
	const imgContainer = document.createElement("div");
	imgContainer.style.cssText = `
    position: relative;
    background: white;
    padding: 20px;
    border-radius: 8px;
    max-width: 90%;
    max-height: 90%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
  `;

	// 创建提示文字
	const hint = document.createElement("div");
	hint.style.cssText = `
    color: #333;
    font-size: 14px;
    text-align: center;
    padding: 10px;
  `;
	hint.textContent = '右键点击图片，选择"复制图片"，然后点击任意位置关闭';

	// 克隆图片
	const displayImg = img.cloneNode(true);
	displayImg.style.cssText =
		"max-width: 100%; max-height: 70vh; height: auto; cursor: pointer;";

	imgContainer.appendChild(displayImg);
	imgContainer.appendChild(hint);
	overlay.appendChild(imgContainer);
	document.body.appendChild(overlay);

	// 点击关闭
	overlay.addEventListener("click", (e) => {
		if (e.target === overlay || e.target === overlay) {
			document.body.removeChild(overlay);
		}
	});

	// 图片右键复制提示
	displayImg.addEventListener("contextmenu", (e) => {
		e.stopPropagation();
	});

	if (setToastMessage) {
		setToastMessage('请右键点击图片，选择"复制图片"');
		setToastType("info");
	}
}

export function selectColor(
	level,
	color,
	selectedColorLevel,
	selectedColor,
	setSelectedColorLevel,
	setSelectedColor,
	customColor = null
) {
	setSelectedColorLevel(level);
	// 如果有自定义颜色，存储为对象
	setSelectedColor(customColor ? { name: color, custom: customColor } : color);
}

export function cycleLevel1Color(
	selectedColorLevel,
	selectedColor,
	selectColor,
	generateTintVariants,
	getLevel1FillColor,
	inTintMode,
	direction = 1
) {
	// 获取实际的颜色名称
	const actualColorName =
		selectedColor && typeof selectedColor === "object"
			? selectedColor.name
			: selectedColor;

	if (selectedColorLevel === 1 && actualColorName) {
		// 如果在异色模式，在异色数组中循环
		if (inTintMode) {
			const tintVariants = generateTintVariants(
				getLevel1FillColor(actualColorName)
			);
			const currentCustom =
				typeof selectedColor === "object" ? selectedColor.custom : null;
			const currentIndex = currentCustom
				? tintVariants.indexOf(currentCustom)
				: -1;
			// direction: 1 表示正向，-1 表示反向
			const nextIndex =
				currentIndex === -1
					? direction > 0
						? 0
						: tintVariants.length - 1
					: (currentIndex + direction + tintVariants.length) %
					tintVariants.length;
			selectColor(1, actualColorName, tintVariants[nextIndex]);
		} else {
			// 否则切换到下一个主颜色
			const currentIndex = LEVEL1_COLOR_ORDER.indexOf(actualColorName);
			// direction: 1 表示正向，-1 表示反向
			const nextIndex =
				currentIndex === -1
					? direction > 0
						? 0
						: LEVEL1_COLOR_ORDER.length - 1
					: (currentIndex + direction + LEVEL1_COLOR_ORDER.length) %
					LEVEL1_COLOR_ORDER.length;
			selectColor(1, LEVEL1_COLOR_ORDER[nextIndex]);
		}
	} else {
		// 如果未选中或选中其他层级，选择第一个颜色（正向）或最后一个颜色（反向）
		const index = direction > 0 ? 0 : LEVEL1_COLOR_ORDER.length - 1;
		selectColor(1, LEVEL1_COLOR_ORDER[index]);
	}
}

export function cycleLevel2Color(
	selectedColorLevel,
	selectedColor,
	selectColor,
	generateTintVariants,
	getLevel2Color,
	inTintMode,
	direction = 1
) {
	// 获取实际的颜色名称
	const actualColorName =
		selectedColor && typeof selectedColor === "object"
			? selectedColor.name
			: selectedColor;

	if (selectedColorLevel === 2 && actualColorName) {
		// 如果在异色模式，在异色数组中循环
		if (inTintMode) {
			const tintVariants = generateTintVariants(
				getLevel2Color(actualColorName)
			);
			const currentCustom =
				typeof selectedColor === "object" ? selectedColor.custom : null;
			const currentIndex = currentCustom
				? tintVariants.indexOf(currentCustom)
				: -1;
			// direction: 1 表示正向，-1 表示反向
			const nextIndex =
				currentIndex === -1
					? direction > 0
						? 0
						: tintVariants.length - 1
					: (currentIndex + direction + tintVariants.length) %
					tintVariants.length;
			selectColor(2, actualColorName, tintVariants[nextIndex]);
		} else {
			// 否则切换到下一个主颜色
			const currentIndex = LEVEL2_COLOR_ORDER.indexOf(actualColorName);
			// direction: 1 表示正向，-1 表示反向
			const nextIndex =
				currentIndex === -1
					? direction > 0
						? 0
						: LEVEL2_COLOR_ORDER.length - 1
					: (currentIndex + direction + LEVEL2_COLOR_ORDER.length) %
					LEVEL2_COLOR_ORDER.length;
			selectColor(2, LEVEL2_COLOR_ORDER[nextIndex]);
		}
	} else {
		// 如果未选中或选中其他层级，选择第一个颜色（正向）或最后一个颜色（反向）
		const index = direction > 0 ? 0 : LEVEL2_COLOR_ORDER.length - 1;
		selectColor(2, LEVEL2_COLOR_ORDER[index]);
	}
}

export function toggleVisibility(
	visibility,
	setVisibility,
	notesElementRef,
	data,
	updateNote
) {
	const newVisibility = visibility === "hidden" ? "transparent" : "hidden";
	setVisibility(newVisibility);

	if (notesElementRef.current) {
		for (const note of notesElementRef.current.children) {
			const noteId = note.id;
			const noteData = data[noteId] || {};
			const currentVisibility = noteData.visibility;

			// 只更新非visible和selected的note
			if (currentVisibility !== "visible" && currentVisibility !== "selected") {
				updateNote(note, data, { visibility: newVisibility });
			}
		}
	}

	// 更新data中的visibility
	// 注意：这里需要返回新的data，但为了保持函数签名一致，我们通过setData在外部处理
}

export function toggleEnharmonic(enharmonic, setEnharmonic) {
	setEnharmonic((prev) => (prev + 1) % 2);
}

// 替换所有异色note为新颜色对应浓度的异色
export function replaceAllTintNotes(
	targetColorName,
	data,
	setData,
	notesElementRef,
	updateNote,
	generateTintVariants,
	getLevel1FillColor,
	getLevel2Color
) {
	if (!targetColorName || targetColorName === "trans") {
		return; // 不包括透明色
	}

	const targetBaseColor = getLevel1FillColor(targetColorName);
	const targetVariants = generateTintVariants(targetBaseColor);

	// 遍历所有note，找到异色note并替换
	const newData = { ...data };
	let hasChanges = false;

	for (const [noteId, noteData] of Object.entries(newData)) {
		if (noteId.startsWith("conn-")) continue; // 跳过连线数据

		const currentColor = noteData.color;
		const currentColor2 = noteData.color2;
		let updateColor = null;
		let updateColor2 = null;

		// 处理第一层颜色的异色
		if (
			currentColor &&
			typeof currentColor === "object" &&
			currentColor.custom
		) {
			const originalColorName = currentColor.name;
			const originalBaseColor = getLevel1FillColor(originalColorName);
			const originalVariants = generateTintVariants(originalBaseColor);

			// 找到当前异色在原色变体中的索引
			const currentTintValue = currentColor.custom;
			const tintIndex = originalVariants.findIndex(
				(variant) => variant === currentTintValue
			);

			if (tintIndex !== -1) {
				// 找到对应浓度的新颜色异色
				const newTintValue = targetVariants[tintIndex];
				updateColor = {
					name: targetColorName,
					custom: newTintValue,
				};
				hasChanges = true;
			}
		}

		// 处理第二层颜色的异色
		if (
			currentColor2 &&
			typeof currentColor2 === "object" &&
			currentColor2.custom
		) {
			const originalColor2Name = currentColor2.name;
			// 判断是第二层颜色还是第一层颜色
			let originalBaseColor;
			if (originalColor2Name in LEVEL2_COLORS) {
				// 是第二层颜色，使用 getLevel2Color
				originalBaseColor = getLevel2Color(originalColor2Name);
			} else {
				// 是第一层颜色，使用 getLevel1FillColor
				originalBaseColor = getLevel1FillColor(originalColor2Name);
			}
			const originalVariants = generateTintVariants(originalBaseColor);

			// 找到当前异色在原色变体中的索引
			const currentTintValue = currentColor2.custom;
			const tintIndex = originalVariants.findIndex(
				(variant) => variant === currentTintValue
			);

			if (tintIndex !== -1) {
				// 对于第二层颜色，也使用第一层颜色的异色变体（因为右键的是第一层颜色）
				const newTintValue = targetVariants[tintIndex];
				updateColor2 = {
					name: targetColorName,
					custom: newTintValue,
				};
				hasChanges = true;
			}
		}

		// 如果有更新，更新note数据
		if (updateColor || updateColor2) {
			const update = {};
			if (updateColor) update.color = updateColor;
			if (updateColor2) update.color2 = updateColor2;

			newData[noteId] = {
				...noteData,
				...update,
			};

			// 更新DOM元素
			if (notesElementRef.current) {
				const noteElement = notesElementRef.current.querySelector(`#${noteId}`);
				if (noteElement) {
					updateNote(noteElement, data, update);
				}
			}
		}
	}

	if (hasChanges) {
		setData(newData);
	}
}

export function reset(
	visibility,
	setData,
	setSelected,
	notesElementRef,
	data,
	updateNote,
	setStartFret,
	setEndFret,
	setDisplayMode,
	setRootNote,
	setEnharmonic
) {
	// 重置点的颜色、visibility和noteText，清除所有自定义设置
	setData((prevData) => {
		const newData = {};
		// 重置所有note的属性，清除noteText让系统根据displayMode重新生成
		Object.keys(prevData).forEach((key) => {
			if (key.startsWith("conn-")) {
				// 删除所有连线
				return;
			}
			const noteData = prevData[key];
			if (noteData && noteData.type === "note") {
				// 清除noteText，重置其他属性，让系统根据displayMode重新生成显示名称
				newData[key] = {
					type: "note",
					color: "white",
					color2: null,
					visibility: visibility,
				};
			}
		});
		return newData;
	});

	// 更新DOM中的note样式
	if (notesElementRef.current) {
		for (const note of notesElementRef.current.children) {
			updateNote(note, data, {
				type: "note",
				color: "white",
				color2: null,
				visibility: visibility,
			});
		}
	}
	setSelected(null);

	// 还原指板长度到默认值
	if (setStartFret) {
		setStartFret(0);
	}
	if (setEndFret) {
		// 还原为默认值 15
		setEndFret(15);
	}

	// displayMode 和 rootNote 保持不变，不重置
	// setDisplayMode 和 setRootNote 不调用，保持当前状态

	if (setEnharmonic) {
		setEnharmonic(1);
	}
}

export function saveSVG(
	selected,
	setSelected,
	data,
	updateNote,
	connectionToolbarVisible,
	setConnectionToolbarVisible,
	svgElementRef,
	inlineCSS,
	displayMode,
	rootNote,
	enharmonic,
	startFret,
	endFret,
	includeMarkers = true,
	copyOnly = false,
	showNotes = true,
	setToastMessage = null,
	setToastType = null,
	currentVisibility = "transparent",
	setVisibility = null,
	horizontalCrop = true,
	verticalCrop = true
) {
	// 直接导出，不再在这里处理 visibility 切换
	// 切换逻辑已经在 Fretboard.jsx 的 saveSVGMemo 中处理
	// 克隆 SVG 并移除不需要的元素
	const svgClone = svgElementRef.current.cloneNode(true);

	// 移除工具栏和编辑框
	const foreignObjects = svgClone.querySelectorAll("foreignObject");
	foreignObjects.forEach((fo) => {
		const toolbar = fo.querySelector(
			".connection-toolbar-container, .connection-toolbar"
		);
		const editableDiv = fo.querySelector("#editable-div");
		if (toolbar || editableDiv) {
			fo.remove();
		}
	});

	// 如果选中了 note，在克隆的 SVG 中将其设置为可见
	if (selected) {
		const selectedElement = svgClone.getElementById(selected.id);
		if (selectedElement) {
			selectedElement.classList.remove("hidden", "transparent");
			selectedElement.classList.add("visible");
			const circle = selectedElement.querySelector("circle");
			if (circle) {
				circle.style.opacity = "1";
			}
		}
	}

	// showNotes 控制：
	// true: 临时修改原始 DOM，让 inlineCSS 不删除 hidden 的 note
	// false: 执行 Toggle 切换（hidden ↔ transparent）
	const originalNotes = [];
	if (showNotes) {
		const originalSvg = document.getElementById("fretboard-svg");
		if (originalSvg) {
			const notes = originalSvg.querySelectorAll("g.note.hidden");
			notes.forEach((note) => {
				originalNotes.push({ note, wasHidden: true });
				note.classList.remove("hidden");
				note.classList.add("transparent");
			});
		}
	}

	// 调用 inlineCSS
	const svgCopy = inlineCSS(svgClone);

	// 恢复原始 DOM
	if (showNotes && originalNotes.length > 0) {
		originalNotes.forEach(({ note }) => {
			note.classList.remove("transparent");
			note.classList.add("hidden");
		});
	}

	// 设置复制 SVG 中的样式
	if (showNotes) {
		// showNotes 为 true 时，显示所有 note 的文字（包括 transparent）
		// 不需要隐藏 transparent note 的文字
	} else {
		// 执行 Toggle 切换
		const notes = svgCopy.querySelectorAll("g.note");
		notes.forEach((note) => {
			if (
				note.classList.contains("visible") ||
				note.classList.contains("selected")
			) {
				return;
			}

			const text = note.querySelector("text");
			const isTransColor = note.classList.contains("trans");

			if (note.classList.contains("hidden")) {
				// hidden -> transparent
				note.classList.remove("hidden");
				note.classList.add("transparent");
				if (text) text.style.opacity = "0";
				// 如果是 trans note，保持 0.3 透明度
				note.style.opacity = isTransColor ? "0.3" : "1";
			} else if (note.classList.contains("transparent")) {
				// transparent -> hidden
				note.classList.remove("transparent");
				note.classList.add("hidden");
				if (text) text.style.opacity = "0";
				// 如果是 trans note，保持 0.3 透明度而不是完全隐藏
				note.style.opacity = isTransColor ? "0.3" : "0";
			}
		});

		// 当 showNotes 为 false（不显示音符）时，trans note 应该显示为 0.3 透明度
		if (!showNotes) {
			const transNotes = svgCopy.querySelectorAll("g.note.trans");
			transNotes.forEach((note) => {
				note.style.opacity = "0.3";
			});

			// trans note 之间的连线也要有透明度
			const connections = svgCopy.querySelectorAll(".connection");
			connections.forEach((conn) => {
				// 检查连线连接的 note 是否包含 trans
				const path = conn.closest("g");
				if (path) {
					// 尝试从路径的 marker 或连接信息中判断
					// 更简单的方法：检查所有 trans note，然后检查连线是否连接到它们
					const transNoteIds = Array.from(transNotes).map((n) => n.id);
					// 由于连线没有直接存储连接的 note ID，我们需要通过其他方式判断
					// 这里暂时通过检查连线颜色是否为灰色（trans note 的连线默认是灰色）来判断
					const strokeColor = conn.getAttribute("stroke");
					if (
						strokeColor === "#aaaaaa" ||
						strokeColor === "rgba(170, 170, 170, 1)"
					) {
						conn.style.opacity = "0.3";
					}
				}
			});
		}
	}

	// 如果不包含品数，移除 markers（上下方的品数标记，如 3、5、7 等）
	// 注意：必须在 inlineCSS 之后移除，避免索引错位
	if (!includeMarkers) {
		// 查找并移除 markers 组
		const markersGroup = svgCopy.querySelector("g.markers");
		if (markersGroup) {
			markersGroup.remove();
		}
		// 也尝试通过类名查找，以防万一
		const markersByClass = svgCopy.querySelectorAll(".marker");
		markersByClass.forEach((marker) => marker.remove());
	}

	// 获取原始的 viewBox 和尺寸（用于保持上下不变）
	const originalViewBox = svgCopy.getAttribute("viewBox");
	let originalY = 0;
	let originalHeight = 0;
	if (originalViewBox) {
		const parts = originalViewBox.split(" ");
		if (parts.length === 4) {
			originalY = parseFloat(parts[1]);
			originalHeight = parseFloat(parts[3]);
		}
	}

	// 以品丝为边界进行裁剪
	let minFret = Infinity;
	let maxFret = -Infinity;
	let hasColoredNotes = false;

	// 查找所有有颜色的 note，提取品丝编号
	const noteElements = svgCopy.querySelectorAll("g.note");
	noteElements.forEach((noteElement) => {
		const noteId = noteElement.getAttribute("id");
		if (!noteId) return;

		const noteData = data[noteId];
		if (!noteData) return;

		// 检查是否有颜色（visibility 是 visible 或 selected）
		const hasColor =
			noteData.color &&
			(noteData.visibility === "visible" || noteData.visibility === "selected");

		// 或者有 color2
		const hasColor2 = noteData.color2 && noteData.color2 !== null;

		if (hasColor || hasColor2) {
			// 从 noteId 提取品丝编号
			// 格式：f{i}-s{j} 或 o-s{j}（0品/开放弦）
			let fret;
			if (noteId.startsWith("o-")) {
				fret = 0; // 开放弦（0品）
			} else {
				const match = noteId.match(/^f(\d+)-s/);
				if (match) {
					fret = parseInt(match[1], 10);
				}
			}

			if (fret !== undefined && !isNaN(fret)) {
				minFret = Math.min(minFret, fret);
				maxFret = Math.max(maxFret, fret);
				hasColoredNotes = true;
			}
		}
	});

	// 查找所有连线，也考虑它们跨越的品丝范围
	// 从 data.connections 获取连线信息
	if (data && data.connections) {
		Object.values(data.connections).forEach((conn) => {
			if (conn.startNoteId) {
				let fret;
				if (conn.startNoteId.startsWith("o-")) {
					fret = 0;
				} else {
					const match = conn.startNoteId.match(/^f(\d+)-s/);
					if (match) {
						fret = parseInt(match[1], 10);
					}
				}
				if (fret !== undefined && !isNaN(fret)) {
					minFret = Math.min(minFret, fret);
					maxFret = Math.max(maxFret, fret);
					hasColoredNotes = true;
				}
			}

			if (conn.endNoteId) {
				let fret;
				if (conn.endNoteId.startsWith("o-")) {
					fret = 0;
				} else {
					const match = conn.endNoteId.match(/^f(\d+)-s/);
					if (match) {
						fret = parseInt(match[1], 10);
					}
				}
				if (fret !== undefined && !isNaN(fret)) {
					minFret = Math.min(minFret, fret);
					maxFret = Math.max(maxFret, fret);
					hasColoredNotes = true;
				}
			}
		});
	}

	// 计算上下边界（垂直方向截断）- 独立于水平方向截断
	// 逻辑：只有有染色的note要完整显示，transparent和hidden的部分都要截断
	// 必须保留一个方向的完整（要么是顶部要么是底部），不能两个方向都截断
	// 初始值：如果没有原始值，使用marker的实际位置来计算
	let newY = originalY;
	let newHeight = originalHeight;
	if (!newY && !newHeight) {
		// 如果没有原始值，先使用默认值，后面会根据marker实际位置调整
		newY = 0;
		newHeight = parseFloat(svgCopy.getAttribute("height")) || 0;
	}

	// 计算实际内容的上下边界（无论是否包含品数标记都要执行垂直方向截断）
	let minStringIndex = Infinity;
	let maxStringIndex = -Infinity;
	let hasValidNotes = false;

	// 查找所有非hidden的note，提取string索引（用于垂直截断）
	// 包括visible、selected、transparent的note，只排除hidden的
	noteElements.forEach((noteElement) => {
		const noteId = noteElement.getAttribute("id");
		if (!noteId) return;

		// 检查是否不是hidden（包括visible、selected、transparent都算）
		const classList = noteElement.classList;
		const isHidden = classList.contains("hidden");
		if (isHidden) return;

		// 从noteId提取string索引
		// 格式：f{i}-s{j} 或 o-s{j}
		let stringIndex;
		if (noteId.startsWith("o-s")) {
			stringIndex = parseInt(noteId.substring(3), 10);
		} else {
			const match = noteId.match(/-s(\d+)$/);
			if (match) {
				stringIndex = parseInt(match[1], 10);
			}
		}

		if (stringIndex !== undefined && !isNaN(stringIndex)) {
			minStringIndex = Math.min(minStringIndex, stringIndex);
			maxStringIndex = Math.max(maxStringIndex, stringIndex);
			hasValidNotes = true;
		}
	});


	// 检查顶部和底部是否有note（包括transparent，只有hidden不算有note）
	// 需要检查DOM中实际存在的note元素，看它们的class来判断visibility
	let hasTopNote = false; // 顶部（stringIndex = 0）是否有note
	let hasBottomNote = false; // 底部（stringIndex = CONSTS.numStrings - 1）是否有note

	// 检查DOM中所有的note元素
	noteElements.forEach((noteElement) => {
		const noteId = noteElement.getAttribute("id");
		if (!noteId) return;

		// 从noteId提取string索引
		let stringIndex;
		if (noteId.startsWith("o-s")) {
			stringIndex = parseInt(noteId.substring(3), 10);
		} else {
			const match = noteId.match(/-s(\d+)$/);
			if (match) {
				stringIndex = parseInt(match[1], 10);
			}
		}

		if (stringIndex === undefined || isNaN(stringIndex)) return;

		// 检查class来判断visibility：visible、selected、transparent都算有note，只有hidden不算
		const classList = noteElement.classList;
		const isHidden = classList.contains("hidden");

		// 如果不是hidden，就算有note
		if (!isHidden) {
			if (stringIndex === 0) {
				hasTopNote = true;
			}
			if (stringIndex === CONSTS.numStrings - 1) {
				hasBottomNote = true;
			}
		}
	});

	// 根据是否有note动态调整marker位置（通过CSS transform）
	// 如果没有note，通过transform靠近指板；如果有note，保持原始位置
	// 记录marker调整后的实际位置，用于计算viewBox边界
	let actualTopMarkerY = CONSTS.offsetY - CONSTS.stringSpacing * 0.5; // 默认原始位置
	let actualBottomMarkerY =
		CONSTS.offsetY + CONSTS.fretHeight + CONSTS.stringSpacing * 0.7; // 默认原始位置

	if (includeMarkers) {
		const markersGroup = svgCopy.querySelector("g.markers");
		if (markersGroup) {
			const markers = markersGroup.querySelectorAll(".marker");
			markers.forEach((marker) => {
				const currentY = parseFloat(marker.getAttribute("y"));
				if (!isNaN(currentY)) {
					// 判断是顶部还是底部marker
					// 顶部marker的y坐标应该小于offsetY（因为y = offsetY - stringSpacing * 0.5）
					// 底部marker的y坐标应该大于offsetY + fretHeight（因为y = offsetY + fretHeight + stringSpacing * 0.7）
					if (currentY < CONSTS.offsetY) {
						// 顶部marker：如果没有note，向下移动（靠近指板）
						if (!hasTopNote) {
							const moveDistance = CONSTS.stringSpacing * 0.3;
							marker.setAttribute("transform", `translate(0, ${moveDistance})`);
							const adjustedY = currentY + moveDistance;
							if (adjustedY > actualTopMarkerY) {
								actualTopMarkerY = adjustedY;
							}
						} else {
							if (currentY > actualTopMarkerY) {
								actualTopMarkerY = currentY;
							}
						}
					} else if (currentY > CONSTS.offsetY + CONSTS.fretHeight) {
						// 底部marker：如果没有note，向上移动（靠近指板）
						if (!hasBottomNote) {
							const moveDistance = -CONSTS.stringSpacing * 0.4;
							marker.setAttribute("transform", `translate(0, ${moveDistance})`);
							const adjustedY = currentY + moveDistance;
							if (adjustedY < actualBottomMarkerY) {
								actualBottomMarkerY = adjustedY;
							}
						} else {
							const moveDistance = -CONSTS.stringSpacing * 0.1;
							marker.setAttribute("transform", `translate(0, ${moveDistance})`);
							const adjustedY = currentY + moveDistance;
							if (adjustedY < actualBottomMarkerY) {
								actualBottomMarkerY = adjustedY;
							}
						}
					}
				}
			});
		}
	}

	// 计算垂直方向的边界（无论是否开启垂直截断都需要计算）
	// 如果verticalCrop=false，使用新的边界计算逻辑（marker > note > 弦）
	// 如果verticalCrop=true，使用原有的截断逻辑
	if (!verticalCrop) {
		// 辅助函数：计算上下边界（按照优先级：marker > note > 弦）
		const calculateVerticalBounds = () => {
			const PADDING = 6; // 6px padding
			let topEdge = null;
			let bottomEdge = null;

			// 1. 检查顶部和底部是否有marker（优先级最高）
			if (includeMarkers) {
				const markersGroup = svgCopy.querySelector("g.markers");
				if (markersGroup) {
					const markers = markersGroup.querySelectorAll(".marker");
					let minTopMarkerY = Infinity;
					let maxBottomMarkerY = -Infinity;

					// 获取marker的font-size（从CSS或第一个marker元素的计算样式）
					let markerFontSize = 16; // 默认值
					if (markers.length > 0) {
						try {
							// 尝试从原始DOM获取计算样式
							const originalSvg = document.getElementById("fretboard-svg");
							if (originalSvg) {
								const originalMarker = originalSvg.querySelector("text.marker");
								if (originalMarker) {
									const computedStyle = window.getComputedStyle(originalMarker);
									const fontSize = parseFloat(computedStyle.fontSize);
									if (!isNaN(fontSize)) {
										markerFontSize = fontSize;
									}
								}
							}
						} catch (e) {
							// 如果获取失败，使用默认值
						}
					}
					// 注意：如果没有 dominant-baseline: middle，SVG text 的 y 往往是“基线”，
					// 用“上下各半个字号”的算法会导致顶部裁切过紧、底部留白过多。
					// 这里根据 dominant-baseline 动态选择算法：
					// - middle: 上下各 markerFontSize/2
					// - 其他(含 auto/baseline): 使用近似的上升/下降比例（更贴近字体真实盒子）
					let dominantBaseline = "auto";
					try {
						const originalSvg = document.getElementById("fretboard-svg");
						const originalMarker = originalSvg?.querySelector("text.marker");
						if (originalMarker) {
							const computedStyle = window.getComputedStyle(originalMarker);
							dominantBaseline =
								(computedStyle.dominantBaseline || "").trim() || "auto";
						}
					} catch (e) {
						// ignore
					}

					const isMiddleBaseline = dominantBaseline === "middle";
					const ascent = isMiddleBaseline ? markerFontSize / 2 : markerFontSize * 0.8;
					const descent = isMiddleBaseline ? markerFontSize / 2 : markerFontSize * 0.2;

					// marker的transform已经在第768-816行设置过了，这里直接使用
					markers.forEach((marker) => {
						const currentY = parseFloat(marker.getAttribute("y"));
						if (!isNaN(currentY)) {
							// 读取已有的transform（在第768-816行已设置）
							const transform = marker.getAttribute("transform");
							let actualY = currentY;
							if (transform) {
								const match = transform.match(/translate\([^,]+,\s*([^)]+)\)/);
								if (match) {
									actualY = currentY + parseFloat(match[1]);
								}
							}

							// marker是text元素：若是 middle baseline，y≈中心；否则 y≈基线
							if (currentY < CONSTS.offsetY) {
								// 顶部marker - 使用文本的上边缘
								const markerTop = actualY - ascent;
								if (markerTop < minTopMarkerY) {
									minTopMarkerY = markerTop;
								}
							} else if (currentY > CONSTS.offsetY + CONSTS.fretHeight) {
								// 底部marker - 使用文本的下边缘
								const markerBottom = actualY + descent;
								if (markerBottom > maxBottomMarkerY) {
									maxBottomMarkerY = markerBottom;
								}
							}
						}
					});

					// 确保上下留空一致：都使用PADDING
					if (minTopMarkerY !== Infinity) {
						topEdge = minTopMarkerY - PADDING;
					}
					if (maxBottomMarkerY !== -Infinity) {
						bottomEdge = maxBottomMarkerY + PADDING;
					}
				}
			}

			// 2. 如果顶部边界未确定，检查1弦（stringIndex=0）上是否有note
			if (topEdge === null) {
				let topNoteY = null;
				noteElements.forEach((noteElement) => {
					const noteId = noteElement.getAttribute("id");
					if (!noteId) return;

					// 从noteId提取string索引
					let stringIndex;
					if (noteId.startsWith("o-s")) {
						stringIndex = parseInt(noteId.substring(3), 10);
					} else {
						const match = noteId.match(/-s(\d+)$/);
						if (match) {
							stringIndex = parseInt(match[1], 10);
						}
					}

					if (stringIndex === 0) {
						// 检查是否不是hidden
						const classList = noteElement.classList;
						const isHidden = classList.contains("hidden");
						if (!isHidden) {
							// 获取note的Y坐标：优先使用data-y，否则从transform中提取
							let noteY = parseFloat(noteElement.getAttribute("data-y"));
							if (isNaN(noteY)) {
								const transform = noteElement.getAttribute("transform");
								if (transform) {
									const match = transform.match(/translate\([^,]+,\s*([^)]+)\)/);
									if (match) {
										noteY = parseFloat(match[1]);
									}
								}
							}
							if (!isNaN(noteY)) {
								if (topNoteY === null || noteY < topNoteY) {
									topNoteY = noteY;
								}
							}
						}
					}
				});

				if (topNoteY !== null) {
					topEdge = topNoteY - CONSTS.circleRadius - PADDING;
				}
			}

			// 3. 如果底部边界未确定，检查6弦（stringIndex=CONSTS.numStrings-1）上是否有note
			if (bottomEdge === null) {
				let bottomNoteY = null;
				noteElements.forEach((noteElement) => {
					const noteId = noteElement.getAttribute("id");
					if (!noteId) return;

					// 从noteId提取string索引
					let stringIndex;
					if (noteId.startsWith("o-s")) {
						stringIndex = parseInt(noteId.substring(3), 10);
					} else {
						const match = noteId.match(/-s(\d+)$/);
						if (match) {
							stringIndex = parseInt(match[1], 10);
						}
					}

					if (stringIndex === CONSTS.numStrings - 1) {
						// 检查是否不是hidden
						const classList = noteElement.classList;
						const isHidden = classList.contains("hidden");
						if (!isHidden) {
							// 获取note的Y坐标：优先使用data-y，否则从transform中提取
							let noteY = parseFloat(noteElement.getAttribute("data-y"));
							if (isNaN(noteY)) {
								const transform = noteElement.getAttribute("transform");
								if (transform) {
									const match = transform.match(/translate\([^,]+,\s*([^)]+)\)/);
									if (match) {
										noteY = parseFloat(match[1]);
									}
								}
							}
							if (!isNaN(noteY)) {
								if (bottomNoteY === null || noteY > bottomNoteY) {
									bottomNoteY = noteY;
								}
							}
						}
					}
				});

				if (bottomNoteY !== null) {
					bottomEdge = bottomNoteY + CONSTS.circleRadius + PADDING;
				}
			}

			// 4. 如果顶部边界仍未确定，使用1弦的位置
			if (topEdge === null) {
				topEdge = CONSTS.offsetY - PADDING;
			}

			// 5. 如果底部边界仍未确定，使用6弦的位置
			if (bottomEdge === null) {
				bottomEdge = CONSTS.offsetY + CONSTS.stringSpacing * (CONSTS.numStrings - 1) + PADDING;
			}

			return { topEdge, bottomEdge };
		};

		const { topEdge, bottomEdge } = calculateVerticalBounds();
		newY = topEdge;
		newHeight = bottomEdge - topEdge;
	} else if (verticalCrop) {
		// 如果verticalCrop=true，执行垂直截断
		if (
			hasValidNotes &&
			minStringIndex !== Infinity &&
			maxStringIndex !== -Infinity
		) {
			// 根据string索引计算Y坐标范围
			const topStringY = CONSTS.offsetY + CONSTS.stringSpacing * minStringIndex;
			const bottomStringY = CONSTS.offsetY + CONSTS.stringSpacing * maxStringIndex;
			const topNoteTop = topStringY - CONSTS.circleRadius;
			const bottomNoteBottom = bottomStringY + CONSTS.circleRadius;

			// 辅助函数：计算单边边界（顶部或底部），使用与verticalCrop=false时相同的逻辑
			const calculateSingleEdge = (isTop) => {
				const PADDING = 6; // 6px padding
				let edge = null;

				// 1. 检查是否有marker（优先级最高）
				if (includeMarkers) {
					const markersGroup = svgCopy.querySelector("g.markers");
					if (markersGroup) {
						const markers = markersGroup.querySelectorAll(".marker");
						let markerEdge = isTop ? Infinity : -Infinity;

						let markerFontSize = 16;
						if (markers.length > 0) {
							try {
								const originalSvg = document.getElementById("fretboard-svg");
								const originalMarker = originalSvg?.querySelector("text.marker");
								if (originalMarker) {
									const computedStyle = window.getComputedStyle(originalMarker);
									const fontSize = parseFloat(computedStyle.fontSize);
									if (!isNaN(fontSize)) {
										markerFontSize = fontSize;
									}
								}
							} catch (e) {
								// ignore
							}
						}

						let dominantBaseline = "auto";
						try {
							const originalSvg = document.getElementById("fretboard-svg");
							const originalMarker = originalSvg?.querySelector("text.marker");
							if (originalMarker) {
								const computedStyle = window.getComputedStyle(originalMarker);
								dominantBaseline =
									(computedStyle.dominantBaseline || "").trim() || "auto";
							}
						} catch (e) {
							// ignore
						}

						const isMiddleBaseline = dominantBaseline === "middle";
						const ascent = isMiddleBaseline ? markerFontSize / 2 : markerFontSize * 0.8;
						const descent = isMiddleBaseline ? markerFontSize / 2 : markerFontSize * 0.2;

						markers.forEach((marker) => {
							const currentY = parseFloat(marker.getAttribute("y"));
							if (!isNaN(currentY)) {
								const transform = marker.getAttribute("transform");
								let actualY = currentY;
								if (transform) {
									const match = transform.match(/translate\([^,]+,\s*([^)]+)\)/);
									if (match) {
										actualY = currentY + parseFloat(match[1]);
									}
								}

								if (isTop && currentY < CONSTS.offsetY) {
									const markerTop = actualY - ascent;
									if (markerTop < markerEdge) {
										markerEdge = markerTop;
									}
								} else if (!isTop && currentY > CONSTS.offsetY + CONSTS.fretHeight) {
									const markerBottom = actualY + descent;
									if (markerBottom > markerEdge) {
										markerEdge = markerBottom;
									}
								}
							}
						});

						if (markerEdge !== Infinity && markerEdge !== -Infinity) {
							edge = isTop ? markerEdge - PADDING : markerEdge + PADDING;
						}
					}
				}

				// 2. 如果边界未确定，检查边缘弦上的note
				if (edge === null) {
					const targetStringIndex = isTop ? 0 : CONSTS.numStrings - 1;
					let noteY = null;
					noteElements.forEach((noteElement) => {
						const noteId = noteElement.getAttribute("id");
						if (!noteId) return;

						let stringIndex;
						if (noteId.startsWith("o-s")) {
							stringIndex = parseInt(noteId.substring(3), 10);
						} else {
							const match = noteId.match(/-s(\d+)$/);
							if (match) {
								stringIndex = parseInt(match[1], 10);
							}
						}

						if (stringIndex === targetStringIndex) {
							const classList = noteElement.classList;
							const isHidden = classList.contains("hidden");
							if (!isHidden) {
								let y = parseFloat(noteElement.getAttribute("data-y"));
								if (isNaN(y)) {
									const transform = noteElement.getAttribute("transform");
									if (transform) {
										const match = transform.match(/translate\([^,]+,\s*([^)]+)\)/);
										if (match) {
											y = parseFloat(match[1]);
										}
									}
								}
								if (!isNaN(y)) {
									if (noteY === null || (isTop ? y < noteY : y > noteY)) {
										noteY = y;
									}
								}
							}
						}
					});

					if (noteY !== null) {
						edge = isTop
							? noteY - CONSTS.circleRadius - PADDING
							: noteY + CONSTS.circleRadius + PADDING;
					}
				}

				// 3. 如果边界仍未确定，使用边缘弦的位置
				if (edge === null) {
					edge = isTop
						? CONSTS.offsetY - PADDING
						: CONSTS.offsetY + CONSTS.stringSpacing * (CONSTS.numStrings - 1) + PADDING;
				}

				return edge;
			};

			// 计算顶部和底部边界（用于判断保留哪边）
			const calculatedTopEdge = calculateSingleEdge(true);
			const calculatedBottomEdge = calculateSingleEdge(false);

			// 计算最边缘的note到顶部和底部的距离
			const distanceToTop = topNoteTop - calculatedTopEdge;
			const distanceToBottom = calculatedBottomEdge - bottomNoteBottom;

			// 判断最边缘的note靠近哪边，保留那一边的完整
			// 如果两边一样近，默认优先保留顶部
			const keepTop = distanceToTop <= distanceToBottom;

			const padding = 6; // 被截断的一边使用6px padding

			if (keepTop) {
				// 保留顶部完整（使用计算出的顶部边界），只截断底部
				const finalBottom = bottomNoteBottom + padding;
				newY = calculatedTopEdge;
				newHeight = finalBottom - calculatedTopEdge;
			} else {
				// 保留底部完整（使用计算出的底部边界），只截断顶部
				const finalTop = topNoteTop - padding;
				newY = finalTop;
				newHeight = calculatedBottomEdge - finalTop;
			}
		}
	}

	// 如果找到了有颜色的 note，以品丝边界进行裁剪（水平方向截断）
	if (
		horizontalCrop &&
		hasColoredNotes &&
		minFret !== Infinity &&
		maxFret !== -Infinity
	) {
		// 计算品丝边界位置
		// 第0品丝（开放弦的左边界）：CONSTS.offsetX
		// 第i品丝：CONSTS.offsetX + CONSTS.fretWidth * (i - startFret)

		let minX, maxX;

		// 左边界：最小品丝的左边界
		if (minFret === 0) {
			// 0品：左边界需要包含0品note的位置（CONSTS.offsetX - CONSTS.fretWidth / 2）
			// 留出一些padding确保note完全可见
			minX = CONSTS.offsetX - CONSTS.fretWidth / 2 - CONSTS.circleRadius;
		} else {
			// 其他品：左边界是该品丝的位置
			minX = CONSTS.offsetX + CONSTS.fretWidth * (minFret - (startFret || 0));
		}

		// 右边界：最大品丝的右边界（下一品丝的位置）
		maxX = CONSTS.offsetX + CONSTS.fretWidth * (maxFret + 1 - (startFret || 0));

		// 计算新的宽度
		const newWidth = maxX - minX;

		// 设置新的 viewBox（包含水平和垂直方向的截断）
		svgCopy.setAttribute("viewBox", `${minX} ${newY} ${newWidth} ${newHeight}`);
		svgCopy.setAttribute("width", newWidth);
		// 设置高度
		if (newHeight > 0) {
			svgCopy.setAttribute("height", newHeight);
		}
	} else {
		// 没有水平方向截断，根据垂直截断设置viewBox
		const originalWidth =
			parseFloat(svgCopy.getAttribute("width")) ||
			parseFloat(svgCopy.getAttribute("viewBox")?.split(" ")[2]) ||
			800;
		const originalX =
			parseFloat(svgCopy.getAttribute("viewBox")?.split(" ")[0]) || 0;
		// 如果垂直截断开启，应用垂直截断
		if (verticalCrop) {
			svgCopy.setAttribute(
				"viewBox",
				`${originalX} ${newY} ${originalWidth} ${newHeight}`
			);
			if (newHeight > 0) {
				svgCopy.setAttribute("height", newHeight);
			}
		} else {
			// 没有水平方向截断，根据垂直截断设置viewBox
			// 如果verticalCrop=false，newY和newHeight已经在上面计算过了
			// 如果verticalCrop=true，newY和newHeight也在上面计算过了
			// 如果verticalCrop=true但没有有效note，使用原始值
			if (verticalCrop) {
				svgCopy.setAttribute(
					"viewBox",
					`${originalX} ${newY} ${originalWidth} ${newHeight}`
				);
				if (newHeight > 0) {
					svgCopy.setAttribute("height", newHeight);
				}
			} else {
				// verticalCrop=false，使用已计算的newY和newHeight
				svgCopy.setAttribute(
					"viewBox",
					`${originalX} ${newY} ${originalWidth} ${newHeight}`
				);
				svgCopy.setAttribute("width", originalWidth);
				if (newHeight > 0) {
					svgCopy.setAttribute("height", newHeight);
				}
			}
		}
	}

	// 设置 SVG 背景色（从 CSS 变量获取）
	const root = document.documentElement;
	const computedStyle = getComputedStyle(root);
	const backgroundColor =
		computedStyle.getPropertyValue("--background-color").trim() || "black";
	svgCopy.setAttribute("style", `background-color: ${backgroundColor};`);

	// 在 SVG 中添加元数据（保存显示模式信息）
	svgCopy.setAttribute("data-display-mode", displayMode || "note");
	if (rootNote !== null && rootNote !== undefined) {
		svgCopy.setAttribute("data-root-note", String(rootNote));
	}
	svgCopy.setAttribute("data-enharmonic", String(enharmonic || 1));

	// 先保存下载用的SVG数据（不包含背景矩形，因为SVG的style背景色在浏览器中会正确显示）
	const svgData = svgCopy.outerHTML;

	// 如果仅复制，需要在SVG中添加背景矩形（因为SVG转图片时style背景色可能不生效）
	let svgDataForCopy = svgData;
	if (copyOnly) {
		// 克隆SVG以避免修改原始数据
		const svgForCopy = svgCopy.cloneNode(true);

		// 获取 SVG 的尺寸和viewBox
		const width =
			parseFloat(svgForCopy.getAttribute("width")) ||
			parseFloat(svgForCopy.getAttribute("viewBox")?.split(" ")[2]) ||
			800;
		const height =
			parseFloat(svgForCopy.getAttribute("height")) ||
			parseFloat(svgForCopy.getAttribute("viewBox")?.split(" ")[3]) ||
			400;
		const viewBox = svgForCopy.getAttribute("viewBox");

		// 计算背景矩形的位置和尺寸
		let bgX = 0,
			bgY = 0,
			bgWidth = width,
			bgHeight = height;
		if (viewBox) {
			const parts = viewBox.split(" ");
			bgX = parseFloat(parts[0]) || 0;
			bgY = parseFloat(parts[1]) || 0;
			bgWidth = parseFloat(parts[2]) || width;
			bgHeight = parseFloat(parts[3]) || height;
		}

		// 创建背景矩形，插入到SVG的最前面
		const bgRect = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"rect"
		);
		bgRect.setAttribute("x", bgX);
		bgRect.setAttribute("y", bgY);
		bgRect.setAttribute("width", bgWidth);
		bgRect.setAttribute("height", bgHeight);
		bgRect.setAttribute("fill", backgroundColor);
		svgForCopy.insertBefore(bgRect, svgForCopy.firstChild);

		// 使用包含背景矩形的SVG
		svgDataForCopy = svgForCopy.outerHTML;
	}

	// 如果仅复制，将 SVG 转换为图片并复制到剪贴板
	if (copyOnly) {
		// 获取 SVG 的尺寸
		const width =
			parseFloat(svgCopy.getAttribute("width")) ||
			parseFloat(svgCopy.getAttribute("viewBox")?.split(" ")[2]) ||
			800;
		const height =
			parseFloat(svgCopy.getAttribute("height")) ||
			parseFloat(svgCopy.getAttribute("viewBox")?.split(" ")[3]) ||
			400;

		// 将 SVG 转换为图片（使用包含背景矩形的SVG）
		const img = new Image();
		const svgBlob = new Blob([svgDataForCopy], {
			type: "image/svg+xml;charset=utf-8",
		});
		const url = URL.createObjectURL(svgBlob);

		img.onload = () => {
			// 创建 Canvas，使用高分辨率提高清晰度
			const scale = 3; // 使用3倍分辨率确保清晰
			const canvas = document.createElement("canvas");
			canvas.width = width * scale;
			canvas.height = height * scale;
			const ctx = canvas.getContext("2d");

			// 缩放上下文以匹配高分辨率
			ctx.scale(scale, scale);

			// 先填充背景色（确保背景正确，与下载的SVG一致）
			ctx.fillStyle = backgroundColor;
			ctx.fillRect(0, 0, width, height);

			// 绘制图片到 Canvas
			ctx.drawImage(img, 0, 0, width, height);

			// 转换为 Blob (PNG)
			canvas.toBlob((blob) => {
				URL.revokeObjectURL(url);

				if (!blob) {
					if (setToastMessage) {
						setToastMessage("转换图片失败");
						setToastType("error");
					}
					return;
				}

				// 检查是否在安全上下文中（HTTPS或localhost）
				const isSecureContext =
					window.isSecureContext ||
					location.protocol === "https:" ||
					location.hostname === "localhost" ||
					location.hostname === "127.0.0.1";

				// 使用 Clipboard API 复制图片
				if (
					isSecureContext &&
					navigator.clipboard &&
					navigator.clipboard.write &&
					typeof ClipboardItem !== "undefined"
				) {
					const clipboardItem = new ClipboardItem({ "image/png": blob });
					navigator.clipboard
						.write([clipboardItem])
						.then(() => {
							if (setToastMessage) {
								setToastMessage("已复制图片到剪贴板！");
								setToastType("success");
							}
						})
						.catch((err) => {
							console.error("复制图片失败:", err);
							if (setToastMessage) {
								// 如果是权限错误，给出更明确的提示
								if (
									err.name === "NotAllowedError" ||
									err.name === "SecurityError"
								) {
									setToastMessage(
										"复制失败：需要剪贴板权限。请允许浏览器访问剪贴板"
									);
								} else {
									setToastMessage("复制失败：" + err.message);
								}
								setToastType("error");
							}
						});
				} else {
					// 降级方案：HTTP环境下，创建临时图片元素让用户手动复制
					if (!isSecureContext) {
						// 将blob转换为DataURL
						const reader = new FileReader();
						reader.onload = () => {
							const dataUrl = reader.result;

							// 创建临时容器
							const container = document.createElement("div");
							container.style.cssText =
								"position: fixed; top: -9999px; left: -9999px; opacity: 0; pointer-events: none;";

							// 创建img元素
							const img = document.createElement("img");
							img.src = dataUrl;
							img.style.cssText = "max-width: 100%; height: auto;";
							img.onload = () => {
								container.appendChild(img);
								document.body.appendChild(container);

								// 选中图片
								const range = document.createRange();
								range.selectNodeContents(container);
								const selection = window.getSelection();
								selection.removeAllRanges();
								selection.addRange(range);

								// 尝试使用execCommand复制（虽然通常只对文本有效，但某些浏览器可能支持）
								try {
									const successful = document.execCommand("copy");
									if (successful) {
										if (setToastMessage) {
											setToastMessage("已复制图片到剪贴板！");
											setToastType("success");
										}
									} else {
										// 如果execCommand失败，显示图片让用户手动复制
										showImageForManualCopy(
											img,
											dataUrl,
											setToastMessage,
											setToastType
										);
									}
								} catch (err) {
									// execCommand失败，显示图片让用户手动复制
									showImageForManualCopy(
										img,
										dataUrl,
										setToastMessage,
										setToastType
									);
								}

								// 清理
								setTimeout(() => {
									selection.removeAllRanges();
									document.body.removeChild(container);
								}, 100);
							};
						};
						reader.readAsDataURL(blob);
					} else {
						// HTTPS但浏览器不支持
						if (setToastMessage) {
							setToastMessage("浏览器不支持复制图片，请使用下载功能");
							setToastType("error");
						}
					}
				}
			}, "image/png");
		};

		img.onerror = () => {
			URL.revokeObjectURL(url);
			console.error("加载 SVG 图片失败");
			if (setToastMessage) {
				setToastMessage("转换图片失败");
				setToastType("error");
			}
		};

		img.src = url;
		return;
	}

	// 否则下载文件
	const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
	const svgUrl = URL.createObjectURL(svgBlob);
	const link = document.createElement("a");
	link.href = svgUrl;
	link.download = "fretboard-diagram.svg";
	link.click();
	URL.revokeObjectURL(svgUrl);
}

export function setFretWindow(
	fretWindow,
	startFret,
	endFret,
	selected,
	setSelected,
	data,
	setData,
	updateNote,
	setErrorMessage,
	setStartFret,
	setEndFret
) {
	const start = fretWindow.start !== undefined ? fretWindow.start : startFret;
	const end = fretWindow.end !== undefined ? fretWindow.end : endFret;

	if (selected) {
		const noteElement =
			selected.element || document.getElementById(selected.id);
		if (noteElement) {
			updateNote(noteElement, data, { visibility: "visible" });
			setData((prevData) => {
				const newData = { ...prevData };
				if (selected.id in newData) {
					newData[selected.id] = {
						...newData[selected.id],
						visibility: "visible",
					};
				}
				return newData;
			});
		}
		setSelected(null);
	}

	setErrorMessage("");

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
	// if (end - start > 16) {
	// 	setErrorMessage(
	// 		"Maximal number of displayable frets is 16, e.g., 1st to 16th or 4th to 19th!"
	// 	);
	// 	setStartFret(start);
	// 	setEndFret(end);
	// 	return;
	// }

	setStartFret(start);
	setEndFret(end);
}
