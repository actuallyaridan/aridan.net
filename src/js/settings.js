/* Browsers tint their own chrome from <meta name="theme-color"> - Safari 18 and
   older paint the whole toolbar with it - and with no meta present they pick
   something themselves, which is where the blue came from. These mirror
   --background-color in styles.css. They are literals rather than a
   getComputedStyle read because this file runs in <head>, before the stylesheet
   is guaranteed to have arrived. Keep them in step with styles.css. */
const THEME_COLORS = { light: '#f1f1f1', dark: '#121212' };

function syncThemeColor(resolvedTheme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
    }
    meta.setAttribute('content', THEME_COLORS[resolvedTheme] || THEME_COLORS.light);
}

function applyRootSettings(theme, color, style) {
    const root = document.documentElement;
    const kept = root.className.split(/\s+/)
        .filter(cls => cls && !/^(theme|color|style)-/.test(cls));

    if (theme === 'auto') {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    root.className = kept.concat([`theme-${theme}`, `color-${color}`, `style-${style}`]).join(' ');
    syncThemeColor(theme);
}

// addEventListener on a MediaQueryList is recent enough that older Safari still
// needs the deprecated addListener.
function onMediaChange(query, handler) {
    if (query.addEventListener) query.addEventListener('change', handler);
    else if (query.addListener) query.addListener(handler);
}

const PREF_DEFAULT = {
    autoUpdateActivity: () => true,
    reduceMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    reduceTransparency: () => window.matchMedia('(prefers-reduced-transparency: reduce)').matches
};

function prefEnabled(key) {
    const saved = localStorage.getItem(key);
    return saved === null ? PREF_DEFAULT[key]() : saved === 'true';
}

function applyAccessibilityPrefs() {
    const root = document.documentElement;
    root.classList.toggle('reduce-motion', prefEnabled('reduceMotion'));
    root.classList.toggle('reduce-transparency', prefEnabled('reduceTransparency'));
}

function applySavedRootSettings() {
    applyRootSettings(
        localStorage.getItem('theme') || 'auto',
        localStorage.getItem('accentColor') || 'blue',
        localStorage.getItem('style') || 'liquid-glass'
    );
}

(function() {
    applySavedRootSettings();
    applyAccessibilityPrefs();

    /* "Follow system" resolves to theme-light or theme-dark at load, so nothing
       was watching for the system flipping while the page sat open - the CSS
       .theme-auto block never applies. Re-resolve on change, which also keeps
       the browser chrome's theme-color honest. The same goes for the two
       accessibility switches when they are left on their system default. */
    onMediaChange(window.matchMedia('(prefers-color-scheme: dark)'), function() {
        if ((localStorage.getItem('theme') || 'auto') === 'auto') applySavedRootSettings();
    });
    onMediaChange(window.matchMedia('(prefers-reduced-motion: reduce)'), applyAccessibilityPrefs);
    onMediaChange(window.matchMedia('(prefers-reduced-transparency: reduce)'), applyAccessibilityPrefs);

    const SUPPORTED = ['en', 'sv', 'hr', 'bs'];

    let lang = localStorage.getItem('lang') || 'en';
    if (!SUPPORTED.includes(lang)) lang = 'en';
    document.documentElement.setAttribute('lang', lang);

    if (lang !== 'en') {
        document.documentElement.classList.add('i18n-wait');
        window.__i18nPreload = {
            lang: lang,
            dict: fetch(`/src/i18n/${lang}.json`).then(r => r.json())
        };
        setTimeout(() => document.documentElement.classList.remove('i18n-wait'), 1500);
    }
})();

let settingsWired = false;

function initThemeSettings() {
    const themeOptions = document.querySelectorAll('input[name="theme-color"]');
    const colorOptions = document.querySelectorAll('input[name="accent-color"]');
    const styleOptions = document.querySelectorAll('input[name="style"]');
    const toggles = document.querySelectorAll('#autoUpdateActivity, #reduceMotion, #reduceTransparency');
    const resetButton = document.querySelector('.dangerZone');

    if (themeOptions.length === 0 || colorOptions.length === 0 || !resetButton) {
        setTimeout(initThemeSettings, 100);
        return;
    }

    if (settingsWired) {
        initializeSettings();
        return;
    }
    settingsWired = true;

    initializeSettings();

    toggles.forEach(toggle => {
        toggle.addEventListener('change', function() {
            handlePrefChange(this.id, this.checked);
        });
    });

    themeOptions.forEach(option => {
        option.addEventListener('change', function() {
            handleThemeChange(this.value);
        });
    });

    colorOptions.forEach(option => {
        option.addEventListener('change', function() {
            handleColorChange(this.value);
        });
    });

    styleOptions.forEach(option => {
        option.addEventListener('change', function() {
            handleStyleChange(this.value);
        });
    });

    resetButton.addEventListener('click', resetSettings);

    function initializeSettings() {
        toggles.forEach(toggle => { toggle.checked = prefEnabled(toggle.id); });

        const savedTheme = localStorage.getItem('theme') || 'auto';
        const themeRadio = document.querySelector(`input[name="theme-color"][value="${savedTheme}"]`);
        if (themeRadio) themeRadio.checked = true;
        applyTheme(savedTheme);

        const savedColor = localStorage.getItem('accentColor') || 'blue';
        const colorRadio = document.querySelector(`input[name="accent-color"][value="${savedColor}"]`);
        if (colorRadio) colorRadio.checked = true;
        applyAccentColor(savedColor);

        const savedStyle = localStorage.getItem('style') || 'liquid-glass';
        const styleRadio = document.querySelector(`input[name="style"][value="${savedStyle}"]`);
        if (styleRadio) styleRadio.checked = true;
        applyStyle(savedStyle);
    }

    function handlePrefChange(key, enabled) {
        localStorage.setItem(key, String(enabled));
        applyAccessibilityPrefs();
        window.dispatchEvent(new CustomEvent('settings:change', {
            detail: { key: key, value: enabled }
        }));
    }

    function handleThemeChange(themeValue) {
        localStorage.setItem('theme', themeValue);
        applyTheme(themeValue);
    }

    function applyTheme(themeValue) {
        applyRootSettings(
            themeValue,
            localStorage.getItem('accentColor') || 'blue',
            localStorage.getItem('style') || 'liquid-glass'
        );
    }

    function handleColorChange(colorValue) {
        localStorage.setItem('accentColor', colorValue);
        applyAccentColor(colorValue);
    }

    function applyAccentColor(colorValue) {
        const classes = document.documentElement.className.split(' ').filter(cls => !cls.startsWith('color-'));
        document.documentElement.className = classes.join(' ') + ` color-${colorValue}`;
    }

    function handleStyleChange(styleValue) {
        localStorage.setItem('style', styleValue);
        applyStyle(styleValue);
    }

function applyStyle(styleValue) {
    const classes = document.documentElement.className.split(' ').filter(cls => !cls.startsWith('style-'));
    document.documentElement.className = classes.join(' ') + ` style-${styleValue}`;
    
    if (styleValue === 'liquid-glass') {
        requestAnimationFrame(() => {
            if (typeof repositionNavPills === 'function') repositionNavPills();
        });
    }
}

    function resetSettings() {
        if (confirm('Are you sure you want to reset all settings to default?')) {
            localStorage.removeItem('theme');
            localStorage.removeItem('accentColor');
            localStorage.removeItem('style');
            Object.keys(PREF_DEFAULT).forEach(key => localStorage.removeItem(key));

            const autoTheme = document.querySelector('input[name="theme-color"][value="auto"]');
            const blueColor = document.querySelector('input[name="accent-color"][value="blue"]');
            const liquidGlass = document.querySelector('input[name="style"][value="liquid-glass"]');
            if (autoTheme) autoTheme.checked = true;
            if (blueColor) blueColor.checked = true;
            if (liquidGlass) liquidGlass.checked = true;

            applyTheme('auto');
            applyAccentColor('blue');
            applyStyle('liquid-glass');

            toggles.forEach(toggle => { toggle.checked = prefEnabled(toggle.id); });
            applyAccessibilityPrefs();
            window.dispatchEvent(new CustomEvent('settings:change', {
                detail: { key: 'autoUpdateActivity', value: prefEnabled('autoUpdateActivity') }
            }));
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeSettings);
} else {
    setTimeout(initThemeSettings, 0);
}

document.addEventListener('readystatechange', function() {
    if (document.readyState === 'complete') {
        setTimeout(initThemeSettings, 0);
    }
});