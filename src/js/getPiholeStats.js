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
  frequency: 0.6,
  cached_percent: 61.7,
  sd_status: "ok",
  sd_fs_mode: "rw",
  sd_fs_errors: 0,
  sd_mmc_errors: 0,
  sd_lifetime_writes_gb: 14,
  sd_capacity_gb: 128,
  sd_age_days: 92,
  sd_model: "SanDisk SA128",
  sd_manufactured: "2026-05",
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
// and get a trailing "+", floored so the "+" is always truthful (the real number
// is at least what's shown). Decimal separator follows the visitor's locale.
function abbreviatePiholeNumber(n) {
  n = Number(n) || 0;
  if (n < 1000) return n.toLocaleString();
  const [value, suffix] = n >= 1e6 ? [n / 1e6, "M"] : [n / 1e3, "K"];
  const floored = Math.floor(value * 10) / 10;
  return `${floored.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}+`;
}

// "4.8 GB used of 28 GB", a value under 1 GB is shown in MB ("256 MB used of 4 GB").
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

// Cumulative writes: "14 GB", or "1.3 TB" once it passes 1024 GB.
function formatWrites(gb) {
  const n = Number(gb) || 0;
  return n >= 1024 ? `${(n / 1024).toFixed(1)} TB` : `${Math.round(n)} GB`;
}

// Card age from days: "12d", "3 mo", or "1.4 yr".
function formatAge(days) {
  const d = Math.max(0, Math.floor(Number(days) || 0));
  if (d < 60) return `${d}d`;
  if (d < 730) return `${Math.floor(d / 30.44)} mo`;
  return `${(d / 365.25).toFixed(1)} yr`;
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
  setStat("pi-total", abbreviatePiholeNumber(data.total), full(data.total));
  setStat("pi-blocked", abbreviatePiholeNumber(data.blocked), full(data.blocked));
  setStat("pi-percent", `${Number(data.percent).toFixed(1)}%`);
  setStat("pi-domains", abbreviatePiholeNumber(data.domains_on_lists), full(data.domains_on_lists));
  setStat("pi-clients", abbreviatePiholeNumber(data.clients), full(data.clients));

  // Live query rate (frequency is queries/sec; x60 = queries/min, same as the
  // Pi-hole dashboard) and the cache-hit share of all queries.
  if (data.frequency != null) {
    setStat("pi-qpm", Math.round(Number(data.frequency) * 60).toLocaleString(), "live rate, same as the Pi-hole dashboard");
  }
  if (data.cached_percent != null) setStat("pi-cached", `${Number(data.cached_percent).toFixed(1)}%`);

  // Hardware (elements only exist on the /pihole page)
  if (data.temp_c != null) setStat("pi-temp", `${Number(data.temp_c).toFixed(1)}°C`);
  if (data.cpu_percent != null) setStat("pi-cpu", `${Number(data.cpu_percent).toFixed(1)}%`);
  if (data.ram_percent != null) {
    setStat("pi-ram", `${Math.round(Number(data.ram_percent))}%`,
      data.ram_total_gb != null ? usedOfTotal(data.ram_used_gb, data.ram_total_gb) : undefined);
  }
  if (data.disk_percent != null) {
    setStat("pi-disk", `${Math.round(Number(data.disk_percent))}%`,
      data.disk_total_gb != null ? usedOfTotal(data.disk_used_gb, data.disk_total_gb) : undefined);
  }
  if (data.uptime_seconds != null) setStat("pi-uptime", formatUptime(data.uptime_seconds));

  // SD-card health (elements only exist on the /pihole page). SD cards report no
  // vendor wear data, so the status is a traffic light over readable warning signs,
  // with each underlying signal shown as its own card.
  if (data.sd_status != null) {
    const states = {
      ok: { label: "OK", cls: "status-ok" },
      warning: { label: "WARN", cls: "status-warn" },
      critical: { label: "ERR", cls: "status-crit" },
    };
    const s = states[String(data.sd_status)] || states.ok;

    const statusEl = document.getElementById("pi-sd-status");
    if (statusEl) statusEl.textContent = s.label;
    const card = document.getElementById("pi-health");
    if (card) {
      card.classList.remove("status-ok", "status-warn", "status-crit");
      card.classList.add(s.cls);
    }
  }
  if (data.sd_model != null) setStat("pi-sd-model", data.sd_model || "unknown");
  if (data.sd_fs_mode != null) {
    const ro = data.sd_fs_mode === "ro";
    setStat("pi-sd-mode", ro ? "r/o" : "r/w");
    const modeIcon = document.getElementById("pi-sd-mode-icon");
    if (modeIcon) modeIcon.className = ro
      ? "fa-solid fa-arrow-down-up-lock fa-lg"
      : "fa-solid fa-up-down fa-lg";
  }
  if (data.sd_fs_errors != null) setStat("pi-sd-fserr", `${Number(data.sd_fs_errors) || 0}`);
  if (data.sd_mmc_errors != null) setStat("pi-sd-ioerr", `${Number(data.sd_mmc_errors) || 0}`);
  if (data.sd_lifetime_writes_gb != null) setStat("pi-sd-writes", formatWrites(data.sd_lifetime_writes_gb));
  if (data.sd_capacity_gb != null) setStat("pi-sd-size", `${Math.round(Number(data.sd_capacity_gb))} GB`);
  if (data.sd_age_days != null) setStat("pi-sd-age", formatAge(data.sd_age_days));

  const updatedEl = document.getElementById("pi-updated");
  if (updatedEl) {
    if (example) {
      updatedEl.textContent = "example data (local dev)";
    } else if (data.updated) {
      const mins = Math.max(0, Math.round((Date.now() - data.updated) / 60000));
      updatedEl.textContent = mins === 0 ? "just now" : `${mins} min ago`;
    }
  }

  // Reveal freshly-loaded values (removes the pulsing placeholder state).
  document.querySelectorAll(".pi-loading").forEach((el) => el.classList.remove("pi-loading"));
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
    const errEl = document.getElementById("pi-error");
    if (errEl) errEl.style.display = "block";
  }
}

updatePiholeStats();
// Refresh while the tab is open (the Pi pushes every 15 min; a 5-min poll keeps it fresh).
// Skipped on local dev since the values are static.
if (!PIHOLE_IS_LOCAL) {
  setInterval(updatePiholeStats, 300000);
}
