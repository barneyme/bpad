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

  wpFormatBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      document.execCommand(btn.dataset.command, false, null);
      editor.focus();
      editor.dispatchEvent(new Event("input"));
    });
  });

  wpSaveBtn.addEventListener("click", async () => {
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
      const rtfContent = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\\pard\\sa200\\sl276\\slmult1\\f0\\fs24 ${htmlContent
        .replace(/<br>/g, "\\par ")
        .replace(/<b>(.*?)<\/b>/g, "{\\b $1}")
        .replace(/<i>(.*?)<\/i>/g, "{\\i $1}")
        .replace(/<u>(.*?)<\/u>/g, "{\\ul $1}")
        .replace(/<(?:.|\n)*?>/gm, "")}\\par}`;
      await writable.write(rtfContent);
      await writable.close();
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  });

  wpOpenBtn.addEventListener("click", async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          { description: "RTF Files", accept: { "application/rtf": [".rtf"] } },
        ],
      });
      const file = await handle.getFile();
      const contents = await file.text();
      let text = contents
        .replace(/\\par[d]?/g, "\n")
        .replace(/\{\\.*? (.*?)\}/g, "$1")
        .replace(/\\.*?\s?/g, "")
        .replace(/\{|\}/g, "")
        .trim();
      editor.innerHTML = text
        .split("\n")
        .map((p) => `<p>${p}</p>`)
        .join("");
      editor.dispatchEvent(new Event("input"));
    } catch (err) {
      console.error("Failed to open file:", err);
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
  const COLS = 26; // A-Z
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
        const cellValue = sheetData[i][j];
        if (cellValue && cellValue.toString().startsWith("=")) {
          cell.textContent = evaluateFormula(cellValue, new Set());
        } else {
          cell.textContent = cellValue;
        }
      }
    }
  }

  function getCellRefValue(ref, visited) {
    const col = ref.charCodeAt(0) - 65;
    const row = parseInt(ref.substring(1), 10) - 1;
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return "#REF!";

    const cellValue = sheetData[row][col];
    if (cellValue.startsWith("=")) {
      return evaluateFormula(cellValue, visited);
    }
    return parseFloat(cellValue) || 0;
  }

  /**
   * Evaluates a formula string.
   * @param {string} formula The formula string, e.g., "=A1+B1" or "=SUM(A1:B5, C1)".
   * @param {Set<string>} visited A set to track visited cells for circular reference detection.
   * @returns {number|string} The result of the calculation or an error string.
   */
  function evaluateFormula(formula, visited) {
    // Circular reference detection
    if (visited.has(formula)) {
      return "#REF!";
    }
    visited.add(formula);

    const formulaBody = formula.substring(1).toUpperCase();

    // --- SUM Function ---
    const sumRegex = /^SUM\((.+)\)$/;
    if (sumRegex.test(formulaBody)) {
      const args = formulaBody.match(sumRegex)[1].split(",");
      let sum = 0;
      for (const arg of args) {
        const trimmedArg = arg.trim();
        const rangeRegex = /^([A-Z]+\d+):([A-Z]+\d+)$/;
        if (rangeRegex.test(trimmedArg)) {
          // It's a range like C1:C3
          const [, startRef, endRef] = trimmedArg.match(rangeRegex);
          const startCol = startRef.charCodeAt(0) - 65,
            startRow = parseInt(startRef.substring(1)) - 1;
          const endCol = endRef.charCodeAt(0) - 65,
            endRow = parseInt(endRef.substring(1)) - 1;
          for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
              const cellValue = sheetData[r][c];
              sum +=
                parseFloat(
                  cellValue && cellValue.startsWith("=")
                    ? evaluateFormula(cellValue, new Set(visited))
                    : cellValue,
                ) || 0;
            }
          }
        } else {
          // It's a single cell like A1
          sum += getCellRefValue(trimmedArg, new Set(visited));
        }
      }
      return sum;
    }

    // --- Basic Arithmetic (+, -, *, /) ---
    const parts = formulaBody.match(/([A-Z]+\d+)|([+\-*/])/g);
    if (!parts || parts.length % 2 === 0) return "#ERROR!";

    let result = getCellRefValue(parts[0], new Set(visited));

    // Loop through operators and operands from left to right
    for (let i = 1; i < parts.length; i += 2) {
      const operator = parts[i];
      const nextOperandValue = getCellRefValue(parts[i + 1], new Set(visited));

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
  }

  sheetContainer.addEventListener("focusin", (e) => {
    if (e.target.tagName === "TD") {
      if (activeCell) activeCell.classList.remove("active");
      activeCell = e.target;
      activeCell.classList.add("active");
      formulaBar.value =
        sheetData[activeCell.dataset.row][activeCell.dataset.col];
    }
  });

  function handleSheetInput(row, col, value) {
    sheetData[row][col] = value;
    saveSheetData();
  }

  sheetContainer.addEventListener("input", (e) => {
    if (e.target.tagName === "TD") {
      handleSheetInput(
        e.target.dataset.row,
        e.target.dataset.col,
        e.target.textContent,
      );
      formulaBar.value = e.target.textContent;
    }
  });

  formulaBar.addEventListener("input", (e) => {
    if (activeCell) {
      activeCell.textContent = e.target.value;
      handleSheetInput(
        activeCell.dataset.row,
        activeCell.dataset.col,
        e.target.value,
      );
    }
  });

  formulaBar.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && activeCell) {
      e.preventDefault();
      updateSheetDisplay();
      activeCell.focus();
    }
  });

  sheetContainer.addEventListener("keydown", (e) => {
    if (!activeCell) return;

    let row = parseInt(activeCell.dataset.row, 10);
    let col = parseInt(activeCell.dataset.col, 10);

    let newRow = row;
    let newCol = col;

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
      default:
        return;
    }

    if (newRow !== row || newCol !== col) {
      const newCell = sheetContainer.querySelector(
        `[data-row="${newRow}"][data-col="${newCol}"]`,
      );
      if (newCell) {
        newCell.focus();
      }
    }
  });

  csvSaveBtn.addEventListener("click", async () => {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "spreadsheet.csv",
        types: [{ description: "CSV File", accept: { "text/csv": [".csv"] } }],
      });
      const writable = await handle.createWritable();
      const csvContent = sheetData.map((row) => row.join(",")).join("\n");
      await writable.write(csvContent);
      await writable.close();
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  });

  csvOpenBtn.addEventListener("click", async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "CSV Files", accept: { "text/csv": [".csv"] } }],
      });
      const file = await handle.getFile();
      const contents = await file.text();
      const rows = contents.split("\n");
      sheetData = Array(ROWS)
        .fill(null)
        .map(() => Array(COLS).fill(""));
      rows.forEach((row, r) => {
        if (r < ROWS) {
          const cols = row.split(",");
          cols.forEach((col, c) => {
            if (c < COLS) sheetData[r][c] = col;
          });
        }
      });
      updateSheetDisplay();
      saveSheetData();
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  });

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
                <div class="note-header"><button class="note-delete" data-index="${index}" title="Delete Note">X</button></div>
                <textarea data-index="${index}">${noteContent}</textarea>`;
      notesContainer.appendChild(noteEl);
    });
  }

  addNoteBtn.addEventListener("click", () => {
    notes.push("New note...");
    saveNotes();
    renderNotes();
  });

  notesContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("note-delete")) {
      notes.splice(e.target.dataset.index, 1);
      saveNotes();
      renderNotes();
    }
  });

  notesContainer.addEventListener("input", (e) => {
    if (e.target.tagName === "TEXTAREA") {
      notes[e.target.dataset.index] = e.target.value;
      saveNotes();
    }
  });

  txtSaveBtn.addEventListener("click", async () => {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "notes.txt",
        types: [
          { description: "Text File", accept: { "text/plain": [".txt"] } },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(notes.join(NOTE_SEPARATOR));
      await writable.close();
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  });

  txtOpenBtn.addEventListener("click", async () => {
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
});
