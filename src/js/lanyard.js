/* The "what I'm doing right now" card on the home page. */
(() => {
  "use strict";

  if (!document.querySelector(".discordWrapper")) return;

  const HIGH_RES = 512;
  const UPGRADE_RES = 1024;
  const SWEDEN_TZ = "Europe/Stockholm";
  const LOADER_MS = 500;
  const REFRESH_TIMEOUT_MS = 10000;

  const CARD_MS = 320;
  const CARD_EASE = "cubic-bezier(.2,.7,.3,1)";

  function byId(id) {
    if (!id) return null;
    return document.getElementById(id);
  }

  const els = {
    loading: byId("loading"),
    error: byId("errorMessage"),
    errorText: byId("errorMessageText"),
    content: byId("loadedLanyard"),
    lanyardDiscord: byId("lanyardDiscord"),

    amCard: byId("amLanyardDiscord"),
    otherCard: byId("discordActivity"),

    activityLogoLarge: byId("activityLogoLarge"),
    activityName: byId("activityName"),
    activityDetails: byId("activityDetails"),
    activityState: byId("activityState"),

    amActivityLogoLarge: byId("amActivityLogoLarge"),
    amActivityName: byId("amActivityName"),
    amActivityState: byId("amActivityState"),
    amActivityDetails: byId("amActivityDetails"),

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

  let presence = null;
  let rafId = 0;
  let lastTick = 0;
  let lastStatus;
  let clockTimer = null;
  let loaderTimer = null;
  let refreshTimer = null;
  let upgradeArt = prefEnabled("upgradeArtwork");
  let lastTrackKey = "";
  let lastAppleHref = "";
  let lastAppleTrack = null;

  function log(...parts) {
    console.log("[Activity]", ...parts);
  }

  function warn(...parts) {
    console.warn("[Activity]", ...parts);
  }

  for (const card of [els.amCard, els.otherCard]) {
    if (card) card.classList.add("activity");
  }

  initAccessibility();
  initStripNav();
  syncRefreshButton();

  window.Lanyard.subscribe((data) => {
    presence = data;
    setRefreshBusy(false);
    updateUi();
    flashLoading();
  });

  window.addEventListener("settings:change", onSettingsChange);
  els.refresh?.addEventListener("click", onRefreshClick);
  window.i18n?.onChange(() => {
    if (lastStatus === "offline") renderOfflineStatus();

    applyAppleHref();

    if (lastAppleTrack) {
      refreshAppleMusicLink(
        lastAppleTrack.title,
        lastAppleTrack.artist,
        lastAppleTrack.album,
        lastAppleTrack.artworkURL
      );
    }
  });

  function onSettingsChange(e) {
    const { key, value } = e.detail || {};

    if (key === "upgradeArtwork") {
      upgradeArt = !!value;
      if (upgradeArt && presence) {
        artState.delete(els.amActivityLogoLarge);
        artState.delete(els.activityLogoLarge);
        updateUi();
      }
      return;
    }

    if (key !== "autoUpdateActivity") return;
    syncRefreshButton();
    syncTicker();
  }

  function syncRefreshButton() {
    els.refresh?.classList.toggle("hide", window.Lanyard.autoUpdate);
  }

  function onRefreshClick() {
    if (window.Lanyard.autoUpdate) return;
    setRefreshBusy(true);
    window.Lanyard.refresh();
    refreshTimer = setTimeout(() => setRefreshBusy(false), REFRESH_TIMEOUT_MS);
  }

  function setRefreshBusy(busy) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
    if (!els.refresh) return;
    els.refresh.disabled = busy;
    els.refresh.setAttribute("aria-busy", busy ? "true" : "false");
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

  function scrollByActivity(direction) {
    const stripLeft = els.strip.getBoundingClientRect().left;

    const stops = [];

    for (const card of els.strip.children) {
      if (!isVisible(card)) continue;

      const offset = card.getBoundingClientRect().left - stripLeft;
      const margin = parseFloat(getComputedStyle(card).marginLeft) || 0;
      const stop = els.strip.scrollLeft + offset - margin;

      stops.push(Math.max(0, Math.round(stop)));
    }

    // The 1px slack absorbs sub-pixel scroll positions, which would otherwise
    // make the current stop look like the "next" one and go nowhere.
    const here = els.strip.scrollLeft;
    let target;

    if (direction > 0) {
      target = stops.find((stop) => stop > here + 1);
      if (target === undefined) target = els.strip.scrollWidth;
    } else {
      const backwards = [...stops].reverse();
      target = backwards.find((stop) => stop < here - 1);
      if (target === undefined) target = 0;
    }

    let behavior = "smooth";
    if (reduceMotion()) behavior = "auto";

    els.strip.scrollTo({ left: target, behavior: behavior });
  }

  function updateStripNav() {
    if (!els.strip) return;

    const max = els.strip.scrollWidth - els.strip.clientWidth;
    const overflowing = max > 1;
    const here = els.strip.scrollLeft;

    const atStart = here <= 1;
    const atEnd = here >= max - 1;

    els.scrollPrev?.classList.toggle("hide", !overflowing || atStart);
    els.scrollNext?.classList.toggle("hide", !overflowing || atEnd);

    // Only focusable when there is something to scroll, so keyboard users are
    // not sent through a dead stop.
    if (overflowing) {
      els.strip.setAttribute("tabindex", "0");
    } else {
      els.strip.removeAttribute("tabindex");
    }
  }

  function updateUi() {
    try {
      const activities = presence?.activities || [];
      const status = presence?.discord_status || "";

      updateStatusWrapper(status);
      updateActivityInfo(activities, status);

      const music = window.Lanyard.appleMusic(presence);
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
  // by display, display:none cannot transition.
  function showActivityCard(yes) {
    els.content?.classList.toggle("showActivity", !!yes);
  }

  function updateActivityInfo(activities, status) {
    show(els.lanyardDiscord, status === "online");

    // Nothing playing: the whole card collapses, and the collapse needs a height
    // to shrink from, so the last frame is left mounted rather than emptied out
    // first. #loadedLanyard's delayed visibility takes it out of the a11y tree
    // once the transition has finished.
    if (!activities.length) return;

    const appleMusic = window.Lanyard.appleMusic(presence);
    const others = activities.filter((a) => !window.Lanyard.isAppleMusic(a));

    animateActivityChange(() => {
      if (appleMusic) {
        updateAppleMusicInfo(appleMusic);
      } else {
        show(els.amCard, false);
      }

      show(els.otherCard, others.length > 0);
      updateActivityImages(others);
      updateActivityDetails(others);
    });
  }

  // The cards sit in a centred flex row, so revealing one also shoves its
  // neighbour sideways. FLIP: note where each card is, apply the change, then
  // animate from the old box, new cards fade up, existing ones slide across.
  function animateActivityChange(mutate) {
    if (reduceMotion()) {
      mutate();
      return;
    }

    const cards = [els.amCard, els.otherCard].filter(Boolean);
    const before = new Map();
    for (const card of cards) {
      if (isVisible(card)) before.set(card, card.getBoundingClientRect());
    }

    mutate();

    for (const card of cards) {
      if (!isVisible(card)) continue;

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

  function updateActivityImages(activities) {
    const first = activities.find((a) => a.assets?.large_image);
    show(els.activityLogoLarge, !!first);
    if (first) {
      updateImage(els.activityLogoLarge, first, first.assets.large_text);
    }
  }

  function updateActivityDetails(activities) {
    if (!activities.length) {
      show(els.activityName, false);
      show(els.activityDetails, false);
      show(els.activityState, false);
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
    show(els.amCard, true);

    updateImage(els.amActivityLogoLarge, a, a.assets?.large_text);

    setText(els.amActivityName, a.name);
    setText(els.amActivityState, artistOf(a.state));
    setText(els.amActivityDetails, a.details);

    updateActivityTime(a.timestamps, "am");
    updateProgressBar(a.timestamps);

    // The Apple Music lookup costs a few network round trips, so it only runs
    // when the track itself has actually changed, not on every presence update.
    const parts = [a.details, a.state, a.assets?.large_text, a.assets?.large_image];
    const trackKey = parts.join("|");

    if (trackKey !== lastTrackKey) {
      lastTrackKey = trackKey;
      refreshAppleMusicLink(a.details, a.state, a.assets?.large_text, a.assets?.large_image);
    }
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

    function part(type) {
      const found = parts.find((p) => p.type === type);
      return found?.value || "00";
    }

    // Rebuilt as a UTC date purely to read the day index, so the weekday is
    // Sweden's rather than the visitor's.
    const day = new Date(
      Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day")))
    ).getUTCDay();

    return {
      hour: Number(part("hour")),
      time: part("hour") + ":" + part("minute"),
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

    if (window.i18n) {
      hintEl.textContent = window.i18n.t(hint.text);
    } else {
      hintEl.textContent = hint.text;
    }

    const icon = byId("statusOfflineIcon");
    if (icon) {
      for (const name of HINT_ICONS) {
        icon.classList.toggle(name, name === hint.icon);
      }
    }
  }

  function startClock() {
    renderOfflineStatus();
    if (!clockTimer) clockTimer = setInterval(renderOfflineStatus, 30000);
  }

  function stopClock() {
    clearInterval(clockTimer);
    clockTimer = null;
  }

  function updateProgressBar(timestamps, prefix = "am") {
    const am = prefix === "am";
    const bar = am ? els.amProgressBar : els.progressBar;
    const track = am ? els.amProgressTrack : els.progressTrack;
    if (!bar) return;

    const start = +new Date(timestamps?.start || 0);
    const end = +new Date(timestamps?.end || 0);
    // A zero-length window would divide by zero.
    const timed = start > 0 && end > start;

    if (!am) {
      track?.classList.toggle("hide", !timed);
      els.progressSeparator?.classList.toggle("hide", timed);
    }

    let pct = 0;
    if (timed) {
      const through = (Date.now() - start) / (end - start);
      pct = clamp(through * 100, 0, 100);
    }

    // scaleX rather than width: a transform animates without redoing layout.
    bar.style.transform = "scaleX(" + (pct / 100) + ")";

    const rounded = String(Math.round(pct));
    if (track && track.getAttribute("aria-valuenow") !== rounded) {
      track.setAttribute("aria-valuenow", rounded);
    }
  }

  function updateActivityTime(timestamps, prefix = "") {
    const now = Date.now();

    let seconds = null;

    if (timestamps?.end) {
      seconds = (new Date(timestamps.end).getTime() - now) / 1000;
    } else if (timestamps?.start) {
      seconds = (now - new Date(timestamps.start).getTime()) / 1000;
    }

    let text = "-:-";
    if (seconds !== null) text = clock(seconds);

    setText(byId(prefix + "ActivityTime"), text);

    const countingDown = !!timestamps?.end;
    byId(prefix + "Remaining")?.classList.toggle("hide", !countingDown);
    byId(prefix + "Elapsed")?.classList.toggle("hide", countingDown);
  }

  function clock(seconds) {
    const total = Math.max(0, Math.floor(seconds));

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    const parts = [];
    if (hours > 0) parts.push(hours);
    parts.push(minutes);
    parts.push(secs);

    const padded = parts.map((n) => String(n).padStart(2, "0"));
    return padded.join(":");
  }

  // Best-looking version last: each rung is fetched behind the one on screen.
  function artworkLadder(activity) {
    const art = window.Lanyard.artwork(activity);
    if (!art) return [];

    if (art.appAsset) {
      return [{
        url: art.appAsset(HIGH_RES),
        label: "activity icon (" + HIGH_RES + "px)",
      }];
    }

    const ladder = [{
      url: art.proxy(HIGH_RES),
      label: "standard definition album cover (" + HIGH_RES + "px)",
    }];

    if (art.mzstatic) {
      ladder.push({
        url: art.mzstatic(UPGRADE_RES),
        label: "high definition album cover (" + UPGRADE_RES + "px)",
      });
    } else if (art.direct) {
      ladder.push({
        url: art.proxy(HIGH_RES, "&animated=true"),
        label: "animated standard definition album cover (" + HIGH_RES + "px)",
      });
      ladder.push({
        url: art.direct,
        label: "animated album cover at full resolution",
      });
    }

    return ladder;
  }

  const artState = new WeakMap();

  function updateImage(el, activity, alt) {
    if (!el) return;

    const ladder = artworkLadder(activity);
    if (!ladder.length) {
      el.style.display = "none";
      return;
    }

    const state = artState.get(el) || { src: "", token: 0 };

    // Already showing one of the rungs for this same cover, so leave it be.
    // Without this, every presence update would restart the whole climb.
    const alreadyShowing = ladder.some((rung) => rung.url === state.src);
    if (alreadyShowing) return;

    // Bumping the token makes any climb still in flight abandon itself.
    state.token++;
    artState.set(el, state);

    const label = alt || activity.assets?.large_image || "";
    el.alt = label;
    el.title = label;
    el.style.display = "block";

    climb(el, ladder, 0, state.token, false);
  }

  // Each rung is loaded out of sight and only swapped in once ready, so the
  // cover never blinks. `showing` is whether anything is on screen yet.
  function climb(el, ladder, index, token, showing) {
    const rung = ladder[index];
    if (!rung) return;
    if (showing && !upgradeArt) return;

    log("Loading " + rung.label);

    preload(rung.url).then(() => {
      const state = artState.get(el);

      if (!state) return;
      if (state.token !== token) return;

      el.src = rung.url;
      state.src = rung.url;

      climb(el, ladder, index + 1, token, true);
    }).catch(() => {
      warn("Could not load " + rung.label);

      climb(el, ladder, index + 1, token, showing);
    });
  }

  function preload(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(url);
      img.onerror = () => reject(new Error("Artwork failed: " + url));

      // Setting src last is deliberate: a cached image can fire onload the
      // instant this line runs, so the handlers have to already be attached.
      img.src = url;
    });
  }

  // itunes.apple.com has no CORS headers, so its JSONP mode is the only way to
  // read it from a page.
  function fetchJsonp(url, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const cb = "jsonp_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("JSONP timeout: " + url));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        script.remove();
      }

      // The server wraps its JSON in a call to the name we pass, so the
      // downloaded script runs this function.
      window[cb] = (data) => {
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP failed: " + url));
      };

      let separator = "?";
      if (url.includes("?")) separator = "&";
      script.src = url + separator + "callback=" + cb;

      document.head.appendChild(script);
    });
  }

  function itunes(path, params) {
    const query = new URLSearchParams(params);
    const url = "https://itunes.apple.com/" + path + "?" + query;

    return fetchJsonp(url).then((response) => {
      return response?.results || [];
    });
  }

  // Intl.Locale rather than the last two characters of the tag: a bare "sv"
  // would read as "SV", which Apple accepts as El Salvador. maximize() fills in
  // the likely region when the tag has none: sv -> SE, da -> DK, bs -> BA.
  function browserStorefront() {
    let tags = navigator.languages;
    if (!tags || !tags.length) tags = [navigator.language];

    for (const tag of tags) {
      if (!tag) continue;

      try {
        const region = new Intl.Locale(tag).maximize().region;
        if (region) return region.toLowerCase();
      } catch {
        }
    }

    return "us";
  }

  const LANGUAGE_STOREFRONTS = { en: "us", sv: "se", hr: "hr", bs: "ba" };

  // Asked for with ?l= on the link. Apple has no Bosnian interface, and
  // Bosnia's storefront serves Croatian, so bs maps there deliberately.
  const APPLE_UI_LANGUAGES = { en: "en", sv: "sv", hr: "hr", bs: "hr" };

  // Plain "en": every storefront answers it with its own English variant.
  const DEFAULT_APPLE_UI_LANGUAGE = "en";

  // The non-English interfaces each storefront offers; English is universal.
  const STOREFRONT_LANGUAGES = { se: ["sv"], hr: ["hr"], ba: ["hr"], us: [] };

  // Asking a store for a language it lacks does not fail - Apple quietly serves
  // that store's default, so a Croatian reader would land in Swedish. Ask for
  // English instead.
  function appleUiLanguage(store) {
    const siteLang = window.i18n?.lang || localStorage.getItem("lang") || "en";
    const wanted = APPLE_UI_LANGUAGES[siteLang] || DEFAULT_APPLE_UI_LANGUAGE;

    if (wanted === DEFAULT_APPLE_UI_LANGUAGE) return DEFAULT_APPLE_UI_LANGUAGE;

    const offered = STOREFRONT_LANGUAGES[store] || [];
    if (offered.includes(wanted)) return wanted;

    return DEFAULT_APPLE_UI_LANGUAGE;
  }

  // The two-letter country code in an Apple Music path.
  const STOREFRONT_IN_PATH = /music\.apple\.com\/([a-z]{2})\//;

  // The iOS search URL carries no country at all, which falls through to English.
  function storefrontOf(url) {
    const found = url.match(STOREFRONT_IN_PATH);
    if (!found) return "";
    return found[1];
  }

  // Apple's catalogue is per country: a Croatian release is absent from the US store.
  const FALLBACK_STOREFRONTS = ["se", "us", "hr", "ba"];

  // Worth linking to, but not worth asking: iTunes' search endpoint returns
  // nothing at all for Croatia, and a UPC lookup there lists the album without
  // its tracks. preferredStore() moves a track here afterwards instead.
  const UNSEARCHABLE_STOREFRONTS = ["hr"];

  // Best guess first: the chosen language, the browser locale, then the rest.
  function storefrontCascade() {
    const stores = [];

    function add(code) {
      if (!code) return;
      const lower = code.toLowerCase();
      if (!stores.includes(lower)) stores.push(lower);
    }

    add(LANGUAGE_STOREFRONTS[localStorage.getItem("lang")]);
    add(browserStorefront());
    for (const code of FALLBACK_STOREFRONTS) add(code);

    return stores;
  }

  function normalizeTitle(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Lanyard sends every credited artist in one string. iTunes may list a
  // different subset, so a result counts as a match when it names all of them.
  function splitArtists(value) {
    return String(value || "")
      .trim()
      .replace(/^by\s+/i, "")
      .split(/,|&|feat\.?|featuring|with/i)
      .map((a) => a.trim())
      .filter(Boolean);
  }

  // Anchored: an artist can have "by" inside their name - "Bobby Womack" - and
  // only a leading one is Cider's prefix. Mirrored by artistOf() in lyrics.js.
  function artistOf(state) {
    return String(state || "").trim().replace(/^by\s+/i, "");
  }

  function pickTrack(results, titleN, artistsN) {
    return results.find((r) => {
      if (r.wrapperType && r.wrapperType !== "track") return false;
      if (normalizeTitle(r.trackName) !== titleN) return false;

      const artist = normalizeTitle(r.artistName);
      return artistsN.every((one) => artist.includes(one));
    });
  }

  // Tries the UPC from the artwork, then an exact title search, against each
  // storefront in turn. Whatever comes back already carries the right country
  // in its path, so it is used as given.
  async function refreshAppleMusicLink(title, artist, album, artworkURL) {
    const badge = els.appleLink;
    if (!badge || !title || !artist) return;

    lastAppleTrack = { title, artist, album, artworkURL };

    const stores = storefrontCascade();

    // Where the link should end up, not necessarily anywhere we can usefully ask.
    const home = stores[0];

    const searchable = stores.filter((s) => !UNSEARCHABLE_STOREFRONTS.includes(s));

    const titleN = normalizeTitle(title);
    const artistsN = splitArtists(artist).map(normalizeTitle);

    let href = "";

    try {
      for (const store of searchable) {
        const country = store.toUpperCase();

        href = await lookupById(artworkURL, country, titleN, artistsN);
        if (href) break;

        href = await lookupBySong(title, country, titleN, artistsN);
        if (href) break;
      }

      // The expensive route, once, in the first store that can answer.
      if (!href && searchable.length) {
        href = await lookupByAlbum(album, searchable[0].toUpperCase(), titleN, artistsN);
      }

      if (href) href = preferredStore(href, stores);
    } catch (e) {
      warn("Apple Music lookup failed", e);
    }

    if (!href) href = searchPageUrl(title, artist, album, home);

    lastAppleHref = href;
    applyAppleHref();
  }

  // Kept apart from the lookup so a language switch only rewrites the query
  // string. lastAppleHref therefore holds the link WITHOUT the ?l= on it.
  function applyAppleHref() {
    const badge = els.appleLink;
    if (!badge || !lastAppleHref) return;

    const language = appleUiLanguage(storefrontOf(lastAppleHref));

    let separator = "?";
    if (lastAppleHref.includes("?")) separator = "&";

    badge.href = lastAppleHref + separator + "l=" + language;
  }

  // Apple's ids are global and the slug in the path is decorative, so re-homing
  // a link is only a matter of swapping the two-letter country code. This is
  // also the only way a track ever reaches the Croatian store.
  function preferredStore(foundUrl, stores) {
    const home = stores[0];
    if (!home) return foundUrl;

    return foundUrl.replace(STOREFRONT_IN_PATH, "music.apple.com/" + home + "/");
  }

  function searchPageUrl(title, artist, album, store) {
    const words = [title, artist, album].filter(Boolean).join(" ");
    const term = words.replace(/[+\s]+/g, " ").trim();

    // iOS resolves the storefront from the signed-in account, and a path with
    // one in it sends the app to the wrong country's catalogue.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    let base = "https://music.apple.com/" + store + "/search";
    if (isIOS) base = "https://music.apple.com/search";

    return base + "?term=" + encodeURIComponent(term);
  }

  /* Two shapes of artwork URL, needing different lookup parameters - passing a
   * UPC as id= returns nothing:
   *
   *   .../<uuid>/00843930036974.rgb.jpg/1024x1024bb.jpg   -> upc=
   *   .../v4/1444032175/600x600bb.jpg                      -> id=
   *
   * Cider's own host and covers named cover.jpg carry neither, so those skip
   * the lookup and fall through to the search route.
   */
  const UPC_IN_ARTWORK_URL = /\/(\d{8,})(?:\.[a-z]+)?\.jpg/i;
  const ID_IN_ARTWORK_URL = /\/v\d+\/(\d{8,})\//;

  function releaseLookup(artworkURL) {
    if (!artworkURL) return null;

    const upc = artworkURL.match(UPC_IN_ARTWORK_URL);
    if (upc) return { upc: upc[1] };

    const id = artworkURL.match(ID_IN_ARTWORK_URL);
    if (id) return { id: id[1] };

    return null;
  }

  async function lookupById(artworkURL, country, titleN, artistsN) {
    const params = releaseLookup(artworkURL);
    if (!params) return "";

    params.country = country;
    params.entity = "song";

    const results = await itunes("lookup", params);

    // Only an exact title match counts: an album lookup returns every track on
    // it, and a confidently wrong badge is worse than dropping to a search.
    const match = pickTrack(results, titleN, artistsN);
    if (match) return match.trackViewUrl;

    return "";
  }

  async function lookupBySong(title, country, titleN, artistsN) {
    const songs = await itunes("search", {
      term: title,
      entity: "song",
      attribute: "songTerm",
      limit: 25,
      country: country,
    });

    const match = pickTrack(songs, titleN, artistsN);
    if (match) return match.trackViewUrl;

    return "";
  }

  // Up to six requests, so this runs once rather than once per storefront.
  async function lookupByAlbum(album, country, titleN, artistsN) {
    if (!album) return "";

    const albums = await itunes("search", {
      term: album,
      entity: "album",
      attribute: "albumTerm",
      limit: 5,
      country: country,
    });

    for (const found of albums) {
      const artist = normalizeTitle(found.artistName);

      const sameArtist = artistsN.every((one) => artist.includes(one));
      if (!sameArtist) continue;

      const tracks = await itunes("lookup", {
        id: found.collectionId,
        entity: "song",
        country: country,
      });

      const track = pickTrack(tracks, titleN, artistsN);
      if (track) return track.trackViewUrl;
    }

    return "";
  }

  function tick(ts) {
    if (ts - lastTick > 100) {
      lastTick = ts;

      const activities = presence?.activities || [];
      const music = window.Lanyard.appleMusic(presence);

      if (music) {
        updateProgressBar(music.timestamps);
        updateActivityTime(music.timestamps, "am");
      }

      const other = activities.find((a) => a !== music && a?.timestamps);
      if (other) {
        updateActivityTime(other.timestamps);
        updateProgressBar(other.timestamps, "");
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  // No point burning a frame callback when nothing on screen is counting.
  function syncTicker() {
    const activities = presence?.activities || [];
    const anythingTimed = activities.some((a) => {
      return a?.timestamps?.start || a?.timestamps?.end;
    });

    const wanted = window.Lanyard.autoUpdate && anythingTimed;

    if (wanted && !rafId) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    if (!wanted && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  // Applying an update is synchronous, so switching the spinner off in the same
  // task left it without a single frame to paint in, it could never be seen.
  // Hold it on long enough to register; back-to-back updates coalesce into one.
  function flashLoading() {
    clearTimeout(loaderTimer);
    setLoading(true);

    loaderTimer = setTimeout(() => {
      loaderTimer = null;
      setLoading(false);
    }, LOADER_MS);
  }

  function setLoading(isLoading) {
    for (const card of document.querySelectorAll(".activity")) {
      card.classList.toggle("loadingUpdating", isLoading);
    }
  }

  function handleError(e) {
    console.error("[Activity]", e);
    // Only the copy is replaced, writing to #errorMessage itself would blow
    // away the icon paragraph along with it.
    if (els.errorText) els.errorText.textContent = `An error occurred: ${e?.message || e}`;
    // "error" is not a Discord status, so it can never collide with a real one,
    // the next successful payload swaps the chip back on its own.
    updateStatusWrapper("error");
    showActivityCard(false);
    show(els.error, true);
  }

  function initAccessibility() {
    for (const el of document.querySelectorAll(".statusWrapper")) {
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
    }

    // The clock reruns every 30s; announcing it that often is noise, so this one
    // opts out of the implicit live region role="status" would otherwise give it.
    byId("statusWrapperOffline")?.setAttribute("aria-live", "off");

    els.activityLogoLarge?.setAttribute("alt", "Discord activity icon");
    els.amActivityLogoLarge?.setAttribute("alt", "Album art");
  }

  function show(el, yes) {
    if (!el) return;
    if (yes) el.style.display = "flex";
    else el.style.display = "none";
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text ?? "";
    show(el, !!text);
  }

  function isVisible(el) {
    if (!el) return false;
    return getComputedStyle(el).display !== "none";
  }

  function cap(text) {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function reduceMotion() {
    return document.documentElement.classList.contains("reduce-motion");
  }
})();
