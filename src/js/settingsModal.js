(function () {
    var MARKUP = `
<div id="settingsDialog">
    <div id="settingsModalMenu" class="modal">
        <div class="modal-content">
            <h2>Settings</h2>
            <div class="modalSettings">
                <div>
                    <h3><i class="fa-solid fa-language"></i>Language</h3>
                    <div>
                        <select name="language" id="language" class="button">
                            <option value="en" selected>English</option>
                            <option value="sv">Svenska (Swedish)</option>
                            <option value="hr">Hrvatski (Croatian)</option>
                            <option value="bs">Bosanski (Bosnian)</option>
                        </select>
                    </div>
                </div>
                <div>
                    <h3><i class="fa-solid fa-brush"></i>Theme</h3>
                    <div class="themeOptions options">
                        <input type="radio" id="auto" name="theme-color" value="auto" class="theme-option" checked>
                        <label for="auto" class="auto button theme-label"><i class="fa-solid fa-laptop"></i>Follow
                            system</label>

                        <input type="radio" id="light" name="theme-color" value="light" class="theme-option">
                        <label for="light" class="light button theme-label"><i
                                class="fa-solid fa-sun"></i>Light</label>

                        <input type="radio" id="dark" name="theme-color" value="dark" class="theme-option">
                        <label for="dark" class="dark button theme-label"><i
                                class="fa-solid fa-moon"></i>Dark</label>
                    </div>
                </div>
                <div>
                    <h3><i class="fa-solid fa-border-top-left"></i>Style</h3>
                    <div class="themeOptions options">
                        <input type="radio" id="liquid-glass" name="style" value="liquid-glass" class="theme-option" checked>
                        <label for="liquid-glass" class="auto button theme-label"><i class="fa-solid fa-droplet"></i>Liquid Glass</label>

                        <input type="radio" id="flat" name="style" value="flat" class="theme-option">
                        <label for="flat" class="light button theme-label"><i
                                class="fa-solid fa-layer-group"></i>Flat</label>
                    </div>
                    <!---<div id="liquidGlassDisabled"><span class="warn"><p>You need to disable Reduce transparency in order to use Liquid Glass.</p></span></div>--->
                </div>
                <div>
                    <h3><i class="fa-solid fa-fill-drip"></i>Color</h3>
                    <div class="colorOptions options">
                        <input type="radio" id="red" name="accent-color" value="red">
                        <label for="red" class="button">Red<span class="red"></span></label>

                        <input type="radio" id="green" name="accent-color" value="green">
                        <label for="green" class="button">Green<span class="green"></span></label>

                        <input type="radio" id="blue" name="accent-color" value="blue" checked>
                        <label for="blue" class="button">Blue<span class="blue"></span></label>

                        <input type="radio" id="purple" name="accent-color" value="purple">
                        <label for="purple" class="button">Purple<span class="purple"></span></label>

                        <input type="radio" id="monochrome" name="accent-color" value="monochrome">
                        <label for="monochrome" class="monochrome button">Monochrome</label>

                    </div>
                </div>
                <div>
                    <h3><i class="fa-solid fa-sliders"></i>General</h3>
                    <div>
                        <div class="checkbox-wrapper-51">
                            <label for="autoUpdateActivity" class="title">Automatically update activities</label>
                            <input type="checkbox" id="autoUpdateActivity" name="autoUpdateActivity" checked />
                            <label for="autoUpdateActivity" class="toggle">
                                <span>
                                    <svg width="10px" height="10px" viewBox="0 0 10 10">
                                        <path
                                            d="M5,1 L5,1 C2.790861,1 1,2.790861 1,5 L1,5 C1,7.209139 2.790861,9 5,9 L5,9 C7.209139,9 9,7.209139 9,5 L9,5 C9,2.790861 7.209139,1 5,1 L5,9 L5,1 Z">
                                        </path>
                                    </svg>
                                </span>
                            </label>
                        </div>
                    </div>
                </div>
                <div>
                    <h3><i class="fa-solid fa-universal-access"></i>Accessibility</h3>
                    <div>
                        <div class="checkbox-wrapper-51">
                            <label for="reduceMotion" class="title">Reduce motion</label>
                            <input type="checkbox" id="reduceMotion" name="reduceMotion" />
                            <label for="reduceMotion" class="toggle">
                                <span>
                                    <svg width="10px" height="10px" viewBox="0 0 10 10">
                                        <path
                                            d="M5,1 L5,1 C2.790861,1 1,2.790861 1,5 L1,5 C1,7.209139 2.790861,9 5,9 L5,9 C7.209139,9 9,7.209139 9,5 L9,5 C9,2.790861 7.209139,1 5,1 L5,9 L5,1 Z">
                                        </path>
                                    </svg>
                                </span>
                            </label>
                        </div>
                    </div>
                    <div>
                        <div class="checkbox-wrapper-51">
                            <label for="reduceTransparency" class="title">Reduce transparency</label>
                            <input type="checkbox" id="reduceTransparency" name="reduceTransparency" />
                            <label for="reduceTransparency" class="toggle">
                                <span>
                                    <svg width="10px" height="10px" viewBox="0 0 10 10">
                                        <path
                                            d="M5,1 L5,1 C2.790861,1 1,2.790861 1,5 L1,5 C1,7.209139 2.790861,9 5,9 L5,9 C7.209139,9 9,7.209139 9,5 L9,5 C9,2.790861 7.209139,1 5,1 L5,9 L5,1 Z">
                                        </path>
                                    </svg>
                                </span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            <p class="modalDescription">version 3.13</p>
            <div class="modalButtons">
                <button type="button" class="button primary" onClick="toggleSettings()">Done</button>
                <button type="button" class="button dangerZone destructive">Reset</button>
            </div>
        </div>
    </div>
</div>
`;

    function inject() {
        // Never add it twice - a page that still has its own copy wins.
        if (document.getElementById('settingsDialog')) return;
        document.body.insertAdjacentHTML('beforeend', MARKUP.trim());
    }

    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject);
})();
