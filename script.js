sheetContainer.addEventListener("input", (e) => {
    if (e.target.classList.contains('sheet-cell') && activeCell === e.target) {
      const row = parseInt(e.target.dataset.row);
      const col = parseInt(e.target.dataset.col);

      // Update formula bar to match cell content while typing
      formulaBar.value = e.target.textContent;
    }
  });document.addEventListener("DOMContentLoaded", () => {
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
  // IMPROVED SPREADSHEET
  // =================================================================
  const sheetContainer = document.getElementById("spreadsheet-container");
  const formulaBar = document.getElementById("formula-bar");
  const csvOpenBtn = document.getElementById("csv-open");
  const csvSaveBtn = document.getElementById("csv-save");
  const ROWS = 100;
  const COLS = 26;
  let sheetData = [];
  let activeCell = null;
  let isUpdating = false;
  let calculationCache = new Map();

  // Initialize sheet data structure
  function initializeSheetData() {
    return Array(ROWS).fill(null).map(() =>
      Array(COLS).fill(null).map(() => ({
        value: "",
        formula: "",
        calculated: "",
        error: null
      }))
    );
  }

  function saveSheetData() {
    localStorage.setItem(STORAGE_KEYS.sheet, JSON.stringify(sheetData));
  }

  function loadSheetData() {
    const savedData = localStorage.getItem(STORAGE_KEYS.sheet);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        // Handle legacy data format
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0][0] === 'string') {
          // Convert legacy format
          sheetData = Array(ROWS).fill(null).map((_, row) =>
            Array(COLS).fill(null).map((_, col) => ({
              value: parsed[row] && parsed[row][col] ? parsed[row][col] : "",
              formula: parsed[row] && parsed[row][col] && parsed[row][col].startsWith('=') ? parsed[row][col] : "",
              calculated: "",
              error: null
            }))
          );
        } else {
          sheetData = parsed;
        }
      } catch (e) {
        console.error("Error loading sheet data:", e);
        sheetData = initializeSheetData();
      }
    } else {
      sheetData = initializeSheetData();
    }
    renderSheet();
    recalculateAll();
    saveSheetData();
  }

  function parseCSVRow(row) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < row.length) {
      const char = row[i];

      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }

    // Add the last field
    result.push(current);
    return result;
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

  // --- Keyboard shortcuts for spreadsheet ---
  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("sheet-section").classList.contains("active")) {
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          csvSaveBtn.click();
          break;
        case 'o':
          e.preventDefault();
          csvOpenBtn.click();
          break;
        case 'a':
          e.preventDefault();
          // Select all - could be implemented later
          break;
      }
    }
  });
});
  }

  function renderSheet() {
    let tableHTML = '<table class="spreadsheet-table"><thead><tr><th></th>';
    for (let j = 0; j < COLS; j++)
      tableHTML += `<th>${String.fromCharCode(65 + j)}</th>`;
    tableHTML += "</tr></thead><tbody>";
    for (let i = 0; i < ROWS; i++) {
      tableHTML += `<tr><th>${i + 1}</th>`;
      for (let j = 0; j < COLS; j++) {
        tableHTML += `<td data-row="${i}" data-col="${j}" contenteditable="true" class="sheet-cell"></td>`;
      }
      tableHTML += "</tr>";
    }
    tableHTML += "</tbody></table>";
    sheetContainer.innerHTML = tableHTML;
  }

  function updateCellDisplay(row, col) {
    const cell = sheetContainer.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (!cell) return;

    const cellData = sheetData[row][col];

    if (cellData.error) {
      cell.textContent = cellData.error;
      cell.classList.add('error');
      cell.classList.remove('formula');
    } else if (cellData.formula) {
      cell.textContent = cellData.calculated;
      cell.classList.add('formula');
      cell.classList.remove('error');
    } else {
      cell.textContent = cellData.value;
      cell.classList.remove('error', 'formula');
    }
  }

  function updateAllCellDisplays() {
    if (isUpdating) return;
    isUpdating = true;

    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < COLS; j++) {
        updateCellDisplay(i, j);
      }
    }

    isUpdating = false;
  }

  // Improved cell reference parsing
  function parseCellRef(ref) {
    const match = ref.match(/^([A-Z]+)(\d+)$/);
    if (!match) return null;

    const colStr = match[1];
    const rowStr = match[2];

    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
      col = col * 26 + (colStr.charCodeAt(i) - 64);
    }
    col -= 1; // Convert to 0-based

    const row = parseInt(rowStr) - 1; // Convert to 0-based

    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return { row, col };
  }

  function getCellRefValue(ref, visited = new Set()) {
    const coords = parseCellRef(ref);
    if (!coords) return "#REF!";

    const { row, col } = coords;
    const cellKey = `${row},${col}`;

    if (visited.has(cellKey)) return "#CIRCULAR!";

    const cellData = sheetData[row][col];

    if (cellData.formula) {
      visited.add(cellKey);
      const result = evaluateFormula(cellData.formula, visited);
      visited.delete(cellKey);
      return typeof result === "number" ? result : 0;
    }

    const numValue = parseFloat(cellData.value);
    return isNaN(numValue) ? (cellData.value === "" ? 0 : cellData.value) : numValue;
  }

  // Enhanced formula evaluation with better error handling
  function evaluateFormula(formula, visited = new Set()) {
    if (!formula || !formula.startsWith("=")) return "#ERROR!";

    try {
      const formulaBody = formula.substring(1).trim();

      // Handle SUM function with improved range parsing
      const sumMatch = formulaBody.match(/^SUM\s*\((.+)\)$/i);
      if (sumMatch) {
        return evaluateSumFunction(sumMatch[1], visited);
      }

      // Handle AVERAGE function
      const avgMatch = formulaBody.match(/^AVERAGE\s*\((.+)\)$/i);
      if (avgMatch) {
        return evaluateAverageFunction(avgMatch[1], visited);
      }

      // Handle COUNT function
      const countMatch = formulaBody.match(/^COUNT\s*\((.+)\)$/i);
      if (countMatch) {
        return evaluateCountFunction(countMatch[1], visited);
      }

      // Handle MAX function
      const maxMatch = formulaBody.match(/^MAX\s*\((.+)\)$/i);
      if (maxMatch) {
        return evaluateMaxFunction(maxMatch[1], visited);
      }

      // Handle MIN function
      const minMatch = formulaBody.match(/^MIN\s*\((.+)\)$/i);
      if (minMatch) {
        return evaluateMinFunction(minMatch[1], visited);
      }

      // Handle basic arithmetic with improved parsing
      return evaluateArithmeticExpression(formulaBody, visited);

    } catch (error) {
      console.error("Formula evaluation error:", error);
      return "#ERROR!";
    }
  }

  function evaluateSumFunction(args, visited) {
    const values = parseFormulaArgs(args, visited);
    return values.reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
  }

  function evaluateAverageFunction(args, visited) {
    const values = parseFormulaArgs(args, visited);
    const numbers = values.filter(val => typeof val === 'number');
    return numbers.length > 0 ? numbers.reduce((sum, val) => sum + val, 0) / numbers.length : 0;
  }

  function evaluateCountFunction(args, visited) {
    const values = parseFormulaArgs(args, visited);
    return values.filter(val => typeof val === 'number').length;
  }

  function evaluateMaxFunction(args, visited) {
    const values = parseFormulaArgs(args, visited);
    const numbers = values.filter(val => typeof val === 'number');
    return numbers.length > 0 ? Math.max(...numbers) : 0;
  }

  function evaluateMinFunction(args, visited) {
    const values = parseFormulaArgs(args, visited);
    const numbers = values.filter(val => typeof val === 'number');
    return numbers.length > 0 ? Math.min(...numbers) : 0;
  }

  function parseFormulaArgs(args, visited) {
    const values = [];
    const argParts = args.split(',').map(arg => arg.trim());

    for (const arg of argParts) {
      // Check if it's a range (e.g., A1:C3)
      const rangeMatch = arg.match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
      if (rangeMatch) {
        const startCoords = parseCellRef(rangeMatch[1]);
        const endCoords = parseCellRef(rangeMatch[2]);

        if (startCoords && endCoords) {
          const minRow = Math.min(startCoords.row, endCoords.row);
          const maxRow = Math.max(startCoords.row, endCoords.row);
          const minCol = Math.min(startCoords.col, endCoords.col);
          const maxCol = Math.max(startCoords.col, endCoords.col);

          for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
              const cellKey = `${r},${c}`;
              if (!visited.has(cellKey)) {
                const cellData = sheetData[r][c];
                if (cellData.formula) {
                  visited.add(cellKey);
                  const result = evaluateFormula(cellData.formula, visited);
                  visited.delete(cellKey);
                  values.push(result);
                } else {
                  const numValue = parseFloat(cellData.value);
                  values.push(isNaN(numValue) ? 0 : numValue);
                }
              }
            }
          }
        }
      }
      // Check if it's a single cell reference
      else if (parseCellRef(arg)) {
        values.push(getCellRefValue(arg, visited));
      }
      // Check if it's a number
      else {
        const numValue = parseFloat(arg);
        if (!isNaN(numValue)) {
          values.push(numValue);
        }
      }
    }

    return values;
  }

  function evaluateArithmeticExpression(expression, visited) {
    // Enhanced tokenizer that handles cell references, numbers, and operators
    const tokens = expression.match(/([A-Z]+\d+|\d+(?:\.\d+)?|[+\-*/()])/g);
    if (!tokens || tokens.length === 0) return "#ERROR!";

    // Convert tokens to values
    const processedTokens = tokens.map(token => {
      if (parseCellRef(token)) {
        return getCellRefValue(token, visited);
      } else if (!isNaN(parseFloat(token))) {
        return parseFloat(token);
      } else {
        return token; // Operator or parenthesis
      }
    });

    // Simple expression evaluator (could be enhanced with proper operator precedence)
    try {
      return evaluateTokens(processedTokens);
    } catch (e) {
      return "#ERROR!";
    }
  }

  function evaluateTokens(tokens) {
    // Handle single value
    if (tokens.length === 1) {
      return typeof tokens[0] === 'number' ? tokens[0] : "#ERROR!";
    }

    // Simple left-to-right evaluation (could be improved with proper precedence)
    let result = tokens[0];
    if (typeof result !== 'number') return "#ERROR!";

    for (let i = 1; i < tokens.length; i += 2) {
      const operator = tokens[i];
      const operand = tokens[i + 1];

      if (typeof operand !== 'number') return "#ERROR!";

      switch (operator) {
        case '+': result += operand; break;
        case '-': result -= operand; break;
        case '*': result *= operand; break;
        case '/':
          if (operand === 0) return "#DIV/0!";
          result /= operand;
          break;
        default: return "#ERROR!";
      }
    }

    return result;
  }

  function setCellValue(row, col, value) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;

    const cellData = sheetData[row][col];

    if (value.startsWith('=')) {
      cellData.formula = value;
      cellData.value = "";
    } else {
      cellData.value = value;
      cellData.formula = "";
    }

    cellData.error = null;
    cellData.calculated = "";

    // Clear calculation cache
    calculationCache.clear();

    // Recalculate this cell and dependents
    recalculateCell(row, col);
    saveSheetData();
  }

  function recalculateCell(row, col) {
    const cellData = sheetData[row][col];

    if (cellData.formula) {
      try {
        const result = evaluateFormula(cellData.formula);
        if (typeof result === 'string' && result.startsWith('#')) {
          cellData.error = result;
          cellData.calculated = "";
        } else {
          cellData.error = null;
          cellData.calculated = typeof result === 'number' ? result.toString() : result;
        }
      } catch (e) {
        cellData.error = "#ERROR!";
        cellData.calculated = "";
      }
    }

    updateCellDisplay(row, col);
  }

  function recalculateAll() {
    calculationCache.clear();
    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < COLS; j++) {
        recalculateCell(i, j);
      }
    }
  }

  // Enhanced event handlers
  sheetContainer.addEventListener("focusin", (e) => {
    if (e.target.classList.contains('sheet-cell')) {
      if (activeCell) activeCell.classList.remove("active");
      activeCell = e.target;
      activeCell.classList.add("active");

      const row = parseInt(activeCell.dataset.row);
      const col = parseInt(activeCell.dataset.col);
      const cellData = sheetData[row][col];

      // Show formula or value in formula bar
      formulaBar.value = cellData.formula || cellData.value || "";

      // Show raw content in cell while editing
      activeCell.textContent = cellData.formula || cellData.value || "";
    }
  });

  sheetContainer.addEventListener("focusout", (e) => {
    if (e.target.classList.contains('sheet-cell')) {
      const row = parseInt(e.target.dataset.row);
      const col = parseInt(e.target.dataset.col);
      const value = e.target.textContent.trim();

      setCellValue(row, col, value);
    }
  });

  formulaBar.addEventListener("input", (e) => {
    if (activeCell) {
      // Update the cell display while typing
      activeCell.textContent = e.target.value;
    }
  });

  formulaBar.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && activeCell) {
      e.preventDefault();
      const row = parseInt(activeCell.dataset.row);
      const col = parseInt(activeCell.dataset.col);
      const value = formulaBar.value.trim();

      setCellValue(row, col, value);
      activeCell.focus();
    }
  });

  // Enhanced keyboard navigation
  sheetContainer.addEventListener("keydown", (e) => {
    if (!activeCell) return;

    let row = parseInt(activeCell.dataset.row, 10);
    let col = parseInt(activeCell.dataset.col, 10);
    let newRow = row, newCol = col;

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
        if (e.target.selectionStart === 0 && col > 0) {
          newCol--;
          e.preventDefault();
        }
        break;
      case "ArrowRight":
        if (e.target.selectionStart === e.target.textContent.length && col < COLS - 1) {
          newCol++;
          e.preventDefault();
        }
        break;
      case "Enter":
        if (!e.shiftKey) {
          e.preventDefault();
          const value = activeCell.textContent.trim();
          setCellValue(row, col, value);

          if (row < ROWS - 1) newRow++;
        }
        break;
      case "Tab":
        e.preventDefault();
        const value = activeCell.textContent.trim();
        setCellValue(row, col, value);

        if (e.shiftKey) {
          if (col > 0) newCol--;
        } else {
          if (col < COLS - 1) newCol++;
        }
        break;
      case "Delete":
      case "Backspace":
        if (e.target.textContent === "") {
          e.preventDefault();
          setCellValue(row, col, "");
        }
        break;
    }

    if (newRow !== row || newCol !== col) {
      const newCell = sheetContainer.querySelector(`[data-row="${newRow}"][data-col="${newCol}"]`);
      if (newCell) {
        newCell.focus();
      }
    }
  });

  // CSV Save with improved parsing
  csvSaveBtn.addEventListener("click", async () => {
    const csvContent = sheetData
      .map((row) =>
        row
          .map((cellData) => {
            const value = cellData.value || "";
            if (value.includes(",") || value.includes('"') || value.includes('\n')) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(",")
      )
      .join("\n");

    if (!supportsFileSystemAccess) {
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

  csvOpenBtn.addEventListener("click", async () => {
    if (!supportsFileSystemAccess) {
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
    sheetData = initializeSheetData();

    rows.forEach((row, r) => {
      if (r < ROWS && row.trim()) {
        const cols = parseCSVRow(row);
        cols.forEach((col, c) => {
          if (c < COLS) {
            sheetData[r][c].value = col;
            if (col.startsWith('=')) {
              sheetData[r][c].formula = col;
              sheetData[r][c].value = "";
            }
          }
        });
      }
    });

    recalculateAll();
