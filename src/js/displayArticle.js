(function () {
    "use strict";

    var AF = window.ArticleFormat;

    // An article's own icon, as Font Awesome classes - "fa-brands
    // fa-raspberry-pi". Checked, since it comes from the front matter.
    var ICON_CLASSES = /^fa-[a-z]+( fa-[a-z0-9-]+)+$/;

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

    // The newspaper, unless the article has an icon of its own.
    function setIcon(classes) {
        var icon = document.getElementById("articleIcon");
        if (!icon) return;
        if (!classes) return;
        if (!ICON_CLASSES.test(classes)) return;

        icon.className = classes + " icon-background";
    }

    // The hero is already in the page, so only its text is written here;
    // replacing it would make it flash while the body loads.
    function renderArticle(meta, bodyHtml) {
        var preview = meta.preview || "";
        setHero(meta.title || "Untitled article", preview);
        setIcon(meta.icon);

        // Already HTML, produced by marked, so it must not be escaped.
        var content = document.querySelector(".full-article .article-content");
        content.innerHTML = bodyHtml;
        if (window.markExternalLinks) window.markExternalLinks(content);

        // After the body, since the reading time is counted from it.
        var rawDate = AF.escapeHtml(meta.date || "");
        var isoDate = AF.formatDate(meta.date) || "";
        var shownDate = AF.escapeHtml(AF.localDate(isoDate));
        var minutes = AF.readingMinutes(content);

        var byline = document.getElementById("articleByline");
        byline.innerHTML = `<li><i class="fa-regular fa-calendar" aria-hidden="true"></i><time datetime="${rawDate}" data-iso="${AF.escapeHtml(isoDate)}">${shownDate}</time></li>` +
            `<li><i class="fa-regular fa-clock" aria-hidden="true"></i><span data-minutes="${minutes}">${AF.escapeHtml(minutesLabel(minutes))}</span></li>`;
        byline.hidden = false;
    }

    function minutesLabel(minutes) {
        return translate("{0} min read", minutes);
    }

    function translate(english, value) {
        if (window.i18n) return window.i18n.t(english, value);
        return english.split("{0}").join(value);
    }

    /* ---------- Newer and older ----------

       Under the article, a card for the one written after it and the one
       before, in the same order as the article list. Built like the list's
       cards, so they look and behave the same. */

    function renderPager(slug) {
        fetch(AF.INDEX_URL, { cache: "no-cache" })
            .then(function (res) {
                if (!res.ok) throw new Error("http " + res.status);
                return res.json();
            })
            .then(function (list) {
                var entries = pagerEntries(list);

                var index = -1;
                for (var i = 0; i < entries.length; i++) {
                    if (entries[i].slug === slug) index = i;
                }

                // Not in the list - a draft opened by its address, say - so
                // there is nothing to be newer or older than.
                if (index === -1) return;

                var cards = [];

                // Newest first, so the one before this in the list is newer.
                if (index > 0) {
                    cards.push(pagerCard(entries[index - 1], "Newer"));
                }

                if (index < entries.length - 1) {
                    cards.push(pagerCard(entries[index + 1], "Older"));
                }

                if (!cards.length) return;

                var nav = document.createElement("nav");
                nav.className = "articlePager";
                nav.setAttribute("aria-label", translate("More articles"));

                for (var c = 0; c < cards.length; c++) {
                    nav.appendChild(cards[c]);
                }

                document.querySelector(".full-article").appendChild(nav);
            })
            .catch(function (err) {
                // Only an extra, so the article stays up without it.
                console.error("Could not load the other articles:", err);
            });
    }

    // Bare slugs in index.json have nothing to show on a card, so only full
    // entries are used. Sorted the way the article list sorts them.
    function pagerEntries(list) {
        var entries = [];
        if (!Array.isArray(list)) return entries;

        for (var i = 0; i < list.length; i++) {
            var entry = list[i];
            if (!entry || typeof entry !== "object") continue;
            if (!AF.isValidSlug(entry.slug)) continue;
            entries.push(entry);
        }

        // The dates are YYYY-MM-DD, so plain text comparison is date order.
        entries.sort(function (a, b) {
            return String(b.date || "").localeCompare(String(a.date || ""));
        });

        return entries;
    }

    function pagerCard(entry, label) {
        var title = AF.escapeHtml(entry.title || "Untitled article");
        var preview = AF.escapeHtml(entry.preview || "");
        var href = AF.escapeHtml("/articles/view/?article=" + encodeURIComponent(entry.slug));

        var icon = "fa-solid fa-arrow-up";
        if (label === "Older") {
            icon = "fa-solid fa-arrow-down";
        }

        var el = document.createElement("div");
        el.className = "section articlePreview";

        el.innerHTML = `
            <div class="preview">
                <h2 class="section-title"><a class="articleLink" href="${href}">${title}</a></h2>
                <p class="section-content previewContent">${preview}</p>
                <ul class="articleMeta">
                    <li><i class="${icon}" aria-hidden="true"></i><span data-label="${label}">${AF.escapeHtml(translate(label))}</span></li>
                </ul>
            </div>
            <div class="readMore">
                <span class="button backButton articleArrow" aria-hidden="true">
                    <i class="fa-solid fa-arrow-right"></i>
                </span>
            </div>`;

        return el;
    }

    // Written again when the language changes, like the dates in the list.
    function relabel() {
        document.querySelectorAll(".articleByline time[data-iso]").forEach(function (el) {
            el.textContent = AF.localDate(el.dataset.iso);
        });

        document.querySelectorAll(".articleByline [data-minutes]").forEach(function (el) {
            el.textContent = minutesLabel(el.dataset.minutes);
        });

        document.querySelectorAll(".articlePager [data-label]").forEach(function (el) {
            el.textContent = translate(el.dataset.label);
        });

        var pager = document.querySelector(".articlePager");
        if (pager) {
            pager.setAttribute("aria-label", translate("More articles"));
        }
    }

    if (window.i18n) window.i18n.onChange(relabel);

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

                renderPager(slug);

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
