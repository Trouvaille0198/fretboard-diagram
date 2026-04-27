export const en = {
    // FretboardMenu
    menu: {
        toggleAccidental: "Toggle accidental",
        toggle: "Toggle",
        toggleTitle: "Toggle (Z)",
        save: "Save",
        saveTitle: "Save current fretboard state (Ctrl+S)",
        reset: "Reset",
        resetTitle: "Reset (Ctrl+D)",
        copySvg: "Copy SVG",
        downloadSvg: "Download SVG",
        copySvgTitle: "Copy to clipboard",
        downloadSvgTitle: "Download SVG",
        connect: "Connect",
        connectTitle: "Connection tool (S)",
        line: "Line",
        arc: "Arc",
        lineTitle: "Line",
        arcTitle: "Arc",
        arrowNone: "None",
        arrowStart: "←",
        arrowEnd: "→",
        arrowBoth: "⇄",
        arrowTitle: (dir) =>
            `Arrow: ${dir === "none" ? "none" : dir === "start" ? "start" : dir === "end" ? "end" : "both"}`,
        includeMarkers: "Fret markers",
        showNotes: "Show notes",
        horizontalCrop: "H-crop",
        verticalCrop: "V-crop",
        copyOnly: "Copy only",
        minor: "Minor",
        tintVariantTitle: (n) => `Tint variant ${n}`,
    },

    // FretboardGallery
    gallery: {
        toggleOpenTitle: "Show state gallery",
        toggleCloseTitle: "Hide state gallery",
        title: "State Gallery",
        export: "Export",
        exportTitle: "Export all directories and states",
        import: "Import",
        importTitle: "Import fretboard state",
        newDirectory: "+",
        newDirectoryTitle: "New directory",
        deleteDirectoryTitle: "Delete directory",
        empty: "No saved states yet",
        noThumbnail: "No thumbnail",
        deleteStateTitle: "Delete this state",
        shareStateTitle: "Share this state",
        renameHint: "Double-click to rename",
        importDialogTitle: "Import Fretboard State",
        tabString: "Share string",
        tabSvg: "SVG file",
        tabJson: "JSON batch import",
        stringHint: "Paste a share string (format: fretboard://...)",
        jsonHint: "Select a previously exported JSON backup file",
        svgHint: "Select a previously exported SVG file",
        stringPlaceholder: "Paste share string...",
        confirmImport: "Import",
        cancel: "Cancel",
        contextExportDir: "Export this directory",
        applyHint: (name) => `Click to apply – ${name}`,
        confirmClearAll:
            "Clear the entire state gallery? This cannot be undone.",
        confirmDeleteDir: (name, count) =>
            count > 0
                ? `Delete directory "${name}"?\nThe ${count} state(s) inside will be moved to the default directory.`
                : `Delete directory "${name}"?`,
        shareSuccess: "Share string copied to clipboard!",
        shareFail: (msg) => "Share failed: " + msg,
        dirExportEmpty: "No states in this directory",
        undoDelete: "Delete undone",
        importNotInit: "Import not initialized, please refresh the page",
        importSuccess: "Import successful!",
        importParseFail: "Import failed: data parse error",
        importFail: (msg) => msg || "Import failed: unknown error",
        importEnterString: "Please enter a share string",
        importReadSvgFail: "Failed to read SVG file",
        importSelectSvg: "Please select an SVG file",
        importSelectSvgFile: "Please select an SVG file",
        importJsonFail: (msg) => "JSON parse error: " + msg,
        importReadJsonFail: "Failed to read JSON file",
        importSelectJson: "Please select a JSON file",
        dirExportSuccess: (count) =>
            `Exported ${count} state${count === 1 ? "" : "s"}`,
        dirExportFail: (msg) => "Export failed: " + msg,
    },

    // LoginModal
    login: {
        close: "Close",
        closeTitle: "Close",
        title: "Sign in to Fretboard Diagram",
        description:
            "Enter a username to sign in. A new account will be created automatically on first use.",
        usernameLabel: "Username",
        usernamePlaceholder: "3–20 chars: letters, digits, underscores",
        submitting: "Signing in…",
        submit: "Sign in",
        note: "Remember your username — data cannot be recovered if lost.",
        limitTitle: "User limit reached",
        limitDesc:
            "The user limit has been reached. Please contact the author.",
        ok: "OK",
        errorEmpty: "Please enter a username",
        errorLength: "Username must be 3–20 characters",
        errorChars:
            "Username may only contain letters, digits, and underscores",
        errorDefault: "Sign-in failed",
    },

    // ColorPalette
    palette: {
        tintTitle: (name, shortcut) =>
            shortcut
                ? `${name} (${shortcut}) · scroll to cycle tints`
                : `${name} · scroll to cycle tints`,
        replaceConfirm: (name) =>
            `Replace with this color?\n\nThis will replace all tint notes with the ${name} tint color.`,
    },

    // Fretboard (page-level)
    fretboard: {
        themeLight: "Switch to light mode",
        themeDark: "Switch to dark mode",
        snapshotTitle: "Currently applied snapshot",
        snapshotEditHint: "Double-click to edit",
        confirmClearDock: "Clear the current stack? This cannot be undone.",
        toastDeleted: "Removed from stack",
        toastCleared: "Stack cleared",
        langSwitch: "中",
    },

    dock: {
        emptyHint: "Press Ctrl+S to save the current fretboard to the stack",
        label: "Stack",
        clearTitle: "Clear current stack",
        clear: "Clear",
        applyLatestTitle: (name) => `Apply latest snapshot: ${name}`,
        fallbackTitle: "Stack",
        itemTitle: (name) => `${name} · click to apply, right-click to delete`,
        applyTitle: (name) => `Apply: ${name}`,
    },

    svg: {
        connType: "Type",
        connTypeLine: "Line",
        connTypeArc: "Arc",
        connArrow: "Arrow",
        connArrowNone: "–",
        connWidth: "Width",
        connWidthBtn: "≡",
        connCurvature: "Curve",
        connCurvatureBtn: "⌒",
        connReverse: "Flip curve",
        connGray: "Frosted glass",
        connGrayBtn: "◑",
        connDelete: "Delete connection",
    },

    actions: {
        copyImageHint:
            'Right-click the image and select "Copy image", then click anywhere to close',
        copyImageToast: 'Right-click the image and select "Copy image"',
        toastConvertFail: "Failed to convert image",
        toastCopied: "Image copied to clipboard!",
        toastCopyPermission:
            "Copy failed: clipboard permission required. Please allow clipboard access in your browser.",
        toastCopyFail: (msg) => "Copy failed: " + msg,
        toastNoClipboard:
            "Clipboard image copy not supported; please use the download option.",
    },

    history: {
        saved: "Added to stack!",
        overwritten: "Snapshot overwritten!",
        saveFail: (msg) => "Save failed: " + msg,
        autoSaveLabel: "autosave",
        restored: "State restored!",
        restoreFail: (msg) => "Restore failed: " + msg,
        dirNameEmpty: "Directory name cannot be empty",
        dirNameExists: "Directory name already exists",
        exportSuccess: "Export successful!",
        exportFail: (msg) => "Export failed: " + msg,
        invalidFormat: "Invalid data format",
        missingVersion: "Missing version information",
        invalidDirFormat: "Invalid directory data format",
        invalidStateFormat: "Invalid state data format",
        invalidDirStructure: "Incomplete directory data structure",
        invalidStateStructure: "Incomplete state data structure",
        validationFail: (msg) => "Data validation failed: " + msg,
        importBatchSuccess: (dirs, merged, states) =>
            `Imported ${dirs + merged} director${dirs + merged === 1 ? "y" : "ies"} (${merged} merged) and ${states} state${states === 1 ? "" : "s"}`,
        importFail: (msg) => "Import failed: " + msg,
        cannotDeleteDefault: "Cannot delete the default directory",
    },
};
