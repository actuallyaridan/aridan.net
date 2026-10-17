// Star and fork counts for the projects page.
//
// The page used to ask GitHub itself, from every visitor's browser. GitHub
// allows 60 of those an hour per address, so anyone who looked around a bit
// - or shared a connection with someone who had - got the "rate limited"
// notice and old numbers. Asked from here, GitHub hears from the site once
// every REFRESH_MS at most, whoever is looking.
//
// Which repos to count is read from the projects page itself, from its
// data-github-stars attributes, so a new project only has to be added there.
//
// The last good answer is kept in KV and served while it is fresh. When
// GitHub cannot be reached it is served anyway, since slightly old counts
// beat no counts. A GITHUB_TOKEN secret is used if there is one: Workers
// share their outgoing addresses with everyone else's, so GitHub's limit
// for unauthenticated requests can be used up by strangers. A fine-grained
// token with no permissions at all is enough for public repos.

const KV_KEY = "github";
const REFRESH_MS = 15 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 6000;

const UA = "aridan.net/1.0 (+https://github.com/actuallyaridan/aridan.net)";

const SOURCE_PAGE = "/projects/";

// data-github-stars="owner/repo", or several separated by commas for a card
// that adds up a group of repos.
const REPO_ATTRIBUTE = /data-github-(?:stars|forks)="([^"]+)"/g;
const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

export async function onRequestGet({ request, env }) {
  if (!env.STATS) {
    return json({ error: "KV binding STATS is missing" }, 500);
  }

  const saved = await readSaved(env);

  if (saved && Date.now() - saved.checkedAt < REFRESH_MS) {
    return json(saved);
  }

  const repos = await reposOnPage(request, env);
  if (!repos.length) {
    if (saved) return json({ ...saved, stale: true });
    return json({ error: "no repos found on " + SOURCE_PAGE }, 503);
  }

  const fresh = await fetchAll(repos, env);

  // Anything GitHub did not answer for keeps its last known counts, so one
  // bad repo does not blank out the rest.
  const counts = {};
  let missing = 0;
  for (const repo of repos) {
    if (fresh[repo]) {
      counts[repo] = fresh[repo];
    } else if (saved && saved.repos[repo]) {
      counts[repo] = saved.repos[repo];
      missing++;
    } else {
      missing++;
    }
  }

  // Nothing new at all: keep the old timestamp, so the next request tries
  // again rather than waiting out a full REFRESH_MS on numbers that did not
  // actually get checked.
  if (missing === repos.length) {
    if (saved) return json({ ...saved, stale: true });
    return json({ error: "GitHub could not be reached" }, 502);
  }

  const result = { checkedAt: Date.now(), repos: counts };
  await env.STATS.put(KV_KEY, JSON.stringify(result));

  if (missing) return json({ ...result, stale: true });
  return json(result);
}

async function readSaved(env) {
  try {
    const text = await env.STATS.get(KV_KEY);
    if (!text) return null;

    const saved = JSON.parse(text);
    if (!saved || !saved.repos) return null;

    return saved;
  } catch {
    return null;
  }
}

async function reposOnPage(request, env) {
  let html = "";
  try {
    const res = await env.ASSETS.fetch(new URL(SOURCE_PAGE, request.url));
    if (res.ok) html = await res.text();
  } catch {
    return [];
  }

  const repos = new Set();
  for (const match of html.matchAll(REPO_ATTRIBUTE)) {
    for (const part of match[1].split(",")) {
      const repo = part.trim();
      if (REPO_NAME.test(repo)) repos.add(repo);
    }
  }

  return Array.from(repos);
}

// Keyed by "owner/repo". A repo that failed is left out.
async function fetchAll(repos, env) {
  const headers = {
    "user-agent": UA,
    accept: "application/vnd.github+json",
  };
  if (env.GITHUB_TOKEN) {
    headers.authorization = "Bearer " + env.GITHUB_TOKEN;
  }

  // One at a time would be a handful of round trips in a row; these are all
  // independent.
  const checks = [];
  for (const repo of repos) {
    checks.push(fetchRepo(repo, headers));
  }
  const answers = await Promise.all(checks);

  const counts = {};
  for (let i = 0; i < repos.length; i++) {
    if (answers[i]) counts[repos[i]] = answers[i];
  }

  return counts;
}

async function fetchRepo(repo, headers) {
  try {
    const res = await fetch("https://api.github.com/repos/" + repo, {
      headers: headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!Number.isFinite(data.stargazers_count)) return null;
    if (!Number.isFinite(data.forks_count)) return null;

    return { stars: data.stargazers_count, forks: data.forks_count };
  } catch {
    return null;
  }
}

function json(body, status = 200) {
  const headers = { ...jsonHeaders };

  // Browsers and Cloudflare's edge can hold a good answer for a few minutes;
  // KV is what actually keeps GitHub from being asked too often. Errors are
  // never held, so a fixed problem shows up straight away.
  if (status === 200) {
    headers["cache-control"] = "public, max-age=300";
  } else {
    headers["cache-control"] = "no-store";
  }

  return new Response(JSON.stringify(body), { status, headers });
}
