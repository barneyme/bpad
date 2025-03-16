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

window.addEventListener('keydown', function(event) {
    if (event.ctrlKey) {
        if (event.key === 'o') {
            event.preventDefault(); 
            document.querySelector('#open-input').click(); 
        } else if (event.key === 's') {
            event.preventDefault(); 
            document.querySelector('#save').click(); 
        }
    }
});
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

document.querySelector('#save').onclick = function () {
    var filename = filenameBox.value || 'bpad.txt';
    var blob = new Blob([textbox.value], {type: 'text/plain'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
};


document.querySelector('#open').onclick = function() {
    document.querySelector('#open-input').click();
};


document.querySelector('#open-input').onchange = function(event) {
    var file = event.target.files[0];
    if (file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            textbox.value = e.target.result;
            calcStats();
            storeLocally();
            filenameBox.value = file.name;
        };
        reader.readAsText(file);
    }
};
