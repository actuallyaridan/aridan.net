// Fetches aggregate Pi-hole stats from the site's own /api/stats endpoint
// (backed by a Cloudflare KV store that the Pi-hole pushes to) and fills in
// any matching elements on the page. Safe to include on any page - it only
// touches elements that exist.

// Example data used ONLY on a local dev host (localhost / 127.0.0.1), where the
// Cloudflare Function isn't running so /api/stats can't be reached. Production
// is never affected - it always uses the live API.
const EXAMPLE_STATS = {
  total: 1756845,
  blocked: 272765,
  percent: 15.53,
  domains_on_lists: 1907467,
  clients: 5,
  temp_c: 48.3,
  cpu_percent: 0.6,
  ram_percent: 6,
  ram_used_gb: 0.25,
  ram_total_gb: 4,
  disk_percent: 17,
  disk_used_gb: 4.8,
  disk_total_gb: 28,
  uptime_seconds: 442800,
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

// Abbreviates large numbers: 1907467 -> "1.9M+", 25517 -> "25.5K+", 5 -> "5".
// Anything under 1000 is shown in full. Values >= 1000 are floored to one decimal
// and get a trailing "+" — floored so the "+" is always truthful (the real number
// is at least what's shown). Decimal separator follows the visitor's locale.
function abbreviatePiholeNumber(n) {
  n = Number(n) || 0;
  if (n < 1000) return n.toLocaleString();
  const [value, suffix] = n >= 1e6 ? [n / 1e6, "M"] : [n / 1e3, "K"];
  const floored = Math.floor(value * 10) / 10;
  return `${floored.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}+`;
}

// "4.8 GB used of 28 GB" — a value under 1 GB is shown in MB ("256 MB used of 4 GB").
function formatSize(gb) {
  const n = Number(gb) || 0;
  return n < 1 ? `${Math.round(n * 1024)} MB` : `${n} GB`;
}
function usedOfTotal(usedGb, totalGb) {
  return `${formatSize(usedGb)} used of ${formatSize(totalGb)}`;
}

// Compact uptime: "5d 3h", "3h 20m", or "12m".
function formatUptime(seconds) {
  const s = Math.floor(Number(seconds) || 0);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function renderPiholeStats(data, { example = false } = {}) {
  // Shows the abbreviated value on screen, with the exact number as a hover tooltip.
  const setStat = (id, text, fullTitle) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (fullTitle != null) el.title = fullTitle;
  };

  const full = (n) => Number(n).toLocaleString();
  setStat("ph-total", abbreviatePiholeNumber(data.total), full(data.total));
  setStat("ph-blocked", abbreviatePiholeNumber(data.blocked), full(data.blocked));
  setStat("ph-percent", `${Number(data.percent).toFixed(1)}%`);
  setStat("ph-domains", abbreviatePiholeNumber(data.domains_on_lists), full(data.domains_on_lists));
  setStat("ph-clients", abbreviatePiholeNumber(data.clients), full(data.clients));

  // Hardware (elements only exist on the /pihole page)
  if (data.temp_c != null) setStat("ph-temp", `${Number(data.temp_c).toFixed(1)}°C`);
  if (data.cpu_percent != null) setStat("ph-cpu", `${Number(data.cpu_percent).toFixed(1)}%`);
  if (data.ram_percent != null) {
    setStat("ph-ram", `${Math.round(Number(data.ram_percent))}%`,
      data.ram_total_gb != null ? usedOfTotal(data.ram_used_gb, data.ram_total_gb) : undefined);
  }
  if (data.disk_percent != null) {
    setStat("ph-disk", `${Math.round(Number(data.disk_percent))}%`,
      data.disk_total_gb != null ? usedOfTotal(data.disk_used_gb, data.disk_total_gb) : undefined);
  }
  if (data.uptime_seconds != null) setStat("ph-uptime", formatUptime(data.uptime_seconds));

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
// Refresh while the tab is open (the Pi pushes every 15 min; a 5-min poll keeps it fresh).
// Skipped on local dev since the values are static.
if (!PIHOLE_IS_LOCAL) {
  setInterval(updatePiholeStats, 300000);
}
