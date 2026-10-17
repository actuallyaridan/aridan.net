/* The date and reading time over the privacy page, the same byline an
 * article has (see renderArticle in displayArticle.js). Written by script
 * rather than into the page so the date is shown the way the visitor's
 * language writes it, and so the reading time is counted from whatever
 * language the page is in.
 */
(function () {
    "use strict";

    var AF = window.ArticleFormat;
    var byline = document.getElementById("legalByline");
    var content = document.querySelector(".legal .article-content");

    if (!AF || !byline || !content) return;

    function translate(english, value) {
        if (window.i18n) return window.i18n.t(english, value);
        return english.split("{0}").join(value);
    }

    function item(iconClass, child) {
        var li = document.createElement("li");

        var icon = document.createElement("i");
        icon.className = iconClass;
        icon.setAttribute("aria-hidden", "true");

        li.appendChild(icon);
        li.appendChild(child);
        return li;
    }

    function render() {
        // When the policy last changed, from data-updated on the list itself.
        var iso = byline.dataset.updated;

        byline.textContent = "";

        if (iso) {
            var time = document.createElement("time");
            time.setAttribute("datetime", iso);
            time.textContent = AF.localDate(iso);

            byline.appendChild(item("fa-regular fa-calendar", time));
        }

        var minutes = AF.readingMinutes(content);

        var label = document.createElement("span");
        label.textContent = translate("{0} min read", minutes);

        byline.appendChild(item("fa-regular fa-clock", label));
        byline.hidden = false;
    }

    render();

    if (window.i18n) window.i18n.onChange(render);
})();
