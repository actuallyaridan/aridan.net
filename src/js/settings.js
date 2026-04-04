(function() {
    const savedTheme = localStorage.getItem('theme');
    const savedStyle = localStorage.getItem('style') || 'liquid-glass';
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    document.documentElement.className = '';

    if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
        document.documentElement.classList.add('theme-dark', 'color-blue');
    } else {
        document.documentElement.classList.add('theme-light', 'color-blue');
    }

    document.documentElement.classList.add(`style-${savedStyle}`);
})();

function initThemeSettings() {
    const settingsDialog = document.getElementById('settingsDialog');
    const themeOptions = document.querySelectorAll('input[name="theme-color"]');
    const colorOptions = document.querySelectorAll('input[name="accent-color"]');
    const styleOptions = document.querySelectorAll('input[name="style"]');
    const resetButton = document.querySelector('.dangerZone');

    if (!settingsDialog || themeOptions.length === 0 || colorOptions.length === 0 || !resetButton) {
        setTimeout(initThemeSettings, 100);
        return;
    }

    initializeSettings();

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

    function handleThemeChange(themeValue) {
        localStorage.setItem('theme', themeValue);
        applyTheme(themeValue);
    }

    function applyTheme(themeValue) {
        document.documentElement.className = '';

        if (themeValue === 'auto') {
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            themeValue = systemDark ? 'dark' : 'light';
        }

        document.documentElement.classList.add(`theme-${themeValue}`);

        const currentColor = localStorage.getItem('accentColor') || 'blue';
        document.documentElement.classList.add(`color-${currentColor}`);

        const currentStyle = localStorage.getItem('style') || 'liquid-glass';
        document.documentElement.classList.add(`style-${currentStyle}`);
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
        // Give the browser a frame to apply the new styles before recalculating
        requestAnimationFrame(() => {
            const activeItem = document.querySelector('#desktop-header .notAList li.active');
            const pill = document.getElementById('nav-pill');
            const nav = document.querySelector('#desktop-header .notAList');
            if (!activeItem || !pill || !nav) return;
            
            const inner = activeItem.querySelector('a, button');
            if (!inner) return;
            
            const navRect = nav.getBoundingClientRect();
            const innerRect = inner.getBoundingClientRect();
            pill.style.width = innerRect.width + 'px';
            pill.style.left = (innerRect.left - navRect.left) + 'px';
            pill.style.opacity = '1';
        });
    }
}

    function resetSettings() {
        if (confirm('Are you sure you want to reset all settings to default?')) {
            localStorage.removeItem('theme');
            localStorage.removeItem('accentColor');
            localStorage.removeItem('style');

            const autoTheme = document.querySelector('input[name="theme-color"][value="auto"]');
            const blueColor = document.querySelector('input[name="accent-color"][value="blue"]');
            const liquidGlass = document.querySelector('input[name="style"][value="liquid-glass"]');
            if (autoTheme) autoTheme.checked = true;
            if (blueColor) blueColor.checked = true;
            if (liquidGlass) liquidGlass.checked = true;

            applyTheme('auto');
            applyAccentColor('blue');
            applyStyle('liquid-glass');
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