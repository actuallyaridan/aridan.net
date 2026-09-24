/* One shared connection to Lanyard, for everything that needs my presence. */
(() => {
  "use strict";

  const USER_ID = "701403809129168978";
  const WS_URL = "wss://api.lanyard.rest/socket";
  const APPLE_APP_ID = "773825528921849856";
  const MAX_BACKOFF_MS = 30000;

  const subscribers = new Set();

  let socket = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let attempts = 0;
  let latest = null;
  let wantSnapshot = false;
  let stopped = false;

  let autoUpdate = prefEnabled("autoUpdateActivity");

  function log(...parts) {
    console.log("[Lanyard]", ...parts);
  }

  function warn(...parts) {
    console.warn("[Lanyard]", ...parts);
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

      publish(msg.d || {});
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
      return;
    }

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
  }

  function isAppleMusic(activity) {
    if (!activity) return false;
    if (activity.name === "Apple Music") return true;
    return activity.application_id === APPLE_APP_ID;
  }

  function appleMusic(presence) {
    const activities = presence?.activities || [];
    const found = activities.find(isAppleMusic);
    return found || null;
  }

  /* Two kinds of image reference come back from Discord:
   *
   *   "mp:external/<hash>/https/<host>/<path>"  proxied art, which is how Apple
   *                                             Music covers arrive via Cider
   *   "<asset name>"                            an asset belonging to the app
   *
   * Unusable routes are null, so `art.mzstatic?.(512)` is how to read them.
   */
  function artwork(activity) {
    const image = activity?.assets?.large_image || "";
    if (!image) return null;

    const EXTERNAL = "mp:external/";

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

    // Apple's CDN names the size in the path - .../600x600bb.jpg - so any size can
    // be asked for. It also sends CORS headers, which the Cider host does not.
    const APPLE_SIZE_IN_PATH = /\/(\d+)x\1bb(-\d+)?\.(jpg|png)(\?.*)?$/i;

    function mzstatic(size) {
      return direct.replace(APPLE_SIZE_IN_PATH, "/" + size + "x" + size + "bb$2.$3$4");
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
  }, { once: true });

  window.Lanyard = {
    get autoUpdate() { return autoUpdate; },
    get presence() { return latest; },

    subscribe(fn) {
      subscribers.add(fn);

      // Catch a late subscriber up, so it is not left with a blank card.
      if (latest) fn(latest);

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
