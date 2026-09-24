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
    var el = {};

    function viewUrl(slug) {
        return "/articles/view/index.html?article=" + encodeURIComponent(slug);
    }

    var bodyEditor = {
        instance: null,
        get: function () {
            return this.instance ? this.instance.getMarkdown() : el.body.value;
        },
        set: function (text) {
            if (this.instance) this.instance.setMarkdown(text || "", false);
            else el.body.value = text || "";
        }
    };

    function applyEditorTheme() {
        if (!el.bodyHost || !bodyEditor.instance) return;
        el.bodyHost.classList.toggle(
            "toastui-editor-dark",
            document.documentElement.classList.contains("theme-dark")
        );
    }

    function useTextareaFallback() {
        el.body.classList.remove("hide");
        if (el.bodyHost) el.bodyHost.classList.add("hide");
    }

    function initBodyEditor() {
        var Editor = window.toastui && window.toastui.Editor;
        if (!el.bodyHost || !Editor) { useTextareaFallback(); return; }

        try {
            bodyEditor.instance = new Editor({
                el: el.bodyHost,
                height: "auto",
                minHeight: "420px",
                initialEditType: "wysiwyg",
                previewStyle: "vertical",
                hideModeSwitch: false,
                usageStatistics: false,
                autofocus: false,
                initialValue: ""
            });
            bodyEditor.instance.on("change", markDirty);
            applyEditorTheme();
            labelEditorControls();
            new MutationObserver(applyEditorTheme).observe(document.documentElement, {
                attributes: true, attributeFilter: ["class"]
            });
        } catch (err) {
            console.error("Couldn't start the rich editor, using a plain textarea:", err);
            useTextareaFallback();
        }
    }

    function labelEditorControls() {
        if (!el.bodyHost) return;

        var known = {
            more: "More formatting options",
            "scroll-sync": "Sync scrolling between editor and preview"
        };

        el.bodyHost.querySelectorAll("button").forEach(function (btn) {
            if (btn.getAttribute("aria-label") || btn.textContent.trim()) return;

            var name = btn.getAttribute("title");
            if (!name) {
                Object.keys(known).some(function (cls) {
                    if (btn.classList.contains(cls)) { name = known[cls]; return true; }
                    return false;
                });
            }
            if (name) btn.setAttribute("aria-label", t(name));
        });
    }

    var currentDir = null;
    var statusMessage = "";
    var statusKind = "";

    function folderText() {
        if (!Store.isSupported()) return Store.UNSUPPORTED;
        return currentDir
            ? t('Saving into "{0}".', currentDir.name)
            : t("No folder selected yet.");
    }

    function renderFolderBar() {
        if (!el.folderState || !el.folderBar) return;
        el.folderState.textContent = statusMessage || folderText();

        var problem = statusKind === "error" || (!statusMessage && !currentDir);
        el.folderBar.classList.toggle("resolved", !problem);
        el.folderBar.classList.toggle("ok", statusKind === "ok");

        if (el.pickFolder) {
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
        return AF.stringify({
            title: el.title.value.trim(),
            date: el.date.value,
            preview: el.preview.value.trim()
        }, bodyEditor.get());
    }

    function fillForm(meta, body) {
        el.title.value = meta.title || "";

        // <input type="date"> only accepts YYYY-MM-DD; anything else is left blank.
        var formatted = AF.formatDate(meta.date);
        if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
            el.date.value = formatted;
        } else {
            el.date.value = "";
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

        if (!/^\d{4}-\d{2}-\d{2}$/.test(el.date.value)) {
            return { field: el.date, message: t("Pick a date.") };
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
        renderFolderBar();
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
            date: document.getElementById("fieldDate"),
            preview: document.getElementById("fieldPreview"),
            body: document.getElementById("fieldBody"),
            bodyHost: document.getElementById("fieldBodyEditor"),
            layout: document.querySelector(".editorLayout"),
            spinner: document.getElementById("loading"),
            folderBar: document.getElementById("editorFolderBar"),
            folderState: document.getElementById("editorFolderState"),
            pickFolder: document.getElementById("editorPickFolder"),
            save: document.getElementById("saveArticle"),
            download: document.getElementById("downloadArticle"),
            remove: document.getElementById("deleteArticle")
        };
        if (!el.form || !el.title) return;

        el.date.value = AF.todayISO();
        initBodyEditor();

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
