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

/* i18n: language switching 

   English is the source in the HTML. Any non-English language loads its dictionary
   from /src/i18n/<lang>.json (e.g. sv.json, hr.json) and swaps each element's text;
   anything without a translation is simply left in English (nothing breaks). Dynamic
   bits (the role cycler, live Pi-hole numbers, GitHub star counts) are left alone.
   To add a language: add its code to SUPPORTED, drop in <lang>.json, and add an
   <option> to the #language select. */
(function () {
    const SUPPORTED = ["en", "sv", "hr", "bs"];
    const BADGE_SUFFIX = { sv: "_sv" }; // languages with a localized Apple Music badge SVG
    const dicts = {};                   // lang -> dictionary (English text -> translation)
    let current = null;                 // active dictionary, or null for English
    let currentLang = "en";
    const originals = new WeakMap();     // element -> its original English innerHTML
    const nodeOriginals = new WeakMap(); // text node -> its original English value
    const translated = new WeakSet();    // elements currently showing a translation

    const SELECTORS = [
        "head > title",
        "#desktop-header .notAList > li > a",
        "#mobile-header .mobileMenu > li > a",
        "main h1.name",
        "main h2.section-title",
        "main .description.titleColor",
        "main .description.white > span",
        "main p.section-content",
        "main ul.specs > li",
        "main .section > p",
        "main a.button",
        "main .pi-label",
        "main .pi-stat-label",
        "main p.statusWrapper",
        "main .warn p",
        ".modal h2",
        ".modal h3",
        ".modal label.theme-label",
        ".modal label.button",
        ".modal label.title",
        ".modalButtons button"
    ];

    const normalize = (s) => (s || "").replace(/\s+/g, " ").trim();
    const tr = (en) => (current && current[en] != null ? current[en] : en);

    function collect() {
        const out = new Set();
        SELECTORS.forEach((sel) => document.querySelectorAll(sel).forEach((el) => out.add(el)));
        return [...out];
    }

    function textOf(html) {
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        return normalize(tmp.textContent);
    }

    // Replace an element's text while keeping any icon (<i>) it contains. Elements
    // that contain other markup (a link, a color swatch) get their innerHTML set,
    // so those translations include the markup.
    function apply(el, value) {
        const hasMarkup = [...el.children].some((c) => c.tagName !== "I");
        if (hasMarkup) { el.innerHTML = value; return; }
        if (el.children.length === 0) { el.textContent = value; return; }
        for (const n of el.childNodes) {
            if (n.nodeType === 3 && n.nodeValue.trim()) { n.nodeValue = value; return; }
        }
        el.appendChild(document.createTextNode(value));
    }

    function swap() {
        collect().forEach((el) => {
            if (!originals.has(el)) originals.set(el, el.innerHTML);
            const original = originals.get(el);
            const val = current ? current[textOf(original)] : null;
            if (val != null) { apply(el, val); translated.add(el); }
            else if (translated.has(el)) { el.innerHTML = original; translated.delete(el); }
        });
        // Loose text nodes not covered by an element selector.
        swapTextNode(document.querySelector("main .description.white"), "a swedish");
        swapTextNode(document.getElementById("statusWrapperConnecting"), "Connecting");

        // Apple Music "Listen on" badge -> localized SVG (where available), alt and tooltip.
        const amLink = document.getElementById("apple-link");
        const amBadge = amLink && amLink.querySelector("img");
        if (amLink) amLink.title = tr("Listen on Apple Music");
        if (amBadge) {
            const suffix = BADGE_SUFFIX[currentLang] || "";
            amBadge.src = "/assets/media/icons/listenOnAppleMusic" + suffix + ".svg";
            amBadge.alt = tr("A black button with the Apple Music logo and text that says 'Listen on Apple Music'.");
        }
    }

    function swapTextNode(container, phrase) {
        if (!container) return;
        for (const n of container.childNodes) {
            if (n.nodeType === 3 && n.nodeValue.trim()) {
                if (!nodeOriginals.has(n)) nodeOriginals.set(n, n.nodeValue);
                const orig = nodeOriginals.get(n);
                const val = current ? current[phrase] : null;
                n.nodeValue = val != null ? orig.replace(phrase, val) : orig;
                return;
            }
        }
    }

    function applyLanguage() {
        document.documentElement.setAttribute("lang", currentLang);
        const sel = document.getElementById("language");
        if (sel) sel.value = currentLang;
        swap();
    }

    function setLanguage(lang, persist) {
        if (!SUPPORTED.includes(lang)) lang = "en";
        currentLang = lang;
        if (persist) localStorage.setItem("lang", lang);

        if (lang === "en") { current = null; applyLanguage(); return; }
        if (dicts[lang]) { current = dicts[lang]; applyLanguage(); return; }
        fetch("/src/i18n/" + lang + ".json", { cache: "no-cache" })
            .then((r) => r.json())
            .then((d) => { dicts[lang] = d; current = d; applyLanguage(); })
            .catch(() => {});
    }

    function initI18n() {
        const sel = document.getElementById("language");
        if (!sel) { setTimeout(initI18n, 100); return; }
        sel.addEventListener("change", () => setLanguage(sel.value, true));
        setLanguage(localStorage.getItem("lang") || "en", false);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initI18n);
    } else {
        initI18n();
    }
})();