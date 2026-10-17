// Finding a song's lyrics on LRCLIB (https://lrclib.net), shared by the two
// places that ask: functions/api/lyrics.js, and the page itself when that
// Function could not get through.
//
// The page is the fallback because LRCLIB turns away most requests that come
// from Cloudflare's Workers - they all leave from the same few addresses, so
// someone else's traffic uses up the allowance - while a visitor's browser
// asks from an address of its own. It is an ES module so the Function can
// import it, and lyrics.js, a classic script, loads it with import() only when
// it is needed.

const LRCLIB = "https://lrclib.net/api";

const UPSTREAM_TIMEOUT_MS = 6000;

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const RETRY_DELAY_MS = 400;

// A result more than this far from the playing track's length is a different
// recording - a live take, an extended mix - not the song we asked for.
const MAX_DURATION_DRIFT = 15;

// Three widening attempts, stopping at the first that answers. Returns the
// row that was picked, if any, and whether a plain-text-only row was passed
// over on the way.
//
// headers identify the caller to LRCLIB: a user-agent from the Function, and
// Lrclib-Client from a browser, which is not allowed to set its own
// user-agent. retries is how many times each request is tried again when
// LRCLIB sheds it.
export async function lookup(song, options) {
  const ask = (path, params) => lrclib(path, params, options);

  const artist = song.artist;
  const track = song.track;
  const album = song.album;
  const duration = song.duration;

  let plain = false;

  // Artist, track, album and duration together are specific enough to rule out
  // covers and re-recordings, so it is worth one request when Discord gave us
  // all four.
  if (album && duration) {
    const exact = await ask("/get", {
      artist_name: artist,
      track_name: track,
      album_name: album,
      duration,
    });
    if (usable(exact)) return { hit: exact, plain: false };
    if (plainOnly(exact)) plain = true;
  }

  // Duration is deliberately dropped here rather than kept as the last filter:
  // LRCLIB hard-404s when it disagrees by more than a second or two, and a
  // presence timestamp drifts by about that much on its own.
  const loose = await ask("/get", { artist_name: artist, track_name: track });
  if (usable(loose)) return { hit: loose, plain: false };
  if (plainOnly(loose)) plain = true;

  // Search returns every recording of the title, including other artists'
  // covers, so the choice of which one is ours is made below rather than by
  // taking the first row.
  let results = await ask("/search", { artist_name: artist, track_name: track });
  if (!Array.isArray(results)) results = [];

  const hit = best(results, duration);
  if (hit) return { hit: hit, plain: false };

  if (results.some(plainOnly)) plain = true;
  return { hit: null, plain: plain };
}

// A row with the words but no timestamps - the one kind usable() turns away
// that is still worth mentioning.
function plainOnly(row) {
  if (!row) return false;
  if (row.syncedLyrics) return false;
  return !!row.plainLyrics;
}

// Only time-synced lyrics are ever shown, one line at a time as they are sung,
// so a plain-text-only row is no answer at all. Instrumentals pass: they carry
// no lyrics, and the page says so instead of "not found".
function usable(hit) {
  if (!hit) return false;
  if (hit.instrumental) return true;
  return !!hit.syncedLyrics;
}

// The length closest to the track we asked about wins.
function best(results, duration) {
  const candidates = results.filter(usable);
  if (!candidates.length) return null;

  const ranked = candidates.map((r) => {
    // Unknown lengths sort last.
    let drift = Infinity;
    if (duration && r.duration) {
      drift = Math.abs(r.duration - duration);
    }

    return { row: r, drift: drift };
  });

  ranked.sort((a, b) => a.drift - b.drift);

  const top = ranked[0];

  if (duration && top.drift > MAX_DURATION_DRIFT) return null;

  return top.row;
}

async function lrclib(path, params, options) {
  const url = new URL(LRCLIB + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, v);
  }

  const headers = { accept: "application/json", ...options.headers };

  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, {
      headers: headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    // LRCLIB sheds load readily - a burst of a few requests is enough to draw
    // "ServerOverloaded" - and it clears within a moment. Retrying briefly
    // turns what would otherwise be a visible failure on a single button press
    // into a slightly slower success. Capped low deliberately: the point of
    // backing off is to stop adding to the pile-up.
    if (!RETRY_STATUS.has(res.status) || attempt >= options.retries) break;

    // Never wait more than two seconds: someone has the lyrics panel open.
    const after = Number(res.headers.get("retry-after"));

    let wait = RETRY_DELAY_MS;
    if (Number.isFinite(after) && after > 0) {
      wait = Math.min(after * 1000, 2000);
    }

    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  // 404 is the documented "no such track" answer and is a result, not a fault.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`lrclib ${path} responded ${res.status}`);
  return res.json();
}

// What the page is given for a hit, from either side. plainLyrics is
// deliberately left out: the page has no use for a block of text, and it is
// the whole song in one piece.
export function shape(hit) {
  const lines = parseLrc(hit.syncedLyrics || "");
  return {
    found: true,
    synced: lines.length > 0,
    trackName: hit.trackName || hit.name || "",
    artistName: hit.artistName || "",
    albumName: hit.albumName || "",
    duration: Number(hit.duration) || 0,
    instrumental: !!hit.instrumental,
    lines,
  };
}

// Leading timestamps only. A bracket in the middle of a line is lyrics -
// "[Chorus]", "[x2]" - and an LRC file's own [ar:]/[ti:]/[length:] metadata
// headers fail the numeric shape and drop out on their own.
const STAMP = /\[(\d{1,3}):([0-5]?\d(?:[.:]\d{1,3})?)\]/g;

function parseLrc(lrc) {
  const out = [];

  for (const raw of lrc.split("\n")) {
    STAMP.lastIndex = 0;

    const stamps = [];
    let consumed = 0;
    let match;

    while ((match = STAMP.exec(raw))) {
      if (match.index !== consumed) break;
      consumed = STAMP.lastIndex;

      // Some files write the fraction with a colon, so normalise that first.
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2].replace(":", "."));

      stamps.push(minutes * 60 + seconds);
    }

    if (!stamps.length) continue;

    // One line can carry several timestamps when a phrase repeats; each is its
    // own cue. Empty text is kept rather than dropped - LRCLIB ends most files
    // with a bare timestamp that marks where the last line stops, which is what
    // lets the player clear the screen instead of leaving a lyric hanging
    // through the outro.
    const text = raw.slice(consumed).trim();

    for (const stamp of stamps) {
      const rounded = Math.round(stamp * 100) / 100;
      out.push({ t: rounded, text: text });
    }
  }

  out.sort((a, b) => a.t - b.t);
  return out;
}
