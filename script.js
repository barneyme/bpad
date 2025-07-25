document.addEventListener("DOMContentLoaded", function () {
  const elements = {
    textbox1: document.getElementById("textbox-1"),
    textbox2: document.getElementById("textbox-2"),
    filenameBox1: document.getElementById("filename-1"),
    filenameBox2: document.getElementById("filename-2"),
    recentFilesDatalist1: document.getElementById("recent-files-datalist-1"),
    recentFilesDatalist2: document.getElementById("recent-files-datalist-2"),
    recentFilesBtn: document.getElementById("recent-files-btn"),
    recentFilesDropdown: document.getElementById("recent-files-dropdown"),
    linePosition: document.getElementById("line-position"),
    charPosition: document.getElementById("char-position"),
    wordCount: document.getElementById("word-count"),
    openLinkBtn: document.getElementById("open-link-btn"),
    overlay: document.getElementById("popup-overlay"),
    openInput1: document.getElementById("open-input-1"),
    openInput2: document.getElementById("open-input-2"),
    findText: document.getElementById("find-text"),
    replaceText: document.getElementById("replace-text"),
    findCount: document.getElementById("find-count"),
    undoButton: document.getElementById("undo"),
    nav: document.querySelector("nav"),
    findBtn: document.getElementById("find-btn"),
    replaceBtn: document.getElementById("replace-btn"),
    replaceAllBtn: document.getElementById("replace-all-btn"),
    openBtn: document.getElementById("open"),
    saveBtn: document.getElementById("save"),
    emailBtn: document.getElementById("email-btn"),
    openNewTabBtn: document.getElementById("openNewTab"),
    findReplaceBtn: document.getElementById("find-replace-button"),
    closeButtons: document.querySelectorAll(".close-btn"),
    installButton: document.getElementById("install-app"),
    highlightLayer1: document.getElementById("highlight-layer-1"),
    highlightLayer2: document.getElementById("highlight-layer-2"),
    activeLine1: document.getElementById("active-line-1"),
    activeLine2: document.getElementById("active-line-2"),
    caseSensitiveCheckbox: document.getElementById("case-sensitive-checkbox"),
    regexCheckbox: document.getElementById("regex-checkbox"),
    splitViewBtn: document.getElementById("split-view-btn"),
    editorContainer: document.getElementById("editor-container"),
    beditBtn: document.getElementById("bedit-btn"),
    passwordInput: document.getElementById("password-input"),
    passwordSubmitBtn: document.getElementById("password-submit-btn"),
    defaultWordWrapCheck: document.getElementById("default-word-wrap"),
    defaultSplitViewCheck: document.getElementById("default-split-view"),
    defaultAutoIndentCheck: document.getElementById("default-auto-indent"),
    defaultTurboBoostCheck: document.getElementById("default-turbo-boost"),
    enableSpellCheckerCheck: document.getElementById("enable-spell-checker"),
    autoCloseBracketsCheck: document.getElementById("auto-close-brackets"),
    focusModeCheck: document.getElementById("focus-mode-check"),
    defaultThemeSelect: document.getElementById("default-theme"),
    dateFormatSelect: document.getElementById("date-format-select"),
    exportSettingsBtn: document.getElementById("export-settings-btn"),
    importSettingsBtn: document.getElementById("import-settings-btn"),
    importSettingsInput: document.getElementById("import-settings-input"),
  };
  const popups = {
    findReplace: document.getElementById("find-replace-popup"),
    settings: document.getElementById("settings-popup"),
    password: document.getElementById("password-popup"),
  };

  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }

  async function encrypt(data, password) {
    const enc = new TextEncoder();
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      enc.encode(data),
    );
    const bufferToBase64 = (buffer) =>
      btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return {
      salt: bufferToBase64(salt),
      iv: bufferToBase64(iv),
      ciphertext: bufferToBase64(ciphertext),
    };
  }

  async function decrypt(encryptedData, password) {
    const base64ToBuffer = (base64) =>
      Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    try {
      const salt = base64ToBuffer(encryptedData.salt);
      const iv = base64ToBuffer(encryptedData.iv);
      const ciphertext = base64ToBuffer(encryptedData.ciphertext);
      const key = await deriveKey(password, salt);
      const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        ciphertext,
      );
      const dec = new TextDecoder();
      return dec.decode(decrypted);
    } catch (e) {
      console.error("Decryption failed", e);
      return null;
    }
  }

  async function getNoteId(password) {
    const enc = new TextEncoder();
    const data = enc.encode(password);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  let deferredPrompt;
  let activeTextbox = elements.textbox1;
  let currentLinkUrl = null;
  const MAX_RECENT_FILES = 5;
  let protectedNotes = {};
  let activeProtectedNotePassword = null;
  let fileHandles = {
    "textbox-1": null,
    "textbox-2": null,
  };

  let settings = {};
  const defaultSettings = {
    wordWrap: false,
    splitView: false,
    theme: "light",
    autoIndent: false,
    turboBoost: false,
    spellCheck: false,
    autoCloseBrackets: false,
    focusMode: false,
    dateFormat: "DD-MMM-YYYY",
    expansions: {},
  };

  function saveSettings() {
    localStorage.setItem("bedit-settings", JSON.stringify(settings));
  }

  function loadSettings() {
    const savedSettings = localStorage.getItem("bedit-settings");
    settings = savedSettings
      ? { ...defaultSettings, ...JSON.parse(savedSettings) }
      : { ...defaultSettings };
  }

  function applySettings(isInitialLoad = false) {
    const isWordWrapEnabled = settings.wordWrap;
    elements.textbox1.classList.toggle("word-wrap-enabled", isWordWrapEnabled);
    elements.textbox2.classList.toggle("word-wrap-enabled", isWordWrapEnabled);

    elements.textbox1.spellcheck = settings.spellCheck;
    elements.textbox2.spellcheck = settings.spellCheck;

    document.body.className = document.body.className.replace(/\b(dark|snow)-mode\b/g, "").trim();
    if (settings.theme === "dark") {
      document.body.classList.add("dark-mode");
    } else if (settings.theme === "snow") {
      document.body.classList.add("snow-mode");
    }

    if (isInitialLoad && settings.splitView) {
      toggleSplitView();
    }

    elements.defaultWordWrapCheck.checked = settings.wordWrap;
    elements.defaultSplitViewCheck.checked = settings.splitView;
    elements.defaultAutoIndentCheck.checked = settings.autoIndent;
    elements.defaultTurboBoostCheck.checked = settings.turboBoost;
    elements.enableSpellCheckerCheck.checked = settings.spellCheck;
    elements.autoCloseBracketsCheck.checked = settings.autoCloseBrackets;
    elements.focusModeCheck.checked = settings.focusMode;
    elements.defaultThemeSelect.value = settings.theme;
    elements.dateFormatSelect.value = settings.dateFormat;
    initializeExpansionSettings();
  }

  function saveProtectedNotes() {
    localStorage.setItem(
      "bedit-protected-notes",
      JSON.stringify(protectedNotes),
    );
  }

  function loadProtectedNotes() {
    const savedNotes = localStorage.getItem("bedit-protected-notes");
    protectedNotes = savedNotes ? JSON.parse(savedNotes) : {};
  }

  async function lockAndSaveProtectedNote() {
    if (!activeProtectedNotePassword) return;

    const content = elements.textbox1.value;
    const password = activeProtectedNotePassword;
    activeProtectedNotePassword = null;

    if (content.trim() === "") {
      elements.textbox1.value = "";
      elements.textbox1.placeholder =
        "Welcome to bEdit. Start typing to begin or click ? Help for help.";
      updateAllUI();
      storeLocally(elements.textbox1);
      alert(
        "Protected note session ended. No content was saved as the note was empty.",
      );
      return;
    }

    try {
      const encryptedData = await encrypt(content, password);
      const noteId = await getNoteId(password);
      protectedNotes[noteId] = encryptedData;
      saveProtectedNotes();

      elements.textbox1.value = "";
      elements.textbox1.placeholder =
        "Welcome to bEdit. Start typing to begin or click ? Help for help.";
      updateAllUI();
      storeLocally(elements.textbox1);
      alert("Note locked and saved.");
    } catch (error) {
      console.error("Encryption failed:", error);
      alert("Error: Could not lock and save the note.");
      activeProtectedNotePassword = password;
    }
  }

  async function handlePasswordSubmit() {
    const password = elements.passwordInput.value;
    elements.passwordInput.value = "";
    if (!password) {
      togglePopup(null, false);
      return;
    }

    togglePopup(null, false);

    const noteId = await getNoteId(password);

    if (protectedNotes.hasOwnProperty(noteId)) {
      const encryptedData = protectedNotes[noteId];
      const decryptedContent = await decrypt(encryptedData, password);

      if (decryptedContent !== null) {
        addToHistory(elements.textbox1.value, elements.textbox1.selectionStart);
        elements.textbox1.value = decryptedContent;
        elements.textbox1.placeholder =
          "Note unlocked. Press Ctrl + = to lock and save.";
        activeProtectedNotePassword = password;
        updateAllUI();
        storeLocally(elements.textbox1);
        elements.textbox1.focus();
      } else {
        alert("Incorrect password.");
        elements.textbox1.focus();
      }
    } else {
      addToHistory(elements.textbox1.value, elements.textbox1.selectionStart);
      elements.textbox1.value = "";
      elements.textbox1.placeholder =
        "New protected note. Type content and press Ctrl + = to lock and save.";
      activeProtectedNotePassword = password;
      updateAllUI();
      storeLocally(elements.textbox1);
      elements.textbox1.focus();
    }
  }

  function enterFullScreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
  }

  function exitFullScreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }

  function onFullScreenChange() {
    const isFullScreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
    if (settings.focusMode !== isFullScreen) {
      settings.focusMode = isFullScreen;
      elements.focusModeCheck.checked = isFullScreen;
      saveSettings();
    }
  }

  function isPWAInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./service-worker.js")
        .then((registration) => {
          console.log("ServiceWorker registration successful");
        })
        .catch((error) => {
          console.log("ServiceWorker registration failed: ", error);
        });
    });

    if (!isPWAInstalled()) {
      window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (!isMobileDevice() || /Android/i.test(navigator.userAgent)) {
          elements.installButton.style.display = "inline-flex";
        }
      });

      elements.installButton.addEventListener("click", (e) => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          deferredPrompt = null;
        });
      });

      window.addEventListener("appinstalled", (evt) => {
        elements.installButton.style.display = "none";
      });
    }
  }

  if (!window.name) {
    window.name =
      `bedit-tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  const tabId = window.name;

  let saveTimer;
  let currentMatches = [];
  let currentMatchIndex = -1;
  const MAX_HISTORY = 100;
  let history = [];
  let currentHistoryIndex = -1;
  let isUndoing = false;
  let lastChangeTime = 0;
  const CHANGE_DELAY = 1000;

  let historyCursorPositions = [];

  function adjustTextareaHeight() {
    elements.editorContainer.style.top = `${elements.nav.offsetHeight}px`;
  }

  function storeLocally(textbox) {
    if (!textbox) return;
    const key = `bedit_${tabId}_${textbox.id}`;
    localStorage.setItem(key, textbox.value);
  }

  function updateLinkButtonState() {
    const text = activeTextbox.value;
    const cursorPos = activeTextbox.selectionStart;

    const lineStartIndex = text.lastIndexOf("\n", cursorPos - 1) + 1;
    let lineEndIndex = text.indexOf("\n", cursorPos);
    if (lineEndIndex === -1) {
      lineEndIndex = text.length;
    }

    const currentLineText = text.substring(lineStartIndex, lineEndIndex);
    const urlRegex = /https?:\/\/[^\s]+/g;
    let match;
    let foundLink = null;

    while ((match = urlRegex.exec(currentLineText)) !== null) {
      const urlStartIndexInLine = match.index;
      const urlEndIndexInLine = urlStartIndexInLine + match[0].length;
      const cursorIndexInLine = cursorPos - lineStartIndex;

      if (
        cursorIndexInLine >= urlStartIndexInLine &&
        cursorIndexInLine <= urlEndIndexInLine
      ) {
        foundLink = match[0];
        break;
      }
    }
    currentLinkUrl = foundLink;
    elements.openLinkBtn.style.display = foundLink ? "inline-flex" : "none";
  }

  function updateAllUI() {
    updateCursorPosition();
    updateActiveLineHighlight();
    updateWordCount();
    updateLinkButtonState();
    updateUndoRedoButtons();
  }

  function updateCursorPosition() {
    const text = activeTextbox.value;
    const cursorPos = activeTextbox.selectionStart;
    const lines = text.substring(0, cursorPos).split("\n");
    elements.linePosition.textContent = lines.length;
    elements.charPosition.textContent = lines[lines.length - 1].length + 1;
  }

  function updateActiveLineHighlight() {
    const activeLineEl =
      activeTextbox === elements.textbox1
        ? elements.activeLine1
        : elements.activeLine2;
    if (!activeLineEl) return;

    const text = activeTextbox.value;
    const cursorPos = activeTextbox.selectionStart;
    const lines = text.substring(0, cursorPos).split("\n");
    const lineIndex = lines.length - 1;

    const lineHeight = parseFloat(getComputedStyle(activeTextbox).lineHeight);

    activeLineEl.style.top = `${lineIndex * lineHeight}px`;
    activeLineEl.style.height = `${lineHeight}px`;
    activeLineEl.style.display = "block";
  }

  function updateWordCount() {
    const text1 = elements.textbox1.value.trim();
    const text2 = elements.textbox2.value.trim();

    const words1 = text1
      ? text1.split(/\s+/).filter((word) => word.length > 0)
      : [];
    let totalWords = words1.length;

    if (elements.editorContainer.classList.contains("split-view-active")) {
      const words2 = text2
        ? text2.split(/\s+/).filter((word) => word.length > 0)
        : [];
      totalWords += words2.length;
    }

    elements.wordCount.textContent = totalWords.toString();
  }

  function getRecentFiles() {
    const files = localStorage.getItem("bedit-recent-files");
    return files ? JSON.parse(files) : [];
  }

  function removeRecentFile(filenameToRemove) {
    let recentFiles = getRecentFiles();
    recentFiles = recentFiles.filter(
      (file) => file.filename !== filenameToRemove,
    );
    localStorage.setItem("bedit-recent-files", JSON.stringify(recentFiles));
    updateRecentFilesUI();
  }

  function updateRecentFilesUI() {
    const files = getRecentFiles();
    const { recentFilesDatalist1, recentFilesDatalist2, recentFilesDropdown, recentFilesBtn } = elements;
    
    recentFilesDatalist1.innerHTML = "";
    recentFilesDatalist2.innerHTML = "";
    recentFilesDropdown.innerHTML = "";
    
    recentFilesBtn.disabled = files.length === 0;
    
    const fragment = document.createDocumentFragment();
    files.forEach((file) => {
      const option = document.createElement("option");
      option.value = file.filename;
      fragment.appendChild(option);

      const dropdownItem = document.createElement("div");
      dropdownItem.className = "recent-file-item";
      dropdownItem.dataset.filename = file.filename;
      dropdownItem.innerHTML = `<span class="recent-filename">${file.filename}</span><span class="delete-recent-btn" title="Remove from list" data-filename="${file.filename}"> [X]</span>`;
      recentFilesDropdown.appendChild(dropdownItem);
    });
    
    recentFilesDatalist1.appendChild(fragment.cloneNode(true));
    recentFilesDatalist2.appendChild(fragment);
}

  function addRecentFile(filename, content) {
    if (!filename || content === null || content === undefined) return;
    let recentFiles = getRecentFiles();
    recentFiles = recentFiles.filter((file) => file.filename !== filename);
    recentFiles.unshift({ filename, content, timestamp: Date.now() });
    if (recentFiles.length > MAX_RECENT_FILES) {
      recentFiles.pop();
    }
    localStorage.setItem("bedit-recent-files", JSON.stringify(recentFiles));
    updateRecentFilesUI();
  }

  function openDroppedFile(file, targetTextbox, targetFilenameBox) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      targetTextbox.value = content;
      targetFilenameBox.value = file.name;
      addRecentFile(file.name, content);
      storeLocally(targetTextbox);

      if (targetTextbox === elements.textbox1) {
        history = [];
        historyCursorPositions = [];
        currentHistoryIndex = -1;
        addToHistory(content, 0);
      }
      activeTextbox = targetTextbox;
      updateAllUI();
      updateHighlights();
    };
    reader.onerror = (e) => {
      console.warn("Could not read the file.", file.name, e);
    };
    reader.readAsText(file);
  }

  async function openFile() {
    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await window.showOpenFilePicker();
        const file = await handle.getFile();
        const targetTextbox =
          activeTextbox === elements.textbox2
            ? elements.textbox2
            : elements.textbox1;
        const targetFilenameBox =
          activeTextbox === elements.textbox2
            ? elements.filenameBox2
            : elements.filenameBox1;

        fileHandles[targetTextbox.id] = handle;
        openDroppedFile(file, targetTextbox, targetFilenameBox);
      } catch (err) {
        console.log("Open file dialog was cancelled or failed.", err);
      }
    } else {
      const openInput = activeTextbox === elements.textbox2 ? elements.openInput2 : elements.openInput1;
      openInput.click();
    }
  }

  function handleFileOpen(event, targetTextbox, targetFilenameBox) {
    const file = event.target.files[0];
    if (file) {
      fileHandles[targetTextbox.id] = null;
      openDroppedFile(file, targetTextbox, targetFilenameBox);
    }
  }

  async function saveFile() {
    if (activeTextbox === elements.textbox1 && activeProtectedNotePassword) {
      const userConfirmed = confirm(
        "Warning: This is a password-protected file. Saving it to your device will remove the password protection and save the content as plain text. Are you sure you want to continue?",
      );
      if (!userConfirmed) {
        return;
      }
    }

    const handle = fileHandles[activeTextbox.id];
    const content = activeTextbox.value;

    if (handle && "createWritable" in handle) {
      try {
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        addRecentFile(handle.name, content);
        console.log("File saved successfully to existing handle.");
        return;
      } catch (err) {
        console.error(
          'Could not save to existing handle. Fallback to "Save As".',
          err,
        );
        fileHandles[activeTextbox.id] = null;
      }
    }

    if ("showSaveFilePicker" in window) {
      try {
        const filenameBox = activeTextbox === elements.textbox1 ? elements.filenameBox1 : elements.filenameBox2;
        const saveAsHandle = await window.showSaveFilePicker({
          suggestedName: filenameBox.value || "bedit.txt",
          types: [
            {
              description: "Text Files",
              accept: {
                "text/plain": [
                  ".txt",
                  ".text",
                  ".js",
                  ".css",
                  ".html",
                  ".md",
                  ".json",
                ],
              },
            },
          ],
        });
        fileHandles[activeTextbox.id] = saveAsHandle;
        filenameBox.value = saveAsHandle.name;

        const writable = await saveAsHandle.createWritable();
        await writable.write(content);
        await writable.close();
        addRecentFile(saveAsHandle.name, content);
        return;
      } catch (err) {
        console.log("Save As dialog was cancelled or failed.", err);
        return;
      }
    }

    const filenameBox = activeTextbox === elements.textbox2 ? elements.filenameBox2 : elements.filenameBox1;
    const filename = filenameBox.value || "bedit.txt";
    addRecentFile(filename, content);

    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openNewTab() {
    window.open(window.location.origin, "_blank");
  }

  function togglePopup(popupId, show) {
    Object.values(popups).forEach(popup => popup.style.display = 'none');
    elements.overlay.style.display = "none";

    if (show && popupId && popups[popupId]) {
      popups[popupId].style.display = "block";
      elements.overlay.style.display = "block";
      if (popupId === "findReplace" && elements.findText) {
        elements.findText.focus();
        elements.findText.select();
        findAllMatches();
      } else if (popupId === "settings") {
        applySettings();
      } else if (popupId === "password") {
        elements.passwordInput.focus();
      }
    } else {
      elements.highlightLayer1.innerHTML = "";
      elements.highlightLayer2.innerHTML = "";
    }
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      togglePopup(null, false);
    }
  });

  function addToHistory(state, cursorPosition) {
    if (activeTextbox !== elements.textbox1 || history[currentHistoryIndex] === state) {
      return;
    }

    if (currentHistoryIndex < history.length - 1) {
      history.splice(currentHistoryIndex + 1);
      historyCursorPositions.splice(currentHistoryIndex + 1);
    }
    history.push(state);
    historyCursorPositions.push(cursorPosition);
    if (history.length > MAX_HISTORY) {
      history.shift();
      historyCursorPositions.shift();
    }
    currentHistoryIndex = history.length - 1;
    updateUndoRedoButtons();
  }

  function undo() {
    if (activeTextbox !== elements.textbox1 || currentHistoryIndex <= 0) return;
    currentHistoryIndex--;
    restoreState();
  }

  function redo() {
    if (
      activeTextbox !== elements.textbox1 ||
      currentHistoryIndex >= history.length - 1
    )
      return;
    currentHistoryIndex++;
    restoreState();
  }

  function restoreState() {
    isUndoing = true;
    elements.textbox1.value = history[currentHistoryIndex];
    const cursorPos = historyCursorPositions[currentHistoryIndex];
    elements.textbox1.focus();
    elements.textbox1.setSelectionRange(cursorPos, cursorPos);

    activeTextbox = elements.textbox1;
    updateAllUI();
    storeLocally(elements.textbox1);
    updateHighlights();
    isUndoing = false;
  }

  function updateUndoRedoButtons() {
    const isPrimaryActive = activeTextbox === elements.textbox1;
    elements.undoButton.disabled = !isPrimaryActive || currentHistoryIndex <= 0;
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findAllMatches() {
    const searchTerm = elements.findText.value;
    const text = activeTextbox.value;
    if (!searchTerm) {
      currentMatches = [];
      updateFindCount();
      updateHighlights();
      return;
    }
    const isCaseSensitive = elements.caseSensitiveCheckbox.checked;
    const isRegex = elements.regexCheckbox.checked;
    const flags = isCaseSensitive ? "g" : "gi";
    const pattern = isRegex ? searchTerm : escapeRegExp(searchTerm);

    try {
      const regex = new RegExp(pattern, flags);
      currentMatches = [...text.matchAll(regex)].map(match => ({
          start: match.index,
          end: match.index + match[0].length,
      }));
    } catch (e) {
      currentMatches = [];
      console.error("Invalid Regex:", e);
    }

    updateFindCount();
    updateHighlights();
  }

  function updateHighlights() {
    const highlightLayer =
      activeTextbox === elements.textbox1
        ? elements.highlightLayer1
        : elements.highlightLayer2;
    const otherHighlightLayer =
      activeTextbox === elements.textbox1
        ? elements.highlightLayer2
        : elements.highlightLayer1;

    highlightLayer.innerHTML = "";
    if (activeTextbox !== elements.textbox1) {
      otherHighlightLayer.innerHTML = "";
    }

    if (currentMatches.length === 0) return;

    const text = activeTextbox.value;
    const frag = document.createDocumentFragment();
    const lineHeight = parseFloat(getComputedStyle(activeTextbox).lineHeight);

    const span = document.createElement("span");
    span.style.font = getComputedStyle(activeTextbox).font;
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.whiteSpace = "pre";
    document.body.appendChild(span);
    span.textContent = "M";
    const charWidth = span.getBoundingClientRect().width;
    document.body.removeChild(span);

    currentMatches.forEach((match) => {
      const textBefore = text.substring(0, match.start);
      const lines = textBefore.split("\n");
      const lineIndex = lines.length - 1;
      const charPos = lines[lineIndex].length;
      const highlight = document.createElement("div");
      highlight.className = "highlight";
      highlight.style.cssText = `top: ${lineIndex * lineHeight}px; left: ${charPos * charWidth}px; width: ${(match.end - match.start) * charWidth}px; height: ${lineHeight}px;`;
      frag.appendChild(highlight);
    });
    highlightLayer.appendChild(frag);
  }

  function updateFindCount() {
    if (elements.findText.value === "") {
      elements.findCount.textContent = "";
    } else {
        elements.findCount.textContent = `${currentMatches.length} match${currentMatches.length === 1 ? '' : 'es'}`;
    }
  }

  function findNext() {
    if (currentMatches.length === 0) {
      findAllMatches();
    }
    if (currentMatches.length === 0) return;
    const currentPosition = activeTextbox.selectionStart;
    let nextMatchIndex = -1;

    if (
      currentMatchIndex !== -1 &&
      currentMatches[currentMatchIndex] &&
      currentMatches[currentMatchIndex].start === activeTextbox.selectionStart
    ) {
      nextMatchIndex = (currentMatchIndex + 1) % currentMatches.length;
    } else {
        nextMatchIndex = currentMatches.findIndex(match => match.start >= currentPosition);
    }

    if (nextMatchIndex === -1 && currentMatches.length > 0) {
      nextMatchIndex = 0;
    }

    if (nextMatchIndex !== -1) {
      currentMatchIndex = nextMatchIndex;
      const match = currentMatches[currentMatchIndex];
      activeTextbox.focus();
      activeTextbox.setSelectionRange(match.start, match.end);

      const highlightLayer =
        activeTextbox === elements.textbox1
          ? elements.highlightLayer1
          : elements.highlightLayer2;
      if (highlightLayer.children[currentMatchIndex]) {
        const matchTop = highlightLayer.children[currentMatchIndex].offsetTop;
        activeTextbox.scrollTop = matchTop - activeTextbox.clientHeight / 2;
      }
    }
  }

  function replaceCurrentMatch() {
    const replacement = elements.replaceText.value;
    const { selectionStart, selectionEnd } = activeTextbox;
    if (selectionStart === selectionEnd) {
      findNext();
      return;
    }
    const currentText = activeTextbox.value;
    addToHistory(currentText, selectionStart);
    activeTextbox.value = currentText.slice(0, selectionStart) + replacement + currentText.slice(selectionEnd);
    
    const newCursorPos = selectionStart + replacement.length;
    activeTextbox.setSelectionRange(newCursorPos, newCursorPos);

    storeLocally(activeTextbox);
    updateAllUI();
    findAllMatches();
    activeTextbox.focus();
  }

  function replaceAll() {
    const replacement = elements.replaceText.value;
    const searchTerm = elements.findText.value;
    if (!searchTerm) return;
    addToHistory(activeTextbox.value, activeTextbox.selectionStart);
    const isCaseSensitive = elements.caseSensitiveCheckbox.checked;
    const isRegex = elements.regexCheckbox.checked;
    const flags = isCaseSensitive ? "g" : "gi";
    const pattern = isRegex ? searchTerm : escapeRegExp(searchTerm);
    try {
      const regex = new RegExp(pattern, flags);
      activeTextbox.value = activeTextbox.value.replace(regex, replacement);
      storeLocally(activeTextbox);
      updateAllUI();
      findAllMatches();
    } catch (e) {
      console.error("Invalid Regex for replace all:", e);
    }
  }

  function cycleTheme() {
    const themes = ["light", "dark", "snow"];
    const currentThemeIndex = themes.indexOf(settings.theme);
    settings.theme = themes[(currentThemeIndex + 1) % themes.length];
    saveSettings();
    applySettings();
  }

  function toggleSplitView() {
    const isActive =
      elements.editorContainer.classList.toggle("split-view-active");
    elements.filenameBox2.style.display = isActive ? "inline-block" : "none";
    (isActive ? elements.textbox2 : elements.textbox1).focus();
    updateWordCount();
    return isActive;
  }

  function initializeExpansionSettings() {
    const container = document.getElementById("text-expansion-content");
    if (!container) return;
    container.innerHTML = "";
    if (!settings.expansions) settings.expansions = {};

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 26; i++) {
      const char = String.fromCharCode(97 + i);
      const shortcutKey = `.${char}`;
      const row = document.createElement("div");
      row.className = "expansion-row";
      row.innerHTML = `
        <label for="expansion-input-${char}">${shortcutKey}</label>
        <input type="text" id="expansion-input-${char}" placeholder="Expanded text for ${shortcutKey}">
      `;
      const input = row.querySelector("input");
      
      if (char === "d") {
        input.value = "(Date)";
        input.readOnly = true;
        input.title = "This is a built-in shortcut for the current date.";
      } else {
        input.value = settings.expansions[char] || "";
        input.addEventListener("input", () => {
          settings.expansions[char] = input.value;
          saveSettings();
        });
      }
      fragment.appendChild(row);
    }
    container.appendChild(fragment);
  }

  function handleExpansion(event) {
    if (!settings.expansions) return;
    const textbox = event.target;
    const text = textbox.value;
    const cursorPos = textbox.selectionStart;
    const triggerMatch = text.substring(0, cursorPos).match(/\.([a-z])\s$/);

    if (triggerMatch) {
      const key = triggerMatch[1];
      let expansionText;

      if (key === "d") {
        const date = new Date();
        const day = String(date.getDate()).padStart(2, "0");
        const monthNum = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        const yearShort = String(year).slice(-2);
        const monthNames = [
          "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
          "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
        ];
        const monthName = monthNames[date.getMonth()];

        switch (settings.dateFormat) {
          case "MM/DD/YY":
            expansionText = `${monthNum}/${day}/${yearShort}`;
            break;
          case "YYYY-MMM-DD":
            expansionText = `${year}-${monthName}-${day}`;
            break;
          case "DD-MMM-YYYY":
          default:
            expansionText = `${day}-${monthName}-${year}`;
            break;
        }
      } else {
        expansionText = settings.expansions[key];
      }

      if (expansionText) {
        event.preventDefault();
        const triggerLength = 3;
        const textBefore = text.substring(0, cursorPos - triggerLength);
        const textAfter = text.substring(cursorPos);
        addToHistory(textbox.value, cursorPos);
        textbox.value = textBefore + expansionText + textAfter;
        const newCursorPos = textBefore.length + expansionText.length;
        textbox.setSelectionRange(newCursorPos, newCursorPos);
        updateAllUI();
        storeLocally(textbox);
      }
    }
  }

  function handleExportSettings() {
    const settingsString = JSON.stringify(settings, null, 2);
    const blob = new Blob([settingsString], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bedit-settings.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleImportSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedSettings = JSON.parse(e.target.result);
        settings = { ...defaultSettings, ...importedSettings };
        saveSettings();
        applySettings();
        alert("Settings imported successfully!");
      } catch (error) {
        alert(
          "Error: Could not parse settings file. Please make sure it's a valid JSON file.",
        );
        console.error("Settings import error:", error);
      }
    };
    reader.onerror = () => {
      alert("Error reading the file.");
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function openRecentFile(filename) {
    const recentFiles = getRecentFiles();
    const selectedFile = recentFiles.find((file) => file.filename === filename);

    if (selectedFile) {
      const targetTextbox = activeTextbox;
      const targetFilenameBox =
        targetTextbox === elements.textbox1
          ? elements.filenameBox1
          : elements.filenameBox2;

      targetTextbox.value = selectedFile.content;
      targetFilenameBox.value = selectedFile.filename;
      fileHandles[targetTextbox.id] = null;

      storeLocally(targetTextbox);
      if (targetTextbox === elements.textbox1) {
        addToHistory(selectedFile.content, 0);
      }
      updateAllUI();
      targetTextbox.focus();
    }
  }

  function handleFilenameChange(event) {
    openRecentFile(event.target.value);
  }

  function openHighlightedLink() {
    const textbox = activeTextbox;
    if (!textbox) return;

    const selectedText = textbox.value
      .substring(textbox.selectionStart, textbox.selectionEnd)
      .trim();
    let urlToOpen = selectedText || currentLinkUrl;

    if (!urlToOpen) return;

    let url = urlToOpen;
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }

    try {
      new URL(url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("The text is not a valid URL:", url, e);
    }
  }

  function shareViaEmail() {
    const content = activeTextbox.value;
    if (!content) {
      alert("There is no content to email.");
      return;
    }
    const filenameBox =
      activeTextbox === elements.textbox1
        ? elements.filenameBox1
        : elements.filenameBox2;
    const subject = encodeURIComponent(filenameBox.value || "Note from bEdit");
    const body = encodeURIComponent(content);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function handleKeyDown(event) {
    const targetTextbox = event.target.closest(".textbox");
    if (!targetTextbox) return;

    const pairs = {
      "(": ")", "[": "]", "{": "}", "'": "'", '"': '"', "<": ">",
    };
    const openChars = Object.keys(pairs);
    if (settings.autoCloseBrackets && openChars.includes(event.key)) {
      event.preventDefault();
      const openChar = event.key;
      const closeChar = pairs[openChar];
      const s = targetTextbox.selectionStart;
      const e = targetTextbox.selectionEnd;
      const text = targetTextbox.value;
      addToHistory(text, s);
      if (s !== e) {
        const selectedText = text.substring(s, e);
        targetTextbox.value =
          `${text.substring(0, s)}${openChar}${selectedText}${closeChar}${text.substring(e)}`;
        targetTextbox.selectionStart = s + 1;
        targetTextbox.selectionEnd = e + 1;
      } else {
        targetTextbox.value =
          `${text.substring(0, s)}${openChar}${closeChar}${text.substring(e)}`;
        targetTextbox.selectionStart = targetTextbox.selectionEnd = s + 1;
      }

      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        storeLocally(targetTextbox);
      }, 500);
      updateAllUI();
      return;
    }

    if (event.key === "Enter") {
      if (settings.autoIndent) {
        event.preventDefault();
        const s = targetTextbox.selectionStart;
        const e = targetTextbox.selectionEnd;
        const text = targetTextbox.value;
        const lineStart = text.lastIndexOf("\n", s - 1) + 1;
        const currentLine = text.substring(lineStart, s);
        const indentation = currentLine.match(/^\s*/)[0];

        addToHistory(text, s);

        const newText =
          `${text.substring(0, s)}\n${indentation}${text.substring(e)}`;
        const newCursorPos = s + 1 + indentation.length;

        targetTextbox.value = newText;
        targetTextbox.selectionStart = targetTextbox.selectionEnd =
          newCursorPos;
        updateAllUI();
      }
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const tabSpaces = "    ";
      const s = targetTextbox.selectionStart;
      const e = targetTextbox.selectionEnd;
      addToHistory(targetTextbox.value, s);
      targetTextbox.value =
        `${targetTextbox.value.substring(0, s)}${tabSpaces}${targetTextbox.value.substring(e)}`;
      targetTextbox.selectionStart = targetTextbox.selectionEnd =
        s + tabSpaces.length;
      updateAllUI();
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if ("osfkzynhmie/=".includes(key)) {
        event.preventDefault();
      }
      switch (key) {
        case "o": openFile(); break;
        case "s": saveFile(); break;
        case "e": shareViaEmail(); break;
        case "f": togglePopup("findReplace", true); break;
        case "k": openHighlightedLink(); break;
        case "z": undo(); break;
        case "y": redo(); break;
        case "n": openNewTab(); break;
        case "m": cycleTheme(); break;
        case "i": toggleSplitView(); break;
        case "/": togglePopup("settings", true); break;
        case "=":
          if (activeProtectedNotePassword) {
            lockAndSaveProtectedNote();
          } else {
            togglePopup("password", true);
          }
          break;
      }
    }

    if (
      [
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        "Home", "End", "PageUp", "PageDown",
      ].includes(event.key)
    ) {
      setTimeout(updateAllUI, 0);
    }
  }

  function handleMouseUp() {
    setTimeout(updateAllUI, 0);
  }

  function handleInput(event) {
    const targetTextbox = event.target;
    handleExpansion(event);
    updateAllUI();
    if (popups.findReplace.style.display === "block") {
      findAllMatches();
    }

    if (!isUndoing) {
      const now = Date.now();
      if (now - lastChangeTime > CHANGE_DELAY || history.length === 0) {
        addToHistory(targetTextbox.value, targetTextbox.selectionStart);
        lastChangeTime = now;
      }
    }

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      storeLocally(targetTextbox);
    }, 500);
  }

  loadSettings();
  loadProtectedNotes();
  applySettings(true);

  [elements.textbox1, elements.textbox2].forEach((tb) => {
    tb.addEventListener("focus", (e) => {
      activeTextbox = e.target;
      updateAllUI();
    });
    tb.addEventListener("click", (e) => {
      activeTextbox = e.target;
      updateAllUI();
    });
    tb.addEventListener("keydown", handleKeyDown);
    tb.addEventListener("keyup", updateActiveLineHighlight);
    tb.addEventListener("mouseup", handleMouseUp);
    tb.addEventListener("input", handleInput);
  });

  [elements.filenameBox1, elements.filenameBox2].forEach((box) => {
    box.addEventListener("change", handleFilenameChange);
  });

  elements.openBtn.addEventListener("click", openFile);
  elements.saveBtn.addEventListener("click", saveFile);
  elements.emailBtn.addEventListener("click", shareViaEmail);
  elements.openInput1.addEventListener("change", (e) =>
    handleFileOpen(e, elements.textbox1, elements.filenameBox1),
  );
  elements.openInput2.addEventListener("change", (e) =>
    handleFileOpen(e, elements.textbox2, elements.filenameBox2),
  );
  elements.recentFilesBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const dropdown = elements.recentFilesDropdown;
    dropdown.style.display =
      dropdown.style.display === "block" ? "none" : "block";
  });
  elements.recentFilesDropdown.addEventListener("click", (e) => {
    const target = e.target;
    e.stopPropagation();
    if (target.classList.contains("delete-recent-btn")) {
      removeRecentFile(target.dataset.filename);
    } else {
      const item = target.closest(".recent-file-item");
      if (item) {
        openRecentFile(item.dataset.filename);
        elements.recentFilesDropdown.style.display = "none";
      }
    }
  });

  document.addEventListener("fullscreenchange", onFullScreenChange);
  document.addEventListener("webkitfullscreenchange", onFullScreenChange);
  document.addEventListener("mozfullscreenchange", onFullScreenChange);
  document.addEventListener("MSFullscreenChange", onFullScreenChange);

  window.addEventListener("click", (e) => {
    if (!elements.recentFilesBtn.contains(e.target)) {
      elements.recentFilesDropdown.style.display = "none";
    }
  });

  elements.findReplaceBtn.addEventListener("click", () => togglePopup("findReplace", true));
  elements.openLinkBtn.addEventListener("click", openHighlightedLink);
  elements.undoButton.addEventListener("click", undo);
  elements.openNewTabBtn.addEventListener("click", openNewTab);
  elements.splitViewBtn.addEventListener("click", toggleSplitView);
  elements.beditBtn.addEventListener("click", () => togglePopup("settings", true));

  elements.defaultWordWrapCheck.addEventListener("change", (e) => {
    settings.wordWrap = e.target.checked;
    saveSettings();
    applySettings();
  });
  elements.defaultSplitViewCheck.addEventListener("change", (e) => {
    settings.splitView = e.target.checked;
    saveSettings();
  });
  elements.defaultAutoIndentCheck.addEventListener("change", (e) => {
    settings.autoIndent = e.target.checked;
    saveSettings();
  });
  elements.defaultTurboBoostCheck.addEventListener("change", (e) => {
    settings.turboBoost = e.target.checked;
    saveSettings();
  });
  elements.enableSpellCheckerCheck.addEventListener("change", (e) => {
    settings.spellCheck = e.target.checked;
    saveSettings();
    applySettings();
  });
  elements.autoCloseBracketsCheck.addEventListener("change", (e) => {
    settings.autoCloseBrackets = e.target.checked;
    saveSettings();
  });
  elements.focusModeCheck.addEventListener("change", (e) => {
    settings.focusMode = e.target.checked;
    saveSettings();
    if (settings.focusMode) {
      enterFullScreen();
    } else {
      exitFullScreen();
    }
  });
  elements.defaultThemeSelect.addEventListener("change", (e) => {
    settings.theme = e.target.value;
    saveSettings();
    applySettings();
  });
  elements.dateFormatSelect.addEventListener("change", (e) => {
    settings.dateFormat = e.target.value;
    saveSettings();
  });
  elements.exportSettingsBtn.addEventListener("click", handleExportSettings);
  elements.importSettingsBtn.addEventListener("click", () =>
    elements.importSettingsInput.click(),
  );
  elements.importSettingsInput.addEventListener("change", handleImportSettings);

  elements.findText.addEventListener("input", findAllMatches);
  elements.caseSensitiveCheckbox.addEventListener("change", findAllMatches);
  elements.regexCheckbox.addEventListener("change", findAllMatches);
  elements.findBtn.addEventListener("click", findNext);
  elements.replaceBtn.addEventListener("click", replaceCurrentMatch);
  elements.replaceAllBtn.addEventListener("click", replaceAll);
  elements.passwordSubmitBtn.addEventListener("click", handlePasswordSubmit);
  elements.passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handlePasswordSubmit();
    }
  });

  elements.closeButtons.forEach((button) => {
    button.addEventListener("click", () => togglePopup(null, false));
  });

  elements.overlay.addEventListener("click", () => togglePopup(null, false));

  adjustTextareaHeight();
  window.addEventListener("resize", adjustTextareaHeight);

  const savedContent1 = localStorage.getItem(
    `bedit_${tabId}_${elements.textbox1.id}`,
  );
  if (savedContent1) {
    elements.textbox1.value = savedContent1;
    addToHistory(savedContent1, 0);
  } else {
    addToHistory(elements.textbox1.value, 0);
  }
  const savedContent2 = localStorage.getItem(
    `bedit_${tabId}_${elements.textbox2.id}`,
  );
  if (savedContent2) {
    elements.textbox2.value = savedContent2;
  }

  updateAllUI();
  updateRecentFilesUI();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("readme") === "true") {
    togglePopup("readme", true);
  }

  const { editorContainer } = elements;
  editorContainer.addEventListener("dragover", (event) => {
    event.preventDefault();
    editorContainer.classList.add("drag-over");
  });
  editorContainer.addEventListener("dragleave", (event) => {
    event.preventDefault();
    editorContainer.classList.remove("drag-over");
  });
  editorContainer.addEventListener("drop", (event) => {
    event.preventDefault();
    editorContainer.classList.remove("drag-over");
    const files = event.dataTransfer.files;
    if (!files || files.length === 0) {
      return;
    }

    const targetTextbox = event.target.closest(".textbox");
    if (targetTextbox === elements.textbox2) {
      fileHandles[elements.textbox2.id] = null;
      openDroppedFile(files[0], elements.textbox2, elements.filenameBox2);
    } else {
      fileHandles[elements.textbox1.id] = null;
      openDroppedFile(files[0], elements.textbox1, elements.filenameBox1);
      if (
        files.length > 1 &&
        elements.editorContainer.classList.contains("split-view-active")
      ) {
        fileHandles[elements.textbox2.id] = null;
        openDroppedFile(files[1], elements.textbox2, elements.filenameBox2);
      }
    }
  });

  if ("launchQueue" in window) {
    launchQueue.setConsumer(async (launchParams) => {
      if (!launchParams.files || launchParams.files.length === 0) {
        return;
      }
      for (const fileHandle of launchParams.files) {
        let targetTextbox, targetFilenameBox;
        if (
          activeTextbox === elements.textbox1 &&
          elements.textbox1.value === ""
        ) {
            targetTextbox = elements.textbox1;
            targetFilenameBox = elements.filenameBox1;
        } else if (
          elements.editorContainer.classList.contains("split-view-active") &&
          elements.textbox2.value === ""
        ) {
            targetTextbox = elements.textbox2;
            targetFilenameBox = elements.filenameBox2;
        } else {
            targetTextbox = elements.textbox1;
            targetFilenameBox = elements.filenameBox1;
        }
        fileHandles[targetTextbox.id] = fileHandle;
        const file = await fileHandle.getFile();
        openDroppedFile(file, targetTextbox, targetFilenameBox);
      }
    });
  }
});