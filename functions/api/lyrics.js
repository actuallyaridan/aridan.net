// Lyrics come from LRCLIB (https://lrclib.net), a free, key-less community
// database of synced lyrics. Proxying it instead of calling it from the page
// buys the descriptive User-Agent they ask callers to send, a same-origin
// request that needs no connect-src entry in _headers, and - most importantly -
// a place to check the request against my presence.
//
// Lyrics are copyrighted by their publishers, and LRCLIB holds no licence for
// them. So this only ever answers for the song I am playing right now, never
// for whatever a caller asks about, and nothing is kept at the edge: an open,
// cached lyrics API on this domain would be a lyrics site in its own right.

const LRCLIB = "https://lrclib.net/api";
const UA = "aridan.net/1.0 (+https://github.com/actuallyaridan/aridan.net)";

// Mirrors USER_ID and APPLE_APP_ID in src/js/lanyardClient.js.
const LANYARD = "https://api.lanyard.rest/v1/users/701403809129168978";
const APPLE_APP_ID = "773825528921849856";

const UPSTREAM_TIMEOUT_MS = 6000;
const MAX_FIELD = 200;

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const UPSTREAM_RETRIES = 2;
const RETRY_DELAY_MS = 400;

// A result more than this far from the playing track's length is a different
// recording - a live take, an extended mix - not the song we asked for.
const MAX_DURATION_DRIFT = 15;

// no-store on every answer, hits included - see the note at the top.
const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export async function onRequestGet({ request }) {
  const url = new URL(request.url);

  const artist = field(url.searchParams.get("artist"));
  const track = field(url.searchParams.get("track"));

  if (!artist || !track) {
    return json({ error: "artist and track are required" }, 400);
  }

  let playing;
  try {
    playing = await nowPlaying();
  } catch (err) {
    return json({ found: false, reason: "upstream", detail: String(err?.message || err) }, 502);
  }

  // A 409 rather than a 404 on purpose: the page treats a 404 as a final
  // answer and remembers it, and a mismatch is usually just the song changing
  // between the page asking and this check - worth trying again, not
  // remembering.
  if (!playing || !samePlay(playing, artist, track)) {
    return json({ found: false, reason: "not_playing" }, 409);
  }

  let hit;
  try {
    // Album and duration come from the presence, not the query string, so the
    // only thing a caller controls is which song to ask about - and that has
    // to be the one playing.
    hit = await lookup(playing.artist, playing.track, playing.album, playing.duration);
  } catch (err) {
    return json({ found: false, reason: "upstream", detail: String(err?.message || err) }, 502);
  }

  if (!hit) return json({ found: false, reason: "no_match" }, 404);
  return json(shape(hit), 200);
}

// The Apple Music activity from my presence, read the same way lyrics.js reads
// it, or null when nothing is playing.
async function nowPlaying() {
  const res = await fetch(LANYARD, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`lanyard responded ${res.status}`);

  const body = await res.json();
  const activities = body?.data?.activities || [];

  const activity = activities.find((a) => {
    if (a.name === "Apple Music") return true;
    return a.application_id === APPLE_APP_ID;
  });
  if (!activity) return null;

  const track = field(activity.details);
  const artist = field(artistOf(activity.state));
  if (!track || !artist) return null;

  const start = activity.timestamps?.start || 0;
  const end = activity.timestamps?.end || 0;

  let duration = 0;
  if (start && end) duration = durationOf((end - start) / 1000);

  return {
    artist: artist,
    track: track,
    album: field(activity.assets?.large_text),
    duration: duration,
  };
}

// Anchored: an artist can have "by" inside their name - "Bobby Womack" - and
// only a leading one is Cider's prefix. Mirrors artistOf() in lyrics.js.
function artistOf(state) {
  return String(state || "").trim().replace(/^by\s+/i, "");
}

function samePlay(playing, artist, track) {
  if (playing.artist.toLowerCase() !== artist.toLowerCase()) return false;
  if (playing.track.toLowerCase() !== track.toLowerCase()) return false;
  return true;
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
    if (usable(exact)) return exact;
  }

  // Duration is deliberately dropped here rather than kept as the last filter:
  // LRCLIB hard-404s when it disagrees by more than a second or two, and a
  // presence timestamp drifts by about that much on its own.
  const loose = await lrclib("/get", { artist_name: artist, track_name: track });
  if (usable(loose)) return loose;

  // Search returns every recording of the title, including other artists'
  // covers, so the choice of which one is ours is made below rather than by
  // taking the first row.
  const results = await lrclib("/search", { artist_name: artist, track_name: track });
  return best(Array.isArray(results) ? results : [], duration);
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

// plainLyrics is deliberately left out: the page has no use for a block of
// text, and it is the whole song in one piece.
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
