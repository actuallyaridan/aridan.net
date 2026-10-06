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
        var isoDate = AF.formatDate(article.meta.date) || "";
        var shownDate = AF.escapeHtml(AF.localDate(isoDate));
        var preview = AF.escapeHtml(article.meta.preview || "");
        var href = AF.escapeHtml(articleUrl(article.slug));
        var slugId = AF.escapeHtml(article.slug);

        var el = document.createElement("div");
        el.className = "section articlePreview";
        el.dataset.slug = article.slug;

        // The title is the card's one link, stretched over the whole card in
        // styles.css, so the card is a single tab stop that a screen reader
        // reads by its title. The arrow only says "this opens"; the admin
        // buttons sit on top of the stretched link so they still get clicks.
        el.innerHTML = `
            <div class="preview">
                <h2 class="section-title" id="articleTitle-${slugId}"><a class="articleLink" href="${href}">${title}</a></h2>
                <p class="section-content previewContent">${preview}</p>
                <ul class="articleMeta">
                    <li><i class="fa-regular fa-calendar" aria-hidden="true"></i><time datetime="${rawDate}" data-iso="${AF.escapeHtml(isoDate)}">${shownDate}</time></li>
                </ul>
            </div>
            <div class="readMore">
                <span class="button backButton articleArrow" aria-hidden="true">
                    <i class="fa-solid fa-arrow-right"></i>
                </span>
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

    // The editor writes each article's title, date and preview into
    // index.json, so a card needs nothing else. A bare slug - added by hand,
    // per the editor's download message - still works, by fetching the file.
    function fromIndex(entry) {
        if (typeof entry === "string") {
            if (!AF.isValidSlug(entry)) return null;
            return loadArticle(entry);
        }

        if (!entry || typeof entry !== "object") return null;
        if (!AF.isValidSlug(entry.slug)) return null;

        return {
            slug: entry.slug,
            meta: {
                title: entry.title,
                date: entry.date,
                preview: entry.preview
            }
        };
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
            .then(function (entries) {
                if (!Array.isArray(entries)) {
                    throw new Error("index.json should contain a list of articles.");
                }

                return Promise.all(entries.map(fromIndex));
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
                labelCards();
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

    // i18n's pass over the page has usually run before the cards arrive, so the
    // dates are written here, and again whenever the language changes.
    function labelCards() {
        document.querySelectorAll(".articleMeta time[data-iso]").forEach(function (el) {
            el.textContent = AF.localDate(el.dataset.iso);
        });

    }

    if (window.i18n) window.i18n.onChange(labelCards);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", render);
    } else {
        render();
    }
})();
