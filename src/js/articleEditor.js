(function () {
    "use strict";

    var AF = window.ArticleFormat;
    var Store = window.ArticleStore;

    function t() {
        return window.i18n ? window.i18n.t.apply(null, arguments) : arguments[0];
    }

    var isEdit = /\/articles\/edit\//.test(location.pathname);
    var originalSlug = null;
    var slugEditedByHand = false;
    var dirty = false;
    var busy = false;

    // Front matter the form has no field for, kept from the loaded file so a
    // save writes it back. See fillForm() and the stringify call.
    var extraMeta = {};

    // There is no date field: a new article is dated the day it is written,
    // and an edited one keeps its date - see fillForm().
    var articleDate = AF.todayISO();
    var el = {};

    function viewUrl(slug) {
        return "/articles/view/index.html?article=" + encodeURIComponent(slug);
    }

    // The body is a plain Markdown textarea. (It was a Toast UI rich editor
    // once; this wrapper is the one place that would change to bring one back.)
    var bodyEditor = {
        get: function () {
            return el.body.value;
        },
        set: function (text) {
            el.body.value = text || "";
        }
    };

    var currentDir = null;
    var statusMessage = "";
    var statusKind = "";

    // What else is in the chosen folder besides articles - see
    // Store.strayEntries(). Anything there means it may be the wrong folder.
    var strays = [];

    // A few of them by name is enough to recognise the folder by.
    function strayList() {
        var shown = strays.slice(0, 3).map(function (name) {
            return '"' + name + '"';
        });
        if (strays.length > 3) shown.push("…");
        return shown.join(", ");
    }

    function folderText() {
        if (!Store.isSupported()) return Store.UNSUPPORTED;
        if (!currentDir) return t("No folder selected yet.");

        if (strays.length) {
            return t('Saving into "{0}", but it also has {1} in it. Is this really the articles folder?',
                currentDir.name, strayList());
        }

        return t('Saving into "{0}".', currentDir.name);
    }

    // What the folder bar is saying, which picks its icon and colour in
    // editor.css. Only an error is red. While busy, the site's loading ring
    // (#editorFolderLoader) shows instead of an icon.
    var FOLDER_ICONS = {
        empty: "fa-circle-exclamation",
        suspect: "fa-circle-exclamation",
        ready: "fa-folder",
        busy: "fa-folder",
        ok: "fa-circle-check",
        error: "fa-circle-xmark",
        unsupported: "fa-circle-exclamation"
    };

    function folderState() {
        if (statusKind === "error") return "error";
        if (statusKind === "ok") return "ok";
        if (statusMessage) return "busy";
        if (!Store.isSupported()) return "unsupported";
        if (!currentDir) return "empty";
        if (strays.length) return "suspect";
        return "ready";
    }

    function renderFolderBar() {
        if (!el.folderState || !el.folderBar) return;
        el.folderState.textContent = statusMessage || folderText();

        var state = folderState();
        el.folderBar.dataset.state = state;
        if (el.folderIcon) el.folderIcon.className = "fa-solid " + FOLDER_ICONS[state];

        if (el.pickFolder) {
            // The one thing to do while there is no folder, so it is the
            // primary button; after that it is only "Change".
            el.pickFolder.classList.toggle("primary", !currentDir);
            el.pickFolder.textContent = currentDir ? t("Change") : t("Select folder");
            el.pickFolder.title = currentDir
                ? t("Pick a different folder")
                : t("Pick assets/content/articles/");
        }
    }

    function status(message, kind) {
        statusMessage = message || "";
        statusKind = statusMessage ? (kind || "") : "";
        renderFolderBar();
    }

    function isShowingError() {
        return statusKind === "error";
    }

    function markDirty() {
        dirty = true;
        if (isShowingError() && !el.save.disabled) status("");
    }

    function setBusy(state) {
        busy = state;
        [el.save, el.download, el.remove, el.pickFolder].forEach(function (button) {
            if (button && !button.dataset.permanentlyDisabled) button.disabled = state;
        });
    }

    var disabledReasons = [];

    function disablePermanently(button, why) {
        if (!button) return;
        button.disabled = true;
        button.title = typeof why === "function" ? why() : why;
        button.dataset.permanentlyDisabled = "true";
        disabledReasons.push([button, why]);
    }

    function refreshDisabledReasons() {
        disabledReasons.forEach(function (pair) {
            var element = pair[0];
            var reason = pair[1];

            if (typeof reason === "function") {
                element.title = reason();
            } else {
                element.title = reason;
            }
        });
    }

    function buildFile() {
        // Anything in the front matter the form has no field for - an article's
        // icon, say - is carried through from the file as it was loaded, so
        // saving here does not quietly drop it.
        var meta = Object.assign({}, extraMeta, {
            title: el.title.value.trim(),
            date: articleDate,
            preview: el.preview.value.trim()
        });

        return AF.stringify(meta, bodyEditor.get());
    }

    function fillForm(meta, body) {
        extraMeta = {};
        for (var key in meta) {
            if (key === "title" || key === "date" || key === "preview") continue;
            extraMeta[key] = meta[key];
        }

        el.title.value = meta.title || "";

        // An edited article keeps the date it was published on; only one
        // with no readable date gets today's.
        var formatted = AF.formatDate(meta.date);
        if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
            articleDate = formatted;
        } else {
            articleDate = AF.todayISO();
        }

        el.preview.value = meta.preview || "";
        bodyEditor.set(body || "");

        dirty = false;
    }

    // `field` is what to focus, and is null for the body, which is not an input.
    function validate() {
        if (!el.title.value.trim()) {
            return { field: el.title, message: t("Give the article a title.") };
        }

        var slug = el.slug.value.trim();

        if (!slug) {
            return { field: el.slug, message: t("Give the article a file name.") };
        }

        if (!AF.isValidSlug(slug)) {
            return {
                field: el.slug,
                message: t("File name can only use lowercase letters, numbers and dashes.")
            };
        }

        if (!bodyEditor.get().trim()) {
            return { field: null, message: t("The article has no body yet.") };
        }

        return null;
    }

    function reportProblem(problem) {
        status(problem.message, "error");
        if (problem.field) problem.field.focus({ preventScroll: false });
    }

    function setFolderState(dir) {
        currentDir = dir;
        strays = [];
        renderFolderBar();

        // Looked at after the bar is drawn, so it never waits on the check.
        // Only applied if the folder has not changed again meanwhile.
        if (dir) {
            Store.strayEntries(dir).then(function (found) {
                if (currentDir !== dir) return;
                strays = found;
                renderFolderBar();
            });
        }

        return dir;
    }

    function confirmUnfamiliar(dir) {
        if (!dir) return Promise.resolve(null);
        return Store.looksLikeArticlesDir(dir).then(function (looksRight) {
            if (looksRight) return dir;
            var ok = confirm(
                t('"{0}" has no articles in it.', dir.name) + "\n\n" +
                t("Saving here creates a new index.json in that folder. Use it anyway?")
            );
            return ok ? dir : null;
        });
    }

    function pickFolder() {
        return Store.pickDir()
            .then(confirmUnfamiliar)
            .then(function (dir) {
                if (!dir) return Store.savedDir(false).then(setFolderState);
                setFolderState(dir);
                if (isShowingError()) status("");
                return dir;
            })
            .catch(function (err) {
                status(t("Couldn't open that folder: {0}", err.message), "error");
                return null;
            });
    }

    function ensureFolder() {
        return Store.getDir(true).then(setFolderState);
    }

    function failed(key, arg) {
        return function (err) {
            console.error(err);
            status(t(key, arg, err.message), "error");
        };
    }

    function save(event) {
        if (event) event.preventDefault();
        if (busy) return;

        var problem = validate();
        if (problem) { reportProblem(problem); return; }

        if (!Store.isSupported()) {
            status(Store.UNSUPPORTED, "error");
            return;
        }

        var slug = el.slug.value.trim();
        var contents = buildFile();

        setBusy(true);
        status(t("Saving…"));

        ensureFolder()
            .then(function (dir) {
                if (!dir) {
                    status(t("No folder selected, so nothing was saved."), "error");
                    return;
                }

                return Store.exists(dir, slug).then(function (already) {
                    // Saving over the article being edited needs no confirmation.
                    var wouldClobber = already && slug !== originalSlug;

                    if (wouldClobber) {
                        var question = t("{0}.md already exists in this folder. Overwrite it?", slug);
                        if (!confirm(question)) {
                            status(t("Nothing was saved."));
                            return;
                        }
                    }

                    return Store.writeArticle(dir, slug, contents)
                        .then(function () {
                            return Store.rebuildIndex(dir);
                        })
                        .then(function () {
                            dirty = false;   // stops the "unsaved changes" prompt
                            status(t("Saved {0}.md. Opening it…", slug), "ok");
                            location.href = viewUrl(slug);
                        });
                });
            })
            .catch(failed("Couldn't save {0}.md: {1}", slug))
            .finally(function () {
                setBusy(false);
            });
    }

    function remove() {
        if (busy) return;
        if (!originalSlug) return;   // nothing saved yet, nothing to delete

        var question = t('Delete "{0}"?', originalSlug);
        var warning = t("This deletes the file from assets/content/articles/ and cannot be undone.");

        if (!confirm(question + "\n\n" + warning)) return;

        setBusy(true);
        status(t("Deleting…"));

        ensureFolder()
            .then(function (dir) {
                if (!dir) {
                    status(t("No folder selected, so nothing was deleted."), "error");
                    return;
                }

                return Store.deleteArticle(dir, originalSlug)
                    .then(function () {
                        return Store.rebuildIndex(dir);
                    })
                    .then(function () {
                        dirty = false;
                        location.href = "/articles/";
                    });
            })
            .catch(failed("Couldn't delete {0}: {1}", originalSlug))
            .finally(function () {
                setBusy(false);
            });
    }

    // The fallback for browsers without the folder-picking API.
    function download() {
        var problem = validate();
        if (problem) {
            reportProblem(problem);
            return;
        }

        var slug = el.slug.value.trim();

        var blob = new Blob([buildFile()], { type: "text/markdown" });
        var url = URL.createObjectURL(blob);

        var a = document.createElement("a");
        a.href = url;
        a.download = slug + ".md";
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Released once the download has had a moment to start.
        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 1000);

        var message;
        if (isEdit) {
            message = t("Downloaded {0}.md. Replace the file of the same name with it in assets/content/articles/.", slug);
        } else {
            message = t('Downloaded {0}.md. Move it into assets/content/articles/ and add "{0}" to index.json.', slug);
        }

        status(message, "ok");
    }

    function showSpinner(state) {
        if (!el.spinner) return;
        if (state) el.spinner.style.display = "block";
        else el.spinner.style.display = "none";
    }

    function revealForm() {
        showSpinner(false);
        el.layout.classList.remove("hide");
    }

    function cannotEdit(message, why) {
        showSpinner(false);
        status(message, "error");
        disablePermanently(el.save, why);
        disablePermanently(el.remove, why);
    }

    function loadForEditing() {
        var slug = new URLSearchParams(location.search).get("article");
        if (!slug || !AF.isValidSlug(slug)) {
            cannotEdit(t("No article to edit - open this page from the Articles list."),
                       t("There's no article loaded."));
            return;
        }

        originalSlug = slug;
        el.slug.value = slug;
        el.slug.readOnly = true;
        el.slugHint.textContent = t("You can't change the file name of an existing article.");

        fetch(AF.DIR_URL + encodeURIComponent(slug) + ".md", { cache: "no-cache" })
            .then(function (res) {
                if (!res.ok) throw new Error(t("Couldn't load {0}.md ({1}).", slug, res.status));
                return res.text();
            })
            .then(function (text) {
                var parsed = AF.parse(text);
                fillForm(parsed.meta, parsed.body);
                revealForm();
                status("");
            })
            .catch(function (err) {
                cannotEdit(err.message, t("This article couldn't be loaded."));
            });
    }

    function bindShortcuts() {
        document.addEventListener("keydown", function (event) {
            if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
                event.preventDefault();
                if (!el.save.disabled) save();
            }
        });

        window.addEventListener("beforeunload", function (event) {
            if (!dirty) return;
            event.preventDefault();
            event.returnValue = "";
        });
    }

    function init() {
        el = {
            form: document.getElementById("editorForm"),
            title: document.getElementById("fieldTitle"),
            slug: document.getElementById("fieldSlug"),
            slugHint: document.getElementById("slugHint"),
            preview: document.getElementById("fieldPreview"),
            body: document.getElementById("fieldBody"),
            layout: document.querySelector(".editorLayout"),
            spinner: document.getElementById("loading"),
            folderBar: document.getElementById("editorFolderBar"),
            folderState: document.getElementById("editorFolderState"),
            folderIcon: document.getElementById("editorFolderIcon"),
            pickFolder: document.getElementById("editorPickFolder"),
            save: document.getElementById("saveArticle"),
            download: document.getElementById("downloadArticle"),
            remove: document.getElementById("deleteArticle")
        };
        if (!el.form || !el.title) return;


        el.form.addEventListener("input", markDirty);
        el.form.addEventListener("submit", save);
        el.title.addEventListener("input", function () {
            if (!isEdit && !slugEditedByHand) el.slug.value = AF.slugify(el.title.value);
        });
        el.slug.addEventListener("input", function () {
            slugEditedByHand = el.slug.value.trim() !== "";
        });

        el.download.addEventListener("click", download);
        if (el.remove) el.remove.addEventListener("click", remove);
        if (el.pickFolder) el.pickFolder.addEventListener("click", pickFolder);

        if (window.i18n) {
            window.i18n.onChange(function () {
                renderFolderBar();
                refreshDisabledReasons();
            });
        }

        if (Store.isSupported()) {
            Store.savedDir(false).then(setFolderState);
        } else {
            if (el.pickFolder) el.pickFolder.remove();
            el.pickFolder = null;
            disablePermanently(el.save, function () { return Store.CANNOT_SAVE; });
            disablePermanently(el.remove, function () { return Store.CANNOT_DELETE; });
            renderFolderBar();
            el.download.classList.add("primary");
        }

        bindShortcuts();

        if (isEdit) loadForEditing();

        el.title.focus({ preventScroll: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
