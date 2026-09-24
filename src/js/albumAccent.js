/* Recolours the site to match whatever album art is on screen. */
(() => {
    "use strict";

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

    let enabled = prefEnabled("albumAccent");
    let base = null;
    let artKey = null;
    let lastActivity = null;
    // Bumped on every track change so a slow image load cannot repaint the page
    // in the colour of a cover that is no longer playing.
    let generation = 0;
    let painted = false;

    window.Lanyard.subscribe((presence) => onTrack(window.Lanyard.appleMusic(presence)));
    window.addEventListener("settings:change", onSettingsChange);
    watchTheme();

    function onSettingsChange(e) {
        if (e.detail?.key !== "albumAccent") return;

        enabled = !!e.detail.value;
        log(`Album accent ${enabled ? "on" : "off"}`);

        if (!enabled) {
            clearAccent();
            return;
        }

        if (base) {
            applyAccent(false);
        } else if (lastActivity) {
            generation++;
            derive(candidates(lastActivity), generation);
        }
    }

    function onTrack(activity) {
        lastActivity = activity || null;

        const key = activity?.assets?.large_image || "";
        if (key === artKey) return;

        artKey = key;
        base = null;

        generation++;
        const token = generation;

        if (!key) {
            clearAccent();
            return;
        }

        if (!enabled) return;

        log(`Getting dominant color from ${activity.assets.large_text || key}...`);
        derive(candidates(activity), token);
    }

    // Both routes are same-origin-readable; the Cider host the art really lives
    // on sends no CORS headers, so drawing it to a canvas would taint it.
    function candidates(activity) {
        const art = window.Lanyard.artwork(activity);
        if (!art) return [];

        const urls = [];
        if (art.proxy) urls.push(art.proxy(SAMPLE));
        if (art.mzstatic) urls.push(art.mzstatic(SAMPLE));
        if (art.appAsset) urls.push(art.appAsset(SAMPLE));

        return urls;
    }

    function derive(urls, token) {
        if (generation !== token || !enabled) return;

        if (!urls.length) {
            warn("No usable artwork");
            artKey = "";
            clearAccent();
            return;
        }

        const [url, ...rest] = urls;

        loadArtwork(url)
            .then((img) => {
                if (generation !== token) return;

                const hsl = dominant(img);
                if (!hsl) {
                    warn("No color found in", url);
                    derive(rest, token);
                    return;
                }

                base = hsl;
                if (enabled) applyAccent(painted);
            })
            .catch(() => {
                warn("Artwork failed to load:", url);
                derive(rest, token);
            });
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
        for (let i = 0; i < HUE_BUCKETS; i++) {
            buckets.push({ w: 0, x: 0, y: 0, s: 0, l: 0 });
        }

        let mono = 0;
        let monoCount = 0;

        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const alpha = pixels[i + 3];

            if (alpha < 128) continue;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);

            mono += (max + min) / 510;
            monoCount++;

            if (max < MIN_LEVEL) continue;
            if (max - min < MIN_CHROMA) continue;

            const hsl = rgbToHsl(r, g, b);
            const midtone = Math.exp(-((hsl.l - 0.5) ** 2) / 0.1);
            const w = ((max - min) / 255) * midtone;
            const rad = hsl.h * Math.PI / 180;

            const bucket = buckets[Math.floor(hsl.h / HUE_STEP) % HUE_BUCKETS];
            bucket.w += w;
            bucket.x += w * Math.cos(rad);
            bucket.y += w * Math.sin(rad);
            bucket.s += w * hsl.s;
            bucket.l += w * hsl.l;
        }

        function at(i) {
            return buckets[(i + HUE_BUCKETS) % HUE_BUCKETS];
        }

        // Scored with its neighbours so a hue straddling a bucket edge still wins.
        let peak = -1;
        let peakWeight = 0;
        for (let i = 0; i < HUE_BUCKETS; i++) {
            const weight = at(i - 1).w + 2 * at(i).w + at(i + 1).w;
            if (weight > peakWeight) { peakWeight = weight; peak = i; }
        }

        if (peak < 0) return monoCount ? { h: 0, s: 0, l: mono / monoCount } : null;

        const mass = { w: 0, x: 0, y: 0, s: 0, l: 0 };

        for (const bucket of [at(peak - 1), at(peak), at(peak + 1)]) {
            mass.w += bucket.w;
            mass.x += bucket.x;
            mass.y += bucket.y;
            mass.s += bucket.s;
            mass.l += bucket.l;
        }

        return {
            h: ((Math.atan2(mass.y, mass.x) * 180 / Math.PI) + 360) % 360,
            s: mass.s / mass.w,
            l: mass.l / mass.w
        };
    }

    function accentVars(colour, dark) {
        let s;
        if (colour.s < 0.12) {
            s = Math.min(colour.s, 0.08);
        } else {
            s = clamp(colour.s, 0.45, 0.92);
        }

        let pageBg = LIGHT_BG;
        let away = -1;
        if (dark) {
            pageBg = DARK_BG;
            away = 1;
        }

        let bandL;
        if (dark) {
            bandL = clamp(colour.l, 0.50, 0.66);
        } else {
            bandL = clamp(colour.l, 0.38, 0.55);
        }

        const l = fitContrast(colour.h, s, bandL, pageBg, 3, away);

        let hoverStart;
        if (dark) {
            hoverStart = clamp(l + 0.10, 0.06, 0.94);
        } else {
            hoverStart = clamp(l - 0.12, 0.06, 0.94);
        }

        const hover = fitContrast(colour.h, s, hoverStart, pageBg, 3, away);

        // 4.62 is the WCAG AA threshold for normal text, with a little margin.
        function shade(startL, ref, direction) {
            const lightness = fitContrast(colour.h, s, startL, ref, 4.62, direction);
            return hsl(colour.h, s, lightness);
        }

        return {
            "--accent-color": hsl(colour.h, s, l),
            "--accent-color-hover": hsl(colour.h, s, hover),
            "--accent-color-to-active": hsl(colour.h, s, l, 0.61),
            "--icon-color": hsl(colour.h, s, hover),
            "--accent-text": shade(l, pageBg, away),
            "--accent-text-hover": shade(hover, pageBg, away),
            // Filled buttons carry white text, so these are fitted against white.
            "--accent-fill": shade(l, WHITE, -1),
            "--accent-fill-hover": shade(hover, WHITE, -1)
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

        const vars = accentVars(base, root.classList.contains("theme-dark"));

        root.classList.toggle("accent-crossfade", !!animate);

        for (const [prop, value] of Object.entries(vars)) {
            root.style.setProperty(prop, value);
        }

        root.classList.add("album-accent");

        log(`Setting accent color to ${vars["--accent-color"]}`);

        painted = true;
        // Both themes are cached so settings.js can paint the accent back on
        // the next page load before anything renders.
        store({ light: accentVars(base, false), dark: accentVars(base, true) });
    }

    function clearAccent() {
        if (root.classList.contains("album-accent")) log("Clearing accent color");
        root.classList.remove("accent-crossfade", "album-accent");

        for (const prop of PROPS) {
            root.style.removeProperty(prop);
        }

        store(null);
    }

    // Storage can throw in private browsing or when the quota is full; losing
    // the cache only costs a colour flash on the next page.
    function store(value) {
        try {
            if (value) {
                localStorage.setItem(CACHE_KEY, JSON.stringify(value));
            } else {
                localStorage.removeItem(CACHE_KEY);
            }
        } catch {
            /* ignored */
        }
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

    function log(...parts) {
        console.log("[AlbumAccent]", ...parts);
    }

    function warn(...parts) {
        console.warn("[AlbumAccent]", ...parts);
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function hsl(h, s, l, alpha) {
        const hue = Math.round(h);
        const sat = Math.round(s * 100);
        const light = Math.round(l * 100);
        const parts = hue + ", " + sat + "%, " + light + "%";

        if (alpha == null) return "hsl(" + parts + ")";
        return "hsla(" + parts + ", " + alpha + ")";
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

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        const d = max - min;

        if (d === 0) return { h: 0, s: 0, l };

        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;

        h *= 60;
        if (h < 0) h += 360;

        return { h, s, l };
    }

    function luminance(rgb) {
        const linear = rgb.map((v) => {
            const c = v / 255;

            if (c <= 0.03928) return c / 12.92;
            return ((c + 0.055) / 1.055) ** 2.4;
        });

        const r = linear[0];
        const g = linear[1];
        const b = linear[2];

        return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    }

    function contrast(a, b) {
        const la = luminance(a);
        const lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
})();
