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

// The Pi-hole is only reachable from inside my own network; everywhere else gets
// the example numbers above.
function isPiholeLocalHost() {
  const host = location.hostname;

  if (!host) return true;
  if (host === "localhost") return true;
  if (host === "::1") return true;
  if (host.endsWith(".local")) return true;
  if (host.endsWith(".lan")) return true;

  const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const parts = host.match(IPV4);
  if (!parts) return false;

  const first = Number(parts[1]);
  const second = Number(parts[2]);

  if (first === 0) return true;
  if (first === 127) return true;                           // loopback
  if (first === 10) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 169 && second === 254) return true;         // link-local

  return false;
}

const PIHOLE_IS_LOCAL = isPiholeLocalHost();

// Rounded down, hence the "+", so the headline is never larger than the truth.
function abbreviatePiholeNumber(n) {
  const value = Number(n) || 0;

  if (value < 1000) return value.toLocaleString();

  let scaled;
  let suffix;

  if (value >= 1000000) {
    scaled = value / 1000000;
    suffix = "M";
  } else {
    scaled = value / 1000;
    suffix = "K";
  }

  const floored = Math.floor(scaled * 10) / 10;

  const text = floored.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return text + suffix + "+";
}

function formatSize(gb) {
  const n = Number(gb) || 0;

  if (n < 1) return Math.round(n * 1024) + " MB";
  return n + " GB";
}

function usedOfTotal(usedGb, totalGb) {
  return formatSize(usedGb) + " used of " + formatSize(totalGb);
}

// Only the two largest units, so five days shows as "5d 3h".
function formatUptime(seconds) {
  const total = Math.floor(Number(seconds) || 0);

  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (days > 0) return days + "d " + hours + "h";
  if (hours > 0) return hours + "h " + minutes + "m";
  return minutes + "m";
}

function formatWrites(gb) {
  const n = Number(gb) || 0;

  if (n >= 1024) return (n / 1024).toFixed(1) + " TB";
  return Math.round(n) + " GB";
}

function formatAge(days) {
  const d = Math.max(0, Math.floor(Number(days) || 0));

  if (d < 60) return d + "d";
  if (d < 730) return Math.floor(d / 30.44) + " mo";
  return (d / 365.25).toFixed(1) + " yr";
}

function renderPiholeStats(data, { example = false } = {}) {
  function setStat(id, text, fullTitle) {
    const el = document.getElementById(id);
    if (!el) return;

    el.textContent = text;
    if (fullTitle != null) el.title = fullTitle;
  }

  function full(n) {
    return Number(n).toLocaleString();
  }
  setStat("pi-total", abbreviatePiholeNumber(data.total), full(data.total));
  setStat("pi-blocked", abbreviatePiholeNumber(data.blocked), full(data.blocked));
  setStat("pi-percent", `${Number(data.percent).toFixed(1)}%`);
  setStat("pi-domains", abbreviatePiholeNumber(data.domains_on_lists), full(data.domains_on_lists));
  setStat("pi-clients", abbreviatePiholeNumber(data.clients), full(data.clients));

  if (data.frequency != null) {
    // The API reports queries per second; the card shows per minute.
    const perMinute = Math.round(Number(data.frequency) * 60);
    setStat("pi-qpm", perMinute.toLocaleString(), "live rate, same as the Pi-hole dashboard");
  }
  if (data.cached_percent != null) {
    setStat("pi-cached", Number(data.cached_percent).toFixed(1) + "%");
  }

  if (data.temp_c != null) {
    setStat("pi-temp", Number(data.temp_c).toFixed(1) + "\u00b0C");
  }

  if (data.cpu_percent != null) {
    setStat("pi-cpu", Number(data.cpu_percent).toFixed(1) + "%");
  }

  if (data.ram_percent != null) {
    let hover;
    if (data.ram_total_gb != null) {
      hover = usedOfTotal(data.ram_used_gb, data.ram_total_gb);
    }
    setStat("pi-ram", Math.round(Number(data.ram_percent)) + "%", hover);
  }

  if (data.disk_percent != null) {
    let hover;
    if (data.disk_total_gb != null) {
      hover = usedOfTotal(data.disk_used_gb, data.disk_total_gb);
    }
    setStat("pi-disk", Math.round(Number(data.disk_percent)) + "%", hover);
  }
  if (data.uptime_seconds != null) setStat("pi-uptime", formatUptime(data.uptime_seconds));

  if (data.sd_status != null) {
    const states = {
      ok: { label: "OK", cls: "status-ok" },
      warning: { label: "WARN", cls: "status-warn" },
      critical: { label: "ERR", cls: "status-crit" },
    };

    const state = states[String(data.sd_status)] || states.ok;

    const statusEl = document.getElementById("pi-sd-status");
    if (statusEl) statusEl.textContent = state.label;

    // All three come off first, so no stale colour class is left behind.
    const card = document.getElementById("pi-health");
    if (card) {
      card.classList.remove("status-ok", "status-warn", "status-crit");
      card.classList.add(state.cls);
    }
  }
  if (data.sd_model != null) setStat("pi-sd-model", data.sd_model || "unknown");
  // Read only usually means a disk error, so it gets a padlock instead of arrows.
  if (data.sd_fs_mode != null) {
    const readOnly = data.sd_fs_mode === "ro";

    if (readOnly) {
      setStat("pi-sd-mode", "r/o");
    } else {
      setStat("pi-sd-mode", "r/w");
    }

    const modeIcon = document.getElementById("pi-sd-mode-icon");
    if (modeIcon) {
      if (readOnly) {
        modeIcon.className = "fa-solid fa-arrow-down-up-lock fa-lg";
      } else {
        modeIcon.className = "fa-solid fa-up-down fa-lg";
      }
    }
  }

  if (data.sd_fs_errors != null) {
    setStat("pi-sd-fserr", String(Number(data.sd_fs_errors) || 0));
  }

  if (data.sd_mmc_errors != null) {
    setStat("pi-sd-ioerr", String(Number(data.sd_mmc_errors) || 0));
  }
  if (data.sd_lifetime_writes_gb != null) {
    setStat("pi-sd-writes", formatWrites(data.sd_lifetime_writes_gb));
  }

  if (data.sd_capacity_gb != null) {
    setStat("pi-sd-size", Math.round(Number(data.sd_capacity_gb)) + " GB");
  }
  if (data.sd_age_days != null) setStat("pi-sd-age", formatAge(data.sd_age_days));

  renderUpdatedLine(data, example);

  // The cards start greyed out; this has to run whatever happened above.
  for (const el of document.querySelectorAll(".pi-loading")) {
    el.classList.remove("pi-loading");
  }
}

function renderUpdatedLine(data, example) {
  const updatedEl = document.getElementById("pi-updated");
  if (!updatedEl) return;

  if (example) {
    updatedEl.textContent = "example data (local dev)";
    return;
  }

  if (!data.updated) return;

  const ageMs = Date.now() - data.updated;
  const mins = Math.max(0, Math.round(ageMs / 60000));

  if (mins === 0) {
    updatedEl.textContent = "just now";
  } else {
    updatedEl.textContent = mins + " min ago";
  }
}

async function updatePiholeStats() {
  if (PIHOLE_IS_LOCAL) {
    renderPiholeStats(EXAMPLE_STATS, { example: true });
    return;
  }

  try {
    const response = await fetch("/api/stats", { cache: "no-store" });

    // 503 means the Pi has not reported in yet, which fixes itself.
    if (response.status === 503) {
      console.warn("Pi-hole stats not available yet.");
      return;
    }

    if (!response.ok) {
      throw new Error("stats API error: " + response.status);
    }

    const data = await response.json();
    renderPiholeStats(data);
  } catch (error) {
    console.error("Failed to fetch Pi-hole stats:", error);

    const errEl = document.getElementById("pi-error");
    if (errEl) errEl.style.display = "block";
  }
}

const FIVE_MINUTES = 5 * 60 * 1000;

updatePiholeStats();

if (!PIHOLE_IS_LOCAL) {
  setInterval(updatePiholeStats, FIVE_MINUTES);
}
