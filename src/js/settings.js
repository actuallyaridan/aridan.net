/* Theme, accent colour and preferences. Loaded without `defer` and first
 * on every page, because the root classes have to be on <html> before anything
 * paints or the page flashes in the wrong theme.
 */

const THEME_COLORS = { light: '#f1f1f1', dark: '#121212' };

const DEFAULTS = {
    theme: 'auto',
    accent: 'album',
    lyricsMode: 'immersive'
};

// The one list of languages: settingsPanel.js and i18n.js both read it.
const LANGUAGES = {
    en: 'English',
    sv: 'Svenska (Swedish)',
    hr: 'Hrvatski (Croatian)',
    bs: 'Bosanski (Bosnian)'
};

const PREF_DEFAULT = {
    autoUpdateActivity: () => true,
    hideExplicit: () => true,
    upgradeArtwork: () => true,
    reduceMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    reduceTransparency: () => matchMedia('(prefers-reduced-transparency: reduce)').matches,
    debugMode: () => false
};

// Which radio group in the settings panel holds which setting.
const RADIO_SETTINGS = {
    'theme-color': 'theme',
    'accent-color': 'accent'
};

function prefEnabled(key) {
    const saved = localStorage.getItem(key);

    // null means never written, which is not the same as having been set to false.
    if (saved === null) {
        const getDefault = PREF_DEFAULT[key];
        return getDefault();
    }

    return saved === 'true';
}

// Every script logs through this instead of console, so the console stays
// quiet unless Debug mode is on in Settings. Real errors skip it and go to
// console.error directly - those should be seen whether debugging or not.
// The pref is read on each call, not cached, so flipping the toggle takes
// effect without a reload.
//
// Since every line is printed from here, the console names settings.js as the
// source of all of them. Each one is tagged with the file that really logged
// it instead, e.g. [lanyard.js], read off the call stack.
const debug = {
    log(...parts) {
        if (!prefEnabled('debugMode')) return;
        console.log(callerTag(), ...parts);
    },

    warn(...parts) {
        if (!prefEnabled('debugMode')) return;
        console.warn(callerTag(), ...parts);
    }
};

// Every browser writes stack lines a little differently, but all of them end
// in ".../name.js:line:column", sometimes with a ?query before the line. The
// first file that is not this one is whoever called debug.
const STACK_FILE = /\/([^\/?#:]+\.js)(\?[^:]*)?:\d+:\d+/;

function callerTag() {
    const stack = new Error().stack || '';

    for (const line of stack.split('\n')) {
        const match = line.match(STACK_FILE);
        if (!match) continue;
        if (match[1] === 'settings.js') continue;

        return '[' + match[1] + ']';
    }

    return '[unknown]';
}

function setting(key) {
    return localStorage.getItem(key) || DEFAULTS[key];
}

function resolvedTheme() {
    const theme = setting('theme');

    if (theme !== 'auto') return theme;

    const osPrefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
    if (osPrefersDark) return 'dark';
    return 'light';
}

function applyRootSettings() {
    const root = document.documentElement;
    const theme = resolvedTheme();

    // Assigning to className replaces the whole attribute, so classes that are
    // not ours - reduce-motion, album-accent, i18n-wait - are carried over by hand.
    const kept = [];
    for (const cls of root.className.split(' ')) {
        if (!cls) continue;
        if (cls.startsWith('theme-')) continue;
        if (cls.startsWith('color-')) continue;
        if (cls.startsWith('style-')) continue;
        kept.push(cls);
    }

    kept.push('theme-' + theme);
    kept.push('color-' + setting('accent'));

    // Liquid Glass is the only style now - Flat was removed - but the CSS is
    // still written against this class, so it is always there.
    kept.push('style-liquid-glass');

    root.className = kept.join(' ');

    syncThemeColor(theme);
    restoreAlbumAccent(theme);

    // The pill is positioned in pixels, so a resized nav leaves it behind.
    if (typeof window.repositionNavPills === 'function') {
        requestAnimationFrame(window.repositionNavPills);
    }
}

function applyAccessibilityPrefs() {
    const root = document.documentElement;
    root.classList.toggle('reduce-motion', prefEnabled('reduceMotion'));
    root.classList.toggle('reduce-transparency', prefEnabled('reduceTransparency'));
}

function syncThemeColor(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
    }
    meta.setAttribute('content', THEME_COLORS[theme] || THEME_COLORS.light);
}

// Painting albumAccent.js's cached variables back before the first frame is what
// stops the accent snapping from blue to the album's colour on every navigation.
function restoreAlbumAccent(theme) {
    if (setting('accent') !== 'album') return;

    const raw = localStorage.getItem('albumAccentCache');

    let cache;
    try {
        cache = JSON.parse(raw);
    } catch {
        return;
    }

    if (!cache) return;

    const vars = cache[theme];
    if (!vars) return;

    const root = document.documentElement;

    // Custom properties only take through setProperty; root.style['--x'] is a no-op.
    for (const [prop, value] of Object.entries(vars)) {
        root.style.setProperty(prop, value);
    }

    root.classList.add('album-accent');
}

// Holds open the room the "now playing" card took up on the last visit, before
// the first frame. Presence only arrives after the page is up, and a card
// opening then shoves everything below it down by its whole height. With the
// room already there, lanyard.js just fades the card into it. Has to be here
// because this is the only script that runs before the page is painted.
function reserveLanyardSpace() {
    const saved = Number(localStorage.getItem('lanyardReserve'));
    if (!saved) return;

    const root = document.documentElement;
    root.style.setProperty('--lanyard-reserve', saved + 'px');
    root.classList.add('lanyard-reserve');
}

// Matching the album art used to be a toggle of its own, with a picked colour
// underneath it for between songs. It is one of the colours now, under a new
// key so an old saved colour can't be mistaken for a new pick. Whoever had
// the toggle on, or never touched it, gets the album's colour.
(function migrateAccent() {
    if (localStorage.getItem('accent') !== null) return;

    const oldColor = localStorage.getItem('accentColor');
    const oldToggle = localStorage.getItem('albumAccent');
    if (oldColor === null && oldToggle === null) return;

    if (oldToggle === 'false') {
        localStorage.setItem('accent', oldColor || 'blue');
    } else {
        localStorage.setItem('accent', 'album');
    }

    localStorage.removeItem('accentColor');
    localStorage.removeItem('albumAccent');
})();

// Monochrome was dropped as a colour. Whoever picked it goes back to the default.
if (localStorage.getItem('accent') === 'monochrome') {
    localStorage.setItem('accent', DEFAULTS.accent);
}

applyRootSettings();
applyAccessibilityPrefs();
reserveLanyardSpace();

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (setting('theme') === 'auto') applyRootSettings();
});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyAccessibilityPrefs);
matchMedia('(prefers-reduced-transparency: reduce)').addEventListener('change', applyAccessibilityPrefs);

// Fetched here rather than in i18n.js so the request is in flight while the rest
// of the scripts are parsed. i18n-wait hides the page until the strings land.
(function preloadLanguage() {
    const lang = localStorage.getItem('lang');

    if (!lang) return;                 // nothing saved
    if (lang === 'en') return;         // English is what the HTML already says
    if (!(lang in LANGUAGES)) return;  // unknown value, ignore it

    document.documentElement.classList.add('i18n-wait');
    document.documentElement.setAttribute('lang', lang);

    // The promise is parked, not the data, so i18n.js waits on this same fetch.
    const dict = fetch('/src/i18n/' + lang + '.json').then(function (response) {
        return response.json();
    });

    window.__i18nPreload = { lang: lang, dict: dict };

    setTimeout(() => document.documentElement.classList.remove('i18n-wait'), 1500);
})();

function announceChange(key, value) {
    const event = new CustomEvent('settings:change', {
        detail: { key: key, value: value }
    });
    window.dispatchEvent(event);
}

// For changing a setting from outside the settings panel - the lyrics overlay's
// own style buttons, say. Goes through the same steps a radio click would, and
// ticks the matching radio, if the setting has one, so an open settings dialog
// does not show the old value.
function saveSetting(key, value) {
    localStorage.setItem(key, value);
    applyRootSettings();

    for (const [name, settingKey] of Object.entries(RADIO_SETTINGS)) {
        if (settingKey !== key) continue;

        const selector = 'input[name="' + name + '"][value="' + value + '"]';
        const radio = document.querySelector(selector);
        if (radio) radio.checked = true;
    }

    announceChange(key, value);
}

// A deferred script would miss "settings:panelready", so the DOM is the source
// of truth and the event is only how earlier scripts get told.
function onSettingsPanel(fn) {
    if (document.querySelector('.settingsPanel')) fn();
    else document.addEventListener('settings:panelready', fn, { once: true });
}

onSettingsPanel(function wirePanel() {
    // Only checkboxes whose id names a real preference.
    const toggles = [];
    for (const box of document.querySelectorAll('.settingsPanel input[type="checkbox"]')) {
        if (box.id in PREF_DEFAULT) toggles.push(box);
    }

    const radios = RADIO_SETTINGS;

    function syncControls() {
        for (const toggle of toggles) {
            toggle.checked = prefEnabled(toggle.id);
        }

        for (const [name, key] of Object.entries(radios)) {
            const value = setting(key);
            const selector = 'input[name="' + name + '"][value="' + value + '"]';
            const radio = document.querySelector(selector);
            if (radio) radio.checked = true;
        }
    }

    for (const toggle of toggles) {
        toggle.addEventListener('change', function () {
            localStorage.setItem(toggle.id, String(toggle.checked));
            applyAccessibilityPrefs();
            announceChange(toggle.id, toggle.checked);
        });
    }

    for (const [name, key] of Object.entries(radios)) {
        for (const radio of document.querySelectorAll('input[name="' + name + '"]')) {
            radio.addEventListener('change', function () {
                localStorage.setItem(key, radio.value);

                applyRootSettings();
                announceChange(key, radio.value);
            });
        }
    }

    const resetButton = document.querySelector('.dangerZone');
    const resetStatus = document.querySelector('.settingsPanel .resetStatus');

    function resetEverything() {
        // Deleted rather than written back as defaults, so prefEnabled reads
        // them as "never touched" and asks the operating system again.
        for (const key of Object.keys(DEFAULTS)) {
            localStorage.removeItem(key);
        }
        for (const key of Object.keys(PREF_DEFAULT)) {
            localStorage.removeItem(key);
        }

        // The language is not in DEFAULTS - i18n.js owns it - but a reset
        // that left someone in Swedish would not be much of a reset.
        localStorage.removeItem('lang');
        if (window.i18n) window.i18n.setLanguage('en');

        syncControls();
        applyRootSettings();
        applyAccessibilityPrefs();

        for (const key of Object.keys(PREF_DEFAULT)) {
            announceChange(key, prefEnabled(key));
        }
        for (const key of Object.keys(DEFAULTS)) {
            announceChange(key, setting(key));
        }
    }

    if (resetButton) {
        wireResetButton(resetButton, resetStatus, resetEverything);
    }

    wireSubpages(document.querySelector('.settingsPanel'));

    syncControls();
});

/* ---------- Reset ----------
 * Reset asks before it does anything, but inside the panel rather than with
 * confirm(), whose wording the browser owns and which is always in English.
 * The first press arms the button - it turns a stronger red and says to press
 * again - and the second resets. Left alone, or with focus moved away, it
 * goes back to being a plain Reset button.
 */
const RESET_ARMED_MS = 4000;

function wireResetButton(button, status, reset) {
    let armedTimer = 0;

    function t(text) {
        if (window.i18n) return window.i18n.t(text);
        return text;
    }

    function say(text) {
        if (status) status.textContent = text;
    }

    function isArmed() {
        return button.classList.contains('armed');
    }

    // Subscribed on the first press, not when this is wired up: the panel is
    // wired before i18n.js has loaded. A language change rewrites the
    // button's text from the English markup, which would leave it red but
    // saying Reset.
    let watchingLanguage = false;

    function arm() {
        if (!watchingLanguage && window.i18n) {
            window.i18n.onChange(disarm);
            watchingLanguage = true;
        }

        button.classList.add('armed');
        button.textContent = t('Press again to reset');
        say(t('Press again to reset'));

        window.clearTimeout(armedTimer);
        armedTimer = window.setTimeout(disarm, RESET_ARMED_MS);
    }

    function disarm() {
        window.clearTimeout(armedTimer);
        armedTimer = 0;

        if (!isArmed()) return;

        button.classList.remove('armed');
        button.textContent = t('Reset');
    }

    button.addEventListener('click', function () {
        if (!isArmed()) {
            arm();
            return;
        }

        disarm();
        reset();

        // After the reset, so it is read out in the language reset to.
        say(t('Settings reset'));
    });

    button.addEventListener('blur', disarm);

    // The layer closing is as good as walking away from it.
    window.addEventListener('reveal:close', disarm);
}

// The heading a subpage takes over, so it looks the same as the settings it
// came from: the "Settings" heading at the top of the settings layer, or the
// icon, title and description at the top of the /settings page.
function headerOf(panel) {
    const sheet = panel.closest('.settingsSheet');
    if (sheet) {
        return {
            title: sheet.querySelector('h2'),
            description: null,
            icon: null,
            back: cornerBackButton(sheet.querySelector('.settingsSheetHeader')),
            saved: null
        };
    }

    const info = document.querySelector('main .info');
    if (panel.closest('#settingsInline') && info) {
        const title = info.querySelector('.name');
        return {
            title: title,
            description: info.querySelector('.description'),
            icon: info.querySelector('.icon > .fa-solid'),
            back: pageBackButton(title),
            saved: null
        };
    }

    return null;
}

// Both back buttons are only shown while a subpage is open. They are
// labelled from the start, so there is never a moment when one exists
// without a name, and labelled again by syncBack() when shown - by then the
// translations have arrived, and on the main page it may lead to the menu.
function backButton(className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.hidden = true;

    let label = 'Back to Settings';
    if (window.i18n) label = window.i18n.t(label);
    button.title = label;
    button.setAttribute('aria-label', label);

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-arrow-left';
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);

    return button;
}

// In the settings layer: a bare arrow in the header's top left corner, where
// a phone puts it.
function cornerBackButton(header) {
    if (!header) return null;

    const button = backButton('settingsBack');
    header.prepend(button);
    return button;
}

// On the /settings page: the back button the rest of the site uses, under
// the title, as it is under an article's.
function pageBackButton(title) {
    if (!title) return null;

    const button = backButton('button backButton settingsPageBack');
    title.after(button);
    return button;
}

// The subpage's own title is hidden in its markup and only read from here -
// it is kept there so i18n.js translates it like any other text in the panel.
// The /settings page's description is about the settings, so a subpage hides
// it rather than putting something else in its place.
function retitle(header, page) {
    if (!header || !header.title) return;

    // The main page's header, as it was, to go back to.
    if (!header.saved) {
        header.saved = {
            title: header.title.textContent,
            icon: header.icon ? header.icon.className : ''
        };
    }

    const isMain = !page || page.dataset.page === 'main';

    if (isMain) {
        header.title.textContent = header.saved.title;
        if (header.description) header.description.hidden = false;
        if (header.icon) header.icon.className = header.saved.icon;
        header.saved = null;
        return;
    }

    const title = page.querySelector('.settingsSubpageTitle');
    if (title) header.title.textContent = title.textContent;

    if (header.description) header.description.hidden = true;

    if (header.icon && page.dataset.icon) {
        header.icon.className = 'fa-solid ' + page.dataset.icon + ' icon-background';
    }
}

// How a page comes in when it is switched to: from the right going into a
// subpage, from the left coming back out of one, the way a phone's Settings
// app pushes and pops its pages. The same curve as the page sliding aside
// for the layer (#page in styles.css), only shorter and a shorter way.
const PAGE_SLIDE_MS = 300;
const PAGE_SLIDE_PX = 32;
const PAGE_SLIDE_EASE = 'cubic-bezier(.2, .8, .2, 1)';

// Only the page coming in moves. The one leaving is hidden straight away, as
// it was before: two pages up at once would mean two scrollers, and on iOS a
// hidden scroller left in the layout keeps catching taps.
function slideIn(el, direction) {
    if (!el) return;
    if (document.documentElement.classList.contains('reduce-motion')) return;
    if (typeof el.animate !== 'function') return;

    let from = PAGE_SLIDE_PX;
    if (direction === 'back') from = -PAGE_SLIDE_PX;

    el.animate(
        [
            { transform: 'translateX(' + from + 'px)', opacity: 0 },
            { transform: 'none', opacity: 1 }
        ],
        { duration: PAGE_SLIDE_MS, easing: PAGE_SLIDE_EASE }
    );
}

/* ---------- Subpages ----------
 * A row like "Component versions" opens a page of its own in place of the
 * settings, with a back button, the way a phone's Settings app opens Wi-Fi.
 * Only one page is ever shown; the others are `hidden`, not just moved out of
 * view, so nothing off-screen can catch a tap.
 */
function wireSubpages(panel) {
    if (!panel) return;

    const header = headerOf(panel);

    // Returns the page now showing, for showPage to slide in.
    function setPage(name) {
        panel.dataset.page = name;

        let shown = null;
        for (const page of panel.querySelectorAll('.settingsPage')) {
            page.hidden = page.dataset.page !== name;
            if (!page.hidden) shown = page;
        }

        retitle(header, shown);
        syncBack();

        return shown;
    }

    // Settings opened from the phone menu leads back to it, so on its main
    // page the arrow goes back to the menu. Opened any other way, the main
    // page has nowhere to go back to and the arrow is only on subpages.
    function backGoesToMenu() {
        if (panel.dataset.page !== 'main') return false;
        if (!panel.closest('#settingsLayer')) return false;
        if (!window.PageReveal) return false;
        return window.PageReveal.hasParent();
    }

    function syncBack() {
        if (!header || !header.back) return;

        const toMenu = backGoesToMenu();
        header.back.hidden = panel.dataset.page === 'main' && !toMenu;

        let label = 'Back to Settings';
        if (toMenu) label = 'Back to Menu';
        if (window.i18n) label = window.i18n.t(label);

        header.back.title = label;
        header.back.setAttribute('aria-label', label);
    }

    // focusTarget is also what is scrolled to: the back button on the way in,
    // so the new page is seen from its top, and the row on the way out, so the
    // settings are back where they were left.
    // The title moves with the page, since it changes with it - "Settings"
    // to "Component versions" and back.
    function showPage(name, focusTarget) {
        let direction = 'forward';
        if (name === 'main') direction = 'back';

        const shown = setPage(name);

        slideIn(shown, direction);
        if (header) slideIn(header.title, direction);

        if (focusTarget) {
            focusTarget.scrollIntoView({ block: 'nearest' });
            focusTarget.focus({ preventScroll: true });
        }

        if (name === 'versions') checkVersions();
    }

    for (const row of panel.querySelectorAll('[data-subpage]')) {
        row.addEventListener('click', function () {
            const page = panel.querySelector('.settingsPage[data-page="' + row.dataset.subpage + '"]');
            if (!page) return;

            let back = null;
            if (header) back = header.back;
            showPage(row.dataset.subpage, back);
        });
    }

    if (header && header.back) {
        header.back.addEventListener('click', function () {
            if (backGoesToMenu()) {
                window.PageReveal.back();
                return;
            }

            // Focus goes back to the row that opened this page.
            const from = panel.dataset.page;
            const row = panel.querySelector('[data-subpage="' + from + '"]');
            showPage('main', row);
        });
    }

    // Settings opens on its main page every time, as it would after leaving
    // the app on a phone. setPage, not showPage: nothing to scroll to or focus
    // in a layer that is on its way out.
    window.addEventListener('reveal:close', function () {
        if (panel.dataset.page === 'main') return;
        setPage('main');
    });

    window.addEventListener('reveal:open', function (event) {
        if (!event.detail.layer.contains(panel)) return;
        syncBack();
    });

    const versionResults = panel.querySelector('.versionCheckResults');

    async function checkVersions() {
        if (!versionResults) return;

        try {
            await loadVersionCheck();
        } catch (err) {
            console.error('[versions]', err);
            return;
        }

        window.VersionCheck.run(versionResults);
    }
}

// Only fetched the first time the button is pressed - see versionCheck.js.
let versionCheckLoading = null;

function loadVersionCheck() {
    if (window.VersionCheck) return Promise.resolve();
    if (versionCheckLoading) return versionCheckLoading;

    versionCheckLoading = new Promise(function (resolve, reject) {
        const script = document.createElement('script');
        script.src = '/src/js/versionCheck.js';
        script.onload = resolve;
        script.onerror = function () {
            versionCheckLoading = null;
            reject(new Error('versionCheck.js failed to load'));
        };
        document.head.appendChild(script);
    });

    return versionCheckLoading;
}
