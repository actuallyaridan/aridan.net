(function () {
    "use strict";

    var AF = window.ArticleFormat;

    function articleUrl(slug) {
        return "/articles/view/index.html?article=" + encodeURIComponent(slug);
    }

    function card(article) {
        var esc = AF.escapeHtml;
        var categories = Array.isArray(article.meta.categories) ? article.meta.categories : [];

        var chips = categories
            .map(function (cat) {
                if (!cat || typeof cat !== "object") return "";
                return '<span class="' + esc(cat.color || "default") + '">' + esc(cat.name) + "</span>";
            })
            .join("");

        var el = document.createElement("div");
        el.className = "section articlePreview";
        el.dataset.slug = article.slug;
        el.innerHTML =
            '<div class="preview">' +
                '<span class="titleContainer">' +
                    '<h3 class="section-title">' + esc(article.meta.title || "Untitled article") + "</h3>" +
                    '<p class="date section-content">' +
                        '<time datetime="' + esc(article.meta.date || "") + '">' +
                            esc(AF.formatDate(article.meta.date)) +
                        "</time>" +
                    "</p>" +
                "</span>" +
                '<p class="section-content previewContent">' + esc(article.meta.preview || "") + "</p>" +
            "</div>" +
            '<div class="readMore">' +
                            '<div class="categories">' + chips + "</div>" +
                '<div><a href="' + esc(articleUrl(article.slug)) + '" title="Read more" class="button backButton">' +
                    '<i class="fa-solid fa-arrow-right"></i>' +
                "</a> </div>" +
            "</div>";
        return el;
    }

    function message(container, text) {
        var p = document.createElement("p");
        p.className = "section-content";
        p.textContent = text;
        container.appendChild(p);
    }

    function loadArticle(slug) {
        return fetch(AF.DIR_URL + encodeURIComponent(slug) + ".md", { cache: "no-cache" })
            .then(function (res) {
                if (!res.ok) throw new Error(res.status + " " + res.statusText);
                return res.text();
            })
            .then(function (text) {
                var parsed = AF.parse(text);
                return { slug: slug, meta: parsed.meta };
            })
            .catch(function (err) {
                console.error('Skipping article "' + slug + '":', err.message);
                return null;
            });
    }

    function render() {
        var container = document.querySelector("main.container");
        var spinner = document.getElementById("loading");
        if (!container) return;
        if (spinner) spinner.style.display = "block";

        fetch(AF.INDEX_URL, { cache: "no-cache" })
            .then(function (res) {
                if (!res.ok) throw new Error("Could not load the article list (" + res.status + ").");
                return res.json();
            })
            .then(function (slugs) {
                if (!Array.isArray(slugs)) throw new Error("index.json should contain a list of slugs.");
                var valid = slugs.filter(function (s) {
                    return typeof s === "string" && AF.isValidSlug(s);
                });
                return Promise.all(valid.map(loadArticle));
            })
            .then(function (articles) {
                var found = articles.filter(Boolean);
                if (!found.length) {
                    message(container, "No articles yet.");
                    document.dispatchEvent(new CustomEvent("articles:rendered"));
                    return;
                }
                found.sort(function (a, b) {
                    return AF.dateSortKey(b.meta.date).localeCompare(AF.dateSortKey(a.meta.date));
                });
                var frag = document.createDocumentFragment();
                found.forEach(function (a) { frag.appendChild(card(a)); });
                container.appendChild(frag);
                document.dispatchEvent(new CustomEvent("articles:rendered"));
            })
            .catch(function (err) {
                console.error("Error loading articles:", err);
                message(container, "Articles couldn't be loaded right now. Please try again later.");
            })
            .finally(function () {
                if (spinner) spinner.style.display = "none";
            });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", render);
    } else {
        render();
    }
})();
