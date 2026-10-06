/* Theme, accent colour and preferences. Loaded without `defer` and first
 * on every page, because the root classes have to be on <html> before anything
 * paints or the page flashes in the wrong theme.
 */

const THEME_COLORS = { light: '#f1f1f1', dark: '#121212' };

const DEFAULTS = {
    theme: 'auto',
    accentColor: 'blue',
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
    albumAccent: () => true,
    hideExplicit: () => true,
    upgradeArtwork: () => true,
    reduceMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    reduceTransparency: () => matchMedia('(prefers-reduced-transparency: reduce)').matches,
    debugMode: () => false
};

// Which radio group in the settings panel holds which setting.
const RADIO_SETTINGS = {
    'theme-color': 'theme',
    'accent-color': 'accentColor'
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
const debug = {
    log(...parts) {
        if (!prefEnabled('debugMode')) return;
        console.log(...parts);
    },

    warn(...parts) {
        if (!prefEnabled('debugMode')) return;
        console.warn(...parts);
    }
};

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
    kept.push('color-' + setting('accentColor'));

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
    if (!prefEnabled('albumAccent')) return;

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

applyRootSettings();
applyAccessibilityPrefs();

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

    if (resetButton) {
        resetButton.addEventListener('click', function () {
            if (!confirm('Are you sure you want to reset all settings to default?')) return;

            // Deleted rather than written back as defaults, so prefEnabled reads
            // them as "never touched" and asks the operating system again.
            for (const key of Object.keys(DEFAULTS)) {
                localStorage.removeItem(key);
            }
            for (const key of Object.keys(PREF_DEFAULT)) {
                localStorage.removeItem(key);
            }

            syncControls();
            applyRootSettings();
            applyAccessibilityPrefs();

            for (const key of Object.keys(PREF_DEFAULT)) {
                announceChange(key, prefEnabled(key));
            }
            for (const key of Object.keys(DEFAULTS)) {
                announceChange(key, setting(key));
            }
        });
    }

    wireSubpages(document.querySelector('.settingsPanel'));

    syncControls();
});

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

// Both back buttons are only shown while a subpage is open, and labelled
// then - see retitle() - since the translations may not have arrived yet
// when they are made.
function backButton(className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.hidden = true;

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

/* ---------- Subpages ----------
 * A row like "Component versions" opens a page of its own in place of the
 * settings, with a back button, the way a phone's Settings app opens Wi-Fi.
 * Only one page is ever shown; the others are `hidden`, not just moved out of
 * view, so nothing off-screen can catch a tap.
 */
function wireSubpages(panel) {
    if (!panel) return;

    const header = headerOf(panel);

    function setPage(name) {
        panel.dataset.page = name;

        let shown = null;
        for (const page of panel.querySelectorAll('.settingsPage')) {
            page.hidden = page.dataset.page !== name;
            if (!page.hidden) shown = page;
        }

        retitle(header, shown);
        syncBack();
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
    function showPage(name, focusTarget) {
        setPage(name);

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
