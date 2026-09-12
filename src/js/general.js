// twemoji only walks the DOM it is handed, once. Anything rendered after load -
// article cards, article bodies - has to ask for its own pass, so this is a
// named helper rather than a one-shot, alongside markExternalLinks below.
window.parseEmoji = function (root) {
    if (!window.twemoji) return;
    twemoji.parse(root || document.body, {
        folder: 'svg',
        ext: '.svg',
    });
};

window.addEventListener("load", function () {
    window.parseEmoji(document.body);
});

document.addEventListener("DOMContentLoaded", function () {
    const spans = Array.from(document.querySelectorAll(".description span"));
    if (spans.length === 0) return;
    let currentIndex = 0;
    let shuffledSpans = [];

    function shuffleArray(array) {
        return array.sort(() => Math.random() - 0.5);
    }

    function swapSpans() {
        if (currentIndex === 0) {
            shuffledSpans = shuffleArray([...spans]);
        }
        spans.forEach(span => (span.style.display = "none"));
        shuffledSpans[currentIndex].style.display = "inline";
        currentIndex = (currentIndex + 1) % spans.length;
    }

    swapSpans();
    if (!document.documentElement.classList.contains("reduce-motion")) {
        setInterval(swapSpans, 2000);
    }
});

window.markExternalLinks = function (root) {
    (root || document).querySelectorAll('a[href^="http"]').forEach(function (a) {
        if (a.hasAttribute("target")) return;
        if (a.hostname === location.hostname) return;
        a.target = "_blank";
        a.rel = a.rel ? a.rel + " noopener" : "noopener";
    });
};

document.addEventListener("DOMContentLoaded", function () {
    window.markExternalLinks(document);
});

function setMenuOpen(open) {
    const menu = document.getElementById("mobileMenuID");
    if (!menu) return;
    menu.classList.toggle("showMenu", open);
    document
        .querySelectorAll('[aria-controls="mobileMenuID"]')
        .forEach((btn) => {
            btn.setAttribute("aria-expanded", open ? "true" : "false");
            const icon = btn.querySelector("i");
            if (icon) {
                icon.classList.toggle("fa-bars", !open);
                icon.classList.toggle("fa-bars-staggered", open);
            }
        });
}

function toggleMenu() {
    const menu = document.getElementById("mobileMenuID");
    if (menu) setMenuOpen(!menu.classList.contains("showMenu"));
}

function toggleSettings() {
    const inline = document.getElementById("settingsInline");
    if (inline) {
        inline.scrollIntoView({
            behavior: document.documentElement.classList.contains("reduce-motion")
                ? "auto"
                : "smooth",
            block: "start"
        });
        return;
    }

    if (window.matchMedia("(max-width: 966px)").matches) {
        location.href = "/settings/";
        return;
    }

    if (window.SettingsModal) window.SettingsModal.toggle();
}

document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    const menu = document.getElementById("mobileMenuID");
    if (menu && menu.classList.contains("showMenu")) setMenuOpen(false);
});

// Header and settings buttons declare their intent with data-action instead of
// an inline onclick, so the CSP can refuse inline scripts outright. Delegated
// from the document so the settings modal's own buttons work once injected.
const ACTIONS = {
    menu: toggleMenu,
    settings: toggleSettings
};

document.addEventListener("click", function (e) {
    const trigger = e.target.closest("[data-action]");
    if (!trigger) return;
    const action = ACTIONS[trigger.dataset.action];
    if (action) action();
});

document.addEventListener("DOMContentLoaded", function () {
    const year = document.getElementById("footerYear");
    if (year) year.textContent = new Date().getFullYear();
});

function isLocalHost() {
    const h = location.hostname;
    if (!h || h === "localhost" || h === "::1" || h.endsWith(".local") || h.endsWith(".lan")) return true;
    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    if (!m) return false;
    return Number(m[1]) === 127 || (Number(m[1]) === 169 && Number(m[2]) === 254);
}

// Registered after load so the install never competes with the first render.
// Never on localhost: there is no build step, so a cached shell would keep
// serving yesterday's CSS while you edit it. Any worker left over from a
// previous visit is torn down for the same reason.
window.addEventListener("load", function () {
    if (!("serviceWorker" in navigator)) return;

    if (isLocalHost() || /^\/articles\/(new|edit)\//.test(location.pathname)) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
            regs.forEach(function (reg) { reg.unregister(); });
        });
        if (window.caches) caches.keys().then(function (keys) {
            keys.filter(function (k) { return k.startsWith("aridan-"); })
                .forEach(function (k) { caches.delete(k); });
        });
        return;
    }

    navigator.serviceWorker.register("/sw.js").catch(function (err) {
        console.warn("Service worker registration failed", err);
    });
});

(function () {
    const pills = [];

    function movePillTo(host, pill, item) {
        const inner = item && item.querySelector("a, button");
        if (!inner) return;
        const hostRect = host.getBoundingClientRect();
        const innerRect = inner.getBoundingClientRect();
        pill.style.width = innerRect.width + "px";
        pill.style.left = (innerRect.left - hostRect.left) + "px";
        pill.style.opacity = "1";
    }

    function settle(host, pill) {
        const activeItem = host.querySelector("li.active");
        if (activeItem) movePillTo(host, pill, activeItem);
        else pill.style.opacity = "0";
    }

    function attachPill(list) {
        const host = list.parentElement;
        if (!host) return;

        const pill = document.createElement("span");
        pill.className = "nav-pill";
        host.style.position = "relative";
        host.insertBefore(pill, list);
        pills.push([host, pill]);

        list.querySelectorAll("li").forEach((li) => {
            li.addEventListener("mouseenter", () => {
                pill.classList.add("hovering");
                movePillTo(host, pill, li);
            });
        });

        host.addEventListener("mouseleave", () => {
            pill.classList.remove("hovering");
            settle(host, pill);
        });

        settle(host, pill);
    }

    window.repositionNavPills = function () {
        pills.forEach(([host, pill]) => settle(host, pill));
    };

    document.addEventListener("DOMContentLoaded", () => {
        [
            document.querySelector("#desktop-header nav .notAList"),
            document.querySelector("main .projectFilter ul")
        ].forEach((list) => { if (list) attachPill(list); });
    });

    window.addEventListener("load", () => window.repositionNavPills());
})();

(function () {
    const SUPPORTED = ["en", "sv", "hr", "bs"];
    const BADGE_SUFFIX = { sv: "_sv" };
    const dicts = {};
    let current = null;
    let currentLang = "en";
    const listeners = [];
    const originals = new WeakMap();
    const nodeOriginals = new WeakMap();
    const translated = new WeakSet();

    const SELECTORS = [
        "head > title",
        ".skipLink",
        "#desktop-header .notAList > li > a",
        "#mobile-header .mobileMenu li > a",
        "footer .footerNote > a",
        "footer .footerNote .rightsNote",
        "footer .footerNote.embedNote",
        "main .projectFilter li > button",
        "main .name",
        "main h2.section-title",
        "main .visuallyHidden",
        "main .description.titleColor",
        "main .description.white > span",
        "main p.section-content",
        "main ul.specs > li",
        "main .section > p",
        "main a.button",
        "main .pi-label",
        "main .pi-stat-label",
        "main p.statusWrapper:not(#statusWrapperOffline)",
        "main #lanyardRefresh",
        "main #Remaining",
        "main #Elapsed",
        "main #amRemaining",
        "main #amElapsed",
        "main .warn:not(#editorFolderBar) p",
        "main .articleAdminBar > button.button",
        "main #editorFolderBar > button.button",
        "main .editorField > span",
        "main .editorField > small",
        ".modal h2",
        ".settingsPanel .settingsGroupHeading",
        ".settingsPanel label.theme-label",
        ".settingsPanel label.button",
        ".settingsPanel label.title",
        ".modalButtons button"
    ];

    const ATTR_SELECTORS = [
        ["main .editorField > input[placeholder]", "placeholder"],
        ["main .editorField > textarea[placeholder]", "placeholder"],
        ["main .articleAdminBar [title]", "title"],
        ["main .articleAdminActions [title]", "title"],
        ["main .readMore a[title]", "title"],
        ["main #editorFolderBar [title]", "title"],
        ["main .article-navigation a[title]", "title"],
        ["main .activityNav[title]", "title"],
        ["main .activityNav[aria-label]", "aria-label"],
        ["header [title]", "title"],
        ["header [aria-label]", "aria-label"],
        ["footer [title]", "title"],
        ["footer [aria-label]", "aria-label"]
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

    function apply(el, value) {
        const hasMarkup = [...el.children].some((c) => c.tagName !== "I");
        if (hasMarkup) { el.innerHTML = value; return; }
        if (el.children.length === 0) { el.textContent = value; return; }
        for (const n of el.childNodes) {
            if (n.nodeType === 3 && n.nodeValue.trim()) { n.nodeValue = value; return; }
        }
        el.appendChild(document.createTextNode(value));
    }

    function swapAttrs() {
        ATTR_SELECTORS.forEach(([sel, attr]) => {
            document.querySelectorAll(sel).forEach((el) => {
                const keep = "data-i18n-" + attr;
                if (!el.hasAttribute(keep)) el.setAttribute(keep, el.getAttribute(attr) || "");
                const original = el.getAttribute(keep);
                el.setAttribute(attr, tr(normalize(original)) === normalize(original) ? original : tr(normalize(original)));
            });
        });
    }

    function swap() {
        collect().forEach((el) => {
            if (!originals.has(el)) originals.set(el, el.innerHTML);
            const original = originals.get(el);
            const val = current ? current[textOf(original)] : null;
            if (val != null) { apply(el, val); translated.add(el); }
            else if (translated.has(el)) { el.innerHTML = original; translated.delete(el); }
        });
        swapAttrs();
        swapTextNode(document.querySelector("main .description.white"), "a swedish");
        swapTextNode(document.getElementById("statusWrapperConnecting"), "Connecting");

        const genius = document.getElementById("amGeniusLink");
        if (genius) {
            genius.title = tr("View song information and lyrics on Genius");
            genius.setAttribute("aria-label", tr("View song information and lyrics on Genius"));
        }

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

    function reveal() {
        document.documentElement.classList.remove("i18n-wait");
    }

    function applyLanguage() {
        document.documentElement.setAttribute("lang", currentLang);
        const sel = document.getElementById("language");
        if (sel) sel.value = currentLang;
        swap();
        listeners.forEach((fn) => { try { fn(currentLang); } catch (e) { console.error(e); } });
        reveal();
    }

    function setLanguage(lang, persist) {
        if (!SUPPORTED.includes(lang)) lang = "en";
        currentLang = lang;
        if (persist) localStorage.setItem("lang", lang);

        if (lang === "en") { current = null; applyLanguage(); return; }
        if (dicts[lang]) { current = dicts[lang]; applyLanguage(); return; }
        const pre = window.__i18nPreload && window.__i18nPreload.lang === lang ? window.__i18nPreload.dict : null;
        (pre || fetch("/src/i18n/" + lang + ".json", { cache: "no-cache" }).then((r) => r.json()))
            .then((d) => { dicts[lang] = d; current = d; applyLanguage(); })
            .catch(reveal);
    }

    window.i18n = {
        t(en) {
            let s = tr(normalize(en));
            for (let i = 1; i < arguments.length; i++) s = s.split("{" + (i - 1) + "}").join(arguments[i]);
            return s;
        },
        get lang() { return currentLang; },
        onChange(fn) { listeners.push(fn); if (current || currentLang === "en") fn(currentLang); }
    };

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
