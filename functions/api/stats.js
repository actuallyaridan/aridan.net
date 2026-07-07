// Cloudflare Pages Function - /api/stats
//
// GET  /api/stats  -> public: returns the latest aggregate Pi-hole numbers (from KV)
// POST /api/stats  -> private: the Pi-hole pushes new numbers here, authorised by a
//                     shared bearer token (env var PIHOLE_PUSH_TOKEN).
//
// Requires two bindings on the Pages project (Settings -> Functions):
//   - KV namespace binding named  STATS
//   - Environment secret named    PIHOLE_PUSH_TOKEN
//
// Only aggregate numbers are ever stored/served - no per-domain or per-client data.

const KV_KEY = "latest";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

export async function onRequestGet({ env }) {
  if (!env.STATS) {
    return new Response(JSON.stringify({ error: "KV binding STATS is missing" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const data = await env.STATS.get(KV_KEY);
  if (!data) {
    return new Response(JSON.stringify({ error: "no data yet" }), {
      status: 503,
      headers: { ...jsonHeaders, "cache-control": "no-store" },
    });
  }

  return new Response(data, {
    status: 200,
    headers: {
      ...jsonHeaders,
      // Cache at the edge/browser for 30s so a viral moment can't hammer us.
      "cache-control": "public, max-age=30",
      "access-control-allow-origin": "*",
    },
  });
}

export async function onRequestPost({ request, env }) {
  // --- auth ---
  const expected = env.PIHOLE_PUSH_TOKEN;
  const provided = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  if (!env.STATS) {
    return new Response(JSON.stringify({ error: "KV binding STATS is missing" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  // --- parse + whitelist (never trust/echo arbitrary fields) ---
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const clean = {
    total: num(body.total),
    blocked: num(body.blocked),
    percent: num(body.percent),
    domains_on_lists: num(body.domains_on_lists),
    clients: num(body.clients),
    updated: Date.now(),
  };

  await env.STATS.put(KV_KEY, JSON.stringify(clean));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: jsonHeaders,
  });
}

// Constant-time string compare to avoid leaking the token via timing.
function timingSafeEqual(a, b) {
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
