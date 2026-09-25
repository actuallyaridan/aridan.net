/* Theme, accent colour, style and preferences. Loaded without `defer` and first
 * on every page, because the root classes have to be on <html> before anything
 * paints or the page flashes in the wrong theme.
 */

const THEME_COLORS = { light: '#f1f1f1', dark: '#121212' };

const DEFAULTS = {
    theme: 'auto',
    accentColor: 'blue',
    style: 'liquid-glass',
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
    upgradeArtwork: () => true,
    reduceMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    reduceTransparency: () => matchMedia('(prefers-reduced-transparency: reduce)').matches
};

// Which radio group in the settings panel holds which setting.
const RADIO_SETTINGS = {
    'theme-color': 'theme',
    'accent-color': 'accentColor',
    'style': 'style'
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
    kept.push('style-' + setting('style'));

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

                // The album's colour paints over the chosen one, so picking a
                // colour while matching is on would look like it did nothing.
                if (key === 'accentColor' && prefEnabled('albumAccent')) {
                    localStorage.setItem('albumAccent', 'false');
                    syncControls();
                    announceChange('albumAccent', false);
                }

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

    syncControls();
});
