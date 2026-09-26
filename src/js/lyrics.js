(() => {
  "use strict";

  const btn = document.getElementById("lyricsBtn");
  const overlay = document.getElementById("lyricsOverlay");
  const stage = document.getElementById("lyricsStage");

  if (!btn || !overlay || !stage) return;

  const closeBtn = document.getElementById("lyricsCloseBtn");
  const controls = document.getElementById("lyricsControls");
  const fullscreenBtn = document.getElementById("lyricsFullscreenBtn");
  const modeButtons = overlay.querySelectorAll(".lyricsModeBtn");
  const statusEl = document.getElementById("lyricsStatus");
  const caption = document.getElementById("lyricsCaption");
  const backdropCanvas = document.getElementById("lyricsBackdrop");

  const CLOSE_ANIM_MS = 250;
  const SCROLL_RESUME_MS = 6000;

  // How long the control bar stays up after the last sign of someone using
  // the page - a mouse move, a scroll, a tap.
  const CONTROLS_HIDE_MS = 3000;
  const GAP_MIN = 5;

  // The blurred background is small on purpose. The art is drawn at 64px and
  // the blurred result shown at 128px, stretched over the whole screen by CSS
  // - blurred art has no detail to lose, and canvases this size cost next to
  // nothing to redraw every frame.
  const ART_DRAW_SIZE = 64;
  const ART_SIZE = 300;
  const BACKDROP_FADE_MS = 1200;

  // The blur is made by shrinking the art down through these sizes and back
  // up again, not with a filter. See blurInto().
  const BLUR_DOWN = [32, 16, 8];
  const BLUR_UP = [16, 32, 64];

  // How much more colourful the blurred art is made, the same as CSS
  // saturate(1.7). See saturatePixels().
  const BACKDROP_SATURATION = 1.7;

  // LRCLIB only times whole lines, so the words inside one are spread out by
  // guesswork: roughly how long it takes to sing that many letters, but never
  // past most of the gap before the next line.
  const WORD_PACE = 0.075;
  const WORD_LEAD = 0.35;
  const REVEAL_SHARE = 0.85;
  const SCENE_LEAVE_MS = 1200;
  const ROW_CHARS = 13;
  const ROW_CHARS_PORTRAIT = 8;

  // Where a line lands and how it is tilted. Picked per line, never the same
  // one twice in a row, which is what makes it feel edited rather than typeset.
  const LAYOUTS = [
    { align: "start", y: 38, tilt: -2, scale: 1 },
    { align: "center", y: 50, tilt: 0, scale: 1.1 },
    { align: "end", y: 60, tilt: 2, scale: 1 },
    { align: "stagger", y: 46, tilt: -1, scale: 0.95 },
    { align: "center", y: 42, tilt: 1.5, scale: 0.9 },
    { align: "start", y: 58, tilt: 0, scale: 1.05 },
  ];

  const ENTRANCES = ["rise", "drop", "zoom", "slide"];

  // A word in immersive mode that names a colour is painted in it. The shades
  // are the bright end of each colour, since they sit on a dark, shaded
  // backdrop. Black and white are left out: black would vanish into the
  // background and every word is already white. Swedish is in here too, since
  // the site is.
  const WORD_COLORS = {
    red: "#ff4d4d",
    green: "#4dde6a",
    blue: "#4d9dff",
    yellow: "#ffe14d",
    orange: "#ff9a3c",
    pink: "#ff7ac6",
    purple: "#b77dff",
    violet: "#b77dff",
    brown: "#c48a5a",
    gold: "#ffcf40",
    golden: "#ffcf40",
    silver: "#d0d6de",
    grey: "#a8adb3",
    gray: "#a8adb3",
    cyan: "#4de8f0",
    turquoise: "#40e0d0",
    teal: "#2ec4b6",
    magenta: "#ff4dd8",
    crimson: "#ff3355",
    scarlet: "#ff4424",
    indigo: "#8a7dff",
    lavender: "#c9b3ff",

    röd: "#ff4d4d",
    rött: "#ff4d4d",
    röda: "#ff4d4d",
    grön: "#4dde6a",
    grönt: "#4dde6a",
    gröna: "#4dde6a",
    blå: "#4d9dff",
    blått: "#4d9dff",
    blåa: "#4d9dff",
    gul: "#ffe14d",
    gult: "#ffe14d",
    gula: "#ffe14d",
    rosa: "#ff7ac6",
    lila: "#b77dff",
    brun: "#c48a5a",
    brunt: "#c48a5a",
    bruna: "#c48a5a",
    guld: "#ffcf40",
    grå: "#a8adb3",
    grått: "#a8adb3",
    gråa: "#a8adb3",

    roza: "#ff7ac6",
  };

  // Croatian and Bosnian change the end of a colour word with gender and case
  // - crven, crvena, crveno, crvenih, crvenom and so on - so rather than list
  // every form, these are the part that stays the same, and any of the
  // ENDINGS below may follow it.
  const WORD_COLOR_STEMS = {
    crven: "#ff4d4d",
    zelen: "#4dde6a",
    plav: "#4d9dff",
    žut: "#ffe14d",
    narančast: "#ff9a3c",
    narandžast: "#ff9a3c",
    ružičast: "#ff7ac6",
    ljubičast: "#b77dff",
    smeđ: "#c48a5a",
    zlat: "#ffcf40",
    zlatn: "#ffcf40",
    srebrn: "#d0d6de",
    siv: "#a8adb3",
  };

  const ENDINGS = [
    "", "a", "o", "i", "e", "u",
    "om", "oj", "ih", "im", "ima",
    "og", "oga", "ome", "omu",
    "eg", "ega", "em", "emu",
  ];

  // The page has its own Reduce motion setting on top of the system one, and
  // either being on is enough.
  function reduceMotion() {
    if (document.documentElement.classList.contains("reduce-motion")) return true;
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function lyricsMode() {
    let saved = "";
    if (typeof setting === "function") saved = setting("lyricsMode");

    // "plain", saved before that mode was removed, lands on time-synced;
    // anything else - including nothing saved yet - is immersive.
    if (saved === "synced" || saved === "plain") return "synced";
    return "immersive";
  }

  function t(text) {
    if (window.i18n) return window.i18n.t(text);
    return text;
  }

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

  // Immersive mode shows one line at a time, built when it comes up, so the
  // cues carry text instead of elements and `scene` is whatever is on screen.
  let immersive = false;
  let scene = null;
  let lastLayout = -1;

  let controlsTimer = 0;
  let pointerOnControls = false;
  let lastPointerType = "mouse";

  const answers = new Map();

  function trackKey(track) {
    if (!track) return "";
    const parts = [track.artist, track.title, track.album];
    return parts.join("|").toLowerCase();
  }

  // Anchored: an artist can have "by" inside their name - "Bobby Womack" - and
  // only a leading one is Cider's prefix. Mirrored by artistOf() in lanyard.js.
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

    // LRCLIB uses the length to pick between recordings of the same song.
    let duration = 0;
    if (start && end) duration = (end - start) / 1000;

    return {
      title: title,
      artist: artist,
      album: String(a.assets?.large_text || "").trim(),
      start: start,
      duration: duration,
      artwork: artworkOf(a),
    };
  }

  // Only ever drawn, never read back, so a host without CORS headers is fine
  // here - but the Cider host serves full-size originals, so the Discord proxy
  // is asked for a small copy instead of going there directly.
  function artworkOf(activity) {
    const art = window.Lanyard.artwork(activity);
    if (!art) return "";

    if (art.mzstatic) return art.mzstatic(ART_SIZE);
    if (art.proxy) return art.proxy(ART_SIZE);
    if (art.appAsset) return art.appAsset(ART_SIZE);
    return "";
  }

  function fetchLyrics(want) {
    const key = trackKey(want);
    const known = answers.get(key);
    if (known) return known;

    const params = new URLSearchParams({ artist: want.artist, track: want.title });
    if (want.album) params.set("album", want.album);
    if (want.duration) params.set("duration", String(Math.round(want.duration)));

    const request = fetch("/api/lyrics?" + params, {
      headers: { accept: "application/json" }
    });

    const pending = request.then(async (res) => {
      const type = res.headers.get("content-type") || "";

      // Anything other than JSON means the endpoint is not really there: Pages
      // Functions only run under the Cloudflare runtime, not a static server.
      if (!type.includes("application/json")) {
        const err = new Error(
          "/api/lyrics returned " + res.status + " " +
          (type || "with no content type") +
          " - Pages Functions only run under the Cloudflare runtime"
        );
        err.noBackend = true;
        throw err;
      }

      const body = await res.json();

      // 404 is a real answer here, so it is handled like a success.
      if (res.ok || res.status === 404) return body;

      throw new Error("lyrics request failed: " + res.status + " " + (body.reason || ""));
    });

    // A failed lookup must not stay in the cache, or a retry gets the same rejection.
    const guarded = pending.catch((err) => {
      answers.delete(key);
      throw err;
    });

    answers.set(key, guarded);
    return guarded;
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

    caption.textContent = track.title + " - " + track.artist;
  }

  function clearStage() {
    stage.innerHTML = "";
    stage.classList.remove("isUnsynced");
    stage.classList.remove("isImmersive");
    cues = [];
    activeIndex = null;
    resumeScrollAt = 0;
    immersive = false;
    scene = null;
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
    if (lines[0].t >= GAP_MIN) {
      cues.push({ t: 0, el: dotsRow() });
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.text) {
        cues.push({ t: line.t, el: textRow(line.text) });
        continue;
      }

      const next = lines[i + 1];

      let gap = Infinity;
      if (next) gap = next.t - line.t;

      let el = null;
      if (gap >= GAP_MIN) el = dotsRow();

      // A cue with el: null still takes a slot, so the highlight lands on nothing.
      cues.push({ t: line.t, el: el });
    }
  }

  function present(data) {
    stopTicking();
    clearStage();
    applyMode();

    shownData = data;
    shownKey = trackKey(track);
    setCaption();

    if (!data?.found) return setStatus("No lyrics found for this track.");
    if (data.instrumental) return setStatus("This track is instrumental.");

    // /api/lyrics only answers with time-synced lyrics, so this is only an
    // odd row whose timestamps all failed to parse.
    if (!data.synced || !data.lines?.length) {
      return setStatus("No lyrics found for this track.");
    }

    setStatus("");

    // Without a start timestamp there is no way to know which line is being
    // sung, and a music video that never moves is just a still - so immersive
    // falls back to the time-synced list, over the same moving background.
    if (lyricsMode() === "immersive" && track?.start) {
      renderImmersive(data.lines);
    } else {
      renderSynced(data.lines);
    }

    startTicking();
  }

  /* ---------- Immersive ---------- */

  function renderImmersive(lines) {
    immersive = true;
    stage.classList.add("isImmersive");

    if (lines[0].t >= GAP_MIN) {
      cues.push({ t: 0, text: "", end: lines[0].t, dots: true });
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const next = lines[i + 1];

      // The last line has nothing after it to end on, so it is given a few
      // seconds, which is only used to pace its words.
      let end = line.t + 6;
      if (next) end = next.t;

      let dots = false;
      if (!line.text && end - line.t >= GAP_MIN) dots = true;

      cues.push({ t: line.t, text: line.text, end: end, dots: dots });
    }
  }

  function showScene(cue) {
    if (scene) retireScene(scene.el);
    scene = null;

    if (!cue) return;

    if (cue.text) {
      scene = buildScene(cue);
    } else if (cue.dots) {
      scene = buildBreak();
    }

    if (scene) stage.appendChild(scene.el);
  }

  // The outgoing line is left to animate away on its own rather than removed,
  // so it overlaps the next one coming in the way a cut in a video would.
  function retireScene(el) {
    el.classList.add("isLeaving");

    let wait = SCENE_LEAVE_MS;
    if (reduceMotion()) wait = 0;

    window.setTimeout(function () {
      el.remove();
    }, wait);
  }

  function pickLayout() {
    let index = Math.floor(Math.random() * LAYOUTS.length);

    if (index === lastLayout) {
      index = (index + 1) % LAYOUTS.length;
    }

    lastLayout = index;
    return LAYOUTS[index];
  }

  function pickEntrance() {
    const index = Math.floor(Math.random() * ENTRANCES.length);
    return ENTRANCES[index];
  }

  // Short lines stay on one row and get huge; long ones are broken into rows
  // of about ROW_CHARS letters, each sized to fill the width on its own. A tall
  // phone screen has height to spare and little width, so it gets shorter rows.
  function rowsOf(words) {
    let perRow = ROW_CHARS;
    if (window.innerHeight > window.innerWidth) perRow = ROW_CHARS_PORTRAIT;

    const whole = words.join(" ").length;
    const rowCount = Math.max(1, Math.round(whole / perRow));
    const target = whole / rowCount;

    const rows = [];
    let row = [];
    let length = 0;

    for (const word of words) {
      const grown = length + word.length;

      if (row.length > 0 && grown > target * 1.2) {
        rows.push(row);
        row = [];
        length = 0;
      }

      row.push(word);
      length += word.length + 1;
    }

    if (row.length > 0) rows.push(row);
    return rows;
  }

  function buildScene(cue) {
    const words = cue.text.split(/\s+/).filter(Boolean);
    const rows = rowsOf(words);
    const layout = pickLayout();

    const el = document.createElement("div");
    el.className = "immersiveScene";
    el.dataset.align = layout.align;
    el.dataset.enter = pickEntrance();
    el.style.setProperty("--y", layout.y + "%");
    el.style.setProperty("--tilt", layout.tilt + "deg");
    el.style.setProperty("--scale", String(layout.scale));
    el.style.setProperty("--rows", String(rows.length));

    // A tall line has no room to sit off-centre without running off the screen.
    if (rows.length > 4) el.style.setProperty("--y", "50%");

    const inner = document.createElement("div");
    inner.className = "immersiveInner";
    el.appendChild(inner);

    // Letters, spaces included, are what the reveal is paced by, so a long
    // word takes longer to arrive than a short one.
    let letters = 0;
    for (const word of words) {
      letters += word.length + 1;
    }

    const lineLength = cue.end - cue.t;
    const spoken = WORD_PACE * letters + WORD_LEAD;
    const reveal = Math.max(0, Math.min(lineLength * REVEAL_SHARE, spoken));

    const timed = [];
    let before = 0;
    let order = 0;

    for (const row of rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "immersiveRow";

      // --fit is the font size in vw that makes this row about 80% of the
      // screen wide. Jost's letters average a little over half an em.
      const rowLetters = Math.max(row.join(" ").length, 6);
      const fit = Math.min(150 / rowLetters, 20);
      rowEl.style.setProperty("--fit", fit.toFixed(2));

      for (const word of row) {
        const span = document.createElement("span");
        span.className = "immersiveWord";
        span.textContent = word;
        span.style.setProperty("--i", String(order));

        const color = colorOf(word);
        if (color) paintColorWord(span, word, color);

        rowEl.appendChild(span);
        rowEl.appendChild(document.createTextNode(" "));

        const t = cue.t + reveal * (before / letters);
        timed.push({ t: t, el: span });

        before += word.length + 1;
        order++;
      }

      inner.appendChild(rowEl);
    }

    return { el: el, words: timed };
  }

  // The colour a word names, or "" if it names none. The punctuation around
  // it is ignored, so "red," and "(Blue)" still count.
  function colorOf(word) {
    const bare = word.toLowerCase().replace(/[^\p{L}]/gu, "");

    if (Object.hasOwn(WORD_COLORS, bare)) {
      return WORD_COLORS[bare];
    }

    // Croatian and Bosnian: the word has to be a stem plus one of the known
    // endings, so "plava" counts but a longer word like "plavuša" does not.
    for (const stem in WORD_COLOR_STEMS) {
      if (!bare.startsWith(stem)) continue;

      const ending = bare.slice(stem.length);
      if (ENDINGS.includes(ending)) {
        return WORD_COLOR_STEMS[stem];
      }
    }

    return "";
  }

  // Only the letters are coloured, not the punctuation around them, so in
  // "(red)," the brackets and the comma stay white. The word is split into
  // what comes before its first letter, the letters themselves, and what
  // comes after its last letter, and only the middle part gets the colour.
  function paintColorWord(span, word, color) {
    const parts = word.match(/^([^\p{L}]*)(.*?)([^\p{L}]*)$/u);
    const before = parts[1];
    const letters = parts[2];
    const after = parts[3];

    const colored = document.createElement("span");
    colored.className = "immersiveColor";
    colored.textContent = letters;
    colored.style.setProperty("--word-color", color);

    span.textContent = "";
    span.appendChild(document.createTextNode(before));
    span.appendChild(colored);
    span.appendChild(document.createTextNode(after));
  }

  function buildBreak() {
    const el = document.createElement("div");
    el.className = "immersiveScene immersiveBreak";
    el.setAttribute("aria-hidden", "true");

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "immersiveDot";
      el.appendChild(dot);
    }

    return { el: el, words: [] };
  }

  // Worked out from the clock every frame rather than switched on once, so a
  // seek backwards inside the same line hides the words again.
  function revealWords(elapsed) {
    if (!scene) return;

    for (const word of scene.words) {
      const sung = elapsed >= word.t;
      word.el.classList.toggle("isSung", sung);
    }
  }

  /* ---------- Backdrop ---------- */

  // The art is drawn sharp into `buffer`, then blurred onto the visible
  // canvas. Blurring each copy of the art separately would leave hard edges
  // wherever one overlaps another.
  const backdrop = {
    ctx: backdropCanvas?.getContext("2d") || null,
    buffer: null,
    down: [],
    up: [],
    layers: [],
    url: "",
    rafId: 0,

    // Whether the offscreen canvases can still have their pixels read. A
    // canvas that has ever had art drawn on it without CORS permission is
    // locked for good, so the only way back is a fresh set of canvases.
    readable: true,
  };

  function makeCanvas(size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }

  function makeCanvases() {
    backdrop.buffer = makeCanvas(ART_DRAW_SIZE);
    backdrop.down = [];
    backdrop.up = [];

    for (const size of BLUR_DOWN) {
      backdrop.down.push(makeCanvas(size));
    }

    for (const size of BLUR_UP) {
      backdrop.up.push(makeCanvas(size));
    }

    // The smallest step is the one whose pixels are read every frame. Asking
    // for that up front, on its first getContext, keeps it in memory the CPU
    // can reach instead of on the GPU, where each read would be a round trip.
    const smallest = backdrop.down[backdrop.down.length - 1];
    smallest.getContext("2d", { willReadFrequently: true });

    backdrop.readable = true;
  }

  makeCanvases();

  function smoothContext(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    return ctx;
  }

  /* Blurs `source` onto `ctx` without a filter. Safari has no canvas filters,
     and the CSS blur that stood in for them had to re-blur the whole screen on
     every frame, which Safari could not keep up with.

     Shrinking an image averages its pixels together, and stretching it back
     spreads each one out smoothly - which is what a blur is. It is done a
     step at a time, halving and doubling, because one big jump skips pixels
     on the way down (the art shimmers as it moves) and shows as soft squares
     on the way up. It ends at 128px rather than the 64px it started from so
     the stretch CSS does to fill the screen is short enough not to show
     seams either. Every browser does the same few tiny draws per frame.

     The colour boost is applied at the bottom, on the 8x8 step, where it is
     64 pixels of work, and the way back up carries it to the whole picture. */
  function blurInto(ctx, source) {
    let from = source;

    for (const step of backdrop.down) {
      drawStep(step, from);
      from = step;
    }

    saturatePixels(from);

    for (const step of backdrop.up) {
      drawStep(step, from);
      from = step;
    }

    const size = ctx.canvas.width;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(from, 0, 0, size, size);
  }

  function drawStep(step, from) {
    const stepCtx = smoothContext(step);
    stepCtx.clearRect(0, 0, step.width, step.height);
    stepCtx.drawImage(from, 0, 0, step.width, step.height);
  }

  /* Makes the colours richer the way CSS saturate() does: each pixel is moved
     away from its own grey by the same factor, so a strong colour gets
     stronger and a near-grey stays near-grey.

     This replaced a canvas "saturation" blend, which pushed every pixel part
     of the way to fully saturated however little colour it had. A black that
     was a shade off neutral - rgb(3, 3, 5) - came out a deep blue, and as the
     art moved those pixels flipped between neutral and tinted from frame to
     frame, which showed as blue flickering in the dark parts of a cover.

     The numbers are the CSS saturate() matrix, from the Filter Effects spec. */
  function saturatePixels(canvas) {
    if (!backdrop.readable) return;

    const ctx = canvas.getContext("2d");

    let image;
    try {
      image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      // Art without CORS permission was drawn in. It is still shown, only
      // without the boost, until it is gone - see drawBackdrop().
      backdrop.readable = false;
      return;
    }

    const s = BACKDROP_SATURATION;
    const px = image.data;

    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];

      // Uint8ClampedArray rounds and clamps to 0-255 on its own.
      px[i] = (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b;
      px[i + 1] = (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b;
      px[i + 2] = (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b;
    }

    ctx.putImageData(image, 0, 0);
  }

  // Each copy of the art drifts in a slow circle while it turns. Slightly
  // different speeds keep the pattern from ever lining up and repeating.
  const BLOBS = [
    { x: 0.3, y: 0.3, size: 1.1, orbit: 0.11, radius: 0.18, spin: 0.05, phase: 0 },
    { x: 0.7, y: 0.65, size: 1.0, orbit: -0.08, radius: 0.2, spin: -0.07, phase: 2 },
    { x: 0.5, y: 0.5, size: 0.75, orbit: 0.14, radius: 0.25, spin: 0.09, phase: 4 },
    { x: 0.25, y: 0.75, size: 0.6, orbit: -0.12, radius: 0.15, spin: -0.04, phase: 1 },
  ];

  function drawArt(ctx, img, seconds) {
    const size = backdrop.buffer.width;

    // The first copy fills the whole canvas, so no black shows between the others.
    ctx.drawImage(img, -size * 0.25, -size * 0.25, size * 1.5, size * 1.5);

    for (const blob of BLOBS) {
      const angle = seconds * blob.orbit + blob.phase;
      const cx = size * (blob.x + Math.cos(angle) * blob.radius);
      const cy = size * (blob.y + Math.sin(angle) * blob.radius);
      const side = size * blob.size;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(seconds * blob.spin + blob.phase);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(img, -side / 2, -side / 2, side, side);
      ctx.restore();
    }
  }

  function drawBackdrop(now) {
    const ctx = backdrop.ctx;
    if (!ctx) return;

    let seconds = now / 1000;
    if (reduceMotion()) seconds = 0;

    // The newest cover fades in over the old one, and once it is fully in the
    // old one has nothing left to contribute and is dropped.
    const newest = backdrop.layers[backdrop.layers.length - 1];
    if (newest && now - newest.born >= BACKDROP_FADE_MS) {
      backdrop.layers = [newest];
    }

    // Once a cover without CORS permission is no longer being drawn, fresh
    // canvases bring the colour boost back.
    const allReadable = backdrop.layers.every((layer) => layer.readable);
    if (!backdrop.readable && allReadable) {
      makeCanvases();
    }

    // Fetched only now, since makeCanvases() above may have just replaced it.
    const bufferCtx = backdrop.buffer.getContext("2d");

    // Cleared every frame: a cover with transparent parts would otherwise
    // smear the previous frame into this one.
    const bufferSize = backdrop.buffer.width;
    bufferCtx.clearRect(0, 0, bufferSize, bufferSize);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    for (const layer of backdrop.layers) {
      let alpha = (now - layer.born) / BACKDROP_FADE_MS;
      if (alpha > 1) alpha = 1;
      if (layer === backdrop.layers[0]) alpha = 1;

      bufferCtx.save();
      bufferCtx.globalAlpha = alpha;
      drawArt(bufferCtx, layer.img, seconds);
      bufferCtx.restore();
    }

    blurInto(ctx, backdrop.buffer);
  }

  function backdropFrame(now) {
    backdrop.rafId = 0;
    if (!overlayOpen || !overlay.classList.contains("isImmersive")) return;

    drawBackdrop(now);

    // Still art only needs drawing until its fade-in is over.
    const fading = backdrop.layers.length > 1;
    if (reduceMotion() && !fading) return;

    backdrop.rafId = window.requestAnimationFrame(backdropFrame);
  }

  function startBackdrop() {
    if (backdrop.rafId) return;
    if (!backdrop.layers.length) return;
    backdrop.rafId = window.requestAnimationFrame(backdropFrame);
  }

  function stopBackdrop() {
    if (backdrop.rafId) window.cancelAnimationFrame(backdrop.rafId);
    backdrop.rafId = 0;
  }

  function syncBackdrop() {
    if (!backdrop.ctx) return;

    let url = "";
    if (overlay.classList.contains("isImmersive") && track) url = track.artwork;

    if (!url) {
      stopBackdrop();
      return;
    }

    if (url === backdrop.url) {
      startBackdrop();
      return;
    }

    backdrop.url = url;
    loadBackdropArt(url, true);
  }

  // Asked for with CORS first, so its pixels can be read for the colour
  // boost. Apple's and Discord's image hosts both allow it; if some other
  // host does not, the art is fetched again without asking and shown as is.
  function loadBackdropArt(url, withCors) {
    const img = new Image();
    img.decoding = "async";
    if (withCors) img.crossOrigin = "anonymous";

    img.onload = function () {
      // Another track may have come on while this one was loading.
      if (backdrop.url !== url) return;

      backdrop.layers.push({ img: img, born: performance.now(), readable: withCors });
      startBackdrop();
    };

    img.onerror = function () {
      if (withCors) {
        loadBackdropArt(url, false);
        return;
      }

      console.warn("[lyrics] backdrop artwork failed to load:", url);
    };

    img.src = url;
  }

  // Immersive is a property of the whole overlay - its background, the close
  // button, the caption - not only of the lyrics, so it is set even while the
  // lyrics are still loading or turned out to be missing.
  function applyMode() {
    const on = lyricsMode() === "immersive";
    overlay.classList.toggle("isImmersive", on);

    // Immersive is always dark, whatever the site theme, so the control bar
    // borrows the dark theme's colours there. .theme-dark is a plain class
    // in styles.css, so it works on any element, not only <html>.
    controls?.classList.toggle("theme-dark", on);

    syncBackdrop();
    syncModeButtons();

    // Full screen is only offered in immersive mode, so leaving immersive
    // leaves full screen with it.
    if (!on) exitFullscreen();
    syncFullscreenButton();
  }

  /* ---------- Controls ----------

     A bar across the top, the way a video player does it: out of the way
     while the lyrics play, back as soon as someone moves the mouse, scrolls
     or taps, and gone again a few seconds after they stop. */

  function showControls() {
    overlay.classList.add("controlsShown");
    scheduleHideControls();
  }

  function scheduleHideControls() {
    window.clearTimeout(controlsTimer);
    controlsTimer = window.setTimeout(function () {
      hideControls(false);
    }, CONTROLS_HIDE_MS);
  }

  // `asked` is a tap on the lyrics, which means "hide it now" and wins over
  // everything. The timer running out only hides a bar nobody is using.
  function hideControls(asked) {
    window.clearTimeout(controlsTimer);
    controlsTimer = 0;

    // Never pulled out from under someone who is about to use it.
    if (!asked) {
      if (pointerOnControls) return;
      if (keyboardInControls()) return;
    }

    overlay.classList.remove("controlsShown");

    // A hidden button that still has focus would be pressed by the next
    // Enter or Space, so focus steps back to the dialog itself.
    if (controls?.contains(document.activeElement)) {
      overlay.focus({ preventScroll: true });
    }
  }

  // Only focus that came from the keyboard counts. A button that happens to
  // have focus because it was clicked should not hold the bar up forever.
  function keyboardInControls() {
    const el = document.activeElement;
    if (!controls || !controls.contains(el)) return false;
    return el.matches(":focus-visible");
  }

  function controlButtons() {
    if (!controls) return [];

    const buttons = [];
    for (const button of controls.querySelectorAll("button")) {
      if (button.hidden) continue;
      buttons.push(button);
    }
    return buttons;
  }

  // The switcher is the header's navigator, so the mode in use is marked the
  // way the current page is there - .active on its <li> - and the sliding pill
  // is told to move to it.
  function syncModeButtons() {
    const mode = lyricsMode();

    for (const button of modeButtons) {
      const pressed = button.dataset.mode === mode;
      button.setAttribute("aria-pressed", String(pressed));
      button.parentElement?.classList.toggle("active", pressed);
    }

    placeModePill();
  }

  // general.js measures where the pill goes, which reads 0 for everything
  // while the overlay is display:none - so it is asked again once it shows.
  function placeModePill() {
    if (!overlayOpen) return;
    if (typeof window.repositionNavPills === "function") window.repositionNavPills();
  }

  function chooseMode(mode) {
    if (mode === lyricsMode()) return;

    // saveSetting() lives in settings.js. Its settings:change event is what
    // redraws the lyrics.
    if (typeof saveSetting === "function") {
      saveSetting("lyricsMode", mode);
    } else {
      localStorage.setItem("lyricsMode", mode);
      if (shownData) present(shownData);
      else applyMode();
    }
  }

  /* ---------- Full screen ---------- */

  // Safari on iPhone cannot put anything but a video full screen, so there the
  // button is never shown. Older Safari on the Mac only has the prefixed API.
  const canFullscreen = !!(overlay.requestFullscreen || overlay.webkitRequestFullscreen);

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function enterFullscreen() {
    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch((err) => {
        console.warn("[lyrics] full screen was refused:", err);
      });
      return;
    }

    if (overlay.webkitRequestFullscreen) overlay.webkitRequestFullscreen();
  }

  function exitFullscreen() {
    if (!fullscreenElement()) return;

    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
      return;
    }

    if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }

  function toggleFullscreen() {
    if (fullscreenElement()) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }

  function syncFullscreenButton() {
    if (!fullscreenBtn) return;

    const offered = canFullscreen && lyricsMode() === "immersive";
    fullscreenBtn.hidden = !offered;

    const isFull = !!fullscreenElement();

    let label = t("Full screen");
    if (isFull) label = t("Exit full screen");

    fullscreenBtn.setAttribute("aria-label", label);
    fullscreenBtn.title = label;

    const icon = fullscreenBtn.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-expand", !isFull);
      icon.classList.toggle("fa-compress", isFull);
    }
  }

  function scrollToActive(el) {
    if (Date.now() < resumeScrollAt) return;

    const top = el.offsetTop - (stage.clientHeight / 2) + (el.offsetHeight / 2);

    let behavior = "smooth";
    if (reduceMotion()) behavior = "auto";

    stage.scrollTo({ top: top, behavior: behavior });
  }

  function highlight(index) {
    if (index === activeIndex) return;

    if (immersive) {
      activeIndex = index;
      showScene(cues[index]);
      return;
    }

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
    while (index + 1 < cues.length && cues[index + 1].t <= elapsed) {
      index++;
    }

    highlight(index);
    revealWords(elapsed);
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
    placeModePill();
    overlay.classList.add("lyricsOpening");
    document.body.style.overflow = "hidden";

    opener = document.activeElement;

    // pointerleave does not fire for a pointer that was over the bar when the
    // overlay was hidden, so the flag could otherwise be left stuck on.
    pointerOnControls = false;

    applyMode();
    showControls();
    closeBtn?.focus();

    loadInto();
  }

  async function loadInto() {
    syncBackdrop();

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
      if (err.noBackend) {
        setStatus("Lyrics are not available in this test environment.");
      } else {
        setStatus("Couldn't load lyrics. Try again.");
      }
    }
  }

  function closeOverlay() {
    if (!overlayOpen) return;

    overlayOpen = false;
    stopTicking();
    stopBackdrop();
    exitFullscreen();

    window.clearTimeout(controlsTimer);
    controlsTimer = 0;
    overlay.classList.remove("controlsShown");

    overlay.classList.remove("lyricsOpening");
    overlay.classList.add("lyricsClosing");
    document.body.style.overflow = "";

    if (opener && document.contains(opener)) opener.focus();
    opener = null;

    // display:none cannot be animated, so it is only applied after the fade.
    let wait = CLOSE_ANIM_MS;
    if (reduceMotion()) wait = 0;

    closeTimeoutId = window.setTimeout(function () {
      overlay.classList.add("hide");
      overlay.classList.remove("lyricsClosing");
      closeTimeoutId = 0;
    }, wait);
  }

  window.Lanyard.subscribe((presence) => {
    const next = readTrack(window.Lanyard.appleMusic(presence));
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
  fullscreenBtn?.addEventListener("click", toggleFullscreen);

  for (const button of modeButtons) {
    button.addEventListener("click", () => chooseMode(button.dataset.mode));
  }

  document.addEventListener("fullscreenchange", syncFullscreenButton);
  document.addEventListener("webkitfullscreenchange", syncFullscreenButton);

  document.addEventListener("keydown", (e) => {
    if (!overlayOpen) return;

    // In full screen the browser takes the first Escape to leave full screen,
    // and it never reaches the page - so it is the second one that closes.
    if (e.key === "Escape") {
      closeOverlay();
      return;
    }

    // Tab cycles through the control bar and nothing else, so focus cannot
    // wander into the page behind. It also brings the bar up if it was hidden.
    if (e.key === "Tab") {
      e.preventDefault();
      showControls();

      const buttons = controlButtons();
      if (!buttons.length) return;

      let index = buttons.indexOf(document.activeElement);

      if (e.shiftKey) {
        index = index - 1;
        if (index < 0) index = buttons.length - 1;
      } else {
        index = index + 1;
        if (index >= buttons.length) index = 0;
      }

      buttons[index].focus();
    }
  });

  // The pointer type is remembered from pointerdown because the click that
  // follows does not say whether it came from a finger or a mouse.
  overlay.addEventListener("pointerdown", (e) => {
    lastPointerType = e.pointerType;
  });

  overlay.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    showControls();
  });

  // A tap on the lyrics toggles the bar, like tapping a video. A mouse click
  // only ever brings it up; the mouse moving away is what lets it hide.
  overlay.addEventListener("click", (e) => {
    if (controls?.contains(e.target)) return;

    const shown = overlay.classList.contains("controlsShown");
    if (lastPointerType === "touch" && shown) {
      hideControls(true);
    } else {
      showControls();
    }
  });

  controls?.addEventListener("pointerenter", () => {
    pointerOnControls = true;
  });

  controls?.addEventListener("pointerleave", () => {
    pointerOnControls = false;
    scheduleHideControls();
  });

  // Pressing a button counts as activity too, so the bar does not vanish
  // right after someone switches style.
  controls?.addEventListener("click", showControls);

  function humanScroll() {
    resumeScrollAt = Date.now() + SCROLL_RESUME_MS;
  }

  // A mode change - from the control bar, or a reset in the settings dialog
  // while the lyrics are open - redraws them straight away in the new style.
  window.addEventListener("settings:change", (event) => {
    const key = event.detail?.key;
    if (key !== "lyricsMode" && key !== "reduceMotion") return;
    if (!overlayOpen) return;

    if (shownData) {
      present(shownData);
    } else {
      applyMode();
    }
  });

  stage.addEventListener("wheel", humanScroll, { passive: true });
  stage.addEventListener("touchmove", humanScroll, { passive: true });

  // Scrolling through the lyrics in time-synced mode brings the
  // bar up as well.
  stage.addEventListener("wheel", showControls, { passive: true });
  stage.addEventListener("touchmove", showControls, { passive: true });

  window.i18n?.onChange(() => {
    overlay.setAttribute("aria-label", t("Lyrics"));
    closeBtn?.setAttribute("aria-label", t("Close"));
    closeBtn?.setAttribute("title", t("Close"));
    controls?.querySelector(".lyricsModes")?.setAttribute("aria-label", t("Lyrics style"));

    for (const label of overlay.querySelectorAll(".lyricsModeBtn > span[data-label]")) {
      label.textContent = t(label.dataset.label);
    }

    // A translated label is a different width, so the pill has to follow it.
    placeModePill();

    syncFullscreenButton();

    const key = statusEl?.dataset.key;
    if (key) statusEl.textContent = t(key);
    setCaption();
  });
})();
