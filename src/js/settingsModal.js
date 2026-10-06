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
