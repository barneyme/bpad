const markdownInput = document.getElementById('markdown');
const preview = document.getElementById('preview');

markdownInput.addEventListener('input', () => {
    const markdownText = markdownInput.value;
    preview.innerHTML = marked(markdownText);
});

// Optional: Load saved content from localStorage
window.onload = () => {
    const savedMarkdown = localStorage.getItem('markdown');
    if (savedMarkdown) {
        markdownInput.value = savedMarkdown;
        preview.innerHTML = marked(savedMarkdown);
    }
};

// Save content to localStorage
markdownInput.addEventListener('input', () => {
    localStorage.setItem('markdown', markdownInput.value);
});
