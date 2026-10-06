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

    // textContent rather than innerHTML, so a title can't become markup.
    function setHero(title, preview) {
        var titleEl = document.getElementById("articleTitle");
        var previewEl = document.getElementById("articlePreview");

        titleEl.textContent = title;
        previewEl.textContent = preview;
        previewEl.hidden = !preview;
    }

    // The hero is already in the page, so only its text is written here;
    // replacing it would make it flash while the body loads.
    function renderArticle(meta, bodyHtml) {
        var preview = meta.preview || "";
        setHero(meta.title || "Untitled article", preview);

        var rawDate = AF.escapeHtml(meta.date || "");
        var isoDate = AF.formatDate(meta.date) || "";
        var shownDate = AF.escapeHtml(AF.localDate(isoDate));

        var byline = document.getElementById("articleByline");
        byline.innerHTML = `<li><i class="fa-regular fa-calendar" aria-hidden="true"></i><time datetime="${rawDate}" data-iso="${AF.escapeHtml(isoDate)}">${shownDate}</time></li>`;
        byline.hidden = false;

        // Already HTML, produced by marked, so it must not be escaped.
        var content = document.querySelector(".full-article .article-content");
        content.innerHTML = bodyHtml;
        if (window.markExternalLinks) window.markExternalLinks(content);
    }

    // Written again when the language changes, like the dates in the list.
    function relabelDate() {
        document.querySelectorAll(".articleByline time[data-iso]").forEach(function (el) {
            el.textContent = AF.localDate(el.dataset.iso);
        });
    }

    if (window.i18n) window.i18n.onChange(relabelDate);

    // Reuses the hero too, with the icon swapped, rather than drawing a new one.
    function renderError(heading, detail) {
        document.title = heading + " - aridan.net";

        var icon = document.getElementById("articleIcon");
        if (icon) {
            icon.classList.remove("fa-newspaper");
            icon.classList.add("fa-xmark");
        }

        setHero(heading, detail);

        // There's no article under it, so nothing for the line to divide.
        var rule = document.querySelector(".full-article > hr");
        if (rule) rule.hidden = true;
    }

    function load() {
        // Shown from the start in the HTML, so there is no gap before it appears.
        var spinner = document.getElementById("loading");
        if (!document.querySelector(".full-article")) return;

        var slug = new URLSearchParams(location.search).get("article");

        if (!slug) {
            renderError(
                "No article specified",
                "The address is missing an article name.");
            if (spinner) spinner.style.display = "none";
            return;
        }

        // Checked before it reaches a URL, so a typed address cannot escape the folder.
        if (!AF.isValidSlug(slug)) {
            renderError(
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
                renderArticle(parsed.meta, bodyHtml);

                var article = document.querySelector(".full-article");
                article.classList.add("isLoaded");

                if (window.Prism) Prism.highlightAll();
                if (window.parseEmoji) window.parseEmoji(article);

                var event = new CustomEvent("article:rendered", {
                    detail: { slug: slug }
                });
                document.dispatchEvent(event);
            })
            .catch(function (err) {
                if (err.message === "notfound") {
                    renderError(
                        "Article not found",
                        "There's no article called \u201c" + slug + "\u201d.");
                    return;
                }

                console.error("Error loading article:", err);
                renderError(
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
