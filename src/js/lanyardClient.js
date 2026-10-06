/* One shared view of my presence, for everything that needs it.
 *
 * It comes from two places at once:
 *
 *   Lanyard              what Discord knows: my status, and activity from
 *                        anything that reports to Discord. Needs Discord open.
 *   presence.aridan.net  what the aridan-presence agent on my computers
 *                        reports: music from Cider or Now Playing, and game
 *                        activity while Discord is closed.
 *
 * The two are merged into one Lanyard-shaped presence, so nothing that
 * subscribes has to know there are two. Where both know about the same
 * thing, Discord wins: its covers go through Discord's proxy, animated ones
 * included, and it hears about a new song the moment it starts. The agent
 * fills in what Discord does not know, which with Discord closed is all of it.
 */
(() => {
  "use strict";

  const USER_ID = "701403809129168978";
  const WS_URL = "wss://api.lanyard.rest/socket";
  const APPLE_APP_ID = "773825528921849856";
  const MAX_BACKOFF_MS = 30000;

  const LISTENING = 2;

  // Cloudflare answers these itself without waking the Worker, so they cost
  // nothing; they are only there to notice a dead connection.
  const AGENT_PING_MS = 30000;

  const subscribers = new Set();

  let socket = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let attempts = 0;
  let latest = null;

  // The last word from each side, kept apart so either can be merged with
  // the other's newest.
  let fromLanyard = null;
  let fromAgent = null;

  let agentSocket = null;
  let agentPingTimer = null;
  let agentReconnectTimer = null;
  let agentAttempts = 0;
  let wantSnapshot = false;
  let stopped = false;

  let autoUpdate = prefEnabled("autoUpdateActivity");

  function log(...parts) {
    debug.log("[Lanyard]", ...parts);
  }

  function warn(...parts) {
    debug.warn("[Lanyard]", ...parts);
  }

  function publishMerged() {
    publish(merge(fromLanyard, fromAgent));
  }

  function publish(presence) {
    latest = presence;

    for (const notify of subscribers) {
      try {
        notify(presence);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function send(payload) {
    if (!socket) return;
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }

  function connect() {
    if (stopped || socket) return;
    log("Connecting to", WS_URL);

    try {
      socket = new WebSocket(WS_URL);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      attempts = 0;
      send({ op: 2, d: { subscribe_to_id: USER_ID } });
    };

    socket.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        warn("Ignoring unreadable message");
        return;
      }

      if (msg.op === 1) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => send({ op: 3 }), msg.d.heartbeat_interval);
        return;
      }

      if (msg.op !== 0) return;

      fromLanyard = msg.d || {};
      publishMerged();
      if (!autoUpdate) {
        wantSnapshot = false;
        disconnect();
      }
    };

    socket.onerror = (e) => warn("Socket error", e);

    socket.onclose = () => {
      socket = null;
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      if (autoUpdate || wantSnapshot) scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;

    // 1s, 2s, 4s, 8s... The random extra stops every open tab retrying on one tick.
    const doubling = 1000 * (2 ** attempts);
    const capped = Math.min(MAX_BACKOFF_MS, doubling);
    const jitter = Math.floor(Math.random() * 500);
    const delay = capped + jitter;

    warn("Lost the connection. Retrying in " + Math.round(delay / 1000) + "s.");

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      attempts++;
      connect();
    }, delay);
  }

  // Clearing the handlers first stops onclose booking a reconnect for a
  // socket we closed on purpose.
  function disconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;

    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;

      try {
        socket.close();
      } catch {
      }

      socket = null;
    }
  }

  function applyMode() {
    if (autoUpdate) {
      wantSnapshot = false;
      connect();
      connectAgent();
      return;
    }

    // Live updates off: one look at the agent's side, the same as Lanyard's.
    disconnectAgent();
    if (!fromAgent) fetchAgentSnapshot();

    if (latest) {
      wantSnapshot = false;
      disconnect();
    } else {
      wantSnapshot = true;
      connect();
    }
  }

  function refresh() {
    if (stopped) return;
    wantSnapshot = true;
    attempts = 0;
    disconnect();
    connect();
    fetchAgentSnapshot();
  }

  /* ---------- presence.aridan.net ---------- */

  // In production, the Worker's own hostname. On this computer or the LAN,
  // .claude/dev-server.js passes /__presence through to a local Worker, so
  // testing never touches the real one.
  function agentBase() {
    const host = location.hostname;

    let local = false;
    if (host === "localhost" || host === "127.0.0.1") local = true;
    if (host.startsWith("192.168.") || host.startsWith("10.")) local = true;
    if (host.endsWith(".local")) local = true;

    if (local) return location.origin + "/__presence";
    return "https://presence.aridan.net";
  }

  function connectAgent() {
    if (stopped || agentSocket) return;

    const url = agentBase().replace(/^http/, "ws") + "/";
    log("Connecting to", url);

    try {
      agentSocket = new WebSocket(url);
    } catch {
      scheduleAgentReconnect();
      return;
    }

    agentSocket.onopen = () => {
      agentAttempts = 0;

      clearInterval(agentPingTimer);
      agentPingTimer = setInterval(() => {
        if (agentSocket?.readyState === WebSocket.OPEN) agentSocket.send("ping");
      }, AGENT_PING_MS);
    };

    agentSocket.onmessage = (event) => {
      if (event.data === "pong") return;

      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        warn("Ignoring unreadable message from the agent feed");
        return;
      }

      if (msg.op !== "presence") return;

      fromAgent = msg.d || null;
      publishMerged();
    };

    agentSocket.onclose = () => {
      agentSocket = null;
      clearInterval(agentPingTimer);
      agentPingTimer = null;
      if (autoUpdate) scheduleAgentReconnect();
    };
  }

  // The same backoff as Lanyard's, kept separate so one side being down does
  // not slow the other's retries.
  function scheduleAgentReconnect() {
    if (stopped || agentReconnectTimer) return;

    const doubling = 1000 * (2 ** agentAttempts);
    const capped = Math.min(MAX_BACKOFF_MS, doubling);
    const jitter = Math.floor(Math.random() * 500);
    const delay = capped + jitter;

    agentReconnectTimer = setTimeout(() => {
      agentReconnectTimer = null;
      agentAttempts++;
      connectAgent();
    }, delay);
  }

  function disconnectAgent() {
    clearTimeout(agentReconnectTimer);
    agentReconnectTimer = null;
    clearInterval(agentPingTimer);
    agentPingTimer = null;

    if (agentSocket) {
      agentSocket.onopen = null;
      agentSocket.onmessage = null;
      agentSocket.onclose = null;

      try {
        agentSocket.close();
      } catch {
      }

      agentSocket = null;
    }
  }

  function fetchAgentSnapshot() {
    fetch(agentBase() + "/presence", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then((body) => {
        fromAgent = body;
        publishMerged();
      })
      .catch((err) => warn("Could not read the agent feed", err));
  }

  /* ---------- Merging the two ---------- */

  // Lanyard's presence, with whatever the agent knows that Discord does not
  // added after it. The agent's music goes when Discord has music, since both
  // are describing the same song. Anything else both report is kept once,
  // Discord's copy.
  //
  // Cider names its activity "Apple Music" but does not always mark it as
  // listening, which is why isAppleMusic() is asked as well as the type.
  function merge(lanyard, agent) {
    const base = lanyard || {};
    const fromDiscord = base.activities || [];
    const own = agent?.activities || [];

    if (!own.length) {
      if (!lanyard) return { activities: [] };
      return lanyard;
    }

    let discordHasMusic = false;
    for (const activity of fromDiscord) {
      if (activity.type === LISTENING || isAppleMusic(activity)) {
        discordHasMusic = true;
      }
    }

    const extra = [];
    for (const activity of own) {
      if (discordHasMusic && activity.type === LISTENING) continue;
      if (fromDiscord.some((theirs) => sameApp(theirs, activity))) continue;

      extra.push(activity);
    }

    return { ...base, activities: fromDiscord.concat(extra) };
  }

  function sameApp(a, b) {
    if (a.application_id && a.application_id === b.application_id) return true;
    return a.name === b.name;
  }

  // "Apple Music" is really "the music card": anything the agent reports as
  // listening goes there too, Spotify or a browser included, since it is
  // filled in the same way - song, artist, album.
  function isAppleMusic(activity) {
    if (!activity) return false;
    if (activity.name === "Apple Music") return true;
    if (activity.source && activity.type === LISTENING) return true;
    return activity.application_id === APPLE_APP_ID;
  }

  function appleMusic(presence) {
    const activities = presence?.activities || [];
    const found = activities.find(isAppleMusic);
    return found || null;
  }

  /* Three kinds of image reference come back:
   *
   *   "mp:external/<hash>/https/<host>/<path>"  proxied art, which is how Apple
   *                                             Music covers arrive via Cider
   *   "<asset name>"                            an asset belonging to the app
   *   "https://..."                             a plain address, which is how
   *                                             the agent sends every image
   *
   * Unusable routes are null, so `art.mzstatic?.(512)` is how to read them.
   */
  function artwork(activity) {
    const image = activity?.assets?.large_image || "";
    if (!image) return null;

    const EXTERNAL = "mp:external/";

    // Apple's CDN names the size in the path - .../600x600bb.jpg, or sr
    // instead of bb - so any size can be asked for. It also sends CORS
    // headers, which the Cider host does not.
    const APPLE_SIZE_IN_PATH = /\/(\d+)x\1(bb|sr)(-\d+)?\.(jpg|png)(\?.*)?$/i;

    function resizeApple(url, size) {
      return url.replace(APPLE_SIZE_IN_PATH, "/" + size + "x" + size + "$2$3.$4$5");
    }

    // There is no Discord proxy hash for these, so Apple covers are sized
    // through their own path, and anything else - Spotify's CDN, a game's
    // icon - is used as it is, at whatever size it comes.
    if (image.startsWith("https://")) {
      if (image.includes("mzstatic.com/")) {
        return {
          proxy: null,
          direct: image,
          mzstatic: (size) => resizeApple(image, size),
          appAsset: null,
        };
      }

      return {
        proxy: null,
        direct: image,
        mzstatic: null,
        appAsset: () => image,
      };
    }

    if (!image.startsWith(EXTERNAL)) {
      const appId = activity.application_id;
      if (!appId) return null;
      return {
        proxy: null,
        direct: "",
        mzstatic: null,
        appAsset: (size) =>
          `https://cdn.discordapp.com/app-assets/${appId}/${image}.png?size=${size}`,
      };
    }

    // Splitting on the "/https/" in the middle leaves the real address behind.
    const parts = image.split(/\/https?\//);
    const tail = parts[1];

    let direct = "";
    if (tail) direct = "https://" + tail;

    const isApple = direct.includes("mzstatic.com/");
    const hash = image.slice(EXTERNAL.length);

    function proxy(size, extra = "") {
      return "https://media.discordapp.net/external/" + hash +
        "?width=" + size + "&height=" + size + extra;
    }

    function mzstatic(size) {
      return resizeApple(direct, size);
    }

    return {
      proxy: proxy,
      direct: direct,
      mzstatic: isApple ? mzstatic : null,
      appAsset: null,
    };
  }

  window.addEventListener("settings:change", (event) => {
    const detail = event.detail || {};
    if (detail.key !== "autoUpdateActivity") return;

    autoUpdate = !!detail.value;
    applyMode();
  });

  // A backgrounded tab has its timers throttled, so the heartbeat can be late
  // enough for the server to hang up. Pinging on the way back surfaces a dead
  // socket at once rather than at the next missed beat.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) send({ op: 3 });
  });

  window.addEventListener("beforeunload", () => {
    stopped = true;
    disconnect();
    disconnectAgent();
  }, { once: true });

  window.Lanyard = {
    get autoUpdate() { return autoUpdate; },
    get presence() { return latest; },

    subscribe(fn) {
      subscribers.add(fn);

      // Catch a late subscriber up, so it is not left with a blank card - but
      // only once the script subscribing has finished running. lanyard.js
      // subscribes near its top and declares what its handler needs further
      // down, so calling it right here, when a presence has already arrived,
      // ran the handler before those existed.
      if (latest) {
        queueMicrotask(() => {
          if (subscribers.has(fn)) fn(latest);
        });
      }

      return function unsubscribe() {
        subscribers.delete(fn);
      };
    },

    refresh,
    isAppleMusic,
    appleMusic,
    artwork,
  };

  applyMode();
})();
