/* The desktop settings modal: just the shell. The controls inside it come from
   settingsPanel.js, which must load first. */
(function () {
    var FOCUSABLE = 'a[href], button:not([disabled]), select, input:not([type="hidden"]), [tabindex]:not([tabindex="-1"])';
    var opener = null;

    function shell() {
        return `
<div id="settingsDialog">
    <div id="settingsModalMenu" class="modal">
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="settingsModalTitle">
            <h2 id="settingsModalTitle">Settings</h2>${window.SettingsPanel.markup({ withDone: true })}
        </div>
    </div>
</div>`;
    }

    function backdrop() { return document.getElementById('settingsModalMenu'); }

    function isOpen() {
        var el = backdrop();
        return !!el && el.classList.contains('showMenuNoAnimation');
    }

    // Only the controls that are actually on screen - the radios and checkboxes
    // are moved off-view, and their labels are what a pointer or a Tab lands on.
    function focusable() {
        var content = document.querySelector('#settingsModalMenu .modal-content');
        if (!content) return [];
        return [...content.querySelectorAll(FOCUSABLE)].filter(function (el) {
            return el.offsetParent !== null || el.getClientRects().length > 0;
        });
    }

    function setOpen(open) {
        var el = backdrop();
        var dialog = document.getElementById('settingsDialog');
        if (!el || !dialog) return;

        el.classList.toggle('showMenuNoAnimation', open);
        dialog.classList.toggle('showMenuNoAnimation', open);

        if (open) {
            opener = document.activeElement;
            var first = focusable()[0];
            if (first) first.focus();
        } else if (opener) {
            // Send focus back to the gear that opened it, rather than dropping
            // the caret at the top of the document.
            if (document.contains(opener)) opener.focus();
            opener = null;
        }
    }

    /* A dialog that leaves focus loose lets Tab wander into the page behind it,
       where a screen reader has no way of knowing it is looking at covered
       content. Wrap around instead. */
    function trap(e) {
        if (e.key !== 'Tab' || !isOpen()) return;
        var items = focusable();
        if (!items.length) return;

        var first = items[0];
        var last = items[items.length - 1];
        var here = document.activeElement;

        if (e.shiftKey && (here === first || !items.includes(here))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && here === last) {
            e.preventDefault();
            first.focus();
        }
    }

    function onKeydown(e) {
        if (!isOpen()) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            return;
        }
        trap(e);
    }

    function onClick(e) {
        // The backdrop is the element itself; anything inside is the dialog box.
        if (isOpen() && e.target === backdrop()) setOpen(false);
    }

    function inject() {
        // Never add it twice - a page that still has its own copy wins.
        if (document.getElementById('settingsDialog')) return;
        // /settings/ shows the panel inline; a modal too would duplicate every
        // control id and break the radio groups.
        if (document.getElementById('settingsInline')) return;
        if (!window.SettingsPanel) return;
        document.body.insertAdjacentHTML('beforeend', shell().trim());
        document.addEventListener('keydown', onKeydown);
        backdrop().addEventListener('click', onClick);
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
