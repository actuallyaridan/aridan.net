/* Page furniture: emoji, the mobile menu, nav pills, the service worker. */

// twemoji only walks the DOM it is handed, once. Anything rendered after load -
// article cards, article bodies - has to ask for its own pass, so this is a
// named helper rather than a one-shot, alongside markExternalLinks below.
window.parseEmoji = function (root) {
    if (!window.twemoji) return;
    twemoji.parse(root || document.body, { folder: "svg", ext: ".svg" });
};

window.markExternalLinks = function (root) {
    const scope = root || document;

    for (const a of scope.querySelectorAll('a[href^="http"]')) {
        if (a.hasAttribute("target")) continue;
        if (a.hostname === location.hostname) continue;

        a.target = "_blank";

        if (a.rel) {
            a.rel = a.rel + " noopener";
        } else {
            a.rel = "noopener";
        }
    }
};

function startTitleShuffle() {
    const spans = [...document.querySelectorAll(".description span")];
    if (!spans.length) return;

    let queue = [];

    function next() {
        if (queue.length === 0) {
            queue = spans.slice();
            queue.sort(() => Math.random() - 0.5);
        }

        const showing = queue.pop();

        for (const span of spans) {
            if (span === showing) {
                span.style.display = "inline";
            } else {
                span.style.display = "none";
            }
        }
    }

    next();
    if (!document.documentElement.classList.contains("reduce-motion")) {
        setInterval(next, 2000);
    }
}

/* The spinning album covers - the Apple Music card's, and the one in the
   lyrics bar - both turn with the `spin` animation in lanyard.css.

   On iPad, Safari sometimes stops turning one while still reporting the
   animation as running: its copy on the graphics layer stalls, typically
   after the image is swapped, the element is hidden and shown again, the
   page around it is moved, or the tab comes back from the background.
   Nothing in script can see that happen, so the animation is restarted at
   each of those moments instead. */
const SPINNING_ART = "#amActivityLogoLarge, #lyricsNowArt";

// Starts the spin over as a brand new animation, so Safari builds its layer
// copy afresh - but from the angle it had reached, so the cover does not
// jump. It stays a plain CSS animation, so Reduce motion (which removes it)
// and the lyrics bar pausing it while hidden both still apply.
window.restartSpin = function (el) {
    if (!el) return;

    const style = getComputedStyle(el);
    if (style.animationName === "none") return;

    let elapsed = 0;
    for (const animation of el.getAnimations()) {
        if (animation.animationName === style.animationName) {
            elapsed = Number(animation.currentTime) || 0;
        }
    }

    // animation-duration comes back as seconds, "2.5s".
    const duration = parseFloat(style.animationDuration) * 1000;
    if (duration > 0) {
        elapsed = elapsed % duration;
    }

    el.style.animationName = "none";

    // Reading layout here makes the browser drop the old animation before
    // the next line brings the name back.
    void el.offsetWidth;

    el.style.animationName = "";
    el.style.animationDelay = "-" + Math.round(elapsed) + "ms";
};

function restartAllSpins() {
    for (const el of document.querySelectorAll(SPINNING_ART)) {
        window.restartSpin(el);
    }
}

// Back from another tab or app, or from the back-forward cache.
document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") restartAllSpins();
});

window.addEventListener("pageshow", function (e) {
    if (e.persisted) restartAllSpins();
});

/* Layers under the page - the mobile menu and settings. Opening one slides
   the page aside to show it (see "The page, and the layers under it" in
   styles.css); only one is ever showing. */

// How long the page takes to slide - the transition on #page.
const REVEAL_SLIDE_MS = 450;

let revealed = null;
let revealOpener = null;

// The layer the open one was reached from - the menu, when settings was
// opened from it - and what had focus there, so Done in settings can go
// back to it. Tapping the page or Escape still closes everything.
let revealParent = null;
let revealParentFocus = null;
let revealScrollY = 0;
let revealSettleTimer = 0;

// What lockOutside() made inert, so only those are handed back.
let revealLocked = [];

// Everything inside a layer that the Tab key can reach.
const REVEAL_FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "select",
    "input:not([type=\"hidden\"])",
    "[tabindex]:not([tabindex=\"-1\"])"
].join(", ");

// While a layer is showing, nothing else on the page can be tabbed to or
// read out: the page itself, but also what sits beside it in <body> - the
// skip link, the other layer. Anything already inert for its own reasons is
// left as it is.
function lockOutside(layer) {
    unlockOutside();

    for (const el of document.body.children) {
        if (el === layer) continue;
        if (el.inert) continue;

        el.inert = true;
        revealLocked.push(el);
    }
}

function unlockOutside() {
    for (const el of revealLocked) {
        el.inert = false;
    }
    revealLocked = [];
}

// Tab wraps around inside the open layer instead of leaving for the
// browser's own toolbar, as it did in the settings modal before this.
function trapRevealFocus(e) {
    if (!revealed) return;

    const items = [];
    for (const el of revealed.querySelectorAll(REVEAL_FOCUSABLE)) {
        // A null offsetParent usually means display:none, but is also true
        // of position:fixed, so getClientRects is checked as well.
        const isVisible = el.offsetParent !== null || el.getClientRects().length > 0;
        if (isVisible) items.push(el);
    }

    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];
    const here = document.activeElement;

    // Backwards off the front, or from the layer itself, lands on the last item.
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

function revealIsOpen(layer) {
    if (!revealed) return false;
    if (!layer) return true;
    return revealed === layer;
}

function openReveal(layer) {
    const root = document.documentElement;
    const page = document.getElementById("page");
    if (!layer || !page) return;
    if (revealed === layer) return;

    window.clearTimeout(revealSettleTimer);
    revealSettleTimer = 0;

    // Switching straight from one layer to another - settings from the menu -
    // keeps the page where it is and only moves it to its new place.
    const switching = revealed !== null;
    if (switching) {
        revealParent = revealed;
        revealParentFocus = document.activeElement;

        revealed.classList.remove("revealShown");
        announceRevealClosed(revealed);
    } else {
        // Reopened while still sliding back: the page is still fixed and
        // still where it was frozen, so that position is the one to keep.
        if (!root.classList.contains("revealClosing")) {
            revealScrollY = window.scrollY;
        }
        revealOpener = document.activeElement;
    }

    revealed = layer;
    layer.classList.add("revealShown");
    // Which slide styles.css gives the page for this layer.
    if (layer.dataset.reveal) {
        root.dataset.reveal = layer.dataset.reveal;
    } else {
        delete root.dataset.reveal;
    }
    root.classList.remove("revealClosing");
    root.classList.add("revealOpen");

    // Fixed now, so the page is its own scroller - put it where the window
    // was, so it is picked up exactly as it looked.
    if (!switching) page.scrollTop = revealScrollY;

    // The page is only a preview at the edge now. Inert, taps on it fall
    // through to the layer underneath, which is what closes it (see the
    // click listener below).
    lockOutside(layer);
    layer.focus({ preventScroll: true });

    syncRevealButtons();
    announceRevealOpened(layer);
}

function closeReveal() {
    const root = document.documentElement;
    const page = document.getElementById("page");
    if (!revealed || !page) return;

    const closing = revealed;
    revealed.classList.remove("revealShown");
    revealed = null;
    revealParent = null;
    revealParentFocus = null;

    announceRevealClosed(closing);

    root.classList.remove("revealOpen");
    root.classList.add("revealClosing");
    unlockOutside();

    let wait = REVEAL_SLIDE_MS;
    if (root.classList.contains("reduce-motion")) wait = 0;
    revealSettleTimer = window.setTimeout(settleReveal, wait);

    // Back to whatever opened it, as long as that is on the page and not in
    // a layer that has just been hidden.
    let back = revealOpener;
    if (!back || !page.contains(back)) {
        back = document.querySelector('#mobile-header [aria-controls="mobileMenuID"]');
    }
    if (back) back.focus({ preventScroll: true });
    revealOpener = null;

    syncRevealButtons();
}

// Once the page is back in place it goes back into the document, and the
// window is scrolled to where the page was - both in the same frame, so
// nothing on screen moves.
function settleReveal() {
    revealSettleTimer = 0;
    const root = document.documentElement;
    root.classList.remove("revealClosing");
    delete root.dataset.reveal;
    window.scrollTo(0, revealScrollY);

    // The page was fixed and moved with the covers on it.
    restartAllSpins();
}

function syncRevealButtons() {
    const menuOpen = revealIsOpen(document.getElementById("mobileMenuID"));
    const settingsOpen = revealIsOpen(document.getElementById("settingsLayer"));

    for (const btn of document.querySelectorAll('[aria-controls="mobileMenuID"]')) {
        if (menuOpen) {
            btn.setAttribute("aria-expanded", "true");
        } else {
            btn.setAttribute("aria-expanded", "false");
        }

        // Still in view on the edge of the page while it is aside, so it
        // shows the menu is open.
        const icon = btn.querySelector("i");
        if (!icon) continue;

        icon.classList.toggle("fa-bars", !menuOpen);
        icon.classList.toggle("fa-bars-staggered", menuOpen);
    }

    for (const btn of document.querySelectorAll('[data-action="settings"][aria-expanded]')) {
        if (settingsOpen) {
            btn.setAttribute("aria-expanded", "true");
        } else {
            btn.setAttribute("aria-expanded", "false");
        }
    }
}

function toggleMenu() {
    const menu = document.getElementById("mobileMenuID");
    if (revealIsOpen(menu)) {
        closeReveal();
    } else {
        openReveal(menu);
    }
}

// albumAccent.js puts the album's colour back when settings closes - whether
// the page slides back or the menu takes its place.
function announceRevealClosed(layer) {
    window.dispatchEvent(new CustomEvent("reveal:close", {
        detail: { layer: layer }
    }));
}

// settings.js shows a back arrow in settings when it was opened from the menu.
function announceRevealOpened(layer) {
    window.dispatchEvent(new CustomEvent("reveal:open", {
        detail: { layer: layer }
    }));
}

function revealHasParent() {
    return revealParent !== null;
}

// Back to the layer the open one was reached from, with focus back on what
// opened it - the Settings button in the menu, say.
function returnToRevealParent() {
    const parent = revealParent;
    const focusTarget = revealParentFocus;

    openReveal(parent);

    // Going back is not a new step, so there is nothing to go back to now.
    revealParent = null;
    revealParentFocus = null;

    if (focusTarget && parent.contains(focusTarget)) {
        focusTarget.focus({ preventScroll: true });
    }
}

function toggleSettings() {
    // The settings page shows the panel inline; everywhere else it is a layer
    // under the page (settingsModal.js).
    const inline = document.getElementById("settingsInline");

    if (inline) {
        let behavior = "smooth";
        if (document.documentElement.classList.contains("reduce-motion")) {
            behavior = "auto";
        }

        inline.scrollIntoView({ behavior: behavior, block: "start" });
        return;
    }

    const layer = document.getElementById("settingsLayer");
    if (!layer) return;

    if (!revealIsOpen(layer)) {
        openReveal(layer);
        return;
    }

    // Open already, so this is Done: back to the menu if that is where
    // settings was opened from, otherwise closed.
    if (revealParent) {
        returnToRevealParent();
    } else {
        closeReveal();
    }
}

// Buttons declare their intent with data-action instead of an inline onclick,
// so the CSP can refuse inline scripts outright. Delegated from the document so
// the settings layer's own buttons work once injected.
const ACTIONS = {
    menu: toggleMenu,
    settings: toggleSettings
};

document.addEventListener("click", function (e) {
    const trigger = e.target.closest("[data-action]");
    if (!trigger) return;

    const action = ACTIONS[trigger.dataset.action];
    if (action) action();
});

// The page is inert while a layer is showing, so a tap on the part of it
// still in view lands on the layer behind. Only a tap there closes it - not
// one in the empty space of the layer itself.
document.addEventListener("click", function (e) {
    if (!revealed) return;
    if (!revealed.contains(e.target)) return;
    if (e.target.closest("a, button, input, label, select")) return;

    const page = document.getElementById("page");
    if (!page) return;

    const edge = page.getBoundingClientRect().right;
    if (e.clientX <= edge) closeReveal();
});

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeReveal();
    if (e.key === "Tab") trapRevealFocus(e);
});

// For settingsModal.js, which keeps its old name and API.
window.PageReveal = {
    open: openReveal,
    close: closeReveal,
    isOpen: revealIsOpen,
    hasParent: revealHasParent,
    back: returnToRevealParent
};

const settlePill = [];

function attachPill(list) {
    const host = list.parentElement;
    if (!host) return;

    const pill = document.createElement("span");
    pill.className = "nav-pill";
    host.style.position = "relative";
    host.insertBefore(pill, list);

    function moveTo(item) {
        const inner = item?.querySelector("a, button");
        if (!inner) return;
        const hostBox = host.getBoundingClientRect();
        const innerBox = inner.getBoundingClientRect();
        pill.style.width = innerBox.width + "px";
        pill.style.left = innerBox.left - hostBox.left + "px";
        pill.style.opacity = "1";
    }

    function settle() {
        const active = host.querySelector("li.active");
        if (active) moveTo(active);
        else pill.style.opacity = "0";
    }

    for (const li of list.querySelectorAll("li")) {
        li.addEventListener("mouseenter", () => {
            pill.classList.add("hovering");
            moveTo(li);
        });
    }

    host.addEventListener("mouseleave", () => {
        pill.classList.remove("hovering");
        settle();
    });

    settlePill.push(settle);
    settle();
}

window.repositionNavPills = function () {
    for (const settle of settlePill) {
        settle();
    }
};

function isLocalHost() {
    const host = location.hostname;

    if (!host) return true;
    if (host === "localhost") return true;
    if (host === "::1") return true;
    if (host.endsWith(".local")) return true;
    if (host.endsWith(".lan")) return true;

    const IPV4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/;
    const parts = host.match(IPV4);
    if (!parts) return false;

    const first = Number(parts[1]);
    const second = Number(parts[2]);

    if (first === 127) return true;                       // loopback
    if (first === 169 && second === 254) return true;     // link-local
    return false;
}

// Registered after load so the install never competes with the first render.
// Never on localhost: there is no build step, so a cached shell would keep
// serving yesterday's CSS while you edit it. Any worker left over from a
// previous visit is torn down for the same reason.
function initServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    if (!isLocalHost() && !/^\/articles\/(new|edit)\//.test(location.pathname)) {
        navigator.serviceWorker.register("/sw.js").catch(function (err) {
            debug.warn("Service worker registration failed", err);
        });
        return;
    }

    navigator.serviceWorker.getRegistrations().then(function (registrations) {
        for (const registration of registrations) {
            registration.unregister();
        }
    });

    if (window.caches) {
        caches.keys().then(function (keys) {
            for (const key of keys) {
                if (key.startsWith("aridan-")) caches.delete(key);
            }
        });
    }
}

function init() {
    startTitleShuffle();
    window.markExternalLinks(document);

    const year = document.getElementById("footerYear");
    if (year) year.textContent = new Date().getFullYear();

    // The mobile menu is always dark, like the lyrics control bar in immersive
    // mode: .theme-dark is a plain class in styles.css, so it works on any
    // element, not only <html>. It is still hidden at this point, so it never
    // shows in the wrong colours first.
    const mobileMenu = document.getElementById("mobileMenuID");
    if (mobileMenu) mobileMenu.classList.add("theme-dark");

    // Widened past the phone layout with the menu open: the menu is hidden
    // there, so the page would be left stranded off to the side.
    matchMedia("(max-width: 966px)").addEventListener("change", function (e) {
        if (e.matches) return;
        if (revealIsOpen(document.getElementById("mobileMenuID"))) closeReveal();
    });

    const header = document.querySelector("#desktop-header nav .notAList");
    if (header) attachPill(header);

    for (const list of document.querySelectorAll(".pillNav ul.notAList")) {
        attachPill(list);
    }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

window.addEventListener("load", function () {
    window.parseEmoji(document.body);
    window.repositionNavPills();
    initServiceWorker();
});
