/* The settings panel: its markup, the layer it lives in on every page but
 * /settings/, and its Component versions page. settings.js wires it up.
 */

/* ---------- The panel ---------- */

(function (global) {
    "use strict";

    var VERSION = "6.1.8";

    function toggleMarkup(id, label) {
        return `
                    <div>
                        <div class="checkbox-wrapper-51">
                            <label for="${id}" class="title">${label}</label>
                            <input type="checkbox" id="${id}" name="${id}" />
                            <label for="${id}" class="toggle" aria-hidden="true">
                                <span>
                                    <svg width="10px" height="10px" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                                        <path
                                            d="M5,1 L5,1 C2.790861,1 1,2.790861 1,5 L1,5 C1,7.209139 2.790861,9 5,9 L5,9 C7.209139,9 9,7.209139 9,5 L9,5 C9,2.790861 7.209139,1 5,1 L5,9 L5,1 Z">
                                        </path>
                                    </svg>
                                </span>
                            </label>
                        </div>
                    </div>`;
    }

    // A row that opens one of the panel's own pages, like a phone's Settings
    // app does for Wi-Fi - settings.js does the switching.
    function navRowMarkup(page, label) {
        return `
                    <div>
                        <button type="button" class="settingsNavRow" data-subpage="${page}">
                            <span class="title">${label}</span>
                            <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                        </button>
                    </div>`;
    }

    function languageOptions() {
        return Object.entries(LANGUAGES)
            .map(([code, name]) => `<option value="${code}">${name}</option>`)
            .join("");
    }

    function markup(opts) {
        var withDone = !!(opts && opts.withDone);
        var h = "h" + ((opts && opts.headingLevel) || 3);
        return `
<div class="settingsPanel" data-page="main">
    <div class="settingsPage" data-page="main">
    <div class="modalSettings">
        <div>
            <${h} class="settingsGroupHeading" id="settingsLanguageHeading"><i class="fa-solid fa-language" aria-hidden="true"></i>Language</${h}>
            <div>
                <select name="language" id="language" class="button" aria-labelledby="settingsLanguageHeading">${languageOptions()}</select>
            </div>
        </div>
        <div>
            <${h} class="settingsGroupHeading" id="settingsThemeHeading"><i class="fa-solid fa-brush" aria-hidden="true"></i>Theme</${h}>
            <div class="themeOptions options" role="radiogroup" aria-labelledby="settingsThemeHeading">
                <input type="radio" id="auto" name="theme-color" value="auto" class="theme-option" checked>
                <label for="auto" class="auto button theme-label"><i class="fa-solid fa-laptop" aria-hidden="true"></i>Follow
                    system</label>

                <input type="radio" id="light" name="theme-color" value="light" class="theme-option">
                <label for="light" class="light button theme-label"><i
                        class="fa-solid fa-sun" aria-hidden="true"></i>Light</label>

                <input type="radio" id="dark" name="theme-color" value="dark" class="theme-option">
                <label for="dark" class="dark button theme-label"><i
                        class="fa-solid fa-moon" aria-hidden="true"></i>Dark</label>
            </div>
        </div>
        <div>
            <${h} class="settingsGroupHeading" id="settingsColorHeading"><i class="fa-solid fa-fill-drip" aria-hidden="true"></i>Color</${h}>
            <div class="colorOptions options" role="radiogroup" aria-labelledby="settingsColorHeading">
                <input type="radio" id="album" name="accent-color" value="album" checked>
                <label for="album" class="button">Album art<span class="album"></span></label>

                <input type="radio" id="red" name="accent-color" value="red">
                <label for="red" class="button">Red<span class="red"></span></label>

                <input type="radio" id="green" name="accent-color" value="green">
                <label for="green" class="button">Green<span class="green"></span></label>

                <input type="radio" id="blue" name="accent-color" value="blue">
                <label for="blue" class="button">Blue<span class="blue"></span></label>

                <input type="radio" id="purple" name="accent-color" value="purple">
                <label for="purple" class="button">Purple<span class="purple"></span></label>

            </div>
        </div>
        <div>
            <${h} class="settingsGroupHeading"><i class="fa-solid fa-sliders" aria-hidden="true"></i>General</${h}>${toggleMarkup("autoUpdateActivity", "Automatically update activities")}${toggleMarkup("hideExplicit", "Hide explicit language")}
        </div>
        <div>
            <${h} class="settingsGroupHeading"><i class="fa-solid fa-gauge-high" aria-hidden="true"></i>Performance</${h}>${toggleMarkup("upgradeArtwork", "Upgrade album art quality")}
        </div>
        <div>
            <${h} class="settingsGroupHeading"><i class="fa-solid fa-universal-access" aria-hidden="true"></i>Accessibility</${h}>${toggleMarkup("reduceMotion", "Reduce motion")}${toggleMarkup("reduceTransparency", "Reduce transparency")}
        </div>
        <div>
            <${h} class="settingsGroupHeading"><i class="fa-solid fa-bug" aria-hidden="true"></i>Developer options</${h}>${toggleMarkup("debugMode", "Debug mode")}${navRowMarkup("versions", "Component versions")}
        </div>
    </div>
    <p class="modalDescription settingsVersion">version ${VERSION}</p>
    </div>
    <div class="settingsPage" data-page="versions" data-icon="fa-code-compare" hidden>
    <div class="modalSettings settingsSubpage">
        <p class="settingsSubpageTitle" hidden>Component versions</p>
        <div class="versionCheckResults" aria-live="polite"></div>
    </div>
    </div>
    <div class="modalButtons">${withDone ? `
        <button type="button" class="button primary" data-action="settings">Done</button>` : ""}
        <button type="button" class="button dangerZone destructive">Reset</button>
        <span class="visuallyHidden resetStatus" role="status"></span>
    </div>
</div>`;
    }

    function renderInline() {
        var host = document.getElementById("settingsInline");
        if (!host || host.getAttribute("data-rendered")) return;
        host.innerHTML = markup({ withDone: false, headingLevel: 2 });
        host.setAttribute("data-rendered", "1");
        announceReady();
    }

    // settings.js and i18n.js wire up the controls once the markup is in.
    function announceReady() {
        document.dispatchEvent(new CustomEvent("settings:panelready"));
    }

    global.SettingsPanel = { VERSION: VERSION, markup: markup, announceReady: announceReady };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", renderInline);
    } else {
        renderInline();
    }
})(window);

/* ---------- The layer it opens in ---------- */

/* Settings, as a layer under the page. Opening it slides the page aside to
 * show the panel, the same way the mobile menu opens (openReveal() in
 * general.js does the moving), so a change to the theme or accent can be
 * seen on the page right beside it.
 *
 * The name and the SettingsModal API are kept from when this was a modal.
 */
(function () {
    function shell() {
        return `
<aside id="settingsLayer" class="revealLayer settingsLayer theme-dark" data-reveal="settings" role="dialog" aria-modal="true" aria-labelledby="settingsModalTitle" tabindex="-1">
    <div class="settingsSheet">
        <div class="settingsSheetHeader">
            <h2 id="settingsModalTitle">Settings</h2>
        </div>${window.SettingsPanel.markup({ withDone: true })}
    </div>
</aside>`;
    }

    function layer() {
        return document.getElementById('settingsLayer');
    }

    function isOpen() {
        if (!window.PageReveal) return false;
        return window.PageReveal.isOpen(layer());
    }

    function setOpen(open) {
        if (!window.PageReveal) return;

        if (open) {
            window.PageReveal.open(layer());
            return;
        }

        if (isOpen()) window.PageReveal.close();
    }

    function inject() {
        if (layer()) return;
        if (document.getElementById('settingsInline')) return;
        if (!window.SettingsPanel) return;

        // Under the page, next to the mobile menu, so the page covers it.
        var page = document.getElementById('page');
        var template = document.createElement('template');
        template.innerHTML = shell().trim();

        if (page) {
            document.body.insertBefore(template.content, page);
        } else {
            document.body.appendChild(template.content);
        }

        window.SettingsPanel.announceReady();
    }

    window.SettingsModal = {
        open: function () { setOpen(true); },
        close: function () { setOpen(false); },
        toggle: function () { setOpen(!isOpen()); },
        isOpen: isOpen
    };

    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject);
})();

/* ---------- Component versions ---------- */

/* Settings > Developer options > Component versions. Lists the libraries the
 * site loads from a CDN and whether each is the newest release, as worked out
 * by /api/versions, asked each time that page is opened.
 */
(() => {
    "use strict";

    // Translated at the moment they are shown, through i18n.js, with {0}
    // standing in for a version number.
    function t(text, ...args) {
        if (window.i18n) return window.i18n.t(text, ...args);

        let out = text;
        for (let i = 0; i < args.length; i++) {
            out = out.split("{" + i + "}").join(args[i]);
        }
        return out;
    }

    const STATUS_LABELS = {
        current: "Up to date",
        outdated: "Update available",
        pending: "Newer release not on cdnjs yet",
        unpinned: "Automatic",
        unknown: "Couldn't check"
    };

    // One status per loaded version, since a library pinned at two versions
    // can be current on some pages and behind on others.
    function statusOf(component, entry) {
        if (!entry.version) return "unpinned";
        if (component.error || !component.latest) return "unknown";
        if (entry.version === component.latest) return "current";

        // Behind, but the newer release is not on the CDN to switch to yet.
        if (!component.onCdn) return "pending";

        return "outdated";
    }

    // The lines under the name, one per <p>.
    function detailsOf(component, entry, status) {
        if (status === "unpinned") {
            return [t("Installed: {0}", component.latest), t("Updates install automatically")];
        }

        const installed = t("Installed: {0}", entry.version);

        // The error itself is left in English - it is the upstream's own
        // message, for whoever is debugging it.
        if (status === "unknown") {
            return [installed, component.error || t("No latest version found")];
        }

        if (status === "current") {
            return [installed, t("Already up to date")];
        }

        if (status === "pending") {
            return [installed, t("Available: {0} (not on cdnjs yet)", component.latest)];
        }

        return [installed, t("Available: {0}", component.latest)];
    }

    function element(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function itemFor(component, entry) {
        const status = statusOf(component, entry);

        const item = element("li", "versionItem");
        item.dataset.status = status;

        const head = element("div", "versionHead");
        head.appendChild(element("span", "versionName", component.name));
        head.appendChild(element("span", "versionBadge", t(STATUS_LABELS[status])));
        item.appendChild(head);

        for (const line of detailsOf(component, entry, status)) {
            item.appendChild(element("p", "versionDetail", line));
        }

        return item;
    }

    function render(results, data) {
        results.textContent = "";

        const list = element("ul", "versionList");

        for (const component of data.components) {
            for (const entry of component.versions) {
                list.appendChild(itemFor(component, entry));
            }
        }

        if (!list.children.length) {
            results.appendChild(element("p", "versionDetail", t("No CDN components found.")));
            return;
        }

        results.appendChild(list);
    }

    // As many as the site loads today, so the list is about the height it
    // will be when the real rows replace these.
    const SKELETON_ROWS = 4;

    // Grey rows shaped like the real ones - a name, a badge and two lines -
    // while /api/versions answers. The hidden text is what the live region
    // reads out in their place.
    function skeleton() {
        const wrap = element("div");

        const list = element("ul", "versionList skeleton");
        list.setAttribute("aria-hidden", "true");

        for (let i = 0; i < SKELETON_ROWS; i++) {
            const item = element("li", "versionItem versionSkeleton");

            const head = element("div", "versionHead");
            head.appendChild(element("span", "skeletonBar skeletonName"));
            head.appendChild(element("span", "skeletonBar skeletonBadge"));
            item.appendChild(head);

            item.appendChild(element("span", "skeletonBar skeletonDetail"));
            item.appendChild(element("span", "skeletonBar skeletonDetail short"));

            list.appendChild(item);
        }

        wrap.appendChild(list);
        wrap.appendChild(element("span", "visuallyHidden", t("Checking...")));
        return wrap;
    }

    // Every time the page is opened, so it is never showing an old answer.
    async function run(results) {
        results.textContent = "";
        results.appendChild(skeleton());

        try {
            const res = await fetch("/api/versions", { cache: "no-store" });
            if (!res.ok) throw new Error("/api/versions responded " + res.status);

            const data = await res.json();
            debug.log(data);
            render(results, data);
        } catch (err) {
            console.error("[versions]", err);
            results.textContent = "";
            results.appendChild(element("p", "versionDetail", t("Couldn't check versions: {0}", err.message)));
        }
    }

    window.VersionCheck = { run: run };
})();
