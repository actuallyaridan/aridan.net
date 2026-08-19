(function () {
    "use strict";

    var AF = window.ArticleFormat;

    function setMeta(attr, key, value) {
        var el = document.head.querySelector("meta[" + attr + '="' + key + '"]');
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
    }

    function renderArticle(container, meta, bodyHtml) {
        var esc = AF.escapeHtml;
        var categories = Array.isArray(meta.categories) ? meta.categories : [];
        var chips = categories
            .map(function (cat) {
                if (!cat || typeof cat !== "object") return "";
                return '<span class="' + esc(cat.color || "default") + '">' + esc(cat.name) + "</span>";
            })
            .join("");

        container.innerHTML =
            '<article class="full-article">' +
                '<div class="info">' +
                    '<p class="icon"><i class="fa-solid fa-newspaper icon-background"></i></p>' +
                    "<div>" +
                        '<h1 class="name">' + esc(meta.title || "Untitled article") + "</h1>" +
                        '<p class="description titleColor">' +
                            '<time datetime="' + esc(meta.date || "") + '">' +
                                esc(AF.formatDate(meta.date)) +
                            "</time>" +
                        "</p>" +
                        '<a href="/articles/" title="Back to Articles" class="button backButton">' +
                            '<i class="fa-solid fa-arrow-left"></i>' +
                        "</a>" +
                    "</div>" +
                "</div>" +
                (chips ? '<div class="categories">' + chips + "</div>" : "") +
                "<hr>" +
                '<div class="article-content"></div>' +
            "</article>";

        container.querySelector(".article-content").innerHTML = bodyHtml;
    }

    function renderError(container, heading, detail) {
        document.title = heading + " - aridan.net";
        container.innerHTML =
            '<div class="info">' +
                '<p class="icon"><i class="fa-solid fa-xmark icon-background"></i></p>' +
                "<div>" +
                    '<h1 class="name">' + AF.escapeHtml(heading) + "</h1>" +
                    '<p class="description titleColor">' + AF.escapeHtml(detail) + "</p>" +
                    '<a href="/articles/" class="button"><i class="fa-solid fa-arrow-left"></i>Back to Articles</a>' +
                "</div>" +
            "</div>";
    }

    function load() {
        var container = document.querySelector("main.container");
        var spinner = document.getElementById("loading");
        if (!container) return;
        if (spinner) spinner.style.display = "flex";

        var slug = new URLSearchParams(location.search).get("article");

        if (!slug) {
            renderError(container, "No article specified", "The address is missing an article name.");
            if (spinner) spinner.style.display = "none";
            return;
        }
        if (!AF.isValidSlug(slug)) {
            renderError(container, "Article not found", "“" + slug + "” isn't a valid article name.");
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
                renderArticle(container, parsed.meta, marked.parse(parsed.body));
                if (window.Prism) Prism.highlightAll();
                if (window.twemoji) twemoji.parse(container, { folder: "svg", ext: ".svg" });
                document.dispatchEvent(new CustomEvent("article:rendered", { detail: { slug: slug } }));
            })
            .catch(function (err) {
                if (err.message === "notfound") {
                    renderError(container, "Article not found", "There's no article called “" + slug + "”.");
                } else {
                    console.error("Error loading article:", err);
                    renderError(container, "Unable to display article", "Something went wrong loading this article.");
                }
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
