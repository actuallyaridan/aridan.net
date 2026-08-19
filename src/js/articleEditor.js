(function () {
    "use strict";

    var AF = window.ArticleFormat;
    var Store = window.ArticleStore;
    var COLORS = [
        { value: "default", label: "Default" },
        { value: "blue", label: "Blue" }
    ];

    var isEdit = /\/articles\/edit\//.test(location.pathname);
    var originalSlug = null;
    var slugEditedByHand = false;
    var el = {};

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

    function siteIsDark() {
        return document.documentElement.classList.contains("theme-dark");
    }

    function applyEditorTheme() {
        var host = document.getElementById("fieldBodyEditor");
        if (!host || !bodyEditor.instance) return;
        host.classList.toggle("toastui-editor-dark", siteIsDark());
    }

    function useTextareaFallback() {
        el.body.classList.remove("hide");
        var host = document.getElementById("fieldBodyEditor");
        if (host) host.classList.add("hide");
    }

    function initBodyEditor(initialMarkdown) {
        var host = document.getElementById("fieldBodyEditor");
        var Editor = window.toastui && window.toastui.Editor;
        if (!host || !Editor) { useTextareaFallback(); return; }

        try {
            bodyEditor.instance = new Editor({
                el: host,
                height: "520px",
                initialEditType: "wysiwyg",
                previewStyle: "vertical",
                hideModeSwitch: false,
                usageStatistics: false,
                autofocus: false,
                initialValue: initialMarkdown || ""
            });
            applyEditorTheme();
            new MutationObserver(applyEditorTheme).observe(document.documentElement, {
                attributes: true, attributeFilter: ["class"]
            });
        } catch (err) {
            console.error("Couldn't start the rich editor, using a plain textarea:", err);
            useTextareaFallback();
        }
    }

    function status(message, kind) {
        el.status.innerHTML = "";
        el.status.className = "editorStatus" + (kind ? " " + kind : "");
        if (message) el.status.appendChild(document.createTextNode(message));
    }

    function collectCategories() {
        return Array.from(el.categoryList.querySelectorAll(".editorCategory"))
            .map(function (row) {
                return {
                    name: row.querySelector(".categoryName").value.trim(),
                    color: row.querySelector(".categoryColor").value
                };
            })
            .filter(function (cat) { return cat.name; });
    }

    function buildFile() {
        var meta = {
            title: el.title.value.trim(),
            date: el.date.value,
            preview: el.preview.value.trim()
        };
        var cats = collectCategories();
        if (cats.length) meta.categories = cats;
        return AF.stringify(meta, bodyEditor.get());
    }

    function addCategoryRow(name, color) {
        var row = document.createElement("div");
        row.className = "editorCategory";
        row.innerHTML =
            '<input type="text" class="button categoryName" placeholder="Design">' +
            '<select class="button categoryColor">' +
                COLORS.map(function (c) {
                    return '<option value="' + c.value + '">' + c.label + "</option>";
                }).join("") +
            "</select>" +
            '<button type="button" class="button destructive removeCategory" title="Remove">' +
                '<i class="fa-solid fa-xmark"></i>' +
            "</button>";
        row.querySelector(".categoryName").value = name || "";
        if (color) row.querySelector(".categoryColor").value = color;
        row.querySelector(".removeCategory").addEventListener("click", function () {
            row.remove();
        });
        el.categoryList.appendChild(row);
    }

    function validate() {
        if (!el.title.value.trim()) return "Give the article a title.";
        if (!el.slug.value.trim()) return "Give the article a file name.";
        if (!AF.isValidSlug(el.slug.value.trim()))
            return "File name can only use lowercase letters, numbers and dashes.";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(el.date.value)) return "Pick a date.";
        if (!bodyEditor.get().trim()) return "The article has no body yet.";
        return null;
    }

    function setFolderState(dir) {
        var bar = document.getElementById("editorFolderBar");
        el.folderState.textContent = dir
            ? 'Saving into "' + dir.name + '".'
            : "No folder chosen yet.";
        if (bar) bar.classList.toggle("resolved", !!dir);
        var pick = document.getElementById("editorPickFolder");
        if (pick) pick.textContent = dir ? "Change folder" : "Choose folder";
    }

    function chooseFolder() {
        return Store.getDir(true).then(function (dir) {
            setFolderState(dir);
            if (dir) status("");
            return dir;
        }).catch(function (err) {
            status("Couldn't open that folder: " + err.message, "error");
            return null;
        });
    }

    function fillForm(meta, body) {
        el.title.value = meta.title || "";
        el.date.value = /^\d{4}-\d{2}-\d{2}$/.test(meta.date || "")
            ? meta.date
            : AF.dateSortKey(meta.date);
        el.preview.value = meta.preview || "";
        bodyEditor.set(body || "");
        el.categoryList.innerHTML = "";
        (Array.isArray(meta.categories) ? meta.categories : []).forEach(function (cat) {
            if (cat && typeof cat === "object") addCategoryRow(cat.name, cat.color);
        });
    }

    function loadForEditing() {
        var slug = new URLSearchParams(location.search).get("article");
        if (!slug || !AF.isValidSlug(slug)) {
            status("No article to edit - open this page from the Articles list.", "error");
            el.save.disabled = true;
            return;
        }
        originalSlug = slug;
        el.slug.value = slug;
        el.slug.readOnly = true;
        el.slugHint.textContent = "Fixed for an existing article, so its address doesn't change.";

        fetch(AF.DIR_URL + encodeURIComponent(slug) + ".md", { cache: "no-cache" })
            .then(function (res) {
                if (!res.ok) throw new Error("Couldn't load " + slug + ".md (" + res.status + ").");
                return res.text();
            })
            .then(function (text) {
                var parsed = AF.parse(text);
                fillForm(parsed.meta, parsed.body);
                status("");
            })
            .catch(function (err) {
                status(err.message, "error");
                el.save.disabled = true;
            });
    }

    function save(event) {
        event.preventDefault();
        var problem = validate();
        if (problem) { status(problem, "error"); return; }

        if (!Store.isSupported()) {
            status("This browser can't write files directly - use Download .md instead.", "error");
            return;
        }

        var slug = el.slug.value.trim();

        chooseFolder().then(function (dir) {
            if (!dir) { status("No folder chosen, so nothing was saved.", "error"); return; }

            return Store.exists(dir, slug).then(function (already) {
                var overwritingAnother = already && slug !== originalSlug;
                if (overwritingAnother &&
                    !confirm(slug + ".md already exists in this folder. Overwrite it?")) {
                    status("Nothing was saved.");
                    return;
                }
                status("Saving…");
                return Store.writeArticle(dir, slug, buildFile())
                    .then(function () { return Store.rebuildIndex(dir); })
                    .then(function () {
                        status("Saved " + slug + ".md. Opening it\u2026", "ok");
                        location.href =
                            "/articles/view/index.html?article=" + encodeURIComponent(slug);
                    });
            });
        }).catch(function (err) {
            console.error(err);
            status("Couldn't save: " + err.message, "error");
        });
    }

    function remove() {
        if (!originalSlug) return;
        if (!confirm('Delete "' + originalSlug + '"?\n\nThis deletes the file from ' +
                     'assets/content/articles/ and cannot be undone.')) {
            return;
        }
        status("Deleting\u2026");
        Store.getDir(true)
            .then(function (dir) {
                if (!dir) { status("No folder chosen, so nothing was deleted.", "error"); return; }
                return Store.deleteArticle(dir, originalSlug)
                    .then(function () { return Store.rebuildIndex(dir); })
                    .then(function () {
                        location.href = "/articles/";
                    });
            })
            .catch(function (err) {
                console.error(err);
                status("Couldn't delete " + originalSlug + ": " + err.message, "error");
            });
    }

    function download() {
        var problem = validate();
        if (problem) { status(problem, "error"); return; }
        var slug = el.slug.value.trim();
        var blob = new Blob([buildFile()], { type: "text/markdown" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = slug + ".md";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        status(
            isEdit
                ? "Downloaded " + slug + ".md - replace the file of the same name in " +
                  "assets/content/articles/ to save your changes."
                : "Downloaded " + slug + '.md - move it into assets/content/articles/ and add "' +
                  slug + '" to index.json.',
            "ok"
        );
    }

    function init() {
        el = {
            title: document.getElementById("fieldTitle"),
            slug: document.getElementById("fieldSlug"),
            slugHint: document.getElementById("slugHint"),
            date: document.getElementById("fieldDate"),
            preview: document.getElementById("fieldPreview"),
            body: document.getElementById("fieldBody"),
            categoryList: document.getElementById("categoryList"),
            status: document.getElementById("editorStatus"),
            folderState: document.getElementById("editorFolderState"),
            save: document.getElementById("saveArticle")
        };
        if (!el.title) return;

        el.date.value = AF.todayISO();

        el.title.addEventListener("input", function () {
            if (!isEdit && !slugEditedByHand) el.slug.value = AF.slugify(el.title.value);
        });
        el.slug.addEventListener("input", function () {
            slugEditedByHand = el.slug.value.trim() !== "";
        });
        initBodyEditor("");

        document.getElementById("addCategory").addEventListener("click", function () {
            addCategoryRow("", "default");
        });
        document.getElementById("editorPickFolder").addEventListener("click", chooseFolder);
        document.getElementById("editorForm").addEventListener("submit", save);
        document.getElementById("downloadArticle").addEventListener("click", download);

        var deleteButton = document.getElementById("deleteArticle");
        if (deleteButton) {
            if (Store.isSupported()) {
                deleteButton.addEventListener("click", remove);
            } else {
                deleteButton.disabled = true;
                deleteButton.title = "Deleting needs Chrome, Edge or Opera.";
            }
        }

        if (!Store.isSupported()) {
            document.getElementById("editorPickFolder").remove();
            el.save.disabled = true;
            el.save.title = "Saving needs Chrome, Edge or Opera.";
            var dl = document.getElementById("downloadArticle");
            dl.classList.add("primary");
            el.folderState.textContent = "This browser can't save to a folder - use Download .md.";
        } else {
            Store.getDir(false).then(setFolderState);
        }

        if (isEdit) loadForEditing();

        el.title.focus({ preventScroll: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
