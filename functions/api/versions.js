// For Developer options in Settings: which versions of the third-party
// libraries the site loads from a CDN, and whether a newer one is out.
//
// The loaded versions are read from the site's own files rather than listed
// here, so this can never disagree with what the pages actually load - which
// is the whole point. A page that pins a different version from the others
// shows up as a second version of the same library.
//
// "Latest" comes from npm, not from the CDN. cdnjs reports its own idea of a
// library's version, and for Prism that is a placeholder 9000.0.1 that was
// never a real release. npm's "latest" tag is what the authors published, so
// cdnjs is only asked which npm package it mirrors and whether it has the
// latest one yet.

const UA = "aridan.net/1.0 (+https://github.com/actuallyaridan/aridan.net)";
const UPSTREAM_TIMEOUT_MS = 6000;

// Every page, plus the service worker, which pins Font Awesome and twemoji in
// its precache list. There is no way to list the static files from a Function,
// so a new page has to be added here to be scanned. Extensionless, because
// Pages 308s /404.html to /404 and a redirect has no page in it to read.
const SOURCES = [
  "/",
  "/404",
  "/offline",
  "/articles/",
  "/articles/view/",
  "/articles/new/",
  "/articles/edit/",
  "/contact/",
  "/experience/",
  "/minecraft/",
  "/pihole/",
  "/privacy/",
  "/projects/",
  "/settings/",
  "/sw.js",
];

// cdnjs.cloudflare.com/ajax/libs/<name>/<version>/...
const CDNJS_URL = /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/([^/"'\s]+)\/([^/"'\s]+)\//g;

// cdn.jsdelivr.net/npm/<name>[@<version>]/... - the name may be scoped, like
// @twemoji/api, and the version may be left off, which means "latest".
const JSDELIVR_URL = /https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/@"'\s]+\/)?[^/@"'\s]+)(?:@([^/"'\s]+))?\//g;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export async function onRequestGet({ request, env }) {
  const found = await scanSources(request, env);

  const components = [];
  for (const component of found.values()) {
    components.push(component);
  }

  // One at a time would be a dozen round trips in a row; these are all
  // independent.
  const checks = [];
  for (const component of components) {
    checks.push(checkLatest(component));
  }
  await Promise.all(checks);

  components.sort((a, b) => a.name.localeCompare(b.name));

  return json({ checkedAt: new Date().toISOString(), components: components });
}

/* ---------- What the site loads ---------- */

// Keyed by CDN and library name. Each entry collects the versions it was found
// at and which files load each one.
async function scanSources(request, env) {
  const found = new Map();

  const reads = [];
  for (const path of SOURCES) {
    reads.push(readSource(request, env, path));
  }
  const texts = await Promise.all(reads);

  for (let i = 0; i < SOURCES.length; i++) {
    const path = SOURCES[i];
    const text = texts[i];
    if (!text) continue;

    for (const match of text.matchAll(CDNJS_URL)) {
      record(found, "cdnjs", match[1], match[2], path);
    }

    for (const match of text.matchAll(JSDELIVR_URL)) {
      // No version in the URL: jsDelivr serves whatever is newest.
      let version = match[2];
      if (!version) version = "";

      record(found, "jsdelivr", match[1], version, path);
    }
  }

  return found;
}

async function readSource(request, env, path) {
  const url = new URL(path, request.url);

  try {
    const res = await env.ASSETS.fetch(url);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function record(found, cdn, name, version, path) {
  const key = cdn + ":" + name;

  let component = found.get(key);
  if (!component) {
    component = { name: name, cdn: cdn, package: "", latest: "", onCdn: null, versions: [], error: "" };
    found.set(key, component);
  }

  let entry = component.versions.find((v) => v.version === version);
  if (!entry) {
    entry = { version: version, files: [] };
    component.versions.push(entry);
  }

  if (!entry.files.includes(path)) entry.files.push(path);
}

/* ---------- What is newest ---------- */

async function checkLatest(component) {
  try {
    if (component.cdn === "cdnjs") {
      await checkCdnjs(component);
    } else {
      component.package = component.name;
      component.latest = await npmLatest(component.name);

      // jsDelivr mirrors all of npm, so whatever npm has, it has.
      component.onCdn = true;
    }
  } catch (err) {
    component.error = String(err?.message || err);
  }
}

// cdnjs names its libraries its own way - "prism" is npm's "prismjs", and
// "font-awesome" is "@fortawesome/fontawesome-free" - but it says which npm
// package each one follows.
async function checkCdnjs(component) {
  const info = await getJson(
    "https://api.cdnjs.com/libraries/" + encodeURIComponent(component.name) + "?fields=autoupdate,versions"
  );

  const target = info?.autoupdate?.target;
  if (info?.autoupdate?.source !== "npm" || !target) {
    throw new Error("cdnjs does not say which npm package this follows");
  }

  component.package = target;
  component.latest = await npmLatest(target);

  // A new release takes a while to reach cdnjs, and until it does there is
  // nothing to update to there.
  const versions = info.versions || [];
  component.onCdn = versions.includes(component.latest);
}

async function npmLatest(name) {
  const body = await getJson("https://registry.npmjs.org/" + name.replace("/", "%2F") + "/latest");
  if (!body?.version) throw new Error("npm gave no version for " + name);
  return body.version;
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(new URL(url).host + " responded " + res.status);
  return res.json();
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
