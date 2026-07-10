// aridan.net
// lyricsEasterEgg.js
// Plays a fake, time-synced "lyrics video" full of DNS/Pi-hole jokes whenever
// Lanyard reports "Look What You Made Me Do" by Taylor Swift playing on Apple Music.
// Short phrases pop in one at a time on a plain white stage, then the whole
// phrase clears and the next one builds up. Not the real lyrics — a parody,
// triggered purely by what's currently playing.
//
// The actual words/timings live in lyricsEasterEggScript.js (window.LYRICS_EASTER_EGG_SCRIPT),
// which must load before this file. Edit that file to add or change lines.

(() => {
  "use strict";

  const TARGET_TITLE = "look what you made me do";
  const TARGET_ARTIST = "taylor swift";
  const HOLD_AFTER_LAST_LINE = 8; // seconds the last line stays up before a fallback loop restarts
  const CLOSE_ANIM_MS = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 250;

  // Parses lines like: 2:21 "sweetheart" — blank lines start a new phrase
  // (the stage clears before the next line appears), # lines are comments.
  function parseScript(text) {
    const cues = [];
    let groupIndex = -1;
    let sawRowInGroup = false;

    text.split("\n").forEach((raw) => {
      const line = raw.trim();
      if (!line) {
        sawRowInGroup = false;
        return;
      }
      if (line.startsWith("#")) return;

      const m = line.match(/^(\d+):(\d{2})\s+"(.*)"\s*$/);
      if (!m) {
        warn("Skipping unrecognized lyrics line:", JSON.stringify(line));
        return;
      }

      if (!sawRowInGroup) {
        groupIndex++;
        sawRowInGroup = true;
      }

      const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      cues.push({ t, groupIndex, segs: parseSegments(m[3]) });
    });

    cues.sort((a, b) => a.t - b.t);
    return cues;
  }

  // Splits "IS IN *RED*" into [{text:"IS IN ", cls:null}, {text:"RED", cls:"em"}].
  // *word* -> colored emphasis, _word_ -> underlined.
  function parseSegments(text) {
    const segs = [];
    const re = /\*([^*]+)\*|_([^_]+)_/g;
    let lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > lastIndex) segs.push({ text: text.slice(lastIndex, m.index), cls: null });
      segs.push(m[1] !== undefined ? { text: m[1], cls: "em" } : { text: m[2], cls: "underline" });
      lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) segs.push({ text: text.slice(lastIndex), cls: null });
    if (!segs.length) segs.push({ text, cls: null });
    return segs;
  }

  function warn(...a) { console.warn("[LyricsEasterEgg]", ...a); }

  const CUES = parseScript(window.LYRICS_EASTER_EGG_SCRIPT || "");
  const TIMELINE_END = (CUES.length ? CUES[CUES.length - 1].t : 0) + HOLD_AFTER_LAST_LINE;

  const btn = document.getElementById("lyricsEasterEggBtn");
  const overlay = document.getElementById("lyricsOverlay");
  if (!btn || !overlay || !CUES.length) return;

  const closeBtn = document.getElementById("lyricsCloseBtn");
  const stage = document.getElementById("lyricsStage");

  let activeSong = null; // the matching Lanyard activity object, while it's playing
  let overlayOpen = false;
  let openedAt = 0;
  let rafId = 0;
  let renderedUpTo = -1;
  let currentGroupIndex = -1;
  let closeTimeoutId = 0;

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  function isEasterEggSong(a) {
    if (!a) return false;
    return norm(a.details).includes(TARGET_TITLE) && norm(a.state).includes(TARGET_ARTIST);
  }

  function appendRow(cue) {
    const rowEl = document.createElement("div");
    rowEl.className = "lyricsRow";
    cue.segs.forEach((s) => {
      const span = document.createElement("span");
      if (s.cls) span.className = s.cls;
      span.textContent = s.text;
      rowEl.appendChild(span);
    });
    stage.appendChild(rowEl);
  }

  function currentElapsed() {
    const start = activeSong?.timestamps?.start;
    if (start) return (Date.now() - start) / 1000;
    return (Date.now() - openedAt) / 1000;
  }

  function syncTo(idx) {
    for (let i = renderedUpTo + 1; i <= idx; i++) {
      const cue = CUES[i];
      if (cue.groupIndex !== currentGroupIndex) {
        stage.innerHTML = "";
        currentGroupIndex = cue.groupIndex;
      }
      appendRow(cue);
    }
    renderedUpTo = idx;
  }

  function tick() {
    if (!overlayOpen) return;
    const elapsed = currentElapsed();

    let idx = 0;
    for (let i = 0; i < CUES.length; i++) {
      if (CUES[i].t <= elapsed) idx = i;
      else break;
    }

    if (idx !== renderedUpTo) {
      if (idx < renderedUpTo) {
        stage.innerHTML = "";
        renderedUpTo = -1;
        currentGroupIndex = -1;
      }
      syncTo(idx);
    }

    // Loop back to the top once we've run out of authored content, but only when
    // we have no real playback timestamp to anchor to (open-without-data fallback).
    if (!activeSong?.timestamps?.start && elapsed > TIMELINE_END) {
      openedAt = Date.now();
      stage.innerHTML = "";
      renderedUpTo = -1;
      currentGroupIndex = -1;
    }

    rafId = window.requestAnimationFrame(tick);
  }

  function openOverlay() {
    if (!activeSong) return;
    if (closeTimeoutId) {
      window.clearTimeout(closeTimeoutId);
      closeTimeoutId = 0;
    }
    stage.innerHTML = "";
    renderedUpTo = -1;
    currentGroupIndex = -1;

    overlayOpen = true;
    openedAt = Date.now();
    overlay.classList.remove("hide", "lyricsClosing");
    overlay.classList.add("lyricsOpening");
    document.body.style.overflow = "hidden";
    rafId = window.requestAnimationFrame(tick);
  }

  function closeOverlay() {
    if (!overlayOpen) return;
    overlayOpen = false;
    overlay.classList.remove("lyricsOpening");
    overlay.classList.add("lyricsClosing");
    document.body.style.overflow = "";
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;

    closeTimeoutId = window.setTimeout(() => {
      overlay.classList.add("hide");
      overlay.classList.remove("lyricsClosing");
      closeTimeoutId = 0;
    }, CLOSE_ANIM_MS);
  }

  window.addEventListener("lanyard:applemusic", (evt) => {
    const a = evt.detail;
    if (isEasterEggSong(a)) {
      activeSong = a;
      btn.classList.remove("hide");
    } else {
      activeSong = null;
      btn.classList.add("hide");
      closeOverlay();
    }
  });

  btn.addEventListener("click", openOverlay);
  closeBtn?.addEventListener("click", closeOverlay);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlayOpen) closeOverlay();
  });
})();
