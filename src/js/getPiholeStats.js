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

// The site's language rather than the browser's: someone reading in Swedish on
// an English system should see "1 756 845", not "1,756,845".
function piholeLocale() {
  let lang = "en";
  if (window.i18n && window.i18n.lang) lang = window.i18n.lang;

  const fallback = LOCALE_FALLBACKS[lang];
  if (fallback && !hasNumberData(lang)) return fallback;

  return lang;
}

// Chrome ships without Bosnian number data, yet still claims to support it,
// and quietly writes "1,756,845" the English way. Croatian writes numbers the
// same as Bosnian, so it stands in. Firefox has the real thing.
const LOCALE_FALLBACKS = { bs: "hr" };

const numberDataKnown = {};

function hasNumberData(lang) {
  if (numberDataKnown[lang] === undefined) {
    const own = new Intl.NumberFormat(lang).format(1000.5);
    const english = new Intl.NumberFormat("en").format(1000.5);
    numberDataKnown[lang] = own !== english;
  }

  return numberDataKnown[lang];
}

function formatNumber(n, options) {
  const value = Number(n) || 0;

  try {
    return new Intl.NumberFormat(piholeLocale(), options).format(value);
  } catch {
    return new Intl.NumberFormat("en", options).format(value);
  }
}

// Narrow units for the ones that fit on a tile - "5d 3h" in English, "5 d. 3 h"
// in Croatian - so no dictionary has to know them.
function formatUnit(n, unit, display, extra) {
  const options = { style: "unit", unit: unit, unitDisplay: display, ...extra };
  return formatNumber(n, options);
}

// Rounded down, hence the "+", so the headline is never larger than the truth.
// `steady` keeps the one decimal even when it is a 0 - "121.0K+" rather than
// "121K+" - for the numbers on the way while one is counting up, which
// would otherwise change length every few frames (see countTo in general.js).
//
// The digits follow the language - "272,7K+" in Swedish - but the K and M stay.
// Intl's compact notation has each language's own, and "272,7 tis.+" is too
// wide for a tile on a phone.
function abbreviatePiholeNumber(n, steady) {
  const value = Number(n) || 0;

  if (value < 1000) return formatNumber(value);

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

  const options = { maximumFractionDigits: 1 };
  if (steady) {
    options.minimumFractionDigits = 1;
  }

  return formatNumber(floored, options) + suffix + "+";
}

function formatSize(gb) {
  const n = Number(gb) || 0;

  if (n < 1) return formatUnit(Math.round(n * 1024), "megabyte", "short");
  return formatUnit(n, "gigabyte", "short");
}

function usedOfTotal(usedGb, totalGb) {
  return translate("{0} used of {1}", formatSize(usedGb), formatSize(totalGb));
}

// Only the two largest units, so five days shows as "5d 3h".
function formatUptime(seconds) {
  const total = Math.floor(Number(seconds) || 0);

  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (days > 0) {
    return formatUnit(days, "day", "narrow") + " " + formatUnit(hours, "hour", "narrow");
  }

  if (hours > 0) {
    return formatUnit(hours, "hour", "narrow") + " " + formatUnit(minutes, "minute", "narrow");
  }

  return formatUnit(minutes, "minute", "narrow");
}

function formatWrites(gb) {
  const n = Number(gb) || 0;

  if (n >= 1024) {
    return formatUnit(n / 1024, "terabyte", "short", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  return formatUnit(Math.round(n), "gigabyte", "short");
}

// Months and years are short rather than narrow: a narrow month is "3m" in
// English and Swedish, which reads as minutes.
function formatAge(days) {
  const d = Math.max(0, Math.floor(Number(days) || 0));

  if (d < 60) return formatUnit(d, "day", "narrow");
  if (d < 730) return formatUnit(Math.floor(d / 30.44), "month", "short");

  return formatUnit(d / 365.25, "year", "short", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// The last answer, so a language switch can write it out again in the new
// language without waiting for the next fetch.
let lastRender = null;

function renderPiholeStats(data, { example = false } = {}) {
  lastRender = { data: data, example: example };

  function setStat(id, text, fullTitle) {
    const el = document.getElementById(id);
    if (!el) return;

    el.textContent = text;
    if (fullTitle != null) el.title = fullTitle;
  }

  // The same as setStat, but counting up to the number (window.countTo in
  // general.js) - from 0 the first time, and from the last value on each
  // refresh after. `whole` keeps counts whole on the way up.
  // The big numbers keep their decimal while they count - see
  // abbreviatePiholeNumber.
  function countStat(id, value, format, fullTitle, whole) {
    const el = document.getElementById(id);
    if (!el) return;

    if (fullTitle != null) el.title = fullTitle;

    if (!window.countTo) {
      el.textContent = format(Number(value));
      return;
    }

    const options = { whole: whole };
    if (format === abbreviatePiholeNumber) {
      options.during = function (n) {
        return abbreviatePiholeNumber(n, true);
      };
    }

    window.countTo(el, value, format, options);
  }

  function full(n) {
    return formatNumber(n);
  }

  // The API sends 15.53 for 15.53%, and Intl wants 0.1553.
  function percentOneDecimal(n) {
    return formatNumber(Number(n) / 100, {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function percentWhole(n) {
    return formatNumber(Math.round(Number(n)) / 100, { style: "percent" });
  }

  countStat("pi-total", data.total, abbreviatePiholeNumber, full(data.total), true);
  countStat("pi-blocked", data.blocked, abbreviatePiholeNumber, full(data.blocked), true);
  countStat("pi-percent", data.percent, percentOneDecimal);
  countStat("pi-domains", data.domains_on_lists, abbreviatePiholeNumber, full(data.domains_on_lists), true);
  countStat("pi-clients", data.clients, abbreviatePiholeNumber, full(data.clients), true);

  if (data.frequency != null) {
    // The API reports queries per second; the card shows per minute.
    const perMinute = Math.round(Number(data.frequency) * 60);
    countStat("pi-qpm", perMinute, full, "live rate, same as the Pi-hole dashboard", true);
  }
  if (data.cached_percent != null) {
    countStat("pi-cached", data.cached_percent, percentOneDecimal);
  }

  if (data.temp_c != null) {
    countStat("pi-temp", data.temp_c, function (n) {
      return formatUnit(n, "celsius", "short", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    });
  }

  if (data.cpu_percent != null) {
    countStat("pi-cpu", data.cpu_percent, percentOneDecimal);
  }

  if (data.ram_percent != null) {
    let hover;
    if (data.ram_total_gb != null) {
      hover = usedOfTotal(data.ram_used_gb, data.ram_total_gb);
    }
    countStat("pi-ram", data.ram_percent, percentWhole, hover);
  }

  if (data.disk_percent != null) {
    let hover;
    if (data.disk_total_gb != null) {
      hover = usedOfTotal(data.disk_used_gb, data.disk_total_gb);
    }
    countStat("pi-disk", data.disk_percent, percentWhole, hover);
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
    setStat("pi-sd-fserr", formatNumber(data.sd_fs_errors));
  }

  if (data.sd_mmc_errors != null) {
    setStat("pi-sd-ioerr", formatNumber(data.sd_mmc_errors));
  }
  if (data.sd_lifetime_writes_gb != null) {
    setStat("pi-sd-writes", formatWrites(data.sd_lifetime_writes_gb));
  }

  if (data.sd_capacity_gb != null) {
    setStat("pi-sd-size", formatUnit(Math.round(Number(data.sd_capacity_gb)), "gigabyte", "short"));
  }
  if (data.sd_age_days != null) setStat("pi-sd-age", formatAge(data.sd_age_days));

  renderUpdatedLine(data, example);

  // The cards start as placeholders; this has to run whatever happened above.
  stopLoading();
}

// Ends the placeholders, leaving the "-" under any stat that was not filled
// in. Every way a fetch can end calls it - a failed one too, or the bars
// would shimmer on as though an answer were still on its way.
function stopLoading() {
  for (const el of document.querySelectorAll(".pi-loading")) {
    el.classList.remove("pi-loading");
  }
}

// What the line under the stats last said, so it can be written again in
// another language without waiting for the next fetch.
let updatedState = { kind: "never" };

function translate(english, ...args) {
  if (window.i18n) return window.i18n.t(english, ...args);

  let text = english;
  for (let i = 0; i < args.length; i++) {
    text = text.split("{" + i + "}").join(args[i]);
  }
  return text;
}

function updatedWhen() {
  if (updatedState.kind === "example") {
    // Only ever seen on my own machine, so it stays in English.
    return "example data (local dev)";
  }

  if (updatedState.kind === "never") {
    return translate("never");
  }

  const ageMs = Date.now() - updatedState.at;
  const mins = Math.max(0, Math.round(ageMs / 60000));

  if (mins === 0) {
    return translate("just now");
  }

  return translate("{0} min ago", mins);
}

function writeUpdatedLine() {
  const updatedEl = document.getElementById("pi-updated");
  if (!updatedEl) return;

  const line = translate(
    "Updated {0} - updates automatically every 15 minutes.",
    updatedWhen()
  );

  // A no-break space keeps "15 minutes" from being split across two lines.
  // Put in here rather than in the string, since i18n.js turns every kind of
  // space in a key into a plain one.
  updatedEl.textContent = line.replace("15 ", "15\u00a0");
}

function renderUpdatedLine(data, example) {
  if (example) {
    updatedState = { kind: "example" };
  } else if (data.updated) {
    updatedState = { kind: "at", at: data.updated };
  } else {
    return;
  }

  writeUpdatedLine();
}

// The counts are already at their values, so countTo writes them straight out
// rather than counting up again.
function rerenderPiholeStats() {
  if (!lastRender) {
    writeUpdatedLine();
    return;
  }

  renderPiholeStats(lastRender.data, { example: lastRender.example });
}

if (window.i18n) window.i18n.onChange(rerenderPiholeStats);

async function updatePiholeStats() {
  if (PIHOLE_IS_LOCAL) {
    renderPiholeStats(EXAMPLE_STATS, { example: true });
    return;
  }

  try {
    const response = await fetch("/api/stats", { cache: "no-store" });

    // 503 means the Pi has not reported in yet, which fixes itself.
    if (response.status === 503) {
      debug.warn("Pi-hole stats not available yet.");
      stopLoading();
      return;
    }

    if (!response.ok) {
      throw new Error("stats API error: " + response.status);
    }

    const data = await response.json();
    renderPiholeStats(data);
  } catch (error) {
    console.error("Failed to fetch Pi-hole stats:", error);
    stopLoading();

    const errEl = document.getElementById("pi-error");
    if (errEl) errEl.style.display = "block";
  }
}

// Hovering the blocked-queries card gets a word from Mr. Mackey.
const MACKEY_LINE = "But they're all bad, 'mkay.";
const MACKEY_GIF = "/assets/uploads/images/mkay.gif";

function wireMackey() {
  const number = document.getElementById("pi-blocked");
  if (!number) return;
  if (typeof speechBubble !== "function") return;

  const card = number.closest(".pi-card");
  const bubble = speechBubble(card, { centered: true, gifWidth: 240 });

  // No time limit: it loops for as long as the pointer stays on the card.
  onHover(card, function () {
    bubble.showGif(MACKEY_GIF, MACKEY_LINE);
  }, bubble.hide);
}

wireMackey();

const FIVE_MINUTES = 5 * 60 * 1000;

updatePiholeStats();

if (!PIHOLE_IS_LOCAL) {
  setInterval(updatePiholeStats, FIVE_MINUTES);
}
