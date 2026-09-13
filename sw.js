// Bump VERSION whenever either precache list changes; the old cache is dropped
// on activate, so a stale shell can never outlive a deploy.
//
// Bump it for a CSP change in _headers too. A worker captures the policy from
// its own script response at install time and keeps it for the life of the
// registration - no reload, however hard, re-reads it. Only a byte-different
// sw.js installs a new worker, and that changed etag is also what gets the file
// past Cloudflare's edge cache so the new header is the one it installs under.
const VERSION = "v4";
const CACHE = "aridan-" + VERSION;

// Extensionless on purpose: Pages 308s /offline.html to /offline, and a response
// that came through a redirect cannot be handed to a navigation - the browser
// drops it and shows its own error page instead. Requesting the URL Pages
// actually serves keeps the fallback usable.
const OFFLINE_URL = "/offline";

// The shell every page needs. Page HTML is deliberately absent: navigations are
// network-first and fill the cache as they are visited.
const PRECACHE = [
    OFFLINE_URL,
    "/src/css/styles.css",
    "/src/css/settings.css",
    "/src/css/lanyard.css",
    "/src/css/pihole.css",
    "/src/css/minecraft.css",
    "/src/css/editor.css",
    "/src/css/lyricsEasterEgg.css",
    "/src/js/settings.js",
    "/src/js/settingsPanel.js",
    "/src/js/settingsModal.js",
    "/src/js/general.js",
    "/assets/media/favicons/icon-192.png",
    "/assets/media/favicons/site.webmanifest"
];

// Font Awesome's stylesheet is render-blocking on every page, so until it
// arrives the browser has nothing to paint but default-styled HTML. Coming from
// a third party, it costs a full cross-origin round trip per navigation, and
// when that outruns Chrome's paint-holding budget you get a frame or two of
// unstyled page. Precaching it moves that off the network entirely.
//
// These URLs are version-pinned and therefore immutable: a new Font Awesome
// means a new URL, and VERSION above drops the old entry. That is what makes
// cache-first safe here when it would not be for our own unhashed files.
const FA = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.1/";
const CDN_PRECACHE = [
    FA + "css/all.min.css",
    FA + "webfonts/fa-solid-900.woff2",
    FA + "webfonts/fa-brands-400.woff2",
    FA + "webfonts/fa-regular-400.woff2",
    "https://cdn.jsdelivr.net/npm/@twemoji/api@17.0.3/dist/twemoji.min.js"
];

const CDN_IMMUTABLE =
    /^https:\/\/(cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/|cdn\.jsdelivr\.net\/npm\/@twemoji\/api@)/;

// Fetched as an explicit CORS request, never no-cors. An opaque response would
// still satisfy the page, but the integrity="..." on both tags could not be
// checked against it and the browser would reject them - taking every icon on
// the site with it.
function cdnRequest(url) {
    return new Request(url, { mode: "cors", credentials: "omit" });
}

// Live data and author tooling must never be served from cache:
//   /api/            - Pi-hole stats, the whole point is that they are current
//   /assets/content/ - article markdown the local editor reads back after writes
//   /articles/new/, /articles/edit/ - local-only editor screens
const BYPASS = [
    /^\/api\//,
    /^\/assets\/content\//,
    /^\/articles\/(new|edit)\//,
    /^\/feed\.xml$/,
    /^\/sitemap\.xml$/,
    /^\/robots\.txt$/,
    /^\/sw\.js$/
];

function shouldBypass(pathname) {
    return BYPASS.some((re) => re.test(pathname));
}

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            // Individually, because addAll is all-or-nothing: one slow CDN would
            // otherwise fail the whole install and leave the site with no worker.
            .then((cache) =>
                Promise.all(
                    PRECACHE.map((url) => cache.add(url).catch(() => {})).concat(
                        CDN_PRECACHE.map((url) =>
                            fetch(cdnRequest(url))
                                .then((res) => (res.ok ? cache.put(cdnRequest(url), res) : null))
                                .catch(() => {})
                        )
                    )
                )
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        const offline = await cache.match(OFFLINE_URL);
        if (offline) return offline;
        throw err;
    }
}

// ignoreVary because CDNs vary on Accept-Encoding, which would otherwise miss
// whenever the stored encoding differs from what this request advertises.
async function cacheFirst(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);

    const network = fetch(request)
        .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => cached);

    return cached || network;
}

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    if (url.origin !== self.location.origin) {
        // Only the version-pinned CDN assets above. Everything else third-party
        // keeps using the browser's own HTTP cache.
        if (CDN_IMMUTABLE.test(request.url)) event.respondWith(cacheFirst(request));
        return;
    }

    if (shouldBypass(url.pathname)) return;

    if (request.mode === "navigate") {
        event.respondWith(networkFirst(request));
        return;
    }

    event.respondWith(staleWhileRevalidate(request));
});
