document.addEventListener("DOMContentLoaded", () => {
  // --- PWA Service Worker Registration ---
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("Service Worker registered", reg))
        .catch((err) =>
          console.error("Service Worker registration failed", err),
        );
    });
  }

  // --- Local Storage Keys ---
  const STORAGE_KEYS = {
    processor: "bpad-wordprocessor-content",
    sheet: "bpad-spreadsheet-data",
    notes: "bpad-notes-data",
  };

  // --- Tab Navigation ---
  const tabs = document.querySelectorAll(".tab-btn");
  const sections = document.querySelectorAll(".app-section");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));
      tab.classList.add("active");
      document
        .getElementById(tab.id.replace("tab-", "") + "-section")
        .classList.add("active");
    });
  });

  // =================================================================
  // Word Processor
  // =================================================================
  const editor = document.getElementById("editor");
  const wpFormatBtns = document.querySelectorAll(".wp-format");
  const wpNewBtn = document.getElementById("wp-new");
  const wpOpenBtn = document.getElementById("wp-open");
  const wpSaveBtn = document.getElementById("wp-save");

  function loadProcessorContent() {
    const savedContent = localStorage.getItem(STORAGE_KEYS.processor);
    if (savedContent) {
      editor.innerHTML = savedContent;
    }
  }

  editor.addEventListener("input", () => {
    localStorage.setItem(STORAGE_KEYS.processor, editor.innerHTML);
  });

  wpNewBtn.addEventListener("click", () => {
    if (editor.textContent.trim().length > 0) {
      if (
        confirm(
          "Do you want to save your current document before creating a new one?",
        )
      ) {
        wpSaveBtn.click();
      }
    }
    editor.innerHTML = "";
    localStorage.removeItem(STORAGE_KEYS.processor);
  });

  wpFormatBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      document.execCommand(btn.dataset.command, false, null);
      editor.focus();
      editor.dispatchEvent(new Event("input"));
    });
  });

  // Check if File System Access API is supported
  const supportsFileSystemAccess = "showSaveFilePicker" in window;

  wpSaveBtn.addEventListener("click", async () => {
    if (!supportsFileSystemAccess) {
      // Fallback for browsers that don't support File System Access API
      const htmlContent = editor.innerHTML;
      const rtfBody = htmlContent
        .replace(/<b>(.*?)<\/b>/g, "{\\b $1}")
        .replace(/<i>(.*?)<\/i>/g, "{\\i $1}")
        .replace(/<u>(.*?)<\/u>/g, "{\\ul $1}")
        .replace(/<br>/g, "\\par\n")
        .replace(/<p>(.*?)<\/p>/g, "$1\\par\n")
        .replace(
          /<li>(.*?)<\/li>/g,
          "{\\pard\\fi360\\li720\\bullet\t$1\\par\n}",
        )
        .replace(/<ol>|<\/ol>|<ul>|<\/ul>/g, "")
        .replace(/<[^>]+>/g, "");

      const rtfContent = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\n${rtfBody}}`;

      const blob = new Blob([rtfContent], { type: "application/rtf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "document.rtf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "document.rtf",
        types: [
          {
            description: "Rich Text Format",
            accept: { "application/rtf": [".rtf"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      const htmlContent = editor.innerHTML;

      const rtfBody = htmlContent
        .replace(/<b>(.*?)<\/b>/g, "{\\b $1}")
        .replace(/<i>(.*?)<\/i>/g, "{\\i $1}")
        .replace(/<u>(.*?)<\/u>/g, "{\\ul $1}")
        .replace(/<br>/g, "\\par\n")
        .replace(/<p>(.*?)<\/p>/g, "$1\\par\n")
        .replace(
          /<li>(.*?)<\/li>/g,
          "{\\pard\\fi360\\li720\\bullet\t$1\\par\n}",
        )
        .replace(/<ol>|<\/ol>|<ul>|<\/ul>/g, "")
        .replace(/<[^>]+>/g, "");

      const rtfContent = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\n${rtfBody}}`;

      await writable.write(rtfContent);
      await writable.close();
    } catch (err) {
      console.error("Failed to save RTF file:", err);
    }
  });

  wpOpenBtn.addEventListener("click", async () => {
    if (!supportsFileSystemAccess) {
      // Fallback for browsers that don't support File System Access API
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".rtf";
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          let contents = await file.text();

          const headerRegex =
            /^{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\n/;
          contents = contents.replace(headerRegex, "");
          contents = contents.replace(/}$/, "");

          contents = contents.replace(
            /{\\pard\\fi360\\li720\\bullet\t([^}]+?)\\par\n?}/g,
            "<li>$1</li>",
          );
          contents = contents.replace(/\\par\n?/g, "<br>");

          const replacements = { b: "b", i: "i", ul: "u" };
          let prevContents;
          do {
            prevContents = contents;
            for (const rtfTag in replacements) {
              const htmlTag = replacements[rtfTag];
              const regex = new RegExp(`{\\\\${rtfTag}\\s?([^{}]+)}`, "g");
              contents = contents.replace(regex, `<${htmlTag}>$1</${htmlTag}>`);
            }
          } while (prevContents !== contents);

          const html = contents.replace(/\\.+?\s?|[\{\}]/g, "").trim();
          editor.innerHTML = html;
          editor.dispatchEvent(new Event("input"));
        }
      };
      input.click();
      return;
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          { description: "RTF Files", accept: { "application/rtf": [".rtf"] } },
        ],
      });
      const file = await handle.getFile();
      let contents = await file.text();

      const headerRegex =
        /^{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\n/;
      contents = contents.replace(headerRegex, "");
      contents = contents.replace(/}$/, "");

      contents = contents.replace(
        /{\\pard\\fi360\\li720\\bullet\t([^}]+?)\\par\n?}/g,
        "<li>$1</li>",
      );
      contents = contents.replace(/\\par\n?/g, "<br>");

      const replacements = { b: "b", i: "i", ul: "u" };
      let prevContents;
      do {
        prevContents = contents;
        for (const rtfTag in replacements) {
          const htmlTag = replacements[rtfTag];
          const regex = new RegExp(`{\\\\${rtfTag}\\s?([^{}]+)}`, "g");
          contents = contents.replace(regex, `<${htmlTag}>$1</${htmlTag}>`);
        }
      } while (prevContents !== contents);

      const html = contents.replace(/\\.+?\s?|[\{\}]/g, "").trim();
      editor.innerHTML = html;
      editor.dispatchEvent(new Event("input"));
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (
      !document.getElementById("processor-section").classList.contains("active")
    ) {
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case "s":
          e.preventDefault();
          wpSaveBtn.click();
          break;
        case "o":
          e.preventDefault();
          wpOpenBtn.click();
          break;
        case "n":
          e.preventDefault();
          wpNewBtn.click();
          break;
      }
    }
  });

  // =================================================================
  // Spreadsheet
  // =================================================================
  const sheetContainer = document.getElementById("spreadsheet-container");
  const formulaBar = document.getElementById("formula-bar");
  const csvOpenBtn = document.getElementById("csv-open");
  const csvSaveBtn = document.getElementById("csv-save");
  const ROWS = 100;
  const COLS = 26;
  let sheetData = [];
  let activeCell = null;

  function saveSheetData() {
    localStorage.setItem(STORAGE_KEYS.sheet, JSON.stringify(sheetData));
  }

  function loadSheetData() {
    const savedData = localStorage.getItem(STORAGE_KEYS.sheet);
    sheetData = savedData
      ? JSON.parse(savedData)
      : Array(ROWS)
          .fill(null)
          .map(() => Array(COLS).fill(""));
    renderSheet();
    updateSheetDisplay();
  }

  function renderSheet() {
    let tableHTML = '<table class="spreadsheet-table"><thead><tr><th></th>';
    for (let j = 0; j < COLS; j++)
      tableHTML += `<th>${String.fromCharCode(65 + j)}</th>`;
    tableHTML += "</tr></thead><tbody>";
    for (let i = 0; i < ROWS; i++) {
      tableHTML += `<tr><th>${i + 1}</th>`;
      for (let j = 0; j < COLS; j++)
        tableHTML += `<td data-row="${i}" data-col="${j}" contenteditable="true"></td>`;
      tableHTML += "</tr>";
    }
    tableHTML += "</tbody></table>";
    sheetContainer.innerHTML = tableHTML;
  }

  function updateSheetDisplay() {
    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < COLS; j++) {
        const cell = sheetContainer.querySelector(
          `[data-row="${i}"][data-col="${j}"]`,
        );
        if (!cell) continue; // Safety check

        const cellValue = sheetData[i][j];
        if (cellValue && cellValue.toString().startsWith("=")) {
          const result = evaluateFormula(cellValue, new Set());
          cell.textContent = result;
          // Add error styling for error results
          if (typeof result === "string" && result.startsWith("#")) {
            cell.style.color = "#c9302c";
          } else {
            cell.style.color = "";
          }
        } else {
          cell.textContent = cellValue || "";
          cell.style.color = "";
        }
      }
    }
  }

  function getCellRefValue(ref, visited) {
    const col = ref.charCodeAt(0) - 65;
    const row = parseInt(ref.substring(1), 10) - 1;
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return "#REF!";

    const cellValue = sheetData[row][col];
    if (!cellValue) return 0;

    if (cellValue.toString().startsWith("=")) {
      const cellFormula = cellValue.toString();
      if (visited.has(`${row},${col}`)) return "#CIRCULAR!";
      visited.add(`${row},${col}`);
      const result = evaluateFormula(cellFormula, visited);
      visited.delete(`${row},${col}`);
      return typeof result === "number" ? result : 0;
    }

    const numValue = parseFloat(cellValue);
    return isNaN(numValue) ? 0 : numValue;
  }

  function evaluateFormula(formula, visited) {
    if (!formula || !formula.startsWith("=")) return "#ERROR!";

    try {
      const formulaBody = formula.substring(1).toUpperCase().trim();

      // Handle SUM function
      const sumRegex = /^SUM\((.+)\)$/;
      if (sumRegex.test(formulaBody)) {
        const args = formulaBody.match(sumRegex)[1].split(",");
        let sum = 0;

        for (const arg of args) {
          const trimmedArg = arg.trim();
          const rangeRegex = /^([A-Z]+\d+):([A-Z]+\d+)$/;

          if (rangeRegex.test(trimmedArg)) {
            const [, startRef, endRef] = trimmedArg.match(rangeRegex);
            const startCol = startRef.charCodeAt(0) - 65;
            const startRow = parseInt(startRef.substring(1)) - 1;
            const endCol = endRef.charCodeAt(0) - 65;
            const endRow = parseInt(endRef.substring(1)) - 1;

            for (
              let r = Math.min(startRow, endRow);
              r <= Math.max(startRow, endRow);
              r++
            ) {
              for (
                let c = Math.min(startCol, endCol);
                c <= Math.max(startCol, endCol);
                c++
              ) {
                if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
                  const cellValue = sheetData[r][c];
                  if (cellValue && cellValue.toString().startsWith("=")) {
                    const newVisited = new Set(visited);
                    if (newVisited.has(`${r},${c}`)) return "#CIRCULAR!";
                    newVisited.add(`${r},${c}`);
                    const result = evaluateFormula(cellValue, newVisited);
                    sum += typeof result === "number" ? result : 0;
                  } else {
                    const numValue = parseFloat(cellValue);
                    sum += isNaN(numValue) ? 0 : numValue;
                  }
                }
              }
            }
          } else {
            // Single cell reference
            const cellValue = getCellRefValue(trimmedArg, new Set(visited));
            sum += typeof cellValue === "number" ? cellValue : 0;
          }
        }
        return sum;
      }

      // Handle basic arithmetic operations
      const parts = formulaBody.match(/([A-Z]+\d+|\d+(?:\.\d+)?)|([+\-*\/])/g);
      if (!parts || parts.length === 0) return "#ERROR!";

      // If only one part, it might be a single cell reference or number
      if (parts.length === 1) {
        if (/^[A-Z]+\d+$/.test(parts[0])) {
          return getCellRefValue(parts[0], new Set(visited));
        } else {
          const numValue = parseFloat(parts[0]);
          return isNaN(numValue) ? "#ERROR!" : numValue;
        }
      }

      // For expressions with operators, we need odd number of parts (operand-operator-operand...)
      if (parts.length % 2 === 0) return "#ERROR!";

      // Get first operand
      let result;
      if (/^[A-Z]+\d+$/.test(parts[0])) {
        result = getCellRefValue(parts[0], new Set(visited));
      } else {
        result = parseFloat(parts[0]);
        if (isNaN(result)) return "#ERROR!";
      }

      // Process operators and operands
      for (let i = 1; i < parts.length; i += 2) {
        const operator = parts[i];
        const nextOperandStr = parts[i + 1];

        let nextOperandValue;
        if (/^[A-Z]+\d+$/.test(nextOperandStr)) {
          nextOperandValue = getCellRefValue(nextOperandStr, new Set(visited));
        } else {
          nextOperandValue = parseFloat(nextOperandStr);
          if (isNaN(nextOperandValue)) return "#ERROR!";
        }

        if (typeof nextOperandValue !== "number") return "#ERROR!";

        switch (operator) {
          case "+":
            result += nextOperandValue;
            break;
          case "-":
            result -= nextOperandValue;
            break;
          case "*":
            result *= nextOperandValue;
            break;
          case "/":
            if (nextOperandValue === 0) return "#DIV/0!";
            result /= nextOperandValue;
            break;
          default:
            return "#ERROR!";
        }
      }

      return result;
    } catch (error) {
      return "#ERROR!";
    }
  }

  sheetContainer.addEventListener("focusin", (e) => {
    if (e.target.tagName === "TD") {
      if (activeCell) activeCell.classList.remove("active");
      activeCell = e.target;
      activeCell.classList.add("active");
      const row = parseInt(activeCell.dataset.row);
      const col = parseInt(activeCell.dataset.col);
      formulaBar.value = sheetData[row][col] || "";
    }
  });

  sheetContainer.addEventListener("focusout", (e) => {
    if (e.target.tagName === "TD") {
      const row = parseInt(e.target.dataset.row);
      const col = parseInt(e.target.dataset.col);
      const value = e.target.textContent.trim();

      // Save the value and update display
      handleSheetInput(row, col, value);
      setTimeout(() => updateSheetDisplay(), 50); // Small delay to ensure data is saved
    }
  });

  function handleSheetInput(row, col, value) {
    sheetData[row][col] = value;
    saveSheetData();
  }

  sheetContainer.addEventListener("input", (e) => {
    if (e.target.tagName === "TD") {
      const row = parseInt(e.target.dataset.row);
      const col = parseInt(e.target.dataset.col);
      formulaBar.value = e.target.textContent;
      // Don't save immediately during input to avoid conflicts
    }
  });

  formulaBar.addEventListener("input", (e) => {
    if (activeCell) {
      activeCell.textContent = e.target.value;
      // Don't save immediately during input
    }
  });

  formulaBar.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && activeCell) {
      e.preventDefault();
      const row = parseInt(activeCell.dataset.row);
      const col = parseInt(activeCell.dataset.col);
      const value = formulaBar.value.trim();

      // Save the formula to sheet data
      handleSheetInput(row, col, value);

      // Update the active cell's text content
      activeCell.textContent = value;

      // Update the display to show calculated results
      updateSheetDisplay();

      // Keep focus on the active cell
      activeCell.focus();
    }
  });

  sheetContainer.addEventListener("keydown", (e) => {
    if (!activeCell) return;
    let row = parseInt(activeCell.dataset.row, 10);
    let col = parseInt(activeCell.dataset.col, 10);
    let newRow = row,
      newCol = col;

    switch (e.key) {
      case "ArrowUp":
        if (row > 0) newRow--;
        e.preventDefault();
        break;
      case "ArrowDown":
        if (row < ROWS - 1) newRow++;
        e.preventDefault();
        break;
      case "ArrowLeft":
        if (window.getSelection().anchorOffset === 0) {
          if (col > 0) newCol--;
          e.preventDefault();
        }
        break;
      case "ArrowRight":
        if (
          window.getSelection().anchorOffset === activeCell.textContent.length
        ) {
          if (col < COLS - 1) newCol++;
          e.preventDefault();
        }
        break;
      case "Enter":
        if (!e.shiftKey) {
          e.preventDefault();
          // Save current cell data before moving
          const value = activeCell.textContent.trim();
          handleSheetInput(row, col, value);
          updateSheetDisplay();

          if (row < ROWS - 1) newRow++;
        }
        break;
      default:
        return;
    }

    if (newRow !== row || newCol !== col) {
      const newCell = sheetContainer.querySelector(
        `[data-row="${newRow}"][data-col="${newCol}"]`,
      );
      if (newCell) {
        activeCell = null; // Clear active cell to prevent conflicts
        newCell.focus();
      }
    }
  });

  // CSV Save with fallback
  csvSaveBtn.addEventListener("click", async () => {
    const csvContent = sheetData
      .map((row) =>
        row
          .map((cell) => {
            // If cell contains comma, quote it
            if (cell && cell.toString().includes(",")) {
              return `"${cell.toString().replace(/"/g, '""')}"`;
            }
            return cell || "";
          })
          .join(","),
      )
      .join("\n");

    if (!supportsFileSystemAccess) {
      // Fallback download
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "spreadsheet.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "spreadsheet.csv",
        types: [{ description: "CSV File", accept: { "text/csv": [".csv"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(csvContent);
      await writable.close();
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  });

  // CSV Open with fallback
  csvOpenBtn.addEventListener("click", async () => {
    if (!supportsFileSystemAccess) {
      // Fallback file input
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv";
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          const contents = await file.text();
          parseCSV(contents);
        }
      };
      input.click();
      return;
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "CSV Files", accept: { "text/csv": [".csv"] } }],
      });
      const file = await handle.getFile();
      const contents = await file.text();
      parseCSV(contents);
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  });

  function parseCSV(contents) {
    const rows = contents.split("\n");
    sheetData = Array(ROWS)
      .fill(null)
      .map(() => Array(COLS).fill(""));

    rows.forEach((row, r) => {
      if (r < ROWS && row.trim()) {
        // Simple CSV parsing - could be improved for quoted fields
        const cols = row.split(",");
        cols.forEach((col, c) => {
          if (c < COLS) {
            // Remove quotes if present
            let cellValue = col.trim();
            if (cellValue.startsWith('"') && cellValue.endsWith('"')) {
              cellValue = cellValue.slice(1, -1).replace(/""/g, '"');
            }
            sheetData[r][c] = cellValue;
          }
        });
      }
    });
    updateSheetDisplay();
    saveSheetData();
  }

  // =================================================================
  // Sticky Notes
  // =================================================================
  const notesContainer = document.getElementById("notes-container");
  const addNoteBtn = document.getElementById("add-note");
  const txtOpenBtn = document.getElementById("txt-open");
  const txtSaveBtn = document.getElementById("txt-save");
  let notes = [];
  const NOTE_SEPARATOR = "\n--- bPad Note Break ---\n";

  function saveNotes() {
    localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
  }

  function loadNotes() {
    const savedNotes = localStorage.getItem(STORAGE_KEYS.notes);
    notes = savedNotes ? JSON.parse(savedNotes) : [];
    renderNotes();
  }

  function renderNotes() {
    notesContainer.innerHTML = "";
    notes.forEach((noteContent, index) => {
      const noteEl = document.createElement("div");
      noteEl.className = "note";
      noteEl.innerHTML = `
        <div class="note-header">
          <button class="note-save" data-index="${index}" title="Save Note">💾</button>
          <button class="note-delete" data-index="${index}" title="Delete Note">×</button>
        </div>
        <textarea data-index="${index}" placeholder="Type your note here...">${noteContent}</textarea>`;
      notesContainer.appendChild(noteEl);
    });
  }

  addNoteBtn.addEventListener("click", () => {
    notes.push("");
    saveNotes();
    renderNotes();
    // Focus on the new note
    setTimeout(() => {
      const textareas = notesContainer.querySelectorAll("textarea");
      if (textareas.length > 0) {
        textareas[textareas.length - 1].focus();
      }
    }, 50);
  });

  notesContainer.addEventListener("click", async (e) => {
    if (e.target.classList.contains("note-delete")) {
      const index = parseInt(e.target.dataset.index);
      if (confirm("Are you sure you want to delete this note?")) {
        notes.splice(index, 1);
        saveNotes();
        renderNotes();
      }
    }

    if (e.target.classList.contains("note-save")) {
      const index = parseInt(e.target.dataset.index);
      const content = notes[index];

      if (!supportsFileSystemAccess) {
        // Fallback download
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `note-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: `note-${new Date().toISOString().slice(0, 10)}.txt`,
          types: [
            { description: "Text File", accept: { "text/plain": [".txt"] } },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch (err) {
        console.error("Could not save individual note:", err);
      }
    }
  });

  notesContainer.addEventListener("input", (e) => {
    if (e.target.tagName === "TEXTAREA") {
      const index = parseInt(e.target.dataset.index);
      notes[index] = e.target.value;
      saveNotes();
    }
  });

  // Save all notes with fallback
  txtSaveBtn.addEventListener("click", async () => {
    const allNotesContent = notes.join(NOTE_SEPARATOR);

    if (!supportsFileSystemAccess) {
      // Fallback download
      const blob = new Blob([allNotesContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "all-notes.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "all-notes.txt",
        types: [
          { description: "Text File", accept: { "text/plain": [".txt"] } },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(allNotesContent);
      await writable.close();
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  });

  // Open notes with fallback
  txtOpenBtn.addEventListener("click", async () => {
    if (!supportsFileSystemAccess) {
      // Fallback file input
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".txt";
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          const contents = await file.text();
          notes = contents.split(NOTE_SEPARATOR);
          saveNotes();
          renderNotes();
        }
      };
      input.click();
      return;
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          { description: "Text Files", accept: { "text/plain": [".txt"] } },
        ],
      });
      const file = await handle.getFile();
      const contents = await file.text();
      notes = contents.split(NOTE_SEPARATOR);
      saveNotes();
      renderNotes();
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  });

  // --- Initial Load From Storage ---
  loadProcessorContent();
  loadSheetData();
  loadNotes();

  // --- Periodically update spreadsheet formulas ---
  setInterval(() => {
    if (document.getElementById("sheet-section").classList.contains("active")) {
      updateSheetDisplay();
    }
  }, 3000);
});
