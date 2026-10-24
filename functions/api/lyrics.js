// Lyrics come from LRCLIB (https://lrclib.net), a free, key-less community
// database of synced lyrics. Proxying it instead of calling it from the page
// buys the descriptive User-Agent they ask callers to send and - most
// importantly - a place to check the request against my presence. The page
// only asks LRCLIB itself after this has checked the song and failed to get
// through, which is what the "upstream" answer below is for.
//
// Lyrics are copyrighted by their publishers, and LRCLIB holds no licence for
// them. So this only ever answers for the song I am playing right now, never
// for whatever a caller asks about, and nothing is kept at the edge: an open,
// cached lyrics API on this domain would be a lyrics site in its own right.

import { lookup, shape } from "../../src/js/lrclib.js";

const UA = "aridan.net/1.0 (+https://github.com/actuallyaridan/aridan.net)";

// Mirrors USER_ID and APPLE_APP_ID in src/js/presenceClient.js.
const LANYARD = "https://api.lanyard.rest/v1/users/701403809129168978";
const APPLE_APP_ID = "773825528921849856";

// What the aridan-presence agent reports, which knows about music with
// Discord closed. PRESENCE_URL points this at a local Worker in development.
const DEFAULT_PRESENCE_URL = "https://presence.aridan.net";

const LISTENING = 2;

const UPSTREAM_TIMEOUT_MS = 6000;
const MAX_FIELD = 200;

// No retries. LRCLIB's limit is per address, and every Worker shares a few of
// them with everyone else on Cloudflare, so a 429 here does not clear in the
// moment a retry waits - it only adds to the pile and holds the page up. A
// different User-Agent does not help either: it is the address that is
// limited. The page asks LRCLIB from its own address as soon as this gives up.
const UPSTREAM_RETRIES = 0;

// no-store on every answer, hits included - see the note at the top.
const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  const artist = field(url.searchParams.get("artist"));
  const track = field(url.searchParams.get("track"));

  if (!artist || !track) {
    return json({ error: "artist and track are required" }, 400);
  }

  let candidates;
  try {
    candidates = await nowPlaying(env);
  } catch (err) {
    return json({ found: false, reason: "upstream", detail: String(err?.message || err) }, 502);
  }

  let playing = null;
  for (const candidate of candidates) {
    if (samePlay(candidate, artist, track)) {
      playing = candidate;
      break;
    }
  }

  // A 409 rather than a 404 on purpose: the page treats a 404 as a final
  // answer and remembers it, and a mismatch is usually just the song changing
  // between the page asking and this check - worth trying again, not
  // remembering.
  if (!playing) {
    return json({ found: false, reason: "not_playing" }, 409);
  }

  let result;
  try {
    // Album and duration come from the presence, not the query string, so the
    // only thing a caller controls is which song to ask about - and that has
    // to be the one playing.
    result = await lookup(playing, {
      headers: { "user-agent": UA },
      retries: UPSTREAM_RETRIES,
    });
  } catch (err) {
    // The song is checked and only LRCLIB is in the way, so the page is told
    // which one it is and asks LRCLIB itself. A 200 rather than an error
    // status: this is the usual way a lookup goes, since LRCLIB turns most
    // Worker requests away, and any 4xx or 5xx is printed in red in the
    // console of everyone who opens the lyrics. Not a 502 in any case -
    // Cloudflare swaps that body for its own "error code: 502" page.
    return json({
      found: false,
      reason: "upstream",
      detail: String(err?.message || err),
      song: playing,
    }, 200);
  }

  if (!result.hit) {
    // Only whether plain lyrics exist, never the text itself, so the page can
    // say why nothing was shown.
    return json({ found: false, reason: "no_match", plain: result.plain }, 404);
  }

  return json(shape(result.hit), 200);
}

// Every song my presence says is playing - the agent's and Lanyard's, which
// can differ for a moment while one of them catches up. Asked both at once;
// only if neither answers is that an error.
async function nowPlaying(env) {
  let presenceUrl = DEFAULT_PRESENCE_URL;
  if (env?.PRESENCE_URL) presenceUrl = env.PRESENCE_URL;

  const answers = await Promise.allSettled([
    fromAgent(presenceUrl),
    fromLanyard(),
  ]);

  const songs = [];
  const errors = [];

  for (const answer of answers) {
    if (answer.status === "rejected") {
      errors.push(String(answer.reason?.message || answer.reason));
      continue;
    }

    if (answer.value) songs.push(answer.value);
  }

  if (errors.length === answers.length) {
    throw new Error(errors.join("; "));
  }

  return songs;
}

// Everything the agent reports as listening is music, whichever player.
async function fromAgent(presenceUrl) {
  const res = await fetch(presenceUrl + "/presence", {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`presence responded ${res.status}`);

  const body = await res.json();
  const activities = body?.activities || [];

  const activity = activities.find((a) => a.type === LISTENING);
  return readSong(activity);
}

// The Apple Music activity, read the same way lyrics.js reads it.
async function fromLanyard() {
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
  return readSong(activity);
}

// null when there is no song in it.
function readSong(activity) {
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
