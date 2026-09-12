// Shared helpers for the sitemap, feed and article metadata functions.
// Files under functions/_lib/ are not routed by Pages, only imported.

export const SITE = "https://aridan.net";
export const INDEX_URL = "/assets/content/articles/index.json";
export const ARTICLE_DIR = "/assets/content/articles/";
export const DEFAULT_IMAGE = SITE + "/assets/uploads/images/banner.webp";

// env.ASSETS is bound on Cloudflare Pages; fall back to a normal fetch so the
// same code keeps working if the functions ever run somewhere else.
function assetFetch(env, request, path) {
    const url = new URL(path, new URL(request.url).origin);
    if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return env.ASSETS.fetch(new Request(url, { headers: { accept: "*/*" } }));
    }
    return fetch(url);
}

function stripQuotes(v) {
    if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
        return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") {
        return v.slice(1, -1).replace(/''/g, "'");
    }
    return v;
}

// Mirrors the top-level key: value handling in src/js/articleFormat.js. Nested
// lists are ignored here because no metadata we emit uses them.
export function parseFrontmatter(text) {
    const src = String(text == null ? "" : text).replace(/^﻿/, "");
    const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { meta: {}, body: src.trim() };

    const meta = {};
    for (const line of m[1].split(/\r?\n/)) {
        if (!line.trim() || /^\s*#/.test(line) || /^\s/.test(line)) continue;
        const i = line.indexOf(":");
        if (i < 0) continue;
        const key = line.slice(0, i).trim();
        if (!/^[A-Za-z_][\w-]*$/.test(key)) continue;
        meta[key] = stripQuotes(line.slice(i + 1).trim());
    }
    return { meta, body: src.slice(m[0].length).trim() };
}

export function isValidSlug(slug) {
    return typeof slug === "string" && /^[A-Za-z0-9._-]+$/.test(slug) && slug !== "." && slug !== "..";
}

export async function listSlugs(env, request) {
    const res = await assetFetch(env, request, INDEX_URL);
    if (!res.ok) return [];
    const list = await res.json();
    return Array.isArray(list) ? list.filter(isValidSlug) : [];
}

export async function loadArticle(env, request, slug) {
    if (!isValidSlug(slug)) return null;
    const res = await assetFetch(env, request, ARTICLE_DIR + encodeURIComponent(slug) + ".md");
    if (!res.ok) return null;
    const parsed = parseFrontmatter(await res.text());
    return { slug, meta: parsed.meta, body: parsed.body };
}

export async function loadAllArticles(env, request) {
    const slugs = await listSlugs(env, request);
    const loaded = await Promise.all(slugs.map((s) => loadArticle(env, request, s)));
    return loaded
        .filter(Boolean)
        .sort((a, b) => String(b.meta.date || "").localeCompare(String(a.meta.date || "")));
}

export function articleUrl(slug) {
    return SITE + "/articles/view/index.html?article=" + encodeURIComponent(slug);
}

export function escapeXml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

// Dates are plain YYYY-MM-DD in frontmatter; treat them as UTC midnight so the
// same feed is produced no matter where the function runs.
export function toDate(value) {
    const d = new Date(String(value || "") + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
}
