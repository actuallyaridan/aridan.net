import { SITE, articleUrl, escapeXml, loadAllArticles, toDate } from "./_lib/articles.js";

// Pages that are linked from the nav. /articles/new/ and /articles/edit/ are
// local-only editor screens, and /minecraft/ is deliberately unlisted, so none
// of them belong here.
const PAGES = [
    { path: "/", priority: "1.0", changefreq: "weekly" },
    { path: "/experience/", priority: "0.8", changefreq: "monthly" },
    { path: "/projects/", priority: "0.8", changefreq: "monthly" },
    { path: "/articles/", priority: "0.8", changefreq: "weekly" },
    { path: "/pihole/", priority: "0.6", changefreq: "daily" },
    { path: "/contact/", priority: "0.6", changefreq: "monthly" },
    { path: "/settings/", priority: "0.3", changefreq: "yearly" }
];

function urlEntry({ loc, lastmod, changefreq, priority }) {
    return [
        "  <url>",
        "    <loc>" + escapeXml(loc) + "</loc>",
        lastmod ? "    <lastmod>" + lastmod + "</lastmod>" : null,
        changefreq ? "    <changefreq>" + changefreq + "</changefreq>" : null,
        priority ? "    <priority>" + priority + "</priority>" : null,
        "  </url>"
    ]
        .filter(Boolean)
        .join("\n");
}

export async function onRequestGet({ env, request }) {
    let articles = [];
    try {
        articles = await loadAllArticles(env, request);
    } catch {
        // A broken article should not take the whole sitemap down; the static
        // pages below are still worth serving.
    }

    const newestArticle = articles.length ? toDate(articles[0].meta.date) : null;

    const entries = PAGES.map((page) =>
        urlEntry({
            loc: SITE + page.path,
            lastmod: page.path === "/articles/" && newestArticle
                ? newestArticle.toISOString().slice(0, 10)
                : null,
            changefreq: page.changefreq,
            priority: page.priority
        })
    ).concat(
        articles.map((article) => {
            const date = toDate(article.meta.date);
            return urlEntry({
                loc: articleUrl(article.slug),
                lastmod: date ? date.toISOString().slice(0, 10) : null,
                changefreq: "yearly",
                priority: "0.7"
            });
        })
    );

    const xml =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        entries.join("\n") +
        "\n</urlset>\n";

    return new Response(xml, {
        headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600"
        }
    });
}
