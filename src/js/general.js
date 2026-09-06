window.addEventListener("load", function () {
    // Parse all emojis on the page. Twemoji comes from a CDN, so it may not be
    // there at all - a blocked or failed script shouldn't take the page with it.
    if (!window.twemoji) return;
    twemoji.parse(document.body, {
        folder: 'svg',
        ext: '.svg',
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const spans = Array.from(document.querySelectorAll(".description span"));
    // Some pages (e.g. /pihole/) have a plain description with no spans to rotate.
    if (spans.length === 0) return;
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
    // Text that rotates on its own is exactly what Reduce motion is for: show one
    // role and leave it. settings.js has already put the class on <html>.
    if (!document.documentElement.classList.contains("reduce-motion")) {
        setInterval(swapSpans, 2000);
    }
});

function setMenuOpen(open) {
    const menu = document.getElementById("mobileMenuID");
    if (!menu) return;
    menu.classList.toggle("showMenu", open);
    document
        .querySelectorAll('[aria-controls="mobileMenuID"]')
        .forEach((btn) => btn.setAttribute("aria-expanded", open ? "true" : "false"));
}

function toggleMenu() {
    const menu = document.getElementById("mobileMenuID");
    if (menu) setMenuOpen(!menu.classList.contains("showMenu"));
}

function toggleSettings() {
    const inline = document.getElementById("settingsInline");
    if (inline) { // already on /settings/, nothing to open
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

// Escape closes whichever of the two panels is open. The modal handles its own
// key when it has focus; this covers the menu, which is only ever a link list.
document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    const menu = document.getElementById("mobileMenuID");
    if (menu && menu.classList.contains("showMenu")) setMenuOpen(false);
});

(function () {
    const pills = [];

    function movePillTo(nav, pill, item) {
        const inner = item && item.querySelector("a, button");
        if (!inner) return;
        const navRect = nav.getBoundingClientRect();
        const innerRect = inner.getBoundingClientRect();
        pill.style.width = innerRect.width + "px";
        pill.style.left = (innerRect.left - navRect.left) + "px";
        pill.style.opacity = "1";
    }

    function settle(nav, pill) {
        const activeItem = nav.querySelector("li.active");
        if (activeItem) movePillTo(nav, pill, activeItem);
        else pill.style.opacity = "0";
    }

    function attachPill(nav) {
        const pill = document.createElement("span");
        pill.className = "nav-pill";
        nav.style.position = "relative";
        nav.insertBefore(pill, nav.firstChild);
        pills.push([nav, pill]);

        nav.querySelectorAll("li").forEach((li) => {
            li.addEventListener("mouseenter", () => {
                pill.classList.add("hovering");
                movePillTo(nav, pill, li);
            });
        });

        nav.addEventListener("mouseleave", () => {
            pill.classList.remove("hovering");
            settle(nav, pill);
        });

        settle(nav, pill);
    }

    // Anything that moves the active item or the layout around it (switching
    // to Liquid Glass, the project filter tabs) calls this to catch the pills up.
    window.repositionNavPills = function () {
        pills.forEach(([nav, pill]) => settle(nav, pill));
    };

    document.addEventListener("DOMContentLoaded", () => {
        [
            document.querySelector("#desktop-header .notAList"), // the page links, not the icons beside them
            document.querySelector("main .projectFilter ul")
        ].forEach((nav) => { if (nav) attachPill(nav); });
    });

    window.addEventListener("load", () => window.repositionNavPills());
})();

// Any non-English language loads its dictionary
// from /src/i18n/<lang>.json (e.g. sv.json, hr.json) and swaps each element's text;

(function () {
    const SUPPORTED = ["en", "sv", "hr", "bs"]; // also listed in settings.js's boot - update both
    const BADGE_SUFFIX = { sv: "_sv" }; // languages with a localized Apple Music badge SVG
    const dicts = {};                   // lang -> dictionary (English text -> translation)
    let current = null;                 // active dictionary, or null for English
    let currentLang = "en";
    const listeners = [];                // re-render hooks for JS-generated text
    const originals = new WeakMap();     // element -> its original English innerHTML
    const nodeOriginals = new WeakMap(); // text node -> its original English value
    const translated = new WeakSet();    // elements currently showing a translation

    const SELECTORS = [
        "head > title",
        ".skipLink",
        "#desktop-header .notAList > li > a",
        /* Descendant, not child: the mobile links sit in <ul>s inside .mobileMenu,
           so the old `.mobileMenu > li > a` matched nothing and the whole mobile
           menu stayed in English. */
        "#mobile-header .mobileMenu li > a",
        "main .projectFilter li > button",
        "main .name",
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
        "main #lanyardRefresh",
        // The "elapsed"/"remaining" suffix beside an activity's timer.
        "main #Remaining",
        "main #Elapsed",
        "main #amRemaining",
        "main #amElapsed",
        /* Not #editorFolderBar: its <p> wraps a <span id="editorFolderState"> that
           the editor writes into, and swapping innerHTML here would replace the
           span with plain text - after which setFolderState() updates a detached
           node and the bar silently stops refreshing. That text translates itself
           through i18n.t() instead. */
        "main .warn:not(#editorFolderBar) p",
        // Article editor chrome. The toolbar inside #fieldBodyEditor belongs to
        // Toast UI and is left to the library.
        "main .articleAdminBar > button.button",
        "main #editorFolderBar > button.button",
        "main .editorField > span",
        "main .editorField > small",
        ".modal h2",
        // .settingsPanel, not .modal: the same panel also renders inline on /settings/.
        ".settingsPanel h3",
        ".settingsPanel label.theme-label",
        ".settingsPanel label.button",
        ".settingsPanel label.title",
        ".modalButtons button"
    ];

    /* Text held in attributes rather than in the document: placeholders and the
       tooltips on icon-only buttons. [selector, attribute] pairs. */
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
        // Icon-only header controls carry their name in an attribute.
        ["header [title]", "title"],
        ["header [aria-label]", "aria-label"]
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

    /* Attribute originals live on the element itself (data-i18n-<attr>) rather
       than in a WeakMap, so elements rebuilt by the editor keep working. */
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

    function reveal() {
        document.documentElement.classList.remove("i18n-wait");
    }

    function applyLanguage() {
        document.documentElement.setAttribute("lang", currentLang);
        const sel = document.getElementById("language");
        if (sel) sel.value = currentLang;
        swap();
        listeners.forEach((fn) => { try { fn(currentLang); } catch (e) { console.error(e); } });
        reveal(); // show the (now translated) page; no-op if it was never hidden
    }

    function setLanguage(lang, persist) {
        if (!SUPPORTED.includes(lang)) lang = "en";
        currentLang = lang;
        if (persist) localStorage.setItem("lang", lang);

        if (lang === "en") { current = null; applyLanguage(); return; }
        if (dicts[lang]) { current = dicts[lang]; applyLanguage(); return; }
        // Reuse the dictionary the inline <head> script already started fetching.
        const pre = window.__i18nPreload && window.__i18nPreload.lang === lang ? window.__i18nPreload.dict : null;
        (pre || fetch("/src/i18n/" + lang + ".json", { cache: "no-cache" }).then((r) => r.json()))
            .then((d) => { dicts[lang] = d; current = d; applyLanguage(); })
            .catch(reveal);
    }

    /* Text that JavaScript writes after the page has loaded can't be reached by
       the swap above - it would just be overwritten. Those callers translate at
       the point of writing with i18n.t(), and re-render via i18n.onChange().

           el.button.textContent = i18n.t("Select folder");
           status(i18n.t("Deleted {0}.md.", slug));

       Keys are the English string, same as the dictionary; {0}, {1}... are filled
       from the extra arguments. An untranslated key returns the English. */
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