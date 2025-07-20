window.onload = function () {
    // Parse all emojis on the page
    twemoji.parse(document.body, {
        folder: 'svg',
        ext: '.svg',
    });
}

document.addEventListener("DOMContentLoaded", function () {
    const spans = Array.from(document.querySelectorAll(".description span"));
    let currentIndex = 0;
    let shuffledSpans = [];

    function shuffleArray(array) {
        return array.sort(() => Math.random() - 0.5);
    }

    function swapSpans() {
        if (currentIndex === 0) {
            shuffledSpans = shuffleArray([...spans]); // Shuffle when restarting cycle
        }
        spans.forEach(span => (span.style.display = "none"));
        shuffledSpans[currentIndex].style.display = "inline";
        currentIndex = (currentIndex + 1) % spans.length;
    }

    // Initialize first span and start interval
    swapSpans();
    setInterval(swapSpans, 2000);
});

function toggleMenu() {
    document.getElementById("mobileMenuID").classList.toggle("showMenu");
}

function toggleSettings() {
    document.getElementById("settingsDialog").classList.toggle("showMenuNoAnimation");
    document.getElementById("settingsModalMenu").classList.toggle("showMenuNoAnimation");
}