(function () {
    // Everything inside the dialog that the Tab key can reach.
    var FOCUSABLE = [
        'a[href]',
        'button:not([disabled])',
        'select',
        'input:not([type="hidden"])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

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

    function focusable() {
        var content = document.querySelector('#settingsModalMenu .modal-content');
        if (!content) return [];

        var visible = [];

        for (const el of content.querySelectorAll(FOCUSABLE)) {
            // A null offsetParent usually means display:none, but is also true of
            // position:fixed, so getClientRects is checked as well.
            var isVisible = el.offsetParent !== null || el.getClientRects().length > 0;
            if (isVisible) visible.push(el);
        }

        return visible;
    }

    function setOpen(open) {
        var el = backdrop();
        var dialog = document.getElementById('settingsDialog');
        if (!el || !dialog) return;

        el.classList.toggle('showMenuNoAnimation', open);
        dialog.classList.toggle('showMenuNoAnimation', open);

        for (const btn of document.querySelectorAll('[aria-haspopup="dialog"]')) {
            if (open) {
                btn.setAttribute('aria-expanded', 'true');
            } else {
                btn.setAttribute('aria-expanded', 'false');
            }
        }

        if (open) {
            opener = document.activeElement;
            var first = focusable()[0];
            if (first) first.focus();
            return;
        }

        // Hand focus back, as long as that element is still in the page.
        if (opener) {
            if (document.contains(opener)) opener.focus();
            opener = null;
        }
    }

    // Makes Tab wrap inside the dialog instead of walking out of it.
    function trap(e) {
        if (e.key !== 'Tab') return;
        if (!isOpen()) return;

        var items = focusable();
        if (items.length === 0) return;

        var first = items[0];
        var last = items[items.length - 1];
        var here = document.activeElement;

        // Backwards off the front, or from outside the dialog, lands on the last item.
        if (e.shiftKey) {
            if (here === first || !items.includes(here)) {
                e.preventDefault();
                last.focus();
            }
            return;
        }

        if (here === last) {
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
        if (isOpen() && e.target === backdrop()) setOpen(false);
    }

    function inject() {
        if (document.getElementById('settingsDialog')) return;
        if (document.getElementById('settingsInline')) return;
        if (!window.SettingsPanel) return;
        document.body.insertAdjacentHTML('beforeend', shell().trim());
        document.addEventListener('keydown', onKeydown);
        backdrop().addEventListener('click', onClick);
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
