// Fetches aggregate Pi-hole stats from the site's own /api/stats endpoint
// (backed by a Cloudflare KV store that the Pi-hole pushes to) and fills in
// any matching elements on the page. Safe to include on any page — it only
// touches elements that exist.

async function updatePiholeStats() {
  try {
    const response = await fetch("/api/stats", { cache: "no-store" });

    if (response.status === 503) {
      // KV has no data yet (Pi hasn't pushed, or just set up). Leave placeholders.
      console.warn("Pi-hole stats not available yet.");
      return;
    }
    if (!response.ok) throw new Error(`stats API error: ${response.status}`);

    const data = await response.json();

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
    if (updatedEl && data.updated) {
      const mins = Math.max(0, Math.round((Date.now() - data.updated) / 60000));
      updatedEl.textContent = mins === 0 ? "just now" : `${mins} min ago`;
    }

    // Reveal any freshly-loaded values (removes the pulsing placeholder state).
    document.querySelectorAll(".ph-loading").forEach((el) => el.classList.remove("ph-loading"));
  } catch (error) {
    console.error("Failed to fetch Pi-hole stats:", error);
    const errEl = document.getElementById("ph-error");
    if (errEl) errEl.style.display = "block";
  }
}

updatePiholeStats();
// Refresh while the tab is open (the Pi pushes every ~5 min; a 60s poll keeps it fresh).
setInterval(updatePiholeStats, 60000);
