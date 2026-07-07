// Fetches aggregate Pi-hole stats from the site's own /api/stats endpoint
// (backed by a Cloudflare KV store that the Pi-hole pushes to) and fills in
// any matching elements on the page. Safe to include on any page - it only
// touches elements that exist.

// Example data used ONLY on a local dev host (localhost / 127.0.0.1), where the
// Cloudflare Function isn't running so /api/stats can't be reached. Production
// is never affected - it always uses the live API.
const EXAMPLE_STATS = {
  total: 25333,
  blocked: 2453,
  percent: 9.68,
  domains_on_lists: 1907467,
  clients: 5,
};

// True for any local/dev host: localhost, .local/.lan hostnames, IPv6 loopback,
// or a private/loopback/link-local IPv4 (so a phone hitting the dev server by its
// LAN IP, e.g. 192.168.x.x, also gets the example data instead of an error).
function isPiholeLocalHost() {
  const h = location.hostname;
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".lan")) return true;
  if (h === "::1") return true;

  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 127) return true;                        // loopback   127.0.0.0/8
    if (a === 10) return true;                         // private    10.0.0.0/8
    if (a === 192 && b === 168) return true;           // private    192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true;  // private    172.16.0.0/12
    if (a === 169 && b === 254) return true;           // link-local 169.254.0.0/16
    if (a === 0) return true;                          // 0.0.0.0
  }
  return false;
}

const PIHOLE_IS_LOCAL = isPiholeLocalHost();

function renderPiholeStats(data, { example = false } = {}) {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("ph-total", Number(data.total).toLocaleString());
  setText("ph-blocked", Number(data.blocked).toLocaleString());
  setText("ph-percent", `${Number(data.percent).toFixed(1)}%`);
  setText("ph-domains", Number(data.domains_on_lists).toLocaleString());
  setText("ph-clients", Number(data.clients).toLocaleString());

  const updatedEl = document.getElementById("ph-updated");
  if (updatedEl) {
    if (example) {
      updatedEl.textContent = "example data (local dev)";
    } else if (data.updated) {
      const mins = Math.max(0, Math.round((Date.now() - data.updated) / 60000));
      updatedEl.textContent = mins === 0 ? "just now" : `${mins} min ago`;
    }
  }

  // Reveal freshly-loaded values (removes the pulsing placeholder state).
  document.querySelectorAll(".ph-loading").forEach((el) => el.classList.remove("ph-loading"));
}

async function updatePiholeStats() {
  // Local development: no Function to hit, so render the example data instead.
  if (PIHOLE_IS_LOCAL) {
    renderPiholeStats(EXAMPLE_STATS, { example: true });
    return;
  }

  try {
    const response = await fetch("/api/stats", { cache: "no-store" });

    if (response.status === 503) {
      // KV has no data yet (Pi hasn't pushed, or just set up). Leave placeholders.
      console.warn("Pi-hole stats not available yet.");
      return;
    }
    if (!response.ok) throw new Error(`stats API error: ${response.status}`);

    const data = await response.json();
    renderPiholeStats(data);
  } catch (error) {
    console.error("Failed to fetch Pi-hole stats:", error);
    const errEl = document.getElementById("ph-error");
    if (errEl) errEl.style.display = "block";
  }
}

updatePiholeStats();
// Refresh while the tab is open (the Pi pushes every ~5 min; a 60s poll keeps it fresh).
// Skipped on local dev since the values are static.
if (!PIHOLE_IS_LOCAL) {
  setInterval(updatePiholeStats, 60000);
}
