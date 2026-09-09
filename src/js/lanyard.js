(() => {
  "use strict";

  const USER_ID = "701403809129168978";
  const LANYARD_WS = "wss://api.lanyard.rest/socket";
  const HIGH_RES = 512;
  const UPGRADE_RES = 1024;
  const APPLE_APP_ID = "773825528921849856";
  const SWEDEN_TZ = "Europe/Stockholm";
  const LOADER_MS = 500;

  let socket;
  let autoUpdate = true;
  let awaitingSnapshot = false;
  let refreshTimer = null;
  let rafId = 0;
  let lastTick = 0;
  let heartbeatTimer;
  let reconnectTimer;
  let reconnectAttempts = 0;
  let lastStatus;
  let clockTimer = null;
  let loaderTimer = null;
  let upgradeArt = true;
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
    amGeniusLink: byId("amGeniusLink"),

    refresh: byId("lanyardRefresh"),

    strip: byId("discord"),
    scrollPrev: byId("discordScrollPrev"),
    scrollNext: byId("discordScrollNext"),
  };

  ["amLanyardDiscord", "discordActivity"].forEach((id) =>
    byId(id)?.classList.add("activity")
  );

  if (document.querySelector(".discordWrapper")) {
    initAccessibility();
    autoUpdate = autoUpdateEnabled();
    upgradeArt = upgradeArtEnabled();
    applyUpdateMode({ initial: true });
    connect();
    window.addEventListener("beforeunload", destroy, { once: true });
    document.addEventListener("visibilitychange", onPageVisibilityChange);
    window.addEventListener("settings:change", onSettingsChange);
    els.refresh?.addEventListener("click", refreshNow);
    window.i18n?.onChange(() => {
      if (lastStatus === "offline") renderOfflineStatus();
    });
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

    if (overflowing) els.strip.setAttribute("tabindex", "0");
    else els.strip.removeAttribute("tabindex");
  }

  function autoUpdateEnabled() {
    return localStorage.getItem("autoUpdateActivity") !== "false";
  }

  function upgradeArtEnabled() {
    return localStorage.getItem("upgradeArtwork") !== "false";
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
    const key = e.detail?.key;

    if (key === "upgradeArtwork") {
      upgradeArt = !!e.detail.value;
      if (upgradeArt && discordDataLatest) {
        artState.delete(els.amActivityLogoLarge);
        artState.delete(els.activityLogoLarge);
        updateUi();
      }
      return;
    }

    if (key !== "autoUpdateActivity") return;
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
        case 1:
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          heartbeatTimer = setInterval(() => send({ op: 3 }), msg.d.heartbeat_interval);
          log(`Subscribed to ${USER_ID}`);
          break;
        case 0:
          discordDataLatest = msg.d || {};
          updateUi();
          flashLoading();
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
    stopClock();
    clearTimeout(loaderTimer);
    loaderTimer = null;
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
      // Empty but expanded, #loadedLanyard still contributes its 12px top margin
      // and nudges the page down, so it only opens once there is actually an
      // activity card inside it.
      showActivityCard(activities.length > 0);
      show(els.error, false);

      updateStripNav();
      syncTicker();
    } catch (e) {
      handleError(e);
    }
  }

  // #loadedLanyard animates open/closed, so it is toggled by class rather than
  // by display — display:none cannot transition.
  function showActivityCard(yes) {
    els.content?.classList.toggle("showActivity", !!yes);
  }

  function updateStatusWrapper(status) {
    if (status !== lastStatus) {
      lastStatus = status;
      document.querySelectorAll(".statusWrapper").forEach((el) => el.classList.add("hide"));
      byId(`statusWrapper${cap(status)}`)?.classList.remove("hide");
    }

    if (status === "offline") startClock();
    else stopClock();
  }

  // Discord "offline" also covers invisible mode, phone-only and Discord simply
  // being closed, so the line stays away from claims and just shows my clock.
  function swedishClock() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: SWEDEN_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());

    const part = (type) => parts.find((p) => p.type === type)?.value || "00";

    // Rebuilt as a UTC date purely to read the day index, so the weekday is
    // Sweden's rather than the visitor's.
    const day = new Date(
      Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day")))
    ).getUTCDay();

    return {
      hour: Number(part("hour")),
      time: `${part("hour")}:${part("minute")}`,
      weekday: day >= 1 && day <= 5,
    };
  }

  const HINT_ICONS = ["fa-bed", "fa-briefcase", "fa-clock", "fa-house"];

  function offlineHint(hour, weekday) {
    if (hour >= 23 || hour < 6) return { text: "in Sweden, probably asleep", icon: "fa-bed" };
    if (weekday && hour >= 8 && hour < 17) return { text: "in Sweden, probably at work", icon: "fa-briefcase" };
    if (hour < 18) return { text: "in Sweden, probably out", icon: "fa-clock" };
    return { text: "in Sweden, probably home", icon: "fa-house" };
  }

  function renderOfflineStatus() {
    const timeEl = byId("statusLocalTime");
    const hintEl = byId("statusOfflineHint");
    if (!timeEl || !hintEl) return;

    const { hour, time, weekday } = swedishClock();
    const hint = offlineHint(hour, weekday);

    timeEl.textContent = time;
    hintEl.textContent = window.i18n ? window.i18n.t(hint.text) : hint.text;

    const icon = byId("statusOfflineIcon");
    HINT_ICONS.forEach((name) => icon?.classList.toggle(name, name === hint.icon));
  }

  function startClock() {
    renderOfflineStatus();
    if (!clockTimer) clockTimer = setInterval(renderOfflineStatus, 30000);
  }

  function stopClock() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
  }

  const CARD_MS = 320;
  const CARD_EASE = "cubic-bezier(.2,.7,.3,1)";

  function cardVisible(el) {
    return !!el && getComputedStyle(el).display !== "none";
  }

  // The cards sit in a centred flex row, so revealing one also shoves its
  // neighbour sideways. FLIP: note where each card is, apply the change, then
  // animate from the old box — new cards fade up, existing ones slide across.
  function animateActivityChange(mutate) {
    const cards = [els.amLanyardDiscord, byId("discordActivity")].filter(Boolean);

    if (document.documentElement.classList.contains("reduce-motion")) {
      mutate();
      return;
    }

    const before = new Map();
    for (const card of cards) {
      if (cardVisible(card)) before.set(card, card.getBoundingClientRect());
    }

    mutate();

    for (const card of cards) {
      if (!cardVisible(card)) continue;

      const previous = before.get(card);
      if (!previous) {
        card.animate(
          [
            { opacity: 0, transform: "translateY(10px) scale(.97)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: CARD_MS, easing: CARD_EASE }
        );
        continue;
      }

      const now = card.getBoundingClientRect();
      const dx = previous.left - now.left;
      const dy = previous.top - now.top;

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        card.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
          { duration: CARD_MS, easing: CARD_EASE }
        );
      }
    }
  }

  function updateActivityInfo(activities, status) {
    show(els.lanyardDiscord, status === "online");

    // Nothing playing: the whole card collapses, and the collapse needs a height
    // to shrink from, so the last frame is left mounted rather than emptied out
    // first. #loadedLanyard's delayed visibility takes it out of the a11y tree
    // once the transition has finished.
    if (!activities.length) {
      window.dispatchEvent(new CustomEvent("lanyard:applemusic", { detail: null }));
      return;
    }

    let appleMusic = null;
    const others = [];

    for (const a of activities) {
      if (isAppleMusic(a)) appleMusic = a;
      else others.push(a);
    }

    animateActivityChange(() => {
      if (appleMusic) updateAppleMusicInfo(appleMusic);
      else {
        show(els.amLanyardDiscord, false);
        window.dispatchEvent(new CustomEvent("lanyard:applemusic", { detail: null }));
      }

      show(byId("discordActivity"), others.length > 0);
      updateActivityImages(others);
      updateActivityDetails(others);
    });
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
    updateGeniusLink(a.details, formatActivityState(a.state));

    window.dispatchEvent(new CustomEvent("lanyard:applemusic", { detail: a }));

    const trackKey = [a.details, a.state, a.assets?.large_text, a.assets?.large_image].join("|");
    if (trackKey !== lastTrackKey) {
      lastTrackKey = trackKey;
      refreshAppleMusicLink(a.details, a.state, a.assets?.large_text, a.assets?.large_image);
    }
  }

  // Genius slugs are the whole "artist song" string lowercased with everything
  // non-alphanumeric collapsed to hyphens, then only the first letter capitalised
  // — "Severina" + "Postelja Od Vina" -> "Severina-postelja-od-vina".
  function geniusSlug(text) {
    const cleaned = String(text || "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      // NFKD leaves these alone: they are distinct letters, not base + accent.
      .replace(/[đĐ]/g, "d")
      .replace(/[øØ]/g, "o")
      .replace(/[łŁ]/g, "l")
      .replace(/[ßẞ]/g, "ss")
      .replace(/['’`]/g, "")
      .replace(/&/g, " and ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
  }

  function geniusUrl(title, artist) {
    // Genius indexes under the primary artist, so features are dropped.
    const primary = String(artist || "").split(/,|&|feat\.?|featuring|with/i)[0];
    const slug = geniusSlug(`${primary} ${title}`);
    return slug ? `https://genius.com/${slug}-lyrics` : "";
  }

  function updateGeniusLink(title, artist) {
    const link = els.amGeniusLink;
    if (!link) return;

    const href = title && artist ? geniusUrl(title, artist) : "";
    link.classList.toggle("hide", !href);
    if (href) link.href = href;
  }

  function updateProgressBar(timestamps, prefix = "am") {
    const am = prefix === "am";
    const bar = am ? els.amProgressBar : els.progressBar;
    const track = am ? els.amProgressTrack : els.progressTrack;
    if (!bar) return;

    const timed = !!(timestamps?.start && timestamps?.end);

    if (!am) {
      track?.classList.toggle("hide", !timed);
      els.progressSeparator?.classList.toggle("hide", timed);
    }

    if (!timed) {
      setProgress(bar, track, 0);
      return;
    }

    const now = Date.now();
    const start = +new Date(timestamps.start);
    const end = +new Date(timestamps.end);

    let pct = 0;
    if (now <= start) pct = 0;
    else if (now >= end) pct = 100;
    else pct = ((now - start) / (end - start)) * 100;

    setProgress(bar, track, pct);
  }

  function setProgress(bar, track, pct) {
    bar.style.transform = `scaleX(${pct / 100})`;

    const rounded = String(Math.round(pct));
    if (track && track.getAttribute("aria-valuenow") !== rounded) {
      track.setAttribute("aria-valuenow", rounded);
    }
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

  function artworkSources(image, appId) {
    if (!image) return [];

    const EXTERNAL = "mp:external/";

    if (image.startsWith(EXTERNAL)) {
      const proxied = image.slice(EXTERNAL.length);
      const proxy = (size, extra = "") =>
        `https://media.discordapp.net/external/${proxied}` +
        `?width=${size}&height=${size}${extra}`;

      const parts = image.split(/\/https?\//);
      const direct = parts.length > 1 ? "https://" + parts[1] : "";

      const ladder = [{
        url: proxy(HIGH_RES),
        label: `standard definition album cover (${HIGH_RES}px)`
      }];

      if (/^https:\/\/[^/]*mzstatic\.com\//.test(direct)) {
        ladder.push({
          url: direct.replace(
            /\/(\d+)x\1bb(-\d+)?\.(jpg|png)(\?.*)?$/i,
            `/${UPGRADE_RES}x${UPGRADE_RES}bb$2.$3$4`
          ),
          label: `high definition album cover (${UPGRADE_RES}px)`
        });
      } else if (direct) {
        ladder.push({
          url: proxy(HIGH_RES, "&animated=true"),
          label: `animated standard definition album cover (${HIGH_RES}px)`
        });
        ladder.push({
          url: direct,
          label: "animated album cover at full resolution"
        });
      }

      return ladder;
    }

    return appId
      ? [{
        url: `https://cdn.discordapp.com/app-assets/${appId}/${image}.png?size=${HIGH_RES}`,
        label: `activity icon (${HIGH_RES}px)`
      }]
      : [];
  }

  const artState = new WeakMap();

  function updateImage(el, image, appId, details = "") {
    if (!el || !image) {
      if (el) el.style.display = "none";
      return;
    }

    const sources = artworkSources(image, appId);
    if (!sources.length) return;

    const state = artState.get(el) || { src: "", token: 0 };
    if (sources.some((rung) => rung.url === state.src)) return;

    state.token++;
    artState.set(el, state);

    el.alt = details || String(image);
    el.title = details || String(image);
    el.style.display = "block";

    climb(el, sources, 0, state.token, false);
  }

  function climb(el, sources, index, token, showing) {
    const rung = sources[index];
    if (!rung) return;

    if (showing && !upgradeArt) return;

    log(`Loading ${rung.label}`);

    preload(rung.url)
      .then(() => {
        const state = artState.get(el);
        if (!state || state.token !== token) return;
        el.src = rung.url;
        state.src = rung.url;
        climb(el, sources, index + 1, token, true);
      })
      .catch(() => {
        warn(`Could not load ${rung.label}`);
        climb(el, sources, index + 1, token, showing);
      });
  }

  function preload(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => reject(new Error("Artwork failed: " + url));
      img.src = url;
    });
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
      // el.querySelector(".smallLoader")?.classList.toggle("showSmallLoader", !!isLoading);
    });
  }

  // Applying an update is synchronous, so switching the spinner off in the same
  // task left it without a single frame to paint in — it could never be seen.
  // Hold it on long enough to register; back-to-back updates coalesce into one.
  function flashLoading() {
    clearTimeout(loaderTimer);
    toggleLoading(true);

    loaderTimer = setTimeout(() => {
      loaderTimer = null;
      toggleLoading(false);
    }, LOADER_MS);
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
    showActivityCard(false);
    show(els.error, true);
  }

  function initAccessibility() {
    document.querySelectorAll(".statusWrapper").forEach((el) => {
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
    });

    // The clock reruns every 30s; announcing it that often is noise, so this one
    // opts out of the implicit live region role="status" would otherwise give it.
    byId("statusWrapperOffline")?.setAttribute("aria-live", "off");

    if (els.activityLogoLarge) els.activityLogoLarge.setAttribute("alt", "Discord activity icon");
    if (els.amActivityLogoLarge) els.amActivityLogoLarge.setAttribute("alt", "Album art");
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

    if (!href) {
      const query = [title, artist, album].filter(Boolean).join(" ").replace(/\+/g, " ").replace(/\s+/g, " ").trim().split(" ").map(encodeURIComponent).join("%20");
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const base = isIOS ? "https://music.apple.com/search" : `https://music.apple.com/${storefront}/search`;
      href = `${base}?term=${query}`;
    }

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

  window.__lanyardRefined = {
    reconnectNow() { reconnectAttempts = 0; connect(); },
    destroy,
    isElementInDom,
    startSpinner,
    stopSpinner,
  };
})();
