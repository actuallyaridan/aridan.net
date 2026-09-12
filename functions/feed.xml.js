import { SITE, articleUrl, escapeXml, loadAllArticles, toDate } from "../_lib/articles.js";

const FEED_URL = SITE + "/feed.xml";
const TITLE = "aridan.net";
const DESCRIPTION = "Articles by Adnan Bukvic about hardware, self-hosting, and whatever else he is taking apart.";

export async function onRequestGet({ env, request }) {
    let articles = [];
    try {
        articles = await loadAllArticles(env, request);
    } catch {
        // Serve an empty but valid feed rather than a 500 if an article is
        // malformed; readers handle that far better than an error page.
    }

    const newest = articles.length ? toDate(articles[0].meta.date) : null;
    const lastBuild = (newest || new Date()).toUTCString();

    const items = articles
        .map((article) => {
            const date = toDate(article.meta.date);
            const url = articleUrl(article.slug);
            return [
                "    <item>",
                "      <title>" + escapeXml(article.meta.title || "Untitled article") + "</title>",
                "      <link>" + escapeXml(url) + "</link>",
                '      <guid isPermaLink="true">' + escapeXml(url) + "</guid>",
                article.meta.preview
                    ? "      <description>" + escapeXml(article.meta.preview) + "</description>"
                    : null,
                date ? "      <pubDate>" + date.toUTCString() + "</pubDate>" : null,
                "    </item>"
            ]
                .filter(Boolean)
                .join("\n");
        })
        .join("\n");

    const xml =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n' +
        "  <channel>\n" +
        "    <title>" + escapeXml(TITLE) + "</title>\n" +
        "    <link>" + escapeXml(SITE + "/articles/") + "</link>\n" +
        "    <description>" + escapeXml(DESCRIPTION) + "</description>\n" +
        "    <language>en</language>\n" +
        "    <lastBuildDate>" + lastBuild + "</lastBuildDate>\n" +
        '    <atom:link href="' + escapeXml(FEED_URL) + '" rel="self" type="application/rss+xml"/>\n' +
        (items ? items + "\n" : "") +
        "  </channel>\n" +
        "</rss>\n";

    return new Response(xml, {
        headers: {
            "content-type": "application/rss+xml; charset=utf-8",
            "cache-control": "public, max-age=3600"
        }
    });
}
