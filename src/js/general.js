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
document.addEventListener("DOMContentLoaded", () => {
    const nav = document.querySelector("#desktop-header .notAList");
    const activeItem = nav.querySelector("li.active");
    const pill = document.createElement("span");
    pill.id = "nav-pill";
    nav.style.position = "relative";
    nav.insertBefore(pill, nav.firstChild);

    function movePillTo(el) {
        const inner = el.querySelector("a, button");
        if (!inner) return;
        const navRect = nav.getBoundingClientRect();
        const innerRect = inner.getBoundingClientRect();
        pill.style.width = innerRect.width + "px";
        pill.style.left = (innerRect.left - navRect.left) + "px";
        pill.style.opacity = "1";
    }

    if (activeItem) movePillTo(activeItem);

    window.addEventListener("load", () => {
        if (activeItem) movePillTo(activeItem);
    });

    nav.querySelectorAll("li").forEach(li => {
        li.addEventListener("mouseenter", () => {
            pill.classList.add("hovering");
            movePillTo(li);
        });
    });

    nav.addEventListener("mouseleave", () => {
        pill.classList.remove("hovering");
        if (activeItem) movePillTo(activeItem);
        else pill.style.opacity = "0";
    });
});