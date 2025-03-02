var textbox = document.querySelector('#textbox');
var timeoutID = null;
var filenameBox = document.querySelector('#filename');

// Automatically load/save cache in local storage when opening and closing the page
textbox.value = localStorage.getItem('bpad') || '';
textbox.setSelectionRange(textbox.value.length, textbox.value.length); // Place caret at end of content
calcStats(); // Update counters after loading

function storeLocally() { 
    localStorage.setItem('bpad', textbox.value); 
}
window.onbeforeunload = storeLocally; // Corrected event name

// Allow inputting tabs in the textarea instead of changing focus to the next element
textbox.onkeydown = function (event) {
    if (event.key === "Tab") {
        event.preventDefault();
        var text = this.value, s = this.selectionStart, e = this.selectionEnd;
        this.value = text.substring(0, s) + '\t' + text.substring(e);
        this.selectionStart = this.selectionEnd = s + 1;
    }
};

textbox.onkeyup = function () {
    // Calculate text stats (using onkeyup is needed to update the count when deleting text)
    calcStats();

    // Auto-save to local storage (at most once per second)
    window.clearTimeout(timeoutID);
    timeoutID = window.setTimeout(storeLocally, 1000);
};

// Calculate and display character, words and line counts
function calcStats() {
//  updateCount('char', textbox.value.length);
    updateCount('word', textbox.value === "" ? 0 : textbox.value.replace(/\s+/g, ' ').split(' ').length);
//  updateCount('line', textbox.value === "" ? 0 : textbox.value.split(/\n/).length);
}

function updateCount(item, value) {
    document.querySelector('#' + item + '-count').textContent = value;
}

// Save textarea contents as a text file
document.querySelector('#save a').onclick = function () {
    this.download = (filenameBox.value || 'bpad.txt').replace(/^([^.]*)$/, "$1.txt");
    this.href = URL.createObjectURL(new Blob([textbox.value], { type: 'text/plain' }));
};

// Load contents from a text file
document.querySelector('#open a').onclick = function () {
    document.querySelector('#open input').click();
};

document.querySelector('#open input').onchange
