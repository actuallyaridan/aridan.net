(function () {
    "use strict";

    var AF = window.ArticleFormat;

    function articleUrl(slug) {
        return "/articles/view/index.html?article=" + encodeURIComponent(slug);
    }

    function card(article) {
        // Escaped, so a title with a < in it shows as text.
        var title = AF.escapeHtml(article.meta.title || "Untitled article");
        var rawDate = AF.escapeHtml(article.meta.date || "");
        var shownDate = AF.escapeHtml(AF.formatDate(article.meta.date));
        var preview = AF.escapeHtml(article.meta.preview || "");
        var href = AF.escapeHtml(articleUrl(article.slug));

        var el = document.createElement("div");
        el.className = "section articlePreview";
        el.dataset.slug = article.slug;

        el.innerHTML = `
            <div class="preview">
                <span class="titleContainer">
                    <h2 class="section-title">${title}</h2>
                    <p class="date section-content">
                        <time datetime="${rawDate}">${shownDate}</time>
                    </p>
                </span>
                <p class="section-content previewContent">${preview}</p>
            </div>
            <div class="readMore">
                <div>
                    <a href="${href}" title="Read more" aria-label="Read more"
                       class="button backButton">
                        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                    </a>
                </div>
            </div>`;

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
                if (!Array.isArray(slugs)) {
                    throw new Error("index.json should contain a list of slugs.");
                }

                var valid = [];
                slugs.forEach(function (slug) {
                    if (typeof slug !== "string") return;
                    if (!AF.isValidSlug(slug)) return;
                    valid.push(slug);
                });

                return Promise.all(valid.map(loadArticle));
            })
            .then(function (articles) {
                // loadArticle returns null for anything that failed.
                var found = articles.filter(Boolean);

                if (found.length === 0) {
                    message(container, "No articles found...yet!");
                    document.dispatchEvent(new CustomEvent("articles:rendered"));
                    return;
                }

                // The sort keys are YYYY-MM-DD, so plain text comparison is date order.
                found.sort(function (a, b) {
                    var keyA = AF.dateSortKey(a.meta.date);
                    var keyB = AF.dateSortKey(b.meta.date);
                    return keyB.localeCompare(keyA);
                });

                // Added in one go, so the browser only lays the page out once.
                var frag = document.createDocumentFragment();
                found.forEach(function (a) {
                    frag.appendChild(card(a));
                });
                // These cards land long after the one-off emoji pass on load.
                if (window.parseEmoji) window.parseEmoji(frag);
                container.appendChild(frag);
                document.dispatchEvent(new CustomEvent("articles:rendered"));
            })
            .catch(function (err) {
                console.error("Error loading articles:", err);
                message(container, "Something went wrong. Try again later.");
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
