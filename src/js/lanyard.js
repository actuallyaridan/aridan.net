// aridan.net
// lanyard.js v2
// 2025-09-14

(() => {
  "use strict";

  const USER_ID = "701403809129168978";
  const LANYARD_WS = "wss://api.lanyard.rest/socket";
  const HIGH_RES = 512;
  const APPLE_APP_ID = "773825528921849856"; // Lanyard's Apple Music application id

  let socket;
  let autoUpdate = true;   // "Automatically update activities" in the settings panel
  let awaitingSnapshot = false; // manual mode: close the socket after one payload
  let refreshTimer = null;
  let rafId = 0;
  let lastTick = 0;
  let heartbeatTimer;
  let reconnectTimer;
  let reconnectAttempts = 0;
  let lastStatus;
  let lastArtSrc = "";
  let lastTrackKey = "";
  let lastAppleHref = "";
  let destroyed = false;

  let discordDataLatest;


  const els = {
    loading: byId("loading"),
    error: byId("errorMessage"),
    spinner: byId("loadingSpinner"),
    content: byId("loadedLanyard"),
    lanyardDiscord: byId("lanyardDiscord"),
    amLanyardDiscord: byId("amLanyardDiscord"),

    activityLogoLarge: byId("activityLogoLarge"),
    activityName: byId("activityName"),
    activityDetails: byId("activityDetails"),
    activityState: byId("activityState"),

    amActivityLogoLarge: byId("amActivityLogoLarge"),
    amActivityName: byId("amActivityName"),
    amActivityState: byId("amActivityState"),
    amActivityDetails: byId("amActivityDetails"),
    amActivityTime: byId("amActivityTime"),
    amRemaining: byId("amRemaining"),
    amElapsed: byId("amElapsed"),

    amProgressBar: byId("amProgressBar"),
    amProgressTrack: byId("amProgressTrack"),
    progressBar: byId("ProgressBar"),
    progressTrack: byId("ProgressTrack"),
    progressSeparator: byId("ProgressSeparator"),

    appleLink: byId("apple-link"),

    refresh: byId("lanyardRefresh"),

    strip: byId("discord"),
    scrollPrev: byId("discordScrollPrev"),
    scrollNext: byId("discordScrollNext"),
  };

  ["amLanyardDiscord", "discordActivity"].forEach((id) =>
    byId(id)?.classList.add("activity")
  );

  // Bootstrap
  if (document.querySelector(".discordWrapper")) {
    initAccessibility();
    autoUpdate = autoUpdateEnabled();
    applyUpdateMode({ initial: true });
    connect();
    window.addEventListener("beforeunload", destroy, { once: true });
    document.addEventListener("visibilitychange", onPageVisibilityChange);
    window.addEventListener("settings:change", onSettingsChange);
    els.refresh?.addEventListener("click", refreshNow);
    initStripNav();
  }

  function initStripNav() {
    if (!els.strip) return;

    els.scrollPrev?.addEventListener("click", () => scrollByActivity(-1));
    els.scrollNext?.addEventListener("click", () => scrollByActivity(1));

    els.strip.addEventListener("scroll", updateStripNav, { passive: true });
    window.addEventListener("resize", updateStripNav);
    els.strip.querySelectorAll("img").forEach((img) =>
      img.addEventListener("load", updateStripNav)
    );
    updateStripNav();
  }

  function visibleActivities() {
    return [...els.strip.children].filter(
      (el) => getComputedStyle(el).display !== "none"
    );
  }

  function scrollByActivity(direction) {
    const stripLeft = els.strip.getBoundingClientRect().left;
    const stops = visibleActivities().map((el) => {
      const offset = el.getBoundingClientRect().left - stripLeft;
      const margin = parseFloat(getComputedStyle(el).marginLeft) || 0;
      return Math.max(0, Math.round(els.strip.scrollLeft + offset - margin));
    });

    const here = els.strip.scrollLeft;
    const target = direction > 0
      ? stops.find((x) => x > here + 1)
      : [...stops].reverse().find((x) => x < here - 1);

    els.strip.scrollTo({
      left: target ?? (direction > 0 ? els.strip.scrollWidth : 0),
      behavior: document.documentElement.classList.contains("reduce-motion")
        ? "auto"
        : "smooth"
    });
  }

  function updateStripNav() {
    if (!els.strip) return;
    const max = els.strip.scrollWidth - els.strip.clientWidth;
    const overflowing = max > 1;
    const here = els.strip.scrollLeft;

    els.scrollPrev?.classList.toggle("hide", !overflowing || here <= 1);
    els.scrollNext?.classList.toggle("hide", !overflowing || here >= max - 1);

    // A tab stop is only worth having while there is something to scroll to.
    if (overflowing) els.strip.setAttribute("tabindex", "0");
    else els.strip.removeAttribute("tabindex");
  }

  function autoUpdateEnabled() {
    return localStorage.getItem("autoUpdateActivity") !== "false";
  }

  function applyUpdateMode(opts) {
    const initial = !!(opts && opts.initial);

    if (els.refresh) els.refresh.classList.toggle("hide", autoUpdate);

    if (autoUpdate) {
      awaitingSnapshot = false;
      syncTicker();
      if (!initial && socket?.readyState !== WebSocket.OPEN) connect();
      return;
    }

    stopUiTicker();
    if (discordDataLatest) cleanupSocket();
    else awaitingSnapshot = true;
  }

  function onSettingsChange(e) {
    if (e.detail?.key !== "autoUpdateActivity") return;
    autoUpdate = !!e.detail.value;
    applyUpdateMode({ initial: false });
  }

  function refreshNow() {
    if (autoUpdate || destroyed) return;
    setRefreshBusy(true);
    awaitingSnapshot = true;
    reconnectAttempts = 0;
    connect();
    refreshTimer = setTimeout(() => setRefreshBusy(false), 10000);
  }

  function setRefreshBusy(busy) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
    if (!els.refresh) return;
    els.refresh.disabled = !!busy;
    els.refresh.setAttribute("aria-busy", busy ? "true" : "false");
  }

  // WebSocket 
  function connect() {
    log("Preparing connection to Lanyard WebSocket at", LANYARD_WS);
    cleanupSocket();
    if (destroyed) return;

    try {
      socket = new WebSocket(LANYARD_WS);
    } catch (e) {
      onSocketClose();
      return;
    }

    socket.onopen = () => {
      log("Connected. Subscribing to", USER_ID);
      send({ op: 2, d: { subscribe_to_id: USER_ID } });
    };

    socket.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch (e) {
        warn("Bad message", e);
        return;
      }

      switch (msg.op) {
        case 1: // hello / heartbeat info
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          heartbeatTimer = setInterval(() => send({ op: 3 }), msg.d.heartbeat_interval);
          log(`Subscribed to ${USER_ID}`);
          break;
        case 0: // data
          toggleLoading(true);
          discordDataLatest = msg.d || {};
          updateUi();
          if (!autoUpdate) {
            awaitingSnapshot = false;
            setRefreshBusy(false);
            cleanupSocket();
          }
          break;
      }
    };

    socket.onerror = (err) => {
      warn("WebSocket error", err);
    };

    socket.onclose = onSocketClose;
  }

  function onSocketClose() {
    if (destroyed) return;
    if (!autoUpdate && !awaitingSnapshot) return;
    warn("Lost connection to Lanyard. Reconnecting.");
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    const base = Math.min(30000, 1000 * 2 ** reconnectAttempts);
    const jitter = Math.floor(Math.random() * 500);
    const delay = Math.max(1000, base) + jitter;

    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        reconnectAttempts++;
        connect();
      }, delay);
    }
  }

  function send(obj) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(obj));
    }
  }

  function cleanupSocket() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try {
        socket.close();
      } catch { }
    }
    socket = null;
  }

  function destroy() {
    destroyed = true;
    cleanupSocket();
    stopUiTicker();
    document.removeEventListener("visibilitychange", onPageVisibilityChange);
    window.removeEventListener("settings:change", onSettingsChange);
  }

  function onPageVisibilityChange() {
    if (document.hidden) {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    } else if (socket?.readyState === WebSocket.OPEN) {
      send({ op: 3 });
    }
  }

  // UI update 
  function updateUi() {
    try {
      const d = discordDataLatest || {};
      const activities = Array.isArray(d.activities) ? d.activities : [];
      const status = d.discord_status || "";

      updateStatusWrapper(status);
      updateActivityInfo(activities, status);

      const music = pickAppleMusic(activities);
      if (music) updateProgressBar(music.timestamps);

      show(els.loading, false);
      show(els.content, true);
      show(els.error, false);

      updateStripNav();
      syncTicker();
    } catch (e) {
      handleError(e);
    } finally {
      toggleLoading(false);
    }
  }

  function updateStatusWrapper(status) {
    if (status === lastStatus) return;
    lastStatus = status;

    document.querySelectorAll(".statusWrapper").forEach((el) => el.classList.add("hide"));
    byId(`statusWrapper${cap(status)}`)?.classList.remove("hide");
  }

  function updateActivityInfo(activities, status) {
    show(els.lanyardDiscord, status === "online");

    let appleMusic = null;
    const others = [];

    for (const a of activities) {
      if (isAppleMusic(a)) appleMusic = a;
      else others.push(a);
    }

    if (appleMusic) updateAppleMusicInfo(appleMusic);
    else {
      show(els.amLanyardDiscord, false);
      window.dispatchEvent(new CustomEvent("lanyard:applemusic", { detail: null }));
    }

    show(byId("discordActivity"), others.length > 0);
    updateActivityImages(others);
    updateActivityDetails(others);
  }

  function updateActivityImages(activities) {
    const firstWithImage = activities.find((a) => a.assets?.large_image);
    show(els.activityLogoLarge, !!firstWithImage);
    if (firstWithImage) {
      updateImage(
        els.activityLogoLarge,
        firstWithImage.assets.large_image,
        firstWithImage.application_id,
        firstWithImage.assets.large_text
      );
    }
  }

  function updateActivityDetails(activities) {
    if (!activities.length) {
      [els.activityName, els.activityDetails, els.activityState].forEach((el) => show(el, false));
      return;
    }

    const a = activities[0];
    setText(els.activityName, a.name);
    setText(els.activityDetails, a.details);
    setText(els.activityState, a.state || "");

    updateActivityTime(a.timestamps);
    updateProgressBar(a.timestamps, "");
  }

  function updateAppleMusicInfo(a) {
    show(els.amLanyardDiscord, true);

    if (a.assets) {
      updateImage(els.amActivityLogoLarge, a.assets.large_image, a.application_id, a.assets.large_text);
    }

    setText(els.amActivityName, a.name);
    setText(els.amActivityState, formatActivityState(a.state));
    setText(els.amActivityDetails, a.details);

    updateActivityTime(a.timestamps, "am");
    updateProgressBar(a.timestamps);

    window.dispatchEvent(new CustomEvent("lanyard:applemusic", { detail: a }));

    // build a stable key to reduce API churn
    const trackKey = [a.details, a.state, a.assets?.large_text, a.assets?.large_image].join("|");
    if (trackKey !== lastTrackKey) {
      lastTrackKey = trackKey;
      refreshAppleMusicLink(a.details, a.state, a.assets?.large_text, a.assets?.large_image);
    }
  }

  function updateProgressBar(timestamps, prefix = "am") {
    const am = prefix === "am";
    const bar = am ? els.amProgressBar : els.progressBar;
    const track = am ? els.amProgressTrack : els.progressTrack;
    if (!bar) return;

    const timed = !!(timestamps?.start && timestamps?.end);

    /* A generic Discord activity usually reports a start and no end, which is
       elapsed time rather than a proportion - there is nothing for a bar to
       fill towards. Rather than leave a bar sitting empty forever, swap it for
       the plain separator, which keeps the card the same height and rhythm as
       one that does have a bar. Apple Music always has both, so its track is
       always on show and it has no separator to swap to. */
    if (!am) {
      track?.classList.toggle("hide", !timed);
      els.progressSeparator?.classList.toggle("hide", timed);
    }

    if (!timed) {
      bar.style.width = "0%";
      track?.setAttribute("aria-valuenow", "0");
      return;
    }

    const now = Date.now();
    const start = +new Date(timestamps.start);
    const end = +new Date(timestamps.end);

    let pct = 0;
    if (now <= start) pct = 0;
    else if (now >= end) pct = 100;
    else pct = ((now - start) / (end - start)) * 100;

    bar.style.width = `${pct}%`;
    track?.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  function updateActivityTime(timestamps, prefix = "") {
    const now = new Date();
    const timeEl = byId(`${prefix}ActivityTime`);
    const remainingEl = byId(`${prefix}Remaining`);
    const elapsedEl = byId(`${prefix}Elapsed`);

    const timeData = timestamps?.end
      ? diff(new Date(timestamps.end), now)
      : timestamps?.start
        ? diff(now, new Date(timestamps.start))
        : null;

    setText(timeEl, timeData ? fmt(timeData) : "-:-");
    toggleTimeDisplay(remainingEl, elapsedEl, !!timestamps?.end);
  }

  // Apple Music artwork 
  function getImageUrl(image, appId, size = HIGH_RES) {
    if (!image) return "";

    // Apple external proxies carry the upstream URL
    if (image.startsWith("mp:external/")) {
      // mp:external/http(s)/is*.mzstatic.com/.../96x96bb.jpg or .../96x96bb-65.jpg
      const parts = image.split(/\/https?\//);
      if (parts.length > 1) {
        const rawApple = "https://" + parts[1];
        return rawApple.replace(
          /\/(\d+)x\1bb(-\d+)?\.(jpg|png)(\?.*)?$/i,
          `/${size}x${size}bb$2.$3$4`
        );
      }
    }

    // default: Discord app assets
    if (!appId) return "";
    return `https://cdn.discordapp.com/app-assets/${appId}/${image}.png?size=${size}`;
  }

  function updateImage(el, image, appId, details = "") {
    if (!el || !image) {
      if (el) el.style.display = "none";
      return;
    }

    const hiRes = getImageUrl(image, appId);
    const fallback = image.includes("external")
      ? `https://media.discordapp.net/external/${image.split("mp:external/")[1]}?width=${HIGH_RES}&height=${HIGH_RES}&quality=lossless`
      : hiRes;

    if (hiRes === lastArtSrc || fallback === lastArtSrc) return;

    el.onload = function () {
      lastArtSrc = this.src;
      this.onload = null;
    };

    el.onerror = function () {
      if (this.src !== fallback) {
        warn("Falling back to signed Discord art");
        this.onerror = null;
        this.src = fallback;
      }
    };

    el.src = hiRes;
    el.alt = details || String(image);
    el.title = details || String(image);
    el.style.display = "block";
  }

  function byId(id) { return id ? document.getElementById(id) : null; }
  function show(el, yes) { if (el) el.style.display = yes ? "flex" : "none"; }
  function setText(el, text) { if (!el) return; el.textContent = text ?? ""; show(el, !!text); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function log(...a) { console.log("[Lanyard]", ...a); }
  function warn(...a) { console.warn("[Lanyard]", ...a); }

  function toggleLoading(isLoading) {
    document.querySelectorAll(".activity").forEach((el) => {
      el.classList.toggle("loadingUpdating", !!isLoading);
      el.querySelector(".smallLoader")?.classList.toggle("showSmallLoader", !!isLoading);
    });
  }

  function toggleTimeDisplay(remainingEl, elapsedEl, isRemaining) {
    if (remainingEl) remainingEl.classList.toggle("hide", !isRemaining);
    if (elapsedEl) elapsedEl.classList.toggle("hide", isRemaining);
  }

  function diff(end, start) {
    const secs = Math.max(0, Math.floor((end - start) / 1000));
    return { hours: Math.floor(secs / 3600), minutes: Math.floor((secs % 3600) / 60), seconds: secs % 60 };
  }

  function fmt({ hours, minutes, seconds }) {
    return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
  }

  function isAppleMusic(a) {
    return a?.name === "Apple Music" || a?.application_id === APPLE_APP_ID;
  }

  function pickAppleMusic(activities) {
    return activities.find(isAppleMusic) || null;
  }

  function formatActivityState(state) {
    if (!state) return "";
    const byRegex = /by\s*(?:\(.*\)|[^)]+)/;
    return byRegex.test(state) ? state.replace(/by\s+/, "") : state;
  }

  function handleError(e) {
    console.error("Error:", e);
    if (els.error) els.error.textContent = `An error occurred: ${e?.message || e}`;
    show(els.spinner, false);
    show(els.content, false);
    show(els.error, true);
  }

  function initAccessibility() {
    document.querySelectorAll(".statusWrapper").forEach((el) => {
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
    });

    if (els.activityLogoLarge) els.activityLogoLarge.setAttribute("alt", "Discord activity icon");
    if (els.amActivityLogoLarge) els.amActivityLogoLarge.setAttribute("alt", "Album art");
    // The progressbar role lives on the track in the markup, not on the fill -
    // the fill's width is the value, so it can't also be the element that
    // carries aria-valuemin/max.
  }

  function tick(ts) {
    if (ts - lastTick > 100) {
      lastTick = ts;
      const music = pickAppleMusic(discordDataLatest?.activities || []);
      if (music) {
        updateProgressBar(music.timestamps);
        updateActivityTime(music.timestamps, "am");
      }
      const otherTimed = (discordDataLatest?.activities || []).find((a) => a !== music && a?.timestamps);
      if (otherTimed) {
        updateActivityTime(otherTimed.timestamps);
        updateProgressBar(otherTimed.timestamps, "");
      }
    }
    rafId = window.requestAnimationFrame(tick);
  }

  function startUiTicker() {
    if (!rafId) rafId = window.requestAnimationFrame(tick);
  }
  function stopUiTicker() {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* The ticker exists to advance timers and the progress bar. With nothing
     playing there is nothing to advance, so leaving it running just woke the
     main thread every frame for no visible change - which on a laptop is real
     battery for an idle page. Run it only while something is actually timed. */
  function hasTimedActivity() {
    return (discordDataLatest?.activities || []).some(
      (a) => a?.timestamps?.start || a?.timestamps?.end
    );
  }

  function syncTicker() {
    if (autoUpdate && hasTimedActivity()) startUiTicker();
    else stopUiTicker();
  }

  function fetchJsonp(url, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const cb = "jsonp_" + Math.random().toString(36).slice(2);
      let timer;

      window[cb] = (data) => {
        cleanup();
        resolve(data);
      };

      const script = document.createElement("script");
      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP failed: " + url));
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error("JSONP timeout: " + url));
      }, timeoutMs);

      function cleanup() {
        try { delete window[cb]; } catch { }
        if (script.parentNode) script.parentNode.removeChild(script);
        if (timer) clearTimeout(timer);
      }

      document.head.appendChild(script);
    });
  }

  // Apple Music link resolution 
  function getStorefront() {
    return (navigator.languages?.[0] || navigator.language || "us").slice(-2).toLowerCase();
  }

  async function refreshAppleMusicLink(title, artist, album, artworkURL) {
    const badge = els.appleLink;
    if (!badge || !title || !artist) return;

    const storefront = getStorefront();
    const country = storefront.toUpperCase();

    const norm = (s) =>
      String(s)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const titleN = norm(title);
    const artistsN = norm(artist)
      .split(/,|&|feat\.?|featuring|with/)
      .map((a) => a.trim())
      .filter(Boolean);

    let href = "";

    // 1) Artwork carries Apple numeric id
    const idMatch = artworkURL?.match(/\/(\d{8,})\.jpg/);
    if (idMatch) {
      try {
        const { results } = await fetchJsonp(`https://itunes.apple.com/lookup?id=${idMatch[1]}&country=${country}&entity=song`);
        for (const r of results || []) {
          if (r.wrapperType !== "track") continue;
          if (norm(r.trackName) !== titleN) continue;
          const artistN = norm(r.artistName);
          if (artistsN.every((a) => artistN.includes(a))) { href = r.trackViewUrl; break; }
        }
        if (!href && results?.[0]?.trackViewUrl) href = results[0].trackViewUrl;
      } catch (e) { warn("Apple ID lookup failed", e); }
    }

    // 2) Text search by title, then by album if needed
    if (!href) {
      try {
        const api = `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=song&attribute=songTerm&limit=25&country=${country}`;
        const { results } = await fetchJsonp(api);
        for (const r of results || []) {
          if (norm(r.trackName) !== titleN) continue;
          const artistN = norm(r.artistName);
          if (artistsN.every((a) => artistN.includes(a))) { href = r.trackViewUrl; break; }
        }

        if (!href && album) {
          const api2 = `https://itunes.apple.com/search?term=${encodeURIComponent(album)}&entity=album&attribute=albumTerm&limit=5&country=${country}`;
          const { results: albums } = await fetchJsonp(api2);
          for (const alb of albums || []) {
            const artistN = norm(alb.artistName);
            if (!artistsN.every((a) => artistN.includes(a))) continue;
            const { results: tracks } = await fetchJsonp(`https://itunes.apple.com/lookup?id=${alb.collectionId}&entity=song&country=${country}`);
            const track = (tracks || []).find((t) => t.wrapperType === "track" && norm(t.trackName) === titleN);
            if (track) { href = track.trackViewUrl; break; }
          }
        }
      } catch (e) { warn("Apple search failed", e); }
    }

    // 3) Final storefront-aware search link
    if (!href) {
      const query = [title, artist, album].filter(Boolean).join(" ").replace(/\+/g, " ").replace(/\s+/g, " ").trim().split(" ").map(encodeURIComponent).join("%20");
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const base = isIOS ? "https://music.apple.com/search" : `https://music.apple.com/${storefront}/search`;
      href = `${base}?term=${query}`;
    }

    // 4) Ensure storefront part exists
    if (href.startsWith("https://music.apple.com/")) {
      href = href.replace(/music\.apple\.com\/[a-z]{2}\//, `music.apple.com/${storefront}/`);
    }

    if (href && href !== lastAppleHref) {
      badge.href = href;
      lastAppleHref = href;
    }
  }

  function isElementInDom(el) {
    return !!(el && el.ownerDocument && el.ownerDocument.contains(el));
  }

  function startSpinner() { show(els.spinner, true); }
  function stopSpinner() { show(els.spinner, false); }

  // Public-ish hooks if needed later 
  window.__lanyardRefined = {
    reconnectNow() { reconnectAttempts = 0; connect(); },
    destroy,
    isElementInDom,
    startSpinner,
    stopSpinner,
  };
})();
