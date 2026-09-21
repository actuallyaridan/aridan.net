(() => {
  "use strict";

  const btn = document.getElementById("lyricsBtn");
  const overlay = document.getElementById("lyricsOverlay");
  const stage = document.getElementById("lyricsStage");

  if (!btn || !overlay || !stage) return;

  const closeBtn = document.getElementById("lyricsCloseBtn");
  const statusEl = document.getElementById("lyricsStatus");
  const caption = document.getElementById("lyricsCaption");

  const CLOSE_ANIM_MS = 250;
  const SCROLL_RESUME_MS = 6000;
  const GAP_MIN = 5;
  const reduceMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const t = (s) => (window.i18n ? window.i18n.t(s) : s);

  let track = null;
  let overlayOpen = false;
  let opener = null;
  let rafId = 0;
  let closeTimeoutId = 0;

  let cues = [];
  let activeIndex = null;

  let shownKey = "";
  let shownData = null;
  let resumeScrollAt = 0;

  const answers = new Map();

  const trackKey = (a) => (a ? [a.artist, a.title, a.album].join("|").toLowerCase() : "");

  function artistOf(state) {
    return String(state || "").trim().replace(/^by\s+/i, "");
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

  function fetchLyrics(want) {
    const key = trackKey(want);
    const known = answers.get(key);
    if (known) return known;

    const params = new URLSearchParams({ artist: want.artist, track: want.title });
    if (want.album) params.set("album", want.album);
    if (want.duration) params.set("duration", String(Math.round(want.duration)));

    const pending = fetch("/api/lyrics?" + params, { headers: { accept: "application/json" } })
      .then(async (res) => {
        const type = res.headers.get("content-type") || "";
        if (!type.includes("application/json")) {
          const err = new Error(
            `/api/lyrics returned ${res.status} ${type || "with no content type"} - ` +
              "Pages Functions only run under the Cloudflare runtime"
          );
          err.noBackend = true;
          throw err;
        }

        const body = await res.json();
        if (res.ok || res.status === 404) return body;
        throw new Error(`lyrics request failed: ${res.status} ${body.reason || ""}`.trim());
      })
      .catch((err) => {
        answers.delete(key);
        throw err;
      });

    answers.set(key, pending);
    return pending;
  }

  function setStatus(key) {
    if (!statusEl) return;
    statusEl.dataset.key = key || "";
    statusEl.textContent = key ? t(key) : "";
    statusEl.classList.toggle("hide", !key);
  }

  function setCaption() {
    if (!caption) return;

    if (!track) {
      caption.textContent = "";
      return;
    }

    const line = `${track.title} - ${track.artist}`;
    const unsynced = shownData?.found && !shownData.synced;
    caption.textContent = unsynced ? `${line} · ${t("not time-synced")}` : line;
  }

  function clearStage() {
    stage.innerHTML = "";
    stage.classList.remove("isUnsynced");
    cues = [];
    activeIndex = null;
    resumeScrollAt = 0;
  }

  function textRow(text) {
    const el = document.createElement("p");
    el.className = "lyricsRow";
    el.textContent = text;
    stage.appendChild(el);
    return el;
  }

  function dotsRow() {
    const el = document.createElement("p");
    el.className = "lyricsRow lyricsDots";
    el.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "lyricsDot";
      el.appendChild(dot);
    }
    stage.appendChild(el);
    return el;
  }

  function renderSynced(lines) {
    if (lines[0].t >= GAP_MIN) cues.push({ t: 0, el: dotsRow() });

    lines.forEach((line, i) => {
      if (line.text) {
        cues.push({ t: line.t, el: textRow(line.text) });
        return;
      }
      const next = lines[i + 1];
      const gap = next ? next.t - line.t : Infinity;
      cues.push({ t: line.t, el: gap >= GAP_MIN ? dotsRow() : null });
    });
  }

  function renderPlain(text) {
    stage.classList.add("isUnsynced");

    const block = document.createElement("div");
    block.className = "lyricsPlain";
    text.split("\n").forEach((line) => {
      const el = document.createElement("p");
      el.className = "lyricsRow isStatic";
      el.textContent = line || " ";
      block.appendChild(el);
    });
    stage.appendChild(block);
  }

  function present(data) {
    stopTicking();
    clearStage();

    shownData = data;
    shownKey = trackKey(track);
    setCaption();

    if (!data?.found) return setStatus("No lyrics found for this track.");
    if (data.instrumental) return setStatus("This track is instrumental.");

    if (data.synced && data.lines?.length) {
      setStatus("");
      renderSynced(data.lines);
      startTicking();
    } else if (data.plain) {
      setStatus("");
      renderPlain(data.plain);
    } else {
      setStatus("No lyrics found for this track.");
    }
  }

  function scrollToActive(el) {
    if (Date.now() < resumeScrollAt) return;
    stage.scrollTo({
      top: el.offsetTop - stage.clientHeight / 2 + el.offsetHeight / 2,
      behavior: reduceMotion() ? "auto" : "smooth",
    });
  }

  function highlight(index) {
    if (index === activeIndex) return;

    cues[activeIndex]?.el?.classList.remove("isActive");
    activeIndex = index;

    const el = cues[index]?.el;
    if (!el) return;

    el.classList.add("isActive");
    scrollToActive(el);
  }

  function tick() {
    if (!overlayOpen || !track?.start) return;

    const elapsed = (Date.now() - track.start) / 1000;

    let index = 0;
    while (index + 1 < cues.length && cues[index + 1].t <= elapsed) index++;

    highlight(index);
    rafId = window.requestAnimationFrame(tick);
  }

  function startTicking() {
    stopTicking();
    if (!track?.start) {
      stage.classList.add("isUnsynced");
      return;
    }

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

  async function loadInto() {
    const requested = trackKey(track);
    if (shownKey !== requested) {
      clearStage();
      shownData = null;
      setCaption();
      setStatus("Loading lyrics…");
    }

    try {
      const data = await fetchLyrics(track);
      if (!overlayOpen || trackKey(track) !== requested) return;
      present(data);
    } catch (err) {
      console.warn("[lyrics]", err);
      if (!overlayOpen || trackKey(track) !== requested) return;

      stopTicking();
      clearStage();
      shownData = null;
      shownKey = "";
      setCaption();
      setStatus(
        err.noBackend
          ? "Lyrics are not available in this test environment."
          : "Couldn't load lyrics. Try again."
      );
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
    stopTicking();
    if (overlayOpen) loadInto();
    else shownKey = "";
  });

  btn.addEventListener("click", openOverlay);
  closeBtn?.addEventListener("click", closeOverlay);

  document.addEventListener("keydown", (e) => {
    if (!overlayOpen) return;

    if (e.key === "Escape") closeOverlay();
    else if (e.key === "Tab") {
      e.preventDefault();
      closeBtn?.focus();
    }
  });

  const humanScroll = () => {
    resumeScrollAt = Date.now() + SCROLL_RESUME_MS;
  };
  stage.addEventListener("wheel", humanScroll, { passive: true });
  stage.addEventListener("touchmove", humanScroll, { passive: true });

  window.i18n?.onChange(() => {
    overlay.setAttribute("aria-label", t("Lyrics"));
    closeBtn?.setAttribute("aria-label", t("Close"));

    const key = statusEl?.dataset.key;
    if (key) statusEl.textContent = t(key);
    setCaption();
  });
})();
