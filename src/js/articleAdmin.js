(function () {
    "use strict";

    var Store = window.ArticleStore;

    function t(...args) {
        if (window.i18n) return window.i18n.t(...args);
        return args[0];
    }

    // These buttons are built in JavaScript, so i18n.js cannot find them by
    // selector. Each pushes a function here that redraws its own text.
    var retranslate = [];

    function editUrl(slug) {
        return "/articles/edit/index.html?article=" + encodeURIComponent(slug);
    }

    function button(className, title, icon) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "button " + className;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>';
        return b;
    }

    function notice(text, kind) {
        var bar = document.getElementById("articleAdminNotice");
        if (!bar) return;

        bar.textContent = text || "";

        if (kind) {
            bar.className = "articleAdminNotice " + kind;
        } else {
            bar.className = "articleAdminNotice";
        }
    }

    function addNoticeBar(parent) {
        var bar = document.createElement("p");
        bar.id = "articleAdminNotice";
        bar.className = "articleAdminNotice";
        bar.setAttribute("role", "status");
        bar.setAttribute("aria-live", "polite");
        parent.appendChild(bar);
        return bar;
    }

    function addNewButton() {
        var info = document.querySelector("main.container .info > div");
        if (!info || document.getElementById("newArticleButton")) return;

        var link = document.createElement("a");
        link.id = "newArticleButton";
        link.className = "button primary";
        link.href = "/articles/new/";
        link.innerHTML = '<i class="fa-solid fa-plus"></i>' + t("New article");
        info.appendChild(link);

        // No browser warning here: the editor's folder bar says so where it
        // matters, when there is something to save.
        addNoticeBar(info);

        retranslate.push(function () {
            link.innerHTML = '<i class="fa-solid fa-plus"></i>' + t("New article");
        });
    }

    function removeArticle(slug, onGone) {
        var question = t('Delete "{0}"?', slug);
        var warning = t("This deletes the file from assets/content/articles/ and cannot be undone.");

        if (!confirm(question + "\n\n" + warning)) return;

        notice(t("Deleting {0}…", slug));

        // Prompting for a folder is only allowed because this runs from a click.
        Store.getDir(true)
            .then(function (dir) {
                if (!dir) {
                    notice(t("No folder selected, so nothing was deleted."), "error");
                    return;
                }

                return Store.deleteArticle(dir, slug)
                    .then(function () {
                        // index.json would keep advertising the deleted article.
                        return Store.rebuildIndex(dir);
                    })
                    .then(function (slugs) {
                        onGone(slugs);
                    });
            })
            .catch(function (err) {
                console.error(err);
                notice(t("Couldn't delete {0}: {1}", slug, err.message), "error");
            });
    }

    function disableDelete(del) {
        del.disabled = true;
        del.title = Store.CANNOT_DELETE;
        del.setAttribute("aria-label", Store.CANNOT_DELETE);
        retranslate.push(function () {
            del.title = Store.CANNOT_DELETE;
            del.setAttribute("aria-label", Store.CANNOT_DELETE);
        });
    }

    // Edit and Delete live on the article page only, not on the cards in the
    // list - one step further from deleting something by accident.
    function enhance() {
        addNewButton();
    }

    function decorateArticle(slug) {
        var meta = document.querySelector(".full-article .info > div");
        if (!meta || document.getElementById("articleAdminBar")) return;

        var back = meta.querySelector("a.backButton");
        var row = document.createElement("div");
        row.id = "articleAdminBar";
        row.className = "articleAdminBar";

        if (back) row.appendChild(back);

        // Edit is a button of its own, and the page's main action, so it is
        // .primary like New article and Save. Only Delete goes in the menu.
        var edit = document.createElement("a");
        edit.className = "button primary";
        edit.href = editUrl(slug);

        var del = document.createElement("button");
        del.type = "button";
        del.className = "articleDelete";

        function label() {
            edit.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>' + t("Edit");
            del.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>' + t("Delete");
        }
        label();
        retranslate.push(label);

        if (Store.isSupported()) {
            del.addEventListener("click", function () {
                removeArticle(slug, function () {
                    location.href = "/articles/";
                });
            });
        } else {
            disableDelete(del);
        }

        row.appendChild(edit);
        // Delete is kept behind the "more" menu - see articleMenu.js. Should a
        // cached page not load that yet, it is a plain button rather than
        // missing, which would take the whole row with it.
        if (window.ArticleMenu) {
            row.appendChild(window.ArticleMenu.create([del]));
        } else {
            del.className = "button destructive";
            row.appendChild(del);
        }

        meta.appendChild(row);
        addNoticeBar(meta);
    }

    function init() {
        if (!Store) return;
        if (!Store.isLocalHost()) return;

        if (window.i18n) {
            window.i18n.onChange(function () {
                for (const redraw of retranslate) {
                    redraw();
                }
            });
        }

        var onArticlePage = /\/articles\/view\//.test(location.pathname);

        if (onArticlePage) {
            document.addEventListener("article:rendered", function (event) {
                decorateArticle(event.detail.slug);
            });

            // The article is in the HTML from the start, so it is the class
            // displayArticle.js adds that says it actually loaded.
            if (document.querySelector(".full-article.isLoaded")) {
                var slug = new URLSearchParams(location.search).get("article");
                if (slug) decorateArticle(slug);
            }

            return;
        }

        document.addEventListener("articles:rendered", enhance);

        if (document.querySelector(".articlePreview[data-slug]")) {
            enhance();
        } else {
            addNewButton();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
