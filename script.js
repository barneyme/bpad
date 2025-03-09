var textbox = document.querySelector('#textbox');
var timeoutID = null;
var filenameBox = document.querySelector('#filename');

textbox.value = localStorage.getItem('bpad') || '';
textbox.setSelectionRange(textbox.value.length, textbox.value.length); 
calcStats(); 

function storeLocally() { 
    localStorage.setItem('bpad', textbox.value); 
}
window.onbeforeunload = storeLocally; 

textbox.onkeydown = function (event) {
    if (event.key === "Tab") {
        event.preventDefault();
        var text = this.value, s = this.selectionStart, e = this.selectionEnd;
        this.value = text.substring(0, s) + '\t' + text.substring(e);
        this.selectionStart = this.selectionEnd = s + 1;
    }
};

textbox.onkeyup = function () {
    calcStats();

        window.clearTimeout(timeoutID);
    timeoutID = window.setTimeout(storeLocally, 1000);
};

function calcStats() {
    updateCount('char', textbox.value.length);
    updateCount('word', textbox.value === "" ? 0 : textbox.value.replace(/\s+/g, ' ').split(' ').length);   
    updateCount('line', textbox.value === "" ? 0 : textbox.value.split(/\n/).length);
}

function updateCount(item, value) {
    document.querySelector('#' + item + '-count').textContent = value;
}

document.querySelector('#save a').onclick = function () {
    this.download = (filenameBox.value || 'bpad.txt').replace(/^([^.]*)$/, "$1.txt");
    this.href = URL.createObjectURL(new Blob([textbox.value], { type: 'text/plain' }));
};

document.querySelector('#open a').onclick = function () {
    document.querySelector('#open input').click();
};

document.querySelector('#open input').onchange
