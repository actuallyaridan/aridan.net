// aridan.net
// lanyard.js v2
// 2025-09-14

(() => {
  "use strict";

  // Config 
  const USER_ID = "701403809129168978";
  const LANYARD_WS = "wss://api.lanyard.rest/socket";
  const HIGH_RES = 512;
  const APPLE_APP_ID = "773825528921849856"; // Lanyard's Apple Music application id

  // Internal state 
  let socket;
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

  // latest payload from Lanyard
  let discordDataLatest;

  // DOM cache 
  const els = {
    loading: byId("loading"),
    error: byId("errorMessage"),
    spinner: byId("loadingSpinner"),
    content: byId("loadedLanyard"),
    lanyardDiscord: byId("lanyardDiscord"),
    amLanyardDiscord: byId("amLanyardDiscord"),

    // generic activity
    activityLogoLarge: byId("activityLogoLarge"),
    activityName: byId("activityName"),
    activityDetails: byId("activityDetails"),
    activityState: byId("activityState"),

    // Apple Music
    amActivityLogoLarge: byId("amActivityLogoLarge"),
    amActivityName: byId("amActivityName"),
    amActivityState: byId("amActivityState"),
    amActivityDetails: byId("amActivityDetails"),
    amActivityTime: byId("amActivityTime"),
    amRemaining: byId("amRemaining"),
    amElapsed: byId("amElapsed"),

    // progress bar
    amProgressBar: byId("amProgressBar"),

    // external badge
    appleLink: byId("apple-link"),
  };

  ["amLanyardDiscord", "discordActivity"].forEach((id) =>
    byId(id)?.classList.add("activity")
  );

  // Bootstrap 
  if (document.querySelector(".discordWrapper")) {
    initAccessibility();
    connect();
    startUiTicker();
    window.addEventListener("beforeunload", destroy, { once: true });
    document.addEventListener("visibilitychange", onPageVisibilityChange);
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
    warn("Lost connection to Lanyard. Reconnecting.");
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    // exponential backoff with cap and jitter
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
    try {
      socket?.close();
    } catch { }
    socket = null;
  }

  function destroy() {
    destroyed = true;
    cleanupSocket();
    stopUiTicker();
    document.removeEventListener("visibilitychange", onPageVisibilityChange);
  }

  function onPageVisibilityChange() {
    // pause heartbeats when tab is hidden on some browsers that throttle timers
    if (document.hidden) {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    } else if (socket?.readyState === WebSocket.OPEN) {
      // resume immediately
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
    else show(els.amLanyardDiscord, false);

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
    setText(els.activityDetails, a.details || "No details available");
    setText(els.activityState, a.state || "");

    updateActivityTime(a.timestamps);
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

    // build a stable key to reduce API churn
    const trackKey = [a.details, a.state, a.assets?.large_text, a.assets?.large_image].join("|");
    if (trackKey !== lastTrackKey) {
      lastTrackKey = trackKey;
      refreshAppleMusicLink(a.details, a.state, a.assets?.large_text, a.assets?.large_image);
    }
  }

  function updateProgressBar(timestamps) {
    const bar = els.amProgressBar;
    if (!bar) return;

    if (!timestamps?.start || !timestamps?.end) {
      bar.style.width = "0%";
      bar.setAttribute("aria-valuenow", "0");
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
    bar.setAttribute("aria-valuenow", String(Math.round(pct)));
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
        // keep optional -NN and original extension, preserve any query string
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

  // Helpers 
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

  // Accessibility 
  function initAccessibility() {
    document.querySelectorAll(".statusWrapper").forEach((el) => {
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
    });

    if (els.activityLogoLarge) els.activityLogoLarge.setAttribute("alt", "Discord activity icon");
    if (els.amActivityLogoLarge) els.amActivityLogoLarge.setAttribute("alt", "Album art");

    if (els.amProgressBar) {
      els.amProgressBar.setAttribute("role", "progressbar");
      els.amProgressBar.setAttribute("aria-valuemin", "0");
      els.amProgressBar.setAttribute("aria-valuemax", "100");
      els.amProgressBar.setAttribute("aria-valuenow", "0");
    }
  }

  // UI ticker (smooth time/progress without new payloads) 
  function tick(ts) {
    // throttle to 10 fps, enough for smooth progress bars without cost
    if (ts - lastTick > 100) {
      lastTick = ts;
      const music = pickAppleMusic(discordDataLatest?.activities || []);
      if (music) {
        updateProgressBar(music.timestamps);
        updateActivityTime(music.timestamps, "am");
      }
      const otherTimed = (discordDataLatest?.activities || []).find((a) => a !== music && a?.timestamps);
      if (otherTimed) updateActivityTime(otherTimed.timestamps);
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

  // JSONP helpers for Apple APIs 
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

  // Small utilities 
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
