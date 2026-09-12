import { DEFAULT_IMAGE, SITE, articleUrl, loadArticle, toDate } from "../../_lib/articles.js";

// The article page is rendered client-side from ?article=<slug>, so the static
// HTML carries placeholder metadata and every shared link previewed the same.
// This rewrites the head server-side before it reaches crawlers and unfurlers.

class AttributeSetter {
    constructor(attribute, value) {
        this.attribute = attribute;
        this.value = value;
    }
    element(element) {
        element.setAttribute(this.attribute, this.value);
    }
}

class ContentSetter extends AttributeSetter {
    constructor(value) {
        super("content", value);
    }
}

class TextSetter {
    constructor(value) {
        this.value = value;
    }
    element(element) {
        element.setInnerContent(this.value);
    }
}

class HeadAppender {
    constructor(html) {
        this.html = html;
    }
    element(element) {
        element.append(this.html, { html: true });
    }
}

function jsonLd(article, url) {
    const date = toDate(article.meta.date);
    const data = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: article.meta.title || "Untitled article",
        url,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        image: article.meta.image || DEFAULT_IMAGE,
        author: { "@type": "Person", name: "Adnan Bukvic", url: SITE + "/" },
        publisher: { "@type": "Person", name: "Adnan Bukvic", url: SITE + "/" },
        inLanguage: "en"
    };
    if (article.meta.preview) data.description = article.meta.preview;
    if (date) {
        data.datePublished = date.toISOString();
        data.dateModified = date.toISOString();
    }
    // </script> cannot appear inside a script element, and the frontmatter is
    // author-controlled rather than trusted-by-construction.
    return (
        '<script type="application/ld+json">' +
        JSON.stringify(data).replace(/</g, "\\u003c") +
        "</script>"
    );
}

export async function onRequestGet(context) {
    const response = await context.next();

    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;

    const slug = new URL(context.request.url).searchParams.get("article");
    if (!slug) return response;

    let article = null;
    try {
        article = await loadArticle(context.env, context.request, slug);
    } catch {
        // Fall through to the untouched page rather than erroring the request.
    }
    if (!article) return response;

    const title = article.meta.title || "Untitled article";
    const fullTitle = title + " - aridan.net";
    const description = article.meta.preview || "An article on aridan.net.";
    const url = articleUrl(article.slug);
    const image = article.meta.image || DEFAULT_IMAGE;
    const date = toDate(article.meta.date);

    let rewriter = new HTMLRewriter()
        .on("title", new TextSetter(fullTitle))
        .on('meta[name="description"]', new ContentSetter(description))
        .on('meta[property="og:title"]', new ContentSetter(title))
        .on('meta[property="og:description"]', new ContentSetter(description))
        .on('meta[property="og:url"]', new ContentSetter(url))
        .on('meta[property="og:image"]', new ContentSetter(image))
        .on('meta[property="og:image:alt"]', new ContentSetter("Cover image for " + title))
        .on('link[rel="canonical"]', new AttributeSetter("href", url))
        .on("head", new HeadAppender(jsonLd(article, url)));

    if (date) {
        rewriter = rewriter.on(
            "head",
            new HeadAppender(
                '<meta property="article:published_time" content="' + date.toISOString() + '">'
            )
        );
    }

    // og:image dimensions describe the fallback banner; drop them when an
    // article supplies its own image of unknown size.
    if (article.meta.image) {
        rewriter = rewriter
            .on('meta[property="og:image:width"]', { element: (el) => el.remove() })
            .on('meta[property="og:image:height"]', { element: (el) => el.remove() });
    }

    const rewritten = rewriter.transform(response);
    const headers = new Headers(rewritten.headers);
    headers.set("cache-control", "public, max-age=300");

    return new Response(rewritten.body, {
        status: rewritten.status,
        statusText: rewritten.statusText,
        headers
    });
}
