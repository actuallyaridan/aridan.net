(() => {
  "use strict";

  const btn = document.getElementById("lyricsBtn");
  const overlay = document.getElementById("lyricsOverlay");
  if (!btn || !overlay) return;

  const closeBtn = document.getElementById("lyricsCloseBtn");
  const stage = document.getElementById("lyricsStage");
  const statusEl = document.getElementById("lyricsStatus");
  const caption = document.getElementById("lyricsCaption");

  const CLOSE_ANIM_MS = 250;
  // A reader who scrolls back to re-read a verse should not be yanked forward
  // again by the next line landing. Auto-scroll stands down for this long after
  // any deliberate scroll.
  const SCROLL_RESUME_MS = 6000;

  const reduceMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const t = (s) => (window.i18n ? window.i18n.t(s) : s);

  let track = null;
  let overlayOpen = false;
  let opener = null;
  let rafId = 0;
  let closeTimeoutId = 0;

  // Rendered rows for the lyrics currently on screen, indexed alongside
  // data.lines. A cue with no text has no row, so these entries stay null.
  let rows = [];
  let shownKey = "";
  let shownData = null;
  let activeIndex = -1;
  let resumeScrollAt = 0;

  // Answers are kept for the session so that reopening the overlay, or coming
  // back to a song later in an album, costs nothing upstream.
  const answers = new Map();

  const trackKey = (a) => (a ? [a.artist, a.title, a.album].join("|").toLowerCase() : "");

  // Cider reports the artist in .state, sometimes prefixed with "by". Mirrors
  // formatActivityState() in lanyard.js, which does the same for the Genius
  // link; the two scripts share no module, so the rule is restated here.
  function artistOf(state) {
    const s = String(state || "").trim();
    return /by\s*(?:\(.*\)|[^)]+)/.test(s) ? s.replace(/by\s+/, "") : s;
  }

  function readTrack(a) {
    if (!a) return null;

    const title = String(a.details || "").trim();
    const artist = artistOf(a.state);
    if (!title || !artist) return null;

    const start = a.timestamps?.start || 0;
    const end = a.timestamps?.end || 0;

    return {
      title,
      artist,
      album: String(a.assets?.large_text || "").trim(),
      start,
      duration: start && end ? (end - start) / 1000 : 0,
    };
  }

  // Deliberately called from openOverlay() and nowhere else: LRCLIB is a free
  // service run on donated time, and a lookup fired on every track change would
  // mean a request per song for every visitor who merely left the page open.
  function fetchLyrics(want) {
    const key = trackKey(want);
    const known = answers.get(key);
    if (known) return known;

    const params = new URLSearchParams({ artist: want.artist, track: want.title });
    if (want.album) params.set("album", want.album);
    if (want.duration) params.set("duration", String(Math.round(want.duration)));

    const pending = fetch("/api/lyrics?" + params, { headers: { accept: "application/json" } })
      .then(async (res) => {
        // A plain static file server has no Pages Functions, so this path is
        // just a file that isn't there and the 404 comes back as HTML. Reading
        // status alone would report that as "no lyrics for this track" and
        // quietly blame the song for a missing backend.
        const type = res.headers.get("content-type") || "";
        if (!type.includes("application/json")) {
          throw new Error(
            `/api/lyrics returned ${res.status} ${type || "with no content type"} - ` +
              "Pages Functions only run under the Cloudflare runtime"
          );
        }

        // 404 is the function's own "nothing matched", and carries a body.
        const body = await res.json();
        if (res.ok || res.status === 404) return body;
        throw new Error(`lyrics request failed: ${res.status} ${body.reason || ""}`.trim());
      })
      .catch((err) => {
        // A transport failure is not this track's answer, so it is forgotten
        // and the next open retries instead of replaying the error forever.
        answers.delete(key);
        throw err;
      });

    answers.set(key, pending);
    return pending;
  }

  // Takes the English string rather than a translated one and keeps it on the
  // element: this line is generated, so the page-wide sweep in general.js never
  // sees it and a later language change has nothing else to translate from.
  function setStatus(key) {
    if (!statusEl) return;
    statusEl.dataset.key = key || "";
    statusEl.textContent = key ? t(key) : "";
    statusEl.classList.toggle("hide", !key);
  }

  function setCaption(data) {
    if (!caption) return;
    shownData = data;

    if (!track) {
      caption.textContent = "";
      return;
    }

    const line = `${track.title} - ${track.artist}`;
    caption.textContent = data && data.found && !data.synced ? `${line} · ${t("not time-synced")}` : line;
  }

  function clearStage() {
    if (stage) stage.innerHTML = "";
    rows = [];
    shownKey = "";
    activeIndex = -1;
  }

  function renderSynced(data) {
    clearStage();
    stage.classList.remove("isUnsynced");

    rows = data.lines.map((line) => {
      if (!line.text) return null;
      const el = document.createElement("p");
      el.className = "lyricsRow";
      el.textContent = line.text;
      stage.appendChild(el);
      return el;
    });
  }

  function renderPlain(data) {
    clearStage();
    // Nothing to centre on, so the half-viewport padding that the timed view
    // needs would only push the first verse off the bottom of the screen.
    stage.classList.add("isUnsynced");

    const block = document.createElement("div");
    block.className = "lyricsPlain";
    data.plain.split("\n").forEach((line) => {
      const el = document.createElement("p");
      el.className = "lyricsRow isStatic";
      // A blank line is a verse break and needs to keep its height.
      el.textContent = line || " ";
      block.appendChild(el);
    });
    stage.appendChild(block);
  }

  function present(data) {
    if (!data || !data.found) {
      clearStage();
      setStatus("No lyrics found for this track.");
      setCaption(data);
      return;
    }

    if (data.instrumental) {
      clearStage();
      setStatus("This track is instrumental.");
      setCaption(data);
      return;
    }

    setStatus("");
    setCaption(data);

    if (data.synced) renderSynced(data);
    else if (data.plain) renderPlain(data);
    else {
      clearStage();
      setStatus("No lyrics found for this track.");
      return;
    }

    shownKey = trackKey(track);
    if (data.synced) startTicking(data);
  }

  function scrollToActive(el) {
    if (!el || Date.now() < resumeScrollAt) return;
    stage.scrollTo({
      top: el.offsetTop - stage.clientHeight / 2 + el.offsetHeight / 2,
      behavior: reduceMotion() ? "auto" : "smooth",
    });
  }

  function highlight(index) {
    if (index === activeIndex) return;

    rows[activeIndex]?.classList.remove("isActive");
    activeIndex = index;

    const el = rows[index];
    if (!el) return;

    el.classList.add("isActive");
    scrollToActive(el);
  }

  function startTicking(data) {
    stopTicking();

    // Without a start timestamp there is no way to know how far into the song
    // playback is, so the lyrics stay up as a plain scrollable list.
    if (!track?.start) {
      stage.classList.add("isUnsynced");
      return;
    }
    stage.classList.remove("isUnsynced");

    const tick = () => {
      if (!overlayOpen) return;

      const elapsed = (Date.now() - track.start) / 1000;

      let index = -1;
      for (let i = 0; i < data.lines.length; i++) {
        if (data.lines[i].t <= elapsed) index = i;
        else break;
      }

      highlight(index);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
  }

  function stopTicking() {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function openOverlay() {
    if (!track || overlayOpen) return;

    if (closeTimeoutId) {
      window.clearTimeout(closeTimeoutId);
      closeTimeoutId = 0;
    }

    overlayOpen = true;
    overlay.classList.remove("hide", "lyricsClosing");
    overlay.classList.add("lyricsOpening");
    document.body.style.overflow = "hidden";

    opener = document.activeElement;
    closeBtn?.focus();

    loadInto();
  }

  // Split out from openOverlay so a song changing under an already-open overlay
  // swaps its contents without touching the focus or animation it is mid-way
  // through.
  async function loadInto() {
    const requested = trackKey(track);

    // Re-opening on the same song keeps whatever is already rendered, so there
    // is no flash of the loading line between closes.
    if (shownKey !== requested) {
      clearStage();
      setCaption(null);
      setStatus("Loading lyrics…");
    }

    try {
      const data = await fetchLyrics(track);
      // The song can change, or the overlay close, while the request is out.
      if (!overlayOpen || trackKey(track) !== requested) return;
      present(data);
    } catch (err) {
      console.warn("[lyrics]", err);
      if (!overlayOpen || trackKey(track) !== requested) return;
      clearStage();
      setStatus("Can't load lyrics. Try again later.");
    }
  }

  function closeOverlay() {
    if (!overlayOpen) return;

    overlayOpen = false;
    stopTicking();

    overlay.classList.remove("lyricsOpening");
    overlay.classList.add("lyricsClosing");
    document.body.style.overflow = "";

    if (opener && document.contains(opener)) opener.focus();
    opener = null;

    closeTimeoutId = window.setTimeout(
      () => {
        overlay.classList.add("hide");
        overlay.classList.remove("lyricsClosing");
        closeTimeoutId = 0;
      },
      reduceMotion() ? 0 : CLOSE_ANIM_MS
    );
  }

  function trapFocus(e) {
    if (e.key !== "Tab" || !overlayOpen || !closeBtn) return;
    e.preventDefault();
    closeBtn.focus();
  }

  window.addEventListener("lanyard:applemusic", (evt) => {
    const next = readTrack(evt.detail);
    const changed = trackKey(next) !== trackKey(track);
    track = next;

    if (!track) {
      btn.classList.add("hide");
      closeOverlay();
      return;
    }

    btn.classList.remove("hide");
    if (!changed) return;

    // A new song under an open overlay replaces its contents; a new song while
    // it is shut is left alone until someone asks for it, which is what keeps
    // a page sitting open in a tab from costing anything upstream.
    stopTicking();
    if (overlayOpen) loadInto();
    else shownKey = "";
  });

  btn.addEventListener("click", openOverlay);
  closeBtn?.addEventListener("click", closeOverlay);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlayOpen) closeOverlay();
    else trapFocus(e);
  });

  // Only unmistakably human scrolling counts. Listening for "scroll" instead
  // would catch the smooth auto-scroll's own events and stop it after one line.
  ["wheel", "touchmove"].forEach((type) =>
    stage?.addEventListener(type, () => {
      resumeScrollAt = Date.now() + SCROLL_RESUME_MS;
    }, { passive: true })
  );

  // Everything inside the overlay is generated, so none of it is reachable by
  // the page-wide sweep in general.js and it has to restate itself.
  window.i18n?.onChange(() => {
    overlay.setAttribute("aria-label", t("Lyrics"));
    closeBtn?.setAttribute("aria-label", t("Close"));

    const key = statusEl?.dataset.key;
    if (key) statusEl.textContent = t(key);
    if (shownKey) setCaption(shownData);
  });
})();
