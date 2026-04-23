import { inlineCSS } from "../utils";
import { CONSTS } from "../constants";

export function buildExportSvg({
	selected,
	data,
	svgElementRef,
	displayMode,
	rootNote,
	enharmonic,
	startFret,
	includeMarkers = true,
	showNotes = true,
	horizontalCrop = true,
	verticalCrop = false,
}) {
	if (!svgElementRef.current) {
		return null;
	}

	const svgClone = svgElementRef.current.cloneNode(true);
	svgClone.querySelectorAll("foreignObject").forEach((fo) => {
		const toolbar = fo.querySelector(
			".connection-toolbar-container, .connection-toolbar"
		);
		const editableDiv = fo.querySelector("#editable-div");
		if (toolbar || editableDiv) {
			fo.remove();
		}
	});

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

	const originalNotes = [];
	if (showNotes) {
		const originalSvg = document.getElementById("fretboard-svg");
		if (originalSvg) {
			originalSvg.querySelectorAll("g.note.hidden").forEach((note) => {
				originalNotes.push(note);
				note.classList.remove("hidden");
				note.classList.add("transparent");
			});
		}
	}

	const svgCopy = inlineCSS(svgClone);

	originalNotes.forEach((note) => {
		note.classList.remove("transparent");
		note.classList.add("hidden");
	});

	if (!showNotes) {
		svgCopy.querySelectorAll("g.note").forEach((note) => {
			if (
				note.classList.contains("visible") ||
				note.classList.contains("selected")
			) {
				return;
			}

			const text = note.querySelector("text");
			const isTransColor = note.classList.contains("trans");

			if (note.classList.contains("hidden")) {
				note.classList.remove("hidden");
				note.classList.add("transparent");
				if (text) text.style.opacity = "0";
				note.style.opacity = isTransColor ? "0.3" : "1";
			} else if (note.classList.contains("transparent")) {
				note.classList.remove("transparent");
				note.classList.add("hidden");
				if (text) text.style.opacity = "0";
				note.style.opacity = isTransColor ? "0.3" : "0";
			}
		});

		svgCopy.querySelectorAll("g.note.trans").forEach((note) => {
			note.style.opacity = "0.3";
		});
		svgCopy.querySelectorAll(".connection").forEach((conn) => {
			const strokeColor = conn.getAttribute("stroke");
			if (
				strokeColor === "#aaaaaa" ||
				strokeColor === "rgba(170, 170, 170, 1)"
			) {
				conn.style.opacity = "0.3";
			}
		});
	}

	if (!includeMarkers) {
		svgCopy.querySelector("g.markers")?.remove();
		svgCopy.querySelectorAll(".marker").forEach((marker) => marker.remove());
	}

	const noteElements = svgCopy.querySelectorAll("g.note");
	let minFret = Infinity;
	let maxFret = -Infinity;
	let hasColoredNotes = false;
	noteElements.forEach((noteElement) => {
		const noteId = noteElement.getAttribute("id");
		if (!noteId) return;
		const noteData = data[noteId];
		if (!noteData) return;

		const hasColor =
			noteData.color &&
			(noteData.visibility === "visible" || noteData.visibility === "selected");
		const hasColor2 = noteData.color2 && noteData.color2 !== null;
		if (!hasColor && !hasColor2) return;

		let fret;
		if (noteId.startsWith("o-")) {
			fret = 0;
		} else {
			const match = noteId.match(/^f(\d+)-s/);
			if (match) fret = parseInt(match[1], 10);
		}
		if (fret !== undefined && !Number.isNaN(fret)) {
			minFret = Math.min(minFret, fret);
			maxFret = Math.max(maxFret, fret);
			hasColoredNotes = true;
		}
	});

	if (data?.connections) {
		Object.values(data.connections).forEach((conn) => {
			["startNoteId", "endNoteId"].forEach((key) => {
				const noteId = conn[key];
				if (!noteId) return;
				let fret;
				if (noteId.startsWith("o-")) {
					fret = 0;
				} else {
					const match = noteId.match(/^f(\d+)-s/);
					if (match) fret = parseInt(match[1], 10);
				}
				if (fret !== undefined && !Number.isNaN(fret)) {
					minFret = Math.min(minFret, fret);
					maxFret = Math.max(maxFret, fret);
					hasColoredNotes = true;
				}
			});
		});
	}

	let minStringIndex = Infinity;
	let maxStringIndex = -Infinity;
	let hasValidNotes = false;
	let hasTopNote = false;
	let hasBottomNote = false;
	noteElements.forEach((noteElement) => {
		const noteId = noteElement.getAttribute("id");
		if (!noteId) return;
		const isHidden = noteElement.classList.contains("hidden");
		let stringIndex;
		if (noteId.startsWith("o-s")) {
			stringIndex = parseInt(noteId.substring(3), 10);
		} else {
			const match = noteId.match(/-s(\d+)$/);
			if (match) stringIndex = parseInt(match[1], 10);
		}
		if (stringIndex === undefined || Number.isNaN(stringIndex) || isHidden) return;
		minStringIndex = Math.min(minStringIndex, stringIndex);
		maxStringIndex = Math.max(maxStringIndex, stringIndex);
		hasValidNotes = true;
		if (stringIndex === 0) hasTopNote = true;
		if (stringIndex === CONSTS.numStrings - 1) hasBottomNote = true;
	});

	if (includeMarkers) {
		svgCopy.querySelectorAll("g.markers .marker").forEach((marker) => {
			const currentY = parseFloat(marker.getAttribute("y"));
			if (Number.isNaN(currentY)) return;
			if (currentY < CONSTS.offsetY && !hasTopNote) {
				marker.setAttribute("transform", `translate(0, ${CONSTS.stringSpacing * 0.3})`);
			} else if (currentY > CONSTS.offsetY + CONSTS.fretHeight) {
				const moveDistance = hasBottomNote
					? -CONSTS.stringSpacing * 0.1
					: -CONSTS.stringSpacing * 0.4;
				marker.setAttribute("transform", `translate(0, ${moveDistance})`);
			}
		});
	}

	const originalViewBox = svgCopy.getAttribute("viewBox");
	let originalX = 0;
	let originalY = 0;
	let originalWidth = parseFloat(svgCopy.getAttribute("width")) || 800;
	let originalHeight = parseFloat(svgCopy.getAttribute("height")) || 400;
	if (originalViewBox) {
		const parts = originalViewBox.split(" ").map((part) => parseFloat(part));
		if (parts.length === 4) {
			[originalX, originalY, originalWidth, originalHeight] = parts;
		}
	}

	let newY = originalY;
	let newHeight = originalHeight;
	if (hasValidNotes) {
		const topStringY = CONSTS.offsetY + CONSTS.stringSpacing * minStringIndex;
		const bottomStringY = CONSTS.offsetY + CONSTS.stringSpacing * maxStringIndex;
		if (verticalCrop) {
			newY = topStringY - CONSTS.circleRadius - 6;
			newHeight = bottomStringY + CONSTS.circleRadius + 6 - newY;
		} else {
			newY = Math.min(originalY, topStringY - CONSTS.circleRadius - 12);
			newHeight = Math.max(originalHeight, bottomStringY + CONSTS.circleRadius + 12 - newY);
		}
	}

	if (horizontalCrop && hasColoredNotes && minFret !== Infinity && maxFret !== -Infinity) {
		const fretRange = maxFret - minFret + 1;
		if (fretRange === 1) {
			minFret = Math.max(0, minFret - 1);
			maxFret = maxFret + 1;
		} else if (fretRange === 2) {
			maxFret = maxFret + 1;
		}

		const minX =
			minFret === 0
				? CONSTS.offsetX - CONSTS.fretWidth / 2 - CONSTS.circleRadius
				: CONSTS.offsetX + CONSTS.fretWidth * (minFret - (startFret || 0));
		const maxX =
			CONSTS.offsetX + CONSTS.fretWidth * (maxFret + 1 - (startFret || 0));
		const newWidth = maxX - minX;

		svgCopy.setAttribute("viewBox", `${minX} ${newY} ${newWidth} ${newHeight}`);
		svgCopy.setAttribute("width", newWidth);
		svgCopy.setAttribute("height", newHeight);
	} else {
		svgCopy.setAttribute(
			"viewBox",
			`${originalX} ${newY} ${originalWidth} ${newHeight}`
		);
		svgCopy.setAttribute("width", originalWidth);
		svgCopy.setAttribute("height", newHeight);
	}

	const backgroundColor =
		getComputedStyle(document.documentElement)
			.getPropertyValue("--background-color")
			.trim() || "black";
	svgCopy.setAttribute("style", `background-color: ${backgroundColor};`);
	svgCopy.setAttribute("data-display-mode", displayMode || "note");
	if (rootNote !== null && rootNote !== undefined) {
		svgCopy.setAttribute("data-root-note", String(rootNote));
	}
	svgCopy.setAttribute("data-enharmonic", String(enharmonic || 1));

	return { svgCopy, backgroundColor };
}
