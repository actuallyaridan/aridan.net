/* The "what I'm doing right now" card on the home page. */
(() => {
  "use strict";

  if (!document.querySelector(".discordWrapper")) return;

  const HIGH_RES = 512;
  const UPGRADE_RES = 1024;
  const LOADER_MS = 500;
  const REFRESH_TIMEOUT_MS = 10000;

  const CARD_MS = 320;
  const CARD_EASE = "cubic-bezier(.2,.7,.3,1)";

  // Opening and closing the whole card, and the page below making way for it.
  const SLIDE_MS = 380;
  const SLIDE_EASE = "cubic-bezier(.25,.8,.3,1)";

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
  let tickTimer = 0;
  let loaderTimer = null;
  let refreshTimer = null;
  let upgradeArt = prefEnabled("upgradeArtwork");
  let lastTrackKey = "";
  let lastAppleHref = "";
  let lastAppleTrack = null;
  let firstAnswerSeen = false;

  // Whether the card is open, or on its way open. The showActivity class
  // cannot say: it stays on while the card is closing, so it is still drawn.
  let cardOpen = false;
  let slideAnimations = [];
  let slideCleanup = null;

  function log(...parts) {
    debug.log(...parts);
  }

  function warn(...parts) {
    debug.warn(...parts);
  }

  for (const card of [els.amCard, els.otherCard]) {
    if (card) card.classList.add("activity");
  }

  // The load-time entrance is a one-off: once it has played, the card goes
  // back to its usual slide so closing it later still animates.
  els.content?.addEventListener("animationend", (e) => {
    if (e.animationName !== "lanyard-focus-in") return;
    els.content.classList.remove("revealing");
  });

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
  // settings.js registered its own listener first, so the reduce-motion class
  // is already up to date by the time this one runs.
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", onMotionChange);
  els.refresh?.addEventListener("click", onRefreshClick);
  window.i18n?.onChange(() => {
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

    if (key === "hideExplicit") {
      if (presence) updateUi();
      return;
    }

    if (key === "reduceMotion") {
      onMotionChange();
      return;
    }

    if (key !== "autoUpdateActivity") return;
    syncRefreshButton();
    syncTicker();
  }

  // Restarts the climb so the cover swaps between still and animated straight
  // away. The token is bumped rather than the state deleted: a fresh state
  // starts its token over, so a climb still in flight could match it and go on
  // to load an animated rung after motion was turned off.
  function onMotionChange() {
    if (!presence) return;

    for (const el of [els.amActivityLogoLarge, els.activityLogoLarge]) {
      const state = artState.get(el);
      if (!state) continue;

      state.token++;
      state.src = "";
    }

    updateUi();
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

  function showActivityCard(yes) {
    const content = els.content;
    if (!content) return;

    // Only the very first answer counts as "on load". If nothing was playing
    // then, a later open is a change and slides like any other.
    const isFirst = !firstAnswerSeen;
    firstAnswerSeen = true;

    const root = document.documentElement;
    const roomHeld = root.classList.contains("lanyard-reserve");

    const wasOpen = cardOpen;
    cardOpen = !!yes;
    const changing = wasOpen !== cardOpen;

    // Letting go of the held room can move the page too, if the card came
    // back a different size or not at all, so that goes through the slide.
    const releasing = isFirst && roomHeld;
    if (!changing && !releasing) return;

    // Reduced motion never plays the focus animation, so animationend would
    // never come to take the class off again.
    if (cardOpen && isFirst && !reduceMotion()) {
      content.classList.add("revealing");
    }

    slideCard(() => {
      if (releasing) root.classList.remove("lanyard-reserve");
    }, changing, roomHeld);
  }

  // Opening or closing the card moves everything below it. Letting the layout
  // animate did that by laying the page out again on every frame at a
  // fractional offset, and the text, snapped to whole pixels each time, moved
  // in visible steps. FLIP instead: note where everything below is, apply the
  // new layout at once, then slide it all from the old place with
  // `translate`, which the compositor moves smoothly and lays nothing out.
  // The card itself is uncovered (or covered back up) with a clip, in step.
  function slideCard(alsoChange, changing, roomHeld) {
    const content = els.content;

    settleSlide();

    const animate = !reduceMotion() && !document.hidden;
    const followers = elementsBelow(els.lanyardDiscord);

    let before = null;
    if (animate) before = followers.map(boxTop);

    alsoChange();

    if (changing && cardOpen) {
      content.classList.add("showActivity");

      // With the room held, the card is already where it will be, and coming
      // into focus is its entrance. Otherwise it is uncovered as the page
      // below makes way.
      if (animate && !roomHeld) {
        track(content.animate(
          [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0)" }],
          { duration: SLIDE_MS, easing: SLIDE_EASE }
        ));
      }
    }

    if (changing && !cardOpen) {
      if (!animate) {
        content.classList.remove("showActivity");
      } else {
        // The page below has to close up now, for the FLIP, but the card has
        // to stay on screen while it is covered back up. A negative bottom
        // margin as big as the card takes its room away without taking the
        // card away. The total is exactly what closed takes up, so swapping
        // one for the other afterwards moves nothing.
        const height = content.getBoundingClientRect().height;
        const marginTop = parseFloat(getComputedStyle(content).marginTop) || 0;
        content.style.marginBottom = -(height + marginTop) + "px";

        const closing = content.animate(
          [{ clipPath: "inset(0)" }, { clipPath: "inset(0 0 100% 0)" }],
          { duration: SLIDE_MS, easing: SLIDE_EASE, fill: "forwards" }
        );
        track(closing);

        slideCleanup = () => {
          content.style.marginBottom = "";
          content.classList.remove("showActivity");
        };
        closing.onfinish = settleSlide;
      }
    }

    if (!animate) return;

    // The Lyrics button shows or hides in this same presence update, but from
    // lyrics.js's handler, which runs after this one. A microtask waits until
    // every handler has had its turn, so its move is counted in too.
    queueMicrotask(() => {
      // How far the card's bottom edge travels while opening.
      let cardGrowth = 0;
      if (changing && cardOpen) {
        const marginTop = parseFloat(getComputedStyle(content).marginTop) || 0;
        cardGrowth = content.getBoundingClientRect().height + marginTop;
      }

      followers.forEach((el, i) => {
        const after = boxTop(el);
        const was = before[i];

        // Only just appeared - the Lyrics button, as a song starts - so it
        // has no old place of its own. It rides down with the card's bottom
        // edge, the way it would have if it had been there all along.
        if (was === null) {
          if (after !== null) {
            track(el.animate(
              [
                { opacity: 0, translate: "0 " + -cardGrowth + "px" },
                { opacity: 1, translate: "0 0" },
              ],
              { duration: SLIDE_MS, easing: SLIDE_EASE }
            ));
          }
          return;
        }

        if (after === null) return;

        const dy = was - after;
        if (Math.abs(dy) < 0.5) return;

        // `translate`, not `transform`, so anything that already has a
        // transform of its own keeps it.
        track(el.animate(
          [{ translate: "0 " + dy + "px" }, { translate: "0 0" }],
          { duration: SLIDE_MS, easing: SLIDE_EASE }
        ));
      });
    });
  }

  // Everything that comes after `el` in the page, so everything its height
  // pushes about: its later siblings, then its parent's, and so on up. Fixed
  // things, the header and the lyrics overlay, stay where they are anyway.
  function elementsBelow(el) {
    const found = [];
    let node = el;

    while (node && node !== document.body) {
      let next = node.nextElementSibling;
      while (next) {
        if (getComputedStyle(next).position !== "fixed") found.push(next);
        next = next.nextElementSibling;
      }
      node = node.parentElement;
    }

    return found;
  }

  // null for something not on the page at all (display:none).
  function boxTop(el) {
    if (!el.getClientRects().length) return null;
    return el.getBoundingClientRect().top;
  }

  function track(animation) {
    slideAnimations.push(animation);
  }

  // Jumps any slide still going to its end, so a new one measures from where
  // things really are rather than from halfway through the last.
  function settleSlide() {
    for (const animation of slideAnimations) animation.cancel();
    slideAnimations = [];

    const cleanup = slideCleanup;
    slideCleanup = null;
    if (cleanup) cleanup();
  }

  // How tall the card is when the visitor leaves, for settings.js to hold open
  // next time. Taken on the way out because by then the card has long since
  // finished opening, mid-animation heights would be wrong.
  function rememberCardHeight() {
    // Left before presence came in (or switched tabs that early), so this
    // visit knows nothing new; keep what the last one saved.
    if (!firstAnswerSeen) return;

    const open = cardOpen;

    // The whole section, so the Lyrics button under the card is counted too.
    const section = document.querySelector(".discordWrapper");

    try {
      if (open && section) {
        localStorage.setItem("lanyardReserve", String(section.offsetHeight));
      } else {
        localStorage.removeItem("lanyardReserve");
      }
    } catch {
      // Storage blocked, the next visit just grows the card instead.
    }
  }

  function updateActivityInfo(activities, status) {
    // Discord only reports activity while online, but the aridan-presence
    // agent reports it with Discord closed too, so either one opens this.
    show(els.lanyardDiscord, status === "online" || activities.length > 0);

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
  // animate from the old box, new cards come into focus the same way the whole
  // card does on load (lanyard-focus-in in lanyard.css), existing ones slide
  // across.
  function animateActivityChange(mutate) {
    if (reduceMotion()) {
      mutate();
      return;
    }

    // First presence on load: the whole card is about to come into focus, so
    // the cards inside it doing it again on top would only blur twice.
    if (!firstAnswerSeen) {
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
            { opacity: 0, filter: "blur(10px)", transform: "scale(.94)" },
            { opacity: 1, filter: "blur(0)", transform: "none" },
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
    setText(els.activityDetails, shown(a.details));
    setText(els.activityState, shown(a.state || ""));

    updateActivityTime(a.timestamps);
    updateProgressBar(a.timestamps, "");
  }

  function updateAppleMusicInfo(a) {
    show(els.amCard, true);

    updateImage(els.amActivityLogoLarge, a, a.assets?.large_text);

    setText(els.amActivityName, a.name);
    setText(els.amActivityState, shown(artistOf(a.state)));
    setText(els.amActivityDetails, shown(a.details));

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

    // Covers from the aridan-presence agent come as plain Apple addresses with
    // no Discord proxy to go through, so their first rung is Apple's own.
    const ladder = [];

    if (art.proxy) {
      ladder.push({
        url: art.proxy(HIGH_RES),
        label: "standard definition album cover (" + HIGH_RES + "px)",
      });
    } else if (art.mzstatic) {
      ladder.push({
        url: art.mzstatic(HIGH_RES),
        label: "standard definition album cover (" + HIGH_RES + "px)",
      });
    }

    // With Reduce motion on, the animated rungs are never fetched at all, not
    // just paused - the still HD cover takes their place where there is one.
    const still = reduceMotion();

    // Cider's animated original from the agent, after the still is already
    // showing. There is no proxy to shrink it through, so it is the full file
    // - the cost of having it move at all with Discord closed.
    if (art.animated && !still) {
      ladder.push({
        url: art.animated,
        label: "animated album cover (original)",
      });
    } else if (art.mzstatic) {
      ladder.push({
        url: art.mzstatic(UPGRADE_RES),
        label: "high definition album cover (" + UPGRADE_RES + "px)",
      });
    } else if (art.direct && art.proxy && still) {
      // Without "&animated=true" Discord's proxy hands back the first frame.
      ladder.push({
        url: art.proxy(UPGRADE_RES),
        label: "high definition album cover (" + UPGRADE_RES + "px)",
      });
    } else if (art.direct && art.proxy) {
      ladder.push({
        url: art.proxy(HIGH_RES, "&animated=true"),
        label: "animated standard definition album cover (" + HIGH_RES + "px)",
      });
      // Through the proxy at UPGRADE_RES, not straight from the original: on
      // the Cider host that can be a multi-megabyte file thousands of pixels
      // across, and the browser keeps every frame of it decoded in memory -
      // for a cover shown at 96px.
      ladder.push({
        url: art.proxy(UPGRADE_RES, "&animated=true"),
        label: "animated high definition album cover (" + UPGRADE_RES + "px)",
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

    // Set on every update, not only when the art changes, so turning
    // "Hide explicit language" on or off reaches an album name already shown.
    const label = shown(alt || activity.assets?.large_image || "");
    el.alt = label;
    el.title = label;

    const state = artState.get(el) || { src: "", token: 0 };

    // Already showing one of the rungs for this same cover, so leave it be.
    // Without this, every presence update would restart the whole climb.
    const alreadyShowing = ladder.some((rung) => rung.url === state.src);
    if (alreadyShowing) return;

    // Bumping the token makes any climb still in flight abandon itself.
    state.token++;
    artState.set(el, state);

    // Shown again after being hidden: see restartSpin() in general.js.
    const wasHidden = el.style.display === "none";
    el.style.display = "block";
    if (wasHidden && window.restartSpin) window.restartSpin(el);

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

      // A new image on a turning cover: see restartSpin() in general.js.
      if (window.restartSpin) window.restartSpin(el);

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

  /* The clock and the progress bar are updated once a second, just after
     the moment the clock ticks over, so the two move together. More often
     changes nothing anyone can see - on a three-and-a-half minute song the
     bar moves about 1.4px a second - and every update is a new frame the
     browser has to draw. */

  // How long after the clock's turn the update lands, so the rounding in
  // clock() has definitely flipped by then.
  const TICK_LATE_MS = 20;

  function tick() {
    tickTimer = 0;
    updateTimes();
    tickTimer = setTimeout(tick, msUntilClockTurns());
  }

  // Lined up with whichever clock the card shows: counting down to the end
  // if the song has one, otherwise counting up from the start.
  function msUntilClockTurns() {
    const activities = presence?.activities || [];

    let timed = window.Lanyard.appleMusic(presence);
    if (!timed?.timestamps) {
      timed = activities.find((a) => a?.timestamps);
    }

    const stamps = timed?.timestamps;
    const now = Date.now();

    let wait = 1000 - (now % 1000);

    if (stamps?.end) {
      const remaining = new Date(stamps.end).getTime() - now;
      wait = remaining % 1000;
    } else if (stamps?.start) {
      const elapsed = now - new Date(stamps.start).getTime();
      wait = 1000 - (elapsed % 1000);
    }

    // Past the end, the remainder comes out negative.
    if (wait <= 0) {
      wait = wait + 1000;
    }

    return wait + TICK_LATE_MS;
  }

  function updateTimes() {
    // Nothing to update while the lyrics overlay covers the page, or the tab
    // is in the background. Both catch up the moment they end - see the
    // listeners below.
    if (document.documentElement.classList.contains("lyricsOpen")) return;
    if (document.hidden) return;

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

  // Straight back up to date when the page is on show again, rather than up
  // to a second later with the time from before.
  window.addEventListener("lyrics:close", function () {
    if (tickTimer) updateTimes();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) rememberCardHeight();
    if (tickTimer) updateTimes();
  });

  window.addEventListener("pagehide", rememberCardHeight);

  // No point keeping a timer going when nothing on screen is counting.
  function syncTicker() {
    const activities = presence?.activities || [];
    const anythingTimed = activities.some((a) => {
      return a?.timestamps?.start || a?.timestamps?.end;
    });

    const wanted = window.Lanyard.autoUpdate && anythingTimed;

    // Started over on every presence update, not only the first: a new song
    // is shown at once, and its clock turns over at different moments from
    // the last one's, so the timer lines up with it afresh.
    if (wanted) {
      clearTimeout(tickTimer);
      tick();
      return;
    }

    if (!wanted && tickTimer) {
      clearTimeout(tickTimer);
      tickTimer = 0;
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
    console.error("[lanyard.js]", e);
    // Only the copy is replaced, writing to #errorMessage itself would blow
    // away the icon paragraph along with it.
    if (els.errorText) els.errorText.textContent = `An error occurred: ${e?.message || e}`;
    showActivityCard(false);
    show(els.error, true);
  }

  function initAccessibility() {
    els.activityLogoLarge?.setAttribute("alt", "Discord activity icon");
    els.amActivityLogoLarge?.setAttribute("alt", "Album art");
  }

  function show(el, yes) {
    if (!el) return;
    if (yes) el.style.display = "flex";
    else el.style.display = "none";
  }

  // What a song, artist or album is called on screen - see profanity.js. The
  // real names are still what the Apple Music lookup is given.
  function shown(text) {
    if (window.Profanity) return window.Profanity.clean(text);
    return text;
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function reduceMotion() {
    return document.documentElement.classList.contains("reduce-motion");
  }
})();
