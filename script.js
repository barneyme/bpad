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
        if (cell === activeCell) {
          continue;
        }
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
    if (
      activeCell &&
      activeCell.dataset.row == row &&
      activeCell.dataset.col == col
    ) {
      return parseFloat(activeCell.textContent) || 0;
    }
    const cellValue = sheetData[row][col];
    if (cellValue && cellValue.startsWith("="))
      return evaluateFormula(cellValue, visited);
    return parseFloat(cellValue) || 0;
  }

  function evaluateFormula(formula, visited) {
    if (visited.has(formula)) return "#REF!";
    visited.add(formula);
    const formulaBody = formula.substring(1).toUpperCase();
    const sumRegex = /^SUM\((.+)\)$/;
    if (sumRegex.test(formulaBody)) {
      const args = formulaBody.match(sumRegex)[1].split(",");
      let sum = 0;
      for (const arg of args) {
        const trimmedArg = arg.trim();
        const rangeRegex = /^([A-Z]+\d+):([A-Z]+\d+)$/;
        if (rangeRegex.test(trimmedArg)) {
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
          sum += getCellRefValue(trimmedArg, new Set(visited));
        }
      }
      return sum;
    }
    const parts = formulaBody.match(/([A-Z]+\d+)|([+\-*/])/g);
    if (!parts || parts.length % 2 === 0) return "#ERROR!";
    let result = getCellRefValue(parts[0], new Set(visited));
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
        sheetData[activeCell.dataset.row][activeCell.dataset.col] || "";
    }
  });

  sheetContainer.addEventListener("focusout", (e) => {
    if (e.target.tagName === "TD") {
      activeCell = null;
      updateSheetDisplay();
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
      if (newCell) newCell.focus();
    }
  });

  csvSaveBtn.addEventListener("click", async () => {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "spreadsheet.csv",
        types: [{ description: "CSV File", accept: { "text/csv": [".csv"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(sheetData.map((row) => row.join(",")).join("\n"));
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
                <div class="note-header">
                    <button class="note-save" data-index="${index}" title="Save Note">💾</button>
                    <button class="note-delete" data-index="${index}" title="Delete Note">X</button>
                </div>
                <textarea data-index="${index}">${noteContent}</textarea>`;
      notesContainer.appendChild(noteEl);
    });
  }

  addNoteBtn.addEventListener("click", () => {
    notes.push("New note...");
    saveNotes();
    renderNotes();
  });

  notesContainer.addEventListener("click", async (e) => {
    if (e.target.classList.contains("note-delete")) {
      notes.splice(e.target.dataset.index, 1);
      saveNotes();
      renderNotes();
    }
    if (e.target.classList.contains("note-save")) {
      const index = e.target.dataset.index;
      const content = notes[index];
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
      notes[e.target.dataset.index] = e.target.value;
      saveNotes();
    }
  });

  txtSaveBtn.addEventListener("click", async () => {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "all-notes.txt",
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

  // --- Periodically update spreadsheet formulas ---
  setInterval(() => {
    if (document.getElementById("sheet-section").classList.contains("active")) {
      updateSheetDisplay();
    }
  }, 3000);
});
