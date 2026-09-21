(() => {
    "use strict";

    const USER_ID = "701403809129168978";
    const LANYARD_WS = "wss://api.lanyard.rest/socket";
    const LANYARD_REST = `https://api.lanyard.rest/v1/users/${USER_ID}`;
    const APPLE_APP_ID = "773825528921849856";

    const SAMPLE = 128;

    const MIN_LEVEL = 40;
    const MIN_CHROMA = 16;

    const HUE_BUCKETS = 24;
    const HUE_STEP = 360 / HUE_BUCKETS;

    const PROPS = [
        "--accent-color",
        "--accent-color-hover",
        "--accent-color-to-active",
        "--icon-color",
        "--accent-text",
        "--accent-text-hover",
        "--accent-fill",
        "--accent-fill-hover"
    ];

    const LIGHT_BG = [214, 214, 214];
    const DARK_BG = [39, 39, 39];
    const WHITE = [255, 255, 255];

    const CACHE_KEY = "albumAccentCache";

    const root = document.documentElement;

    let enabled = prefOn("albumAccent");
    let autoUpdate = prefOn("autoUpdateActivity");
    let base = null;
    let artKey = null;
    let lastActivity = null;
    let generation = 0;
    let painted = false;
    let socket = null;
    let heartbeatTimer = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    let destroyed = false;

    const hasWidget = !!document.querySelector(".discordWrapper");

    if (hasWidget) {
        window.addEventListener("lanyard:applemusic", (e) => onTrack(e.detail));
    }
    window.addEventListener("settings:change", onSettingsChange);
    window.addEventListener("beforeunload", destroy, { once: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    watchTheme();

    if (enabled) start();

    function start() {
        if (base) applyAccent(false);
        else if (lastActivity) derive(artworkCandidates(lastActivity), ++generation);

        if (hasWidget || destroyed) return;
        if (autoUpdate) connect();
        else snapshot();
    }

    function stop() {
        disconnect();
        clearAccent();
    }

    function onSettingsChange(e) {
        const key = e.detail && e.detail.key;

        if (key === "albumAccent") {
            enabled = !!e.detail.value;
            log(`Album accent ${enabled ? "on" : "off"}`);
            if (enabled) start();
            else stop();
            return;
        }

        if (key === "autoUpdateActivity") {
            autoUpdate = !!e.detail.value;
            if (!enabled || hasWidget) return;
            if (autoUpdate) connect();
            else { disconnect(); snapshot(); }
        }
    }

    function onTrack(activity) {
        lastActivity = activity || null;

        const key = (activity && activity.assets && activity.assets.large_image) || "";
        if (key === artKey) return;

        artKey = key;
        base = null;
        const token = ++generation;

        if (!key) { clearAccent(); return; }
        if (!enabled) return;

        log(`Getting dominant color from ${activity.assets.large_text || key}...`);
        derive(artworkCandidates(activity), token);
    }

    function derive(candidates, token) {
        if (generation !== token || !enabled) return;

        if (!candidates.length) {
            warn("No usable artwork");
            artKey = "";
            clearAccent();
            return;
        }

        const url = candidates[0];

        loadArtwork(url)
            .then((img) => {
                if (generation !== token) return;
                const hsl = dominant(img);
                if (!hsl) {
                    warn("No color found in", url);
                    derive(candidates.slice(1), token);
                    return;
                }
                base = hsl;
                if (enabled) applyAccent(painted);
            })
            .catch(() => {
                warn("Artwork failed to load:", url);
                derive(candidates.slice(1), token);
            });
    }

    function artworkCandidates(activity) {
        const image = activity.assets && activity.assets.large_image;
        if (!image) return [];

        const EXTERNAL = "mp:external/";

        if (image.startsWith(EXTERNAL)) {
            const list = [
                `https://media.discordapp.net/external/${image.slice(EXTERNAL.length)}` +
                `?width=${SAMPLE}&height=${SAMPLE}`
            ];

            const parts = image.split(/\/https?\//);
            const direct = parts.length > 1 ? "https://" + parts[1] : "";
            if (/^https:\/\/[^/]*mzstatic\.com\//.test(direct)) {
                list.push(direct.replace(
                    /\/(\d+)x\1bb(-\d+)?\.(jpg|png)(\?.*)?$/i,
                    `/${SAMPLE}x${SAMPLE}bb$2.$3$4`
                ));
            }

            return list;
        }

        const appId = activity.application_id;
        return appId
            ? [`https://cdn.discordapp.com/app-assets/${appId}/${image}.png?size=${SAMPLE}`]
            : [];
    }

    function loadArtwork(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.decoding = "async";
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Artwork failed to load"));
            img.src = url;
        });
    }

    function dominant(img) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = SAMPLE;

        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);

        let pixels;
        try {
            pixels = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
        } catch {
            return null;
        }

        const buckets = [];
        for (let i = 0; i < HUE_BUCKETS; i++) buckets.push({ w: 0, x: 0, y: 0, s: 0, l: 0 });

        let mono = 0;
        let monoCount = 0;

        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] < 128) continue;

            const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);

            mono += (max + min) / 510;
            monoCount++;

            if (max < MIN_LEVEL || max - min < MIN_CHROMA) continue;

            const hsl = rgbToHsl(r, g, b);
            const midtone = Math.exp(-Math.pow(hsl.l - 0.5, 2) / 0.1);
            const w = ((max - min) / 255) * midtone;
            const rad = hsl.h * Math.PI / 180;

            const bucket = buckets[Math.floor(hsl.h / HUE_STEP) % HUE_BUCKETS];
            bucket.w += w;
            bucket.x += w * Math.cos(rad);
            bucket.y += w * Math.sin(rad);
            bucket.s += w * hsl.s;
            bucket.l += w * hsl.l;
        }

        let peak = -1;
        let peakWeight = 0;
        for (let i = 0; i < HUE_BUCKETS; i++) {
            const left = buckets[(i + HUE_BUCKETS - 1) % HUE_BUCKETS];
            const right = buckets[(i + 1) % HUE_BUCKETS];
            const weight = left.w + 2 * buckets[i].w + right.w;
            if (weight > peakWeight) { peakWeight = weight; peak = i; }
        }

        if (peak < 0) return monoCount ? { h: 0, s: 0, l: mono / monoCount } : null;

        const mass = [
            buckets[(peak + HUE_BUCKETS - 1) % HUE_BUCKETS],
            buckets[peak],
            buckets[(peak + 1) % HUE_BUCKETS]
        ].reduce(
            (a, bk) => ({ w: a.w + bk.w, x: a.x + bk.x, y: a.y + bk.y, s: a.s + bk.s, l: a.l + bk.l }),
            { w: 0, x: 0, y: 0, s: 0, l: 0 }
        );

        return {
            h: ((Math.atan2(mass.y, mass.x) * 180 / Math.PI) + 360) % 360,
            s: mass.s / mass.w,
            l: mass.l / mass.w
        };
    }

    function accentVars(colour, dark) {
        const s = colour.s < 0.12
            ? Math.min(colour.s, 0.08)
            : clamp(colour.s, 0.45, 0.92);

        const pageBg = dark ? DARK_BG : LIGHT_BG;
        const away = dark ? 1 : -1;

        const bandL = dark ? clamp(colour.l, 0.50, 0.66) : clamp(colour.l, 0.38, 0.55);
        const l = fitContrast(colour.h, s, bandL, pageBg, 3, away);
        const hover = fitContrast(
            colour.h, s, clamp(dark ? l + 0.10 : l - 0.12, 0.06, 0.94), pageBg, 3, away
        );

        const textL = fitContrast(colour.h, s, l, pageBg, 4.62, away);
        const textHoverL = fitContrast(colour.h, s, hover, pageBg, 4.62, away);
        const fillL = fitContrast(colour.h, s, l, WHITE, 4.62, -1);
        const fillHoverL = fitContrast(colour.h, s, hover, WHITE, 4.62, -1);

        return {
            "--accent-color": hsl(colour.h, s, l),
            "--accent-color-hover": hsl(colour.h, s, hover),
            "--accent-color-to-active": hsl(colour.h, s, l, 0.61),
            "--icon-color": hsl(colour.h, s, hover),
            "--accent-text": hsl(colour.h, s, textL),
            "--accent-text-hover": hsl(colour.h, s, textHoverL),
            "--accent-fill": hsl(colour.h, s, fillL),
            "--accent-fill-hover": hsl(colour.h, s, fillHoverL)
        };
    }

    function fitContrast(h, s, startL, ref, target, direction) {
        let l = startL;
        for (let i = 0; i <= 100; i++) {
            if (contrast(hslToRgb(h, s, l), ref) >= target) return l;
            l += direction * 0.01;
            if (l < 0 || l > 1) break;
        }
        return clamp(l, 0, 1);
    }

    function applyAccent(animate) {
        if (!base) return;

        const dark = root.classList.contains("theme-dark");
        const vars = accentVars(base, dark);

        root.classList.toggle("accent-crossfade", !!animate);
        Object.keys(vars).forEach((prop) => root.style.setProperty(prop, vars[prop]));
        root.classList.add("album-accent");

        log(`Setting accent color to ${vars["--accent-color"]}`);

        painted = true;
        cacheAccent();
    }

    function clearAccent() {
        if (root.classList.contains("album-accent")) log("Clearing accent color");
        root.classList.remove("accent-crossfade");
        PROPS.forEach((prop) => root.style.removeProperty(prop));
        root.classList.remove("album-accent");
        try { localStorage.removeItem(CACHE_KEY); } catch { }
    }

    function cacheAccent() {
        if (!base) return;
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                light: accentVars(base, false),
                dark: accentVars(base, true)
            }));
        } catch { }
    }

    function watchTheme() {
        let wasDark = root.classList.contains("theme-dark");
        new MutationObserver(() => {
            const dark = root.classList.contains("theme-dark");
            if (dark === wasDark) return;
            wasDark = dark;
            if (!enabled || !base) return;
            log(`Refitting accent color for ${dark ? "dark" : "light"} theme`);
            applyAccent(false);
        }).observe(root, { attributes: true, attributeFilter: ["class"] });
    }

    function onPresence(data) {
        const activities = Array.isArray(data && data.activities) ? data.activities : [];
        onTrack(activities.find(isAppleMusic) || null);
    }

    function isAppleMusic(a) {
        return a && (a.name === "Apple Music" || a.application_id === APPLE_APP_ID);
    }

    function snapshot() {
        fetch(LANYARD_REST)
            .then((r) => r.json())
            .then((json) => { if (json && json.success) onPresence(json.data); })
            .catch(() => { });
    }

    function connect() {
        if (destroyed || socket) return;

        try {
            socket = new WebSocket(LANYARD_WS);
        } catch {
            scheduleReconnect();
            return;
        }

        socket.onopen = () => {
            reconnectAttempts = 0;
            send({ op: 2, d: { subscribe_to_id: USER_ID } });
        };

        socket.onmessage = (evt) => {
            let msg;
            try { msg = JSON.parse(evt.data); } catch { return; }

            if (msg.op === 1) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = setInterval(() => send({ op: 3 }), msg.d.heartbeat_interval);
            } else if (msg.op === 0) {
                onPresence(msg.d);
            }
        };

        socket.onclose = () => {
            socket = null;
            if (enabled && autoUpdate) scheduleReconnect();
        };
    }

    function scheduleReconnect() {
        if (destroyed || reconnectTimer) return;
        const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts)) +
            Math.floor(Math.random() * 500);
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            reconnectAttempts++;
            connect();
        }, delay);
    }

    function send(obj) {
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
    }

    function disconnect() {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;

        if (socket) {
            socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
            try { socket.close(); } catch { }
            socket = null;
        }
    }

    function onVisibilityChange() {
        if (document.hidden) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        } else if (socket && socket.readyState === WebSocket.OPEN) {
            send({ op: 3 });
        }
    }

    function destroy() {
        destroyed = true;
        disconnect();
    }

    function log(...a) { console.log("[AlbumAccent]", ...a); }
    function warn(...a) { console.warn("[AlbumAccent]", ...a); }

    function prefOn(key) {
        return localStorage.getItem(key) !== "false";
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function hsl(h, s, l, alpha) {
        const parts = `${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
        return alpha == null ? `hsl(${parts})` : `hsla(${parts}, ${alpha})`;
    }

    function hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360 / 360;
        if (s === 0) return [l * 255, l * 255, l * 255];

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const channel = (t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
    }

    function luminance(rgb) {
        const [r, g, b] = rgb.map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function contrast(a, b) {
        const la = luminance(a);
        const lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        const d = max - min;

        if (d === 0) return { h: 0, s: 0, l: l };

        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;

        h *= 60;
        if (h < 0) h += 360;

        return { h: h, s: s, l: l };
    }
})();
