const userID = "701403809129168978";
let lastArtSrc = "";
let lastStatus;
let discordDataLatest;
let webSocket;
let heartbeatInterval;
let reconnectTimeout;

const elements = {
  loadingDiv: document.getElementById("loading"),
  errorMessage: document.getElementById("errorMessage"),
  spinner: document.getElementById("loadingSpinner"),
  contentDiv: document.getElementById("loadedLanyard"),
  lanyardDiscord: document.getElementById("lanyardDiscord"),
  amLanyardDiscord: document.getElementById("amLanyardDiscord"),
  activityLogoLarge: document.getElementById("activityLogoLarge"),
  activityName: document.getElementById("activityName"),
  activityDetails: document.getElementById("activityDetails"),
  activityState: document.getElementById("activityState"),
  amActivityLogoLarge: document.getElementById("amActivityLogoLarge"),
  amActivityName: document.getElementById("amActivityName"),
  amActivityState: document.getElementById("amActivityState"),
  amActivityDetails: document.getElementById("amActivityDetails"),
  amActivityTime: document.getElementById("amActivityTime"),
  amRemaining: document.getElementById("amRemaining"),
  amElapsed: document.getElementById("amElapsed"),
};

["amLanyardDiscord", "discordActivity"].forEach((id) =>
  document.getElementById(id)?.classList.add("activity")
);

function toggleLoading(isLoading) {
  document.querySelectorAll(".activity").forEach((el) => {
    el.classList.toggle("loadingUpdating", isLoading);
    el.querySelector(".smallLoader")?.classList.toggle("showSmallLoader", isLoading);
  });
}

function connectWebSocket() {
  console.log(
    "[Lanyard] Preparing connection to Lanyard WebSocket at wss://api.lanyard.rest/socket..."
  );
  webSocket = new WebSocket("wss://api.lanyard.rest/socket");

  webSocket.onopen = () => {
    console.log("[Lanyard] Ready. Attempting to connect and subscribe...");
    sendMessage({ op: 2, d: { subscribe_to_id: userID } });
  };

  webSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.op === 1) {
      console.log(
        `%c[Lanyard] Successfully subscribed to user ID ${userID}`,
        "color:green;"
      );
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(
        () => sendMessage({ op: 3 }),
        data.d.heartbeat_interval
      );
    } else if (data.op === 0) {
      toggleLoading(true);
      discordDataLatest = data.d;
    }
  };

  webSocket.onerror = (error) => {
    console.error("[Lanyard] Halting on critical WebSocket error:", error);
    webSocket.close();
  };

  webSocket.onclose = () => {
    console.warn("[Lanyard] Lost connection to Lanyard. Reconnecting...");
    clearInterval(heartbeatInterval);
    if (!reconnectTimeout) {
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connectWebSocket();
      }, 3000);
    }
  };
}

function sendMessage(message) {
  if (webSocket?.readyState === WebSocket.OPEN) {
    webSocket.send(JSON.stringify(message));
  } else {
    console.warn("[Lanyard] Connection lost. Unable to recover.");
  }
}

function updateLanyardData() {
  try {
    const discordData = discordDataLatest || {};
    const activities = discordData.activities || [];
    const discordStatus = discordData.discord_status || "";

    updateStatusWrapper(discordStatus);
    updateActivityInfo(activities, discordStatus);

    const musicActivity = activities.find(
      (activity) =>
        activity.name === "Apple Music" ||
        activity.application_id === "773825528921849856"
    );
    if (musicActivity) updateProgressBar(musicActivity.timestamps);

    toggleDisplay(elements.loadingDiv, false);
    toggleDisplay(elements.contentDiv, true);
    toggleDisplay(elements.errorMessage, false);
  } catch (error) {
    handleError(error);
  } finally {
    toggleLoading(false);
  }
}

function updateStatusWrapper(status) {
  if (status === lastStatus) return;
  lastStatus = status;

  document
    .querySelectorAll(".statusWrapper")
    .forEach((el) => el.classList.add("hide"));

  const statusElement = document.getElementById(
    `statusWrapper${capitalizeFirstLetter(status)}`
  );
  statusElement?.classList.remove("hide");
}

function updateActivityInfo(activities, status) {
  toggleDisplay(elements.lanyardDiscord, status === "online");

  let appleMusicActivity = null;
  const otherActivities = activities.filter((activity) => {
    if (
      activity.name === "Apple Music" ||
      activity.application_id === "773825528921849856"
    ) {
      appleMusicActivity = activity;
      return false;
    }
    return true;
  });

  appleMusicActivity
    ? updateAppleMusicInfo(appleMusicActivity)
    : toggleDisplay(elements.amLanyardDiscord, false);

  toggleDisplay(
    document.getElementById("discordActivity"),
    otherActivities.length > 0
  );

  updateActivityImages(otherActivities);
  updateActivityDetails(otherActivities);
}

function updateActivityImages(activities) {
  const hasImage = activities.some((activity) => activity.assets?.large_image);
  toggleDisplay(elements.activityLogoLarge, hasImage);

  activities.forEach((activity) => {
    if (activity.assets?.large_image) {
      updateImage(
        elements.activityLogoLarge,
        activity.assets.large_image,
        activity.application_id,
        activity.assets.large_text
      );
    }
  });
}

function updateActivityDetails(activities) {
  if (!activities.length) {
    [
      elements.activityName,
      elements.activityDetails,
      elements.activityState,
    ].forEach((el) => toggleDisplay(el, false));
    return;
  }

  const activity = activities[0];
  updateElementText(elements.activityName, activity.name);
  updateElementText(
    elements.activityDetails,
    activity.details || "No details available"
  );
  updateElementText(elements.activityState, activity.state || "");

  updateActivityTime(activity.timestamps);
}

function updateAppleMusicInfo(activity) {
  toggleDisplay(elements.amLanyardDiscord, true);

  /* ── artwork ── */
  if (activity.assets) {
    updateImage(
      elements.amActivityLogoLarge,
      activity.assets.large_image,
      activity.application_id,
      activity.assets.large_text
    );
  }

  /* ── text ── */
  updateElementText(elements.amActivityName,    activity.name);
  updateElementText(elements.amActivityState,   formatActivityState(activity.state));
  updateElementText(elements.amActivityDetails, activity.details);

  /* ── time + progress ── */
  updateActivityTime(activity.timestamps, "am");
  updateProgressBar(activity.timestamps);

  /* ▼ resolve the track → URL and wire the badge ▼ */
refreshAppleMusicLink(
  activity.details,                 // title
  activity.state,                   // artist
  activity.assets?.large_text,      // album  (can be undefined)
  activity.assets?.large_image      // artwork URL so the ID‑lookup works
);
}

function updateProgressBar(timestamps) {
  const progressBar = document.getElementById("amProgressBar");
  if (!progressBar) return;

  if (!timestamps?.start || !timestamps?.end) {
    progressBar.style.width = "0%";
    return;
  }

  const now = Date.now();
  const startTime = new Date(timestamps.start).getTime();
  const endTime = new Date(timestamps.end).getTime();

  if (now < startTime) {
    progressBar.style.width = "0%";
  } else if (now > endTime) {
    progressBar.style.width = "100%";
  } else {
    const duration = endTime - startTime;
    const elapsed = now - startTime;
    const percentage = (elapsed / duration) * 100;
    progressBar.style.width = `${percentage}%`;
  }


  // Keep screen readers informed of current progress (0-100)
  const ariaValue = parseFloat(progressBar.style.width) || 0;
  progressBar.setAttribute("aria-valuenow", ariaValue.toFixed(0));
}

function updateActivityTime(timestamps, prefix = "") {
  const now = new Date();
  const timeElem = document.getElementById(`${prefix}ActivityTime`);
  const remainingElem = document.getElementById(`${prefix}Remaining`);
  const elapsedElem = document.getElementById(`${prefix}Elapsed`);

  const timeData = timestamps?.end
    ? calculateTimeDifference(new Date(timestamps.end), now)
    : timestamps?.start
      ? calculateTimeDifference(now, new Date(timestamps.start))
      : null;

  updateElementText(timeElem, timeData ? formatTime(timeData) : "-:-");
  toggleTimeDisplay(remainingElem, elapsedElem, !!timestamps?.end);
}

function calculateTimeDifference(end, start) {
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return {
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}

function formatTime({ hours, minutes, seconds }) {
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

// ────────────────────────────────────────────────────────────────
// High‑resolution Apple Music artwork with signed‑CDN fallback
// ────────────────────────────────────────────────────────────────
const HIGH_RES = 512;

/**
 * Returns the *preferred* (highest‑quality) image URL.
 *  • Apple Music → direct Apple artwork scaled to HIGH_RES.
 *  • Anything else → Discord CDN at HIGH_RES.
 */
function getImageUrl(image, appId, size = HIGH_RES) {
  if (image.includes("external")) {
    // strip Discord signature → https://is1-ssl.mzstatic.com/…
    const rawApple = "https://" + image.split("/https/")[1];
    // swap the trailing 96x96bb.jpg part for e.g. 512x512bb.jpg
    return rawApple.replace(/\/\d+x\d+bb(-\d+)?\./, `/${size}x${size}bb$1.`);
  }
  // default Discord artwork
  return `https://cdn.discordapp.com/app-assets/${appId}/${image}.png?size=${size}`;
}

/**
 * Same signature as before, but now:
 * 1. tries the high‑res URL,
 * 2. falls back to Discord’s signed proxy if that 404s,
 * 3. logs the fallback so you can spot problem albums quickly.
 */
function updateImage(element, image, appId, details = "") {
  if (!image) {
    element.style.display = "none";
    return;
  }

  const hiRes   = getImageUrl(image, appId);
  const fallback = image.includes("external")
    ? `https://media.discordapp.net/external/${image.split("mp:external/")[1]}?width=${HIGH_RES}&height=${HIGH_RES}&quality=lossless`
    : hiRes;

  /* ── bail out early if we’re already showing this artwork ── */
  if (hiRes === lastArtSrc || fallback === lastArtSrc) return;

  /* ── log success once ── */
  element.onload = function () {
    if (this.src === hiRes) {
      console.info("[Lanyard] Using high‑res art");
    } else {
      console.info("[Lanyard] Using fallback art");
    }
    lastArtSrc = this.src;      // remember what we ended up with
    this.onload = null;         // clean up
  };

  /* ── fall back if hi‑res fails ── */
  element.onerror = function () {
    if (this.src !== fallback) {
      console.warn("[Lanyard] Falling back to signed Discord art:");
      this.onerror = null;
      this.src = fallback;
    }
  };

  element.src   = hiRes;        // start loading
  element.alt   = details || image;
  element.title = details || image;
  element.style.display = "block";
}

function updateElementText(element, text) {
  if (element) element.textContent = text;
  toggleDisplay(element, !!text);
}

function toggleTimeDisplay(remainingElem, elapsedElem, isRemaining) {
  if (remainingElem) remainingElem.classList.toggle("hide", !isRemaining);
  if (elapsedElem) elapsedElem.classList.toggle("hide", isRemaining);
}


function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pad(num) {
  return num.toString().padStart(2, "0");
}

function toggleDisplay(element, show) {
  if (element) element.style.display = show ? "flex" : "none";
}

function formatActivityState(state) {
  const byRegex = /by\s*(?:\(.*\)|[^)]+)/;
  return byRegex.test(state) ? state.replace(/by\s+/, "") : state;
}

function handleError(error) {
  console.error("Error:", error);
  elements.errorMessage.textContent = `An error occurred: ${error.message || error
    }`;
  toggleDisplay(elements.spinner, false);
  toggleDisplay(elements.contentDiv, false);
  toggleDisplay(elements.errorMessage, true);
}


// Adds ARIA roles/attributes so assistive technologies announce live updates.
// This runs once, right before the WebSocket connection is established.

function initAccessibility() {
  // Status wrappers announce presence changes
  document.querySelectorAll(".statusWrapper").forEach((el) => {
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
  });

  // Activity large icons
  if (elements.activityLogoLarge)
    elements.activityLogoLarge.setAttribute(
      "alt",
      "Discord activity icon"
    );
  if (elements.amActivityLogoLarge)
    elements.amActivityLogoLarge.setAttribute(
      "alt",
      "Album art"
    );

  // Progress bar for Apple Music track
  const prog = document.getElementById("progressBar");
  if (prog) {
    prog.setAttribute("role", "progressbar");
    prog.setAttribute("aria-valuemin", "0");
    prog.setAttribute("aria-valuemax", "100");
    prog.setAttribute("aria-valuenow", "0");
  }
}

if (document.querySelector(".discordWrapper")) {  initAccessibility();

  connectWebSocket();
  setInterval(updateLanyardData, 1000);
}

/* cache the last successful href so we don’t hammer the API */
let lastAppleHref = "";

/* helper — derive the visitor’s storefront once */
function getStorefront() {
  return (navigator.languages?.[0] || navigator.language || "us")
    .slice(-2)          // "sv‑SE" → "se"
    .toLowerCase();     // Apple wants lowercase
}

/**
 * Resolve (title, artist, album, artworkURL) → Apple Music link
 * 1. Precise track/album link via Apple’s APIs.
 * 2. Otherwise a storefront‑aware search URL (deep‑link friendly on iOS).
 */
async function refreshAppleMusicLink(title, artist, album, artworkURL) {
  const badge = document.getElementById("apple-link");
  if (!badge) return;

  /* storefront once per call */
  const storefront = getStorefront();        // "se", "us", …
  const country    = storefront.toUpperCase(); // API needs "SE", "US", …

  /* quick normaliser */
  const norm = (s) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const titleN   = norm(title);
  const artistsN = norm(artist)
    .split(/,|&|feat\.?|featuring|with/)
    .map((a) => a.trim())
    .filter(Boolean);

  let href = "";

  /* ── 1. ID‑lookup (artwork URL contains a numeric Apple ID) ───────── */
  const idMatch = artworkURL?.match(/\/(\d{8,})\.jpg/); // 8+ digits before .jpg
  if (idMatch) {
    try {
      const res   = await fetch(
        `https://itunes.apple.com/lookup?id=${idMatch[1]}&country=${country}&entity=song`
      );
      const { results } = await res.json();

      for (const r of results) {
        if (r.wrapperType !== "track") continue;
        if (norm(r.trackName) !== titleN) continue;
        const artistN = norm(r.artistName);
        if (artistsN.every((a) => artistN.includes(a))) {
          href = r.trackViewUrl;
          break;
        }
      }
      if (!href && results[0]?.trackViewUrl) href = results[0].trackViewUrl;
    } catch (e) {
      console.warn("[Lanyard] Apple ID lookup failed:", e);
    }
  }

  /* ── 2. Text‑search fallback (title → candidate tracks) ───────────── */
  if (!href) {
    const api = `https://itunes.apple.com/search?term=${encodeURIComponent(
      title
    )}&entity=song&attribute=songTerm&limit=25&country=${country}`;
    try {
      const res   = await fetch(api);
      const { results } = await res.json();

      for (const r of results) {
        if (norm(r.trackName) !== titleN) continue;
        const artistN = norm(r.artistName);
        if (artistsN.every((a) => artistN.includes(a))) {
          href = r.trackViewUrl;
          break;
        }
      }

      /* album‑search backup (if we still haven’t matched) */
      if (!href && album) {
        const api2 = `https://itunes.apple.com/search?term=${encodeURIComponent(
          album
        )}&entity=album&attribute=albumTerm&limit=5&country=${country}`;
        const res2     = await fetch(api2);
        const { results: albums } = await res2.json();

        for (const alb of albums) {
          const artistN = norm(alb.artistName);
          if (!artistsN.every((a) => artistN.includes(a))) continue;

          const res3  = await fetch(
            `https://itunes.apple.com/lookup?id=${alb.collectionId}&entity=song&country=${country}`
          );
          const { results: tracks } = await res3.json();
          const track = tracks.find(
            (t) =>
              t.wrapperType === "track" && norm(t.trackName) === titleN
          );
          if (track) {
            href = track.trackViewUrl;
            break;
          }
        }
      }
    } catch (e) {
      console.warn("[Lanyard] Apple search fallback failed:", e);
    }
  }

  /* ── 3. FINAL fallback: storefront‑aware /search deep link ─────────── */
  if (!href) {
    const query = [title, artist, album]
      .filter(Boolean)
      .join(" ")
      .replace(/\+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map(encodeURIComponent)
      .join("%20");

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    const base = isIOS
      ? "https://music.apple.com/search"              // iOS deep‑link handler
      : `https://music.apple.com/${storefront}/search`; // avoid redirect

    href = `${base}?term=${query}`;
  }

  /* ── 4. Safety net: ensure storefront in finished URLs ─────────────── */
  if (href.startsWith("https://music.apple.com/")) {
    href = href.replace(
      /music\.apple\.com\/[a-z]{2}\//,
      `music.apple.com/${storefront}/`
    );
  }

  /* ── 5. Wire the badge if the link changed ─────────────────────────── */
  if (href && href !== lastAppleHref) {
    badge.href = href;
    lastAppleHref = href;
  }
}
