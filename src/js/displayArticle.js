(function () {
    "use strict";

    var AF = window.ArticleFormat;

    function setMeta(attr, key, value) {
        var selector = "meta[" + attr + '="' + key + '"]';
        var el = document.head.querySelector(selector);
        if (!el) {
            el = document.createElement("meta");
            el.setAttribute(attr, key);
            document.head.appendChild(el);
        }
        el.setAttribute("content", value);
    }

    function applyMetadata(meta) {
        var title = meta.title || "Article";
        document.title = title + " - aridan.net";
        if (meta.preview) {
            setMeta("name", "description", meta.preview);
            setMeta("property", "og:description", meta.preview);
        }
        setMeta("property", "og:title", title);
        setMeta("property", "og:type", "article");
        setMeta("property", "og:url", location.href);

        var canonical = document.head.querySelector('link[rel="canonical"]');
        if (!canonical) {
            canonical = document.createElement("link");
            canonical.setAttribute("rel", "canonical");
            document.head.appendChild(canonical);
        }
        canonical.setAttribute("href", location.href);
    }

    function renderArticle(container, meta, bodyHtml) {
        // Escaped, so a title containing < or & cannot become real markup.
        var title = AF.escapeHtml(meta.title || "Untitled article");
        var rawDate = AF.escapeHtml(meta.date || "");
        var shownDate = AF.escapeHtml(AF.formatDate(meta.date));

        container.innerHTML = `
            <article class="full-article">
                <div class="info">
                    <p class="icon">
                        <i class="fa-solid fa-newspaper icon-background" aria-hidden="true"></i>
                    </p>
                    <div>
                        <h1 class="name">${title}</h1>
                        <p class="description titleColor">
                            <time datetime="${rawDate}">${shownDate}</time>
                        </p>
                        <a href="/articles/" title="Back to Articles"
                           aria-label="Back to Articles" class="button backButton">
                            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
                        </a>
                    </div>
                </div>
                <hr>
                <div class="article-content"></div>
            </article>`;

        // Already HTML, produced by marked, so it must not be escaped.
        var content = container.querySelector(".article-content");
        content.innerHTML = bodyHtml;
        if (window.markExternalLinks) window.markExternalLinks(content);
    }

    function renderError(container, heading, detail) {
        document.title = heading + " - aridan.net";

        var safeHeading = AF.escapeHtml(heading);
        var safeDetail = AF.escapeHtml(detail);

        container.innerHTML = `
            <div class="info">
                <p class="icon">
                    <i class="fa-solid fa-xmark icon-background" aria-hidden="true"></i>
                </p>
                <div>
                    <h1 class="name">${safeHeading}</h1>
                    <p class="description titleColor">${safeDetail}</p>
                    <a href="/articles/" class="button">
                        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>Back to Articles
                    </a>
                </div>
            </div>`;
    }

    function load() {
        var container = document.querySelector("main.container");
        var spinner = document.getElementById("loading");
        if (!container) return;
        if (spinner) spinner.style.display = "flex";

        var slug = new URLSearchParams(location.search).get("article");

        if (!slug) {
            renderError(container,
                "No article specified",
                "The address is missing an article name.");
            if (spinner) spinner.style.display = "none";
            return;
        }

        // Checked before it reaches a URL, so a typed address cannot escape the folder.
        if (!AF.isValidSlug(slug)) {
            renderError(container,
                "Article not found",
                "\u201c" + slug + "\u201d isn't a valid article name.");
            if (spinner) spinner.style.display = "none";
            return;
        }

        fetch(AF.DIR_URL + encodeURIComponent(slug) + ".md", { cache: "no-cache" })
            .then(function (res) {
                if (res.status === 404) throw new Error("notfound");
                if (!res.ok) throw new Error("http " + res.status);
                return res.text();
            })
            .then(function (text) {
                var parsed = AF.parse(text);

                applyMetadata(parsed.meta);

                var bodyHtml = marked.parse(parsed.body);
                renderArticle(container, parsed.meta, bodyHtml);

                if (window.Prism) Prism.highlightAll();
                if (window.parseEmoji) window.parseEmoji(container);

                var event = new CustomEvent("article:rendered", {
                    detail: { slug: slug }
                });
                document.dispatchEvent(event);
            })
            .catch(function (err) {
                if (err.message === "notfound") {
                    renderError(container,
                        "Article not found",
                        "There's no article called \u201c" + slug + "\u201d.");
                    return;
                }

                console.error("Error loading article:", err);
                renderError(container,
                    "Unable to display article",
                    "Something went wrong loading this article.");
            })
            .finally(function () {
                if (spinner) spinner.style.display = "none";
            });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", load);
    } else {
        load();
    }
})();
