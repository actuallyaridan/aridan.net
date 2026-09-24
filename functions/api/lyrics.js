// Lyrics come from LRCLIB (https://lrclib.net), a free, key-less community
// database of synced lyrics. Proxying it instead of calling it from the page
// buys three things: the descriptive User-Agent they ask callers to send, an
// edge cache so a track is fetched from them once per colo rather than once per
// visitor, and a same-origin request that needs no connect-src entry in
// _headers.

const LRCLIB = "https://lrclib.net/api";
const UA = "aridan.net/1.0 (+https://github.com/actuallyaridan/aridan.net)";

// Lyrics for a given recording do not change, so a hit can sit at the edge for
// a long time. A miss expires far sooner: the database is crowd-sourced, and a
// track nobody has contributed today may well be there next week.
const HIT_TTL = 60 * 60 * 24 * 30;
const MISS_TTL = 60 * 60 * 6;

const UPSTREAM_TIMEOUT_MS = 6000;
const MAX_FIELD = 200;

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const UPSTREAM_RETRIES = 2;
const RETRY_DELAY_MS = 400;

// A result more than this far from the playing track's length is a different
// recording - a live take, an extended mix - not the song we asked for.
const MAX_DURATION_DRIFT = 15;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  const artist = field(url.searchParams.get("artist"));
  const track = field(url.searchParams.get("track"));
  const album = field(url.searchParams.get("album"));
  const duration = durationOf(url.searchParams.get("duration"));

  if (!artist || !track) {
    return json({ error: "artist and track are required" }, 400);
  }

  const cache = caches.default;
  const key = cacheKey(url.origin, artist, track, album, duration);

  const cached = await cache.match(key);
  if (cached) return cached;

  let payload;
  let status;
  try {
    const hit = await lookup(artist, track, album, duration);
    payload = hit ? shape(hit) : { found: false, reason: "no_match" };
    status = hit ? 200 : 404;
  } catch (err) {
    // LRCLIB being down or overloaded is a transient condition, so it is
    // answered with a bare 502 and never written to the cache - otherwise one
    // bad minute would suppress a track for the whole MISS_TTL.
    return json({ found: false, reason: "upstream", detail: String(err?.message || err) }, 502, {
      "cache-control": "no-store",
    });
  }

  const response = json(payload, status, {
    "cache-control": `public, max-age=${status === 200 ? HIT_TTL : MISS_TTL}`,
  });

  context.waitUntil(cache.put(key, response.clone()).catch(() => {}));
  return response;
}

// Three widening attempts, stopping at the first that answers.
async function lookup(artist, track, album, duration) {
  // Artist, track, album and duration together are specific enough to rule out
  // covers and re-recordings, so it is worth one request when Discord gave us
  // all four.
  if (album && duration) {
    const exact = await lrclib("/get", {
      artist_name: artist,
      track_name: track,
      album_name: album,
      duration,
    });
    if (exact) return exact;
  }

  // Duration is deliberately dropped here rather than kept as the last filter:
  // LRCLIB hard-404s when it disagrees by more than a second or two, and a
  // presence timestamp drifts by about that much on its own.
  const loose = await lrclib("/get", { artist_name: artist, track_name: track });
  if (loose) return loose;

  // Search returns every recording of the title, including other artists'
  // covers, so the choice of which one is ours is made below rather than by
  // taking the first row.
  const results = await lrclib("/search", { artist_name: artist, track_name: track });
  return best(Array.isArray(results) ? results : [], duration);
}

// Synced lyrics beat plain ones, then the length closest to the track we asked
// about wins.
function best(results, duration) {
  if (!results.length) return null;

  const ranked = results.map((r) => {
    let unsynced = 1;
    if (r.syncedLyrics) unsynced = 0;

    // Unknown lengths sort last.
    let drift = Infinity;
    if (duration && r.duration) {
      drift = Math.abs(r.duration - duration);
    }

    return { row: r, unsynced: unsynced, drift: drift };
  });

  ranked.sort((a, b) => {
    // Drift is only consulted when the synced flags tie.
    if (a.unsynced !== b.unsynced) return a.unsynced - b.unsynced;
    return a.drift - b.drift;
  });

  const top = ranked[0];

  if (duration && top.drift > MAX_DURATION_DRIFT) return null;

  return top.row;
}

async function lrclib(path, params) {
  const url = new URL(LRCLIB + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, v);
  }

  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    // LRCLIB sheds load readily - a burst of a few requests is enough to draw
    // "ServerOverloaded" - and it clears within a moment. Retrying briefly
    // turns what would otherwise be a visible failure on a single button press
    // into a slightly slower success. Capped low deliberately: the point of
    // backing off is to stop adding to the pile-up.
    if (!RETRY_STATUS.has(res.status) || attempt >= UPSTREAM_RETRIES) break;

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

function shape(hit) {
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
    plain: hit.plainLyrics || "",
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

function cacheKey(origin, artist, track, album, duration) {
  // Built rather than reusing the incoming URL so that differences that do not
  // change the answer - casing, parameter order, a stray empty album - all land
  // on one entry.
  const p = new URLSearchParams();
  p.set("artist", artist.toLowerCase());
  p.set("track", track.toLowerCase());
  if (album) p.set("album", album.toLowerCase());
  if (duration) p.set("duration", String(duration));
  return new Request(`${origin}/api/lyrics?${p}`, { method: "GET" });
}

function field(v) {
  return typeof v === "string"
    ? Array.from(v)
        .filter((c) => {
          const n = c.charCodeAt(0);
          return n >= 32 && n !== 127;
        })
        .join("")
        .trim()
        .slice(0, MAX_FIELD)
    : "";
}

function durationOf(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n < 7200 ? n : 0;
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...extra },
  });
}
