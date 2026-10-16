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

/* Numbers that count up to their value instead of just appearing - the
   Pi-hole stats and the GitHub stars and forks.

     window.countTo(el, value, format, options)

   `format` turns a number into what the element shows, and is the same
   function the caller would otherwise use, so the last frame is exactly the
   text it always was. In between it is handed the numbers on the way.

   It counts from wherever the element last counted to, so a refresh ticks
   from the old value to the new one. The first time, it starts from
   options.from, or 0. options.whole rounds the numbers in between, for a
   format that would otherwise show decimals mid-count.

   options.during, if given, formats the numbers in between instead of
   `format` - for a format whose length jumps about from one number to the
   next (one that drops a ".0", say). The text is centred, so every change
   in its length moves the whole number sideways, which flashes. */
const COUNT_MS = 900;

window.countTo = function (el, value, format, options) {
    if (!el) return;

    const target = Number(value);
    const settings = options || {};

    let from = 0;
    if (el.dataset.countValue !== undefined) {
        from = Number(el.dataset.countValue);
    } else if (settings.from !== undefined) {
        from = Number(settings.from);
    }

    el.dataset.countValue = String(target);

    // A newer count on the same element takes over from one still running.
    const token = {};
    el.countToken = token;

    // Nothing to count, or nobody to see it: straight to the end. A hidden
    // tab would not draw the frames anyway.
    let instant = false;
    if (from === target) instant = true;
    if (!Number.isFinite(from) || !Number.isFinite(target)) instant = true;
    if (document.hidden) instant = true;
    if (document.documentElement.classList.contains("reduce-motion")) instant = true;

    if (instant) {
        el.textContent = format(target);
        return;
    }

    const start = performance.now();

    function frame(now) {
        if (el.countToken !== token) return;

        // A frame's timestamp is when the frame began, which can be a moment
        // before the count was started - that would count backwards first.
        let progress = (now - start) / COUNT_MS;
        if (progress < 0) progress = 0;
        if (progress > 1) progress = 1;

        // Ease out: quick at first, slowing into the final number.
        const eased = 1 - Math.pow(1 - progress, 3);

        if (progress >= 1) {
            el.textContent = format(target);
            return;
        }

        let current = from + (target - from) * eased;
        if (settings.whole) {
            current = Math.round(current);
        }

        if (settings.during) {
            el.textContent = settings.during(current);
        } else {
            el.textContent = format(current);
        }

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
};

// How long each word stays, and how long one takes to roll into its place.
const ROLE_HOLD_MS = 2500;
const ROLE_ROLL_MS = 450;
const ROLE_EASE = "cubic-bezier(.2, .8, .2, 1)";

function startTitleShuffle() {
    const roller = document.querySelector(".roleRoller");
    if (!roller) return;

    const spans = [...roller.children];
    if (!spans.length) return;

    let queue = [];
    let showing = null;

    // Every word once, in a random order, then again in a new one. A new
    // round never starts with the word the last one ended on, or it would
    // look like nothing happened.
    function pick() {
        if (queue.length === 0) {
            queue = spans.slice();
            queue.sort(() => Math.random() - 0.5);
        }

        let chosen = queue.pop();

        if (chosen === showing && spans.length > 1) {
            queue.unshift(chosen);
            chosen = queue.pop();
        }

        return chosen;
    }

    // The box takes the width of the word in it. Measured each time rather
    // than once, since switching language changes every word's width.
    // `snap` is for corrections rather than rolls - the font arriving, the
    // language changing - which should just be right, not slide there.
    function fitTo(span, snap) {
        const width = span.offsetWidth + "px";

        if (!snap) {
            roller.style.width = width;
            return;
        }

        roller.style.transition = "none";
        roller.style.width = width;

        // Read back, so the width is applied before the transition returns.
        void roller.offsetWidth;
        roller.style.transition = "";
    }

    function next() {
        // A background tab freezes animations but not this timer, so rolls
        // would pile up behind each other and all play at once on the way
        // back. Nobody is watching, so nothing needs to change.
        if (document.hidden) return;

        const leaving = showing;
        const arriving = pick();

        // Anything still rolling from last time is put straight where it was
        // going, so there are only ever two words in the box.
        for (const span of spans) {
            for (const animation of span.getAnimations()) {
                animation.finish();
            }

            if (span !== arriving && span !== leaving) {
                span.classList.remove("showing");
            }
        }

        const first = !leaving;

        showing = arriving;
        arriving.classList.add("showing");
        fitTo(arriving, first);

        if (!leaving) return;
        if (document.documentElement.classList.contains("reduce-motion")) {
            leaving.classList.remove("showing");
            return;
        }

        const timing = { duration: ROLE_ROLL_MS, easing: ROLE_EASE };

        arriving.animate(
            [
                { transform: "translateY(100%)", opacity: 0 },
                { transform: "none", opacity: 1 }
            ],
            timing
        );

        const out = leaving.animate(
            [
                { transform: "none", opacity: 1 },
                { transform: "translateY(-100%)", opacity: 0 }
            ],
            timing
        );

        out.onfinish = function () {
            // Still the one leaving, not picked again in the meantime.
            if (leaving !== showing) leaving.classList.remove("showing");
        };
    }

    next();

    // A word changes size after it was measured when the web font arrives
    // (on a first visit the first word is measured in the fallback font, and
    // stayed clipped until the next roll), or when the language changes.
    // Either way the box follows the word that is showing.
    if ("ResizeObserver" in window) {
        const observer = new ResizeObserver(function () {
            if (showing) fitTo(showing, true);
        });

        for (const span of spans) {
            observer.observe(span);
        }
    }

    if (!document.documentElement.classList.contains("reduce-motion")) {
        setInterval(next, ROLE_HOLD_MS);
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

// Bumped by every open and close, so an open still getting ready (see
// openReveal) can tell it has been overtaken and leave the page alone.
let revealToken = 0;

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

    revealToken++;
    const token = revealToken;

    if (switching || root.classList.contains("revealClosing")) {
        // Already a card on the screen, with its layer: it just moves.
        root.classList.remove("revealClosing");
        root.classList.add("revealOpen");
    } else {
        // From the page at rest, the slide is started two frames after the
        // page has been made a card (revealPreparing in styles.css): one for
        // the browser to lay it out fixed and draw its layer, one to show
        // it, so the slide's first frame has nothing left to do but move.
        root.classList.add("revealPreparing");

        // Fixed now, so the page is its own scroller - put it where the
        // window was, so it is picked up exactly as it looked.
        page.scrollTop = revealScrollY;

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                // Closed again, or another layer opened, in the meantime.
                if (revealToken !== token) return;

                root.classList.add("revealOpen");
                root.classList.remove("revealPreparing");
            });
        });
    }

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

    revealToken++;
    root.classList.remove("revealPreparing");
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
        back = document.querySelector('#desktop-header [aria-controls="mobileMenuID"]');
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

// settings.js puts settings back on its main page when it closes - whether
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

        // Hidden until now, it appears where it belongs, rather than
        // sliding there from wherever it was last.
        const appearing = pill.style.opacity !== "1";
        if (appearing) {
            pill.style.transition = "opacity .2s ease";
        }

        pill.style.width = innerBox.width + "px";
        pill.style.left = innerBox.left - hostBox.left + "px";

        if (appearing) {
            // Read back, so the place is applied before the slide returns.
            void pill.offsetWidth;
            pill.style.transition = "";
        }

        pill.style.opacity = "1";
    }

    // Below 966px the header's links fold away (see "One header, phone to
    // desktop" in styles.css). The pill goes as soon as the current one
    // starts to fade, and only comes back once it has fully faded back in.
    function isShowing(li) {
        const style = getComputedStyle(li);
        if (style.visibility === "hidden") return false;
        if (parseFloat(style.opacity) < 1) return false;
        return li.getBoundingClientRect().width > 1;
    }

    function settle() {
        const active = host.querySelector("li.active");

        if (active && isShowing(active)) {
            moveTo(active);
        } else {
            pill.style.opacity = "0";
        }
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

    // The folding is a CSS transition, which can finish without the nav
    // changing size again - fading back in is the last thing it does - so
    // its end is a cue to look again too.
    list.addEventListener("transitionend", function (e) {
        if (e.target.parentElement !== list) return;
        if (pill.classList.contains("hovering")) return;
        settle();
    });

    // And the moment the current one starts fading either way, the pill
    // fades with it: out alongside it when it folds, and kept out until it
    // has finished coming back when it unfolds.
    list.addEventListener("transitionrun", function (e) {
        if (e.propertyName !== "opacity") return;
        if (!e.target.classList.contains("active")) return;
        if (e.target.parentElement !== list) return;
        pill.style.opacity = "0";
    });

    // Measured while the nav was hidden - the page opened at phone width and
    // was then widened, or a tablet turned - the pill is left at zero width
    // in the corner. Any change in the nav's size measures it again.
    if ("ResizeObserver" in window) {
        new ResizeObserver(function () {
            if (pill.classList.contains("hovering")) return;
            settle();
        }).observe(host);
    }
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

/* ---------- Layout changes, animated ----------

   The content fits itself to the room it has (see "Fitting the page to the
   window" in styles.css), and at a few widths part of it changes layout - a
   section's photo going from beside its text to under it, the tour's
   buttons dropping below their text. Resizing across one of those, the
   blocks that jump slide from where they were to where they now are,
   instead of teleporting.

   Each block's place is kept relative to <main>, and only a sudden change
   counts: text rewrapping as the window narrows moves things a line at a
   time, which is under MORPH_JUMP. Places are read from the layout
   (offsetLeft and offsetTop) rather than from what is on screen, so a slide
   still under way never looks like another jump. */

// What can move as one block. Nothing in here sits inside another of them
// except the tour's rows, which are handled below.
const MORPH_SELECTOR = [
    "div.section > *",
    ".siteTour div.section > div > *",
    ".articlePreview > *",
    ".pi-grid > *"
].join(", ");

const MORPH_JUMP = 24;
const MORPH_MS = 420;
const MORPH_EASE = "cubic-bezier(.2, .8, .2, 1)";

// Where the element sits in the layout, measured up through its offset
// parents to `root`.
function layoutPosition(el, root) {
    let x = 0;
    let y = 0;
    let node = el;

    while (node && node !== root) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent;
    }

    return { x: x, y: y };
}

function initLayoutMorph() {
    const main = document.querySelector("main");
    if (!main) return;

    const page = document.getElementById("page");

    let last = new Map();

    function snapshot() {
        const places = new Map();
        const origin = layoutPosition(main, page);

        for (const el of main.querySelectorAll(MORPH_SELECTOR)) {
            // Not laid out at all - display: none somewhere above it.
            if (el.offsetParent === null) continue;

            const at = layoutPosition(el, page);
            places.set(el, { x: at.x - origin.x, y: at.y - origin.y });
        }

        return places;
    }

    function slide(el, dx, dy) {
        for (const animation of el.getAnimations()) {
            if (animation.id === "layoutMorph") animation.cancel();
        }

        // `translate` rather than `transform`, so it adds to whatever
        // transform the element already has - a button pressed in, say.
        const animation = el.animate(
            [
                { translate: dx + "px " + dy + "px" },
                { translate: "0 0" }
            ],
            { duration: MORPH_MS, easing: MORPH_EASE }
        );
        animation.id = "layoutMorph";
    }

    function onResize() {
        const now = snapshot();

        let animate = true;
        if (document.hidden) animate = false;
        if (document.documentElement.classList.contains("reduce-motion")) animate = false;

        if (animate) {
            const sliding = [];

            for (const [el, place] of now) {
                const before = last.get(el);
                if (!before) continue;

                const dx = before.x - place.x;
                const dy = before.y - place.y;
                if (Math.abs(dx) < MORPH_JUMP && Math.abs(dy) < MORPH_JUMP) continue;

                // Inside a block that is already sliding, it moves with it.
                let carried = false;
                for (const outer of sliding) {
                    if (outer.contains(el)) carried = true;
                }
                if (carried) continue;

                slide(el, dx, dy);
                sliding.push(el);
            }
        }

        last = now;
    }

    last = snapshot();
    window.addEventListener("resize", onResize);

    // The content changes without a resize too - images arriving, the
    // article list filling in, a filter switched. Kept up to date, so the
    // next resize compares against where things really were.
    if ("ResizeObserver" in window) {
        new ResizeObserver(function () {
            last = snapshot();
        }).observe(main);
    }
}

/* Each image is marked once it has loaded or failed (see "Images still on
   their way" in styles.css): loaded, its blurred preview is taken away;
   failed, its alt text shows again. Neither event bubbles, so they are
   caught on the way down instead. */
function markImage(img) {
    if (!img.complete) return;
    if (!img.getAttribute("src")) return;

    if (img.naturalWidth > 0) {
        img.classList.remove("imgFailed");
        img.classList.add("imgLoaded");
    } else {
        img.classList.remove("imgLoaded");
        img.classList.add("imgFailed");
    }
}

document.addEventListener("load", function (e) {
    if (e.target instanceof HTMLImageElement) markImage(e.target);
}, true);

document.addEventListener("error", function (e) {
    if (e.target instanceof HTMLImageElement) markImage(e.target);
}, true);

// Any that finished before this file ran.
function markImagesAlreadyDone() {
    for (const img of document.images) {
        markImage(img);
    }
}

function init() {
    startTitleShuffle();
    markImagesAlreadyDone();
    initLayoutMorph();
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
