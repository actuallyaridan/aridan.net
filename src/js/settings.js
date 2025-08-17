
(function() {
    const savedTheme = localStorage.getItem('theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    

    document.documentElement.className = '';
    
    if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
        document.documentElement.classList.add('theme-dark', 'color-blue');
    } else {
        document.documentElement.classList.add('theme-light', 'color-blue');
    }
})();

function initThemeSettings() {
    const settingsDialog = document.getElementById('settingsDialog');
    const themeOptions = document.querySelectorAll('input[name="theme-color"]');
    const colorOptions = document.querySelectorAll('input[name="accent-color"]');
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
    }
    
    function handleColorChange(colorValue) {
        localStorage.setItem('accentColor', colorValue);
        applyAccentColor(colorValue);
    }
    
    function applyAccentColor(colorValue) {
        const classes = document.documentElement.className.split(' ').filter(cls => !cls.startsWith('color-'));
        document.documentElement.className = classes.join(' ') + ` color-${colorValue}`;
    }
    
    function resetSettings() {
        if (confirm('Are you sure you want to reset all settings to default?')) {
            localStorage.removeItem('theme');
            localStorage.removeItem('accentColor');
            
            const autoTheme = document.querySelector('input[name="theme-color"][value="auto"]');
            const blueColor = document.querySelector('input[name="accent-color"][value="blue"]');
            if (autoTheme) autoTheme.checked = true;
            if (blueColor) blueColor.checked = true;
            
            applyTheme('auto');
            applyAccentColor('blue');
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

