/* Translation, done against the page that is already in the document. There is
 * no build step, so English lives in the HTML and the dictionaries in
 * /src/i18n/ are keyed by the English string.
 */
(() => {
    "use strict";

    const SUPPORTED = Object.keys(LANGUAGES);

    // Apple ships a localised "Listen on Apple Music" badge for some languages.
    const BADGE_SUFFIX = { sv: "_sv" };

    // A selector matching nothing is harmless, so pages only need the ones
    // that apply to them.
    const SELECTORS = [
        "head > title",
        ".skipLink",
        "#desktop-header .notAList > li > a",
        "#mobile-header .mobileMenu li > a",
        "footer .footerNote > a",
        "footer .footerNote .rightsNote",
        "footer .footerNote.embedNote",
        "footer .footerNote .lyricsCredit",
        "main .projectFilter li > button",
        "main .name",
        "main h2.section-title",
        "main .visuallyHidden",
        "main .description.titleColor",
        "main .description.white > span",
        "main p.section-content",
        "main ul.specs > li",
        "main .legal .article-content > h2",
        "main .legal .article-content > p",
        "main .section > p",
        "main a.button",
        "main .pi-label",
        "main .pi-stat-label",
        "main p.statusWrapper:not(#statusWrapperOffline)",
        "main #lanyardRefresh",
        "main #lyricsBtn",
        "main #Remaining",
        "main #Elapsed",
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

    // Phrases sharing a text node with markup, replaced inside it.
    const PARTIAL = [
        ["main .description.white", "a swedish"],
        ["#statusWrapperConnecting", "Connecting"]
    ];

    const dicts = {};
    const listeners = [];
    const originals = new WeakMap();
    const nodeOriginals = new WeakMap();
    const translated = new WeakSet();

    let current = null;
    let currentLang = "en";

    // The HTML wraps lines, so squashing whitespace is what makes a dictionary
    // key match whatever the markup happens to look like.
    function normalize(text) {
        return (text || "").replace(/\s+/g, " ").trim();
    }

    function tr(english) {
        if (!current) return english;
        if (current[english] == null) return english;
        return current[english];
    }

    function textOf(html) {
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        return normalize(tmp.textContent);
    }

    // An element holding only <i> icons still counts as plain text.
    function write(el, value) {
        // Real markup means the translation is expected to carry its own.
        let hasRealMarkup = false;
        for (const child of el.children) {
            if (child.tagName !== "I") hasRealMarkup = true;
        }

        if (hasRealMarkup) {
            el.innerHTML = value;
            return;
        }

        if (el.children.length === 0) {
            el.textContent = value;
            return;
        }

        for (const node of el.childNodes) {
            const isText = node.nodeType === 3;
            if (isText && node.nodeValue.trim()) {
                node.nodeValue = value;
                return;
            }
        }

        el.appendChild(document.createTextNode(value));
    }

    function swapText() {
        // A Set, because one element can be picked up by more than one selector.
        const seen = new Set();

        for (const selector of SELECTORS) {
            for (const el of document.querySelectorAll(selector)) {
                seen.add(el);
            }
        }

        for (const el of seen) {
            // The English markup, kept so switching back can restore it.
            if (!originals.has(el)) {
                originals.set(el, el.innerHTML);
            }

            const original = originals.get(el);

            let value = null;
            if (current) value = current[textOf(original)];

            if (value != null) {
                write(el, value);
                translated.add(el);
                continue;
            }

            if (translated.has(el)) {
                el.innerHTML = original;
                translated.delete(el);
            }
        }
    }

    function swapAttrs() {
        for (const [selector, attr] of ATTR_SELECTORS) {
            for (const el of document.querySelectorAll(selector)) {
                // Stashed in a data- attribute, since the original is about to go.
                const keep = "data-i18n-" + attr;
                if (!el.hasAttribute(keep)) {
                    el.setAttribute(keep, el.getAttribute(attr) || "");
                }

                const original = el.getAttribute(keep);
                const lookupKey = normalize(original);
                const translated = tr(lookupKey);

                if (translated === lookupKey) {
                    // The markup's own whitespace, rather than the squashed key.
                    el.setAttribute(attr, original);
                } else {
                    el.setAttribute(attr, translated);
                }
            }
        }
    }

    function swapPartials() {
        for (const [selector, phrase] of PARTIAL) {
            const container = document.querySelector(selector);
            if (!container) continue;

            for (const node of container.childNodes) {
                if (node.nodeType !== 3) continue;
                if (!node.nodeValue.trim()) continue;

                if (!nodeOriginals.has(node)) {
                    nodeOriginals.set(node, node.nodeValue);
                }

                const original = nodeOriginals.get(node);

                let value = null;
                if (current) value = current[phrase];

                if (value != null) {
                    node.nodeValue = original.replace(phrase, value);
                } else {
                    node.nodeValue = original;
                }

                break;   // only the first real text node in this container
            }
        }
    }

    // The badge's translation is a different image, not different copy.
    function swapMusicBadge() {
        const link = document.getElementById("apple-link");
        if (!link) return;
        link.title = tr("Listen on Apple Music");

        const badge = link.querySelector("img");
        if (!badge) return;

        const suffix = BADGE_SUFFIX[currentLang] || "";
        badge.src = "/assets/media/icons/listenOnAppleMusic" + suffix + ".svg";
        badge.alt = tr("A black button with the Apple Music logo and text that says 'Listen on Apple Music'.");
    }

    function render() {
        document.documentElement.setAttribute("lang", currentLang);

        const picker = document.getElementById("language");
        if (picker) picker.value = currentLang;

        swapText();
        swapAttrs();
        swapPartials();
        swapMusicBadge();

        for (const fn of listeners) {
            try {
                fn(currentLang);
            } catch (e) {
                console.error(e);
            }
        }

        document.documentElement.classList.remove("i18n-wait");
    }

    function setLanguage(lang, persist) {
        if (!SUPPORTED.includes(lang)) lang = "en";
        currentLang = lang;
        if (persist) localStorage.setItem("lang", lang);

        if (lang === "en") {
            current = null;
            render();
            return;
        }

        if (dicts[lang]) {
            current = dicts[lang];
            render();
            return;
        }

        // settings.js started this download already; reuse that promise.
        let request = null;
        if (window.__i18nPreload?.lang === lang) {
            request = window.__i18nPreload.dict;
        }

        if (!request) {
            request = fetch("/src/i18n/" + lang + ".json", { cache: "no-cache" })
                .then((response) => response.json());
        }

        request.then((dict) => {
            dicts[lang] = dict;
            current = dict;
            render();
        }).catch(() => {
            // Reveal the page in English rather than leaving it behind i18n-wait.
            document.documentElement.classList.remove("i18n-wait");
        });
    }

    window.i18n = {
        t(en, ...args) {
            let text = tr(normalize(en));

            for (let i = 0; i < args.length; i++) {
                const placeholder = "{" + i + "}";
                text = text.split(placeholder).join(args[i]);
            }

            return text;
        },
        get lang() { return currentLang; },
        onChange(fn) {
            listeners.push(fn);
            if (current || currentLang === "en") fn(currentLang);
        }
    };

    onSettingsPanel(() => {
        const picker = document.getElementById("language");
        if (!picker) return;
        picker.value = currentLang;
        picker.addEventListener("change", () => setLanguage(picker.value, true));
    });

    setLanguage(localStorage.getItem("lang") || "en", false);
})();
