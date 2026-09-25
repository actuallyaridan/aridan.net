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

function setMenuOpen(open) {
    const menu = document.getElementById("mobileMenuID");
    if (!menu) return;

    menu.classList.toggle("showMenu", open);

    for (const btn of document.querySelectorAll('[aria-controls="mobileMenuID"]')) {
        if (open) {
            btn.setAttribute("aria-expanded", "true");
        } else {
            btn.setAttribute("aria-expanded", "false");
        }

        const icon = btn.querySelector("i");
        if (!icon) continue;

        icon.classList.toggle("fa-bars", !open);
        icon.classList.toggle("fa-bars-staggered", open);
    }
}

function toggleSettings() {
    // The settings page shows the panel inline; everywhere else it is a modal,
    // except on narrow screens where there is no room for one.
    const inline = document.getElementById("settingsInline");

    if (inline) {
        let behavior = "smooth";
        if (document.documentElement.classList.contains("reduce-motion")) {
            behavior = "auto";
        }

        inline.scrollIntoView({ behavior: behavior, block: "start" });
        return;
    }

    if (matchMedia("(max-width: 966px)").matches) {
        location.href = "/settings/";
        return;
    }

    window.SettingsModal?.toggle();
}

// Buttons declare their intent with data-action instead of an inline onclick,
// so the CSP can refuse inline scripts outright. Delegated from the document so
// the settings modal's own buttons work once injected.
const ACTIONS = {
    menu: function () {
        const menu = document.getElementById("mobileMenuID");
        if (menu) setMenuOpen(!menu.classList.contains("showMenu"));
    },
    settings: toggleSettings
};

document.addEventListener("click", function (e) {
    const trigger = e.target.closest("[data-action]");
    if (!trigger) return;

    const action = ACTIONS[trigger.dataset.action];
    if (action) action();
});

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setMenuOpen(false);
});

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
            console.warn("Service worker registration failed", err);
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
