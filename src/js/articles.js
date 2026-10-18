/* Everything for articles, in the order each part needs the ones before it:
 * ArticleFormat first, since every other part reads it as it starts, then
 * ArticleStore. Each part checks for its own page before doing anything, so
 * the whole file can be loaded on every article page (and the privacy page,
 * for ArticleFormat).
 */

/* ---------- Front matter, dates and other shared helpers (ArticleFormat) ---------- */

(function (global) {
    "use strict";

    /* Matches the front matter fence at the top of an article:
     *
     *     ---
     *     title: Hello
     *     ---
     *     The body starts here.
     */
    var FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

    function stripQuotes(v) {
        if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
            return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        }
        if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") {
            return v.slice(1, -1).replace(/''/g, "'");
        }
        return v;
    }

    function quoteIfNeeded(v) {
        var s = String(v);

        if (s === "") return '""';

        if (/^\s|\s$/.test(s)) return quote(s);

        if (s.indexOf(": ") !== -1) return quote(s);
        if (s.indexOf(" #") !== -1) return quote(s);

        if (/^[-?:[\]{}#&*!|>%@`"']/.test(s)) return quote(s);

        if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return quote(s);

        return s;
    }

    // Backslashes first, or the ones added below would themselves be escaped.
    function quote(s) {
        var escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return '"' + escaped + '"';
    }

    function splitKey(line) {
        var colon = line.indexOf(":");
        if (colon < 0) return null;

        var key = line.slice(0, colon).trim();

        // A key has to look like a name, so a body line with a colon is not one.
        if (!/^[A-Za-z_][\w-]*$/.test(key)) return null;

        return { key: key, value: line.slice(colon + 1).trim() };
    }

    function parse(text) {
        var src = String(text == null ? "" : text);

        // A byte order mark left in place would stop the --- fence matching.
        src = src.replace(/^﻿/, "");

        var m = src.match(FENCE);

        if (!m) return { meta: {}, body: src.trim() };

        var meta = {};
        var lines = m[1].split(/\r?\n/);
        var listKey = null;
        var listItem = null;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line.trim() || /^\s*#/.test(line)) continue;

            // Indentation is what separates a list item from a new key.
            var indent = line.length - line.replace(/^\s*/, "").length;
            var trimmed = line.trim();

            if (listKey && indent > 0 && trimmed[0] === "-") {
                var rest = trimmed.slice(1).trim();
                var pair = splitKey(rest);
                if (pair) {
                    listItem = {};
                    listItem[pair.key] = stripQuotes(pair.value);
                    meta[listKey].push(listItem);
                } else {
                    listItem = null;
                    meta[listKey].push(stripQuotes(rest));
                }
                continue;
            }

            if (listItem && indent > 0) {
                var sub = splitKey(trimmed);
                if (sub) {
                    listItem[sub.key] = stripQuotes(sub.value);
                    continue;
                }
            }

            var top = splitKey(trimmed);
            if (!top) continue;

            listKey = null;
            listItem = null;

            if (top.value === "") {
                meta[top.key] = [];
                listKey = top.key;
            } else if (top.value === "[]") {
                meta[top.key] = [];
            } else {
                meta[top.key] = stripQuotes(top.value);
            }
        }

        return { meta: meta, body: src.slice(m[0].length).trim() };
    }

    var KEY_ORDER = ["title", "date", "preview"];

    function stringify(meta, body) {
        var keys = Object.keys(meta || {});

        // KEY_ORDER first, then the rest alphabetically, so saves are stable.
        keys.sort(function (a, b) {
            var ia = KEY_ORDER.indexOf(a);
            var ib = KEY_ORDER.indexOf(b);

            if (ia === -1 && ib === -1) return a.localeCompare(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        var out = ["---"];
        keys.forEach(function (k) {
            var v = meta[k];
            if (v == null || v === "") return;
            if (Array.isArray(v)) {
                if (!v.length) return;
                out.push(k + ":");
                v.forEach(function (item) {
                    if (!item || typeof item !== "object") {
                        out.push("  - " + quoteIfNeeded(item));
                        return;
                    }

                    var subKeys = [];
                    Object.keys(item).forEach(function (sk) {
                        if (item[sk] == null) return;
                        if (item[sk] === "") return;
                        subKeys.push(sk);
                    });

                    if (subKeys.length === 0) return;

                    // The first field carries the dash; the rest are indented under it.
                    var first = subKeys[0];
                    out.push("  - " + first + ": " + quoteIfNeeded(item[first]));

                    subKeys.slice(1).forEach(function (sk) {
                        out.push("    " + sk + ": " + quoteIfNeeded(item[sk]));
                    });
                });
            } else {
                out.push(k + ": " + quoteIfNeeded(v));
            }
        });
        out.push("---", "");
        return out.join("\n") + "\n" + String(body || "").trim() + "\n";
    }

    var HTML_ESCAPES = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    };

    function escapeHtml(s) {
        var text = String(s == null ? "" : s);
        return text.replace(/[&<>"']/g, function (c) {
            return HTML_ESCAPES[c];
        });
    }

    function slugify(title) {
        var s = String(title || "").toLowerCase();

        // NFD splits an accent off its letter so it can be deleted: crème -> creme.
        s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");

        s = s.replace(/[^a-z0-9]+/g, "-");
        s = s.replace(/^-+|-+$/g, "");

        return s.slice(0, 80);
    }

    function isValidSlug(slug) {
        return /^[a-z0-9][a-z0-9-]*$/.test(String(slug || ""));
    }

    // Built from the local date, not toISOString(), which shifts to UTC.
    function todayISO() {
        var d = new Date();

        var year = d.getFullYear();
        var month = String(d.getMonth() + 1).padStart(2, "0");
        var day = String(d.getDate()).padStart(2, "0");

        return year + "-" + month + "-" + day;
    }

    var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;           // 2026-09-24
    var DMY_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;    // 24/09/2026

    // Older articles were written with slash dates; both shapes are accepted.
    function formatDate(value) {
        var s = String(value == null ? "" : value).trim();

        if (ISO_DATE.test(s)) return s;

        var dmy = DMY_DATE.exec(s);
        if (dmy) return dmy[3] + "-" + dmy[2] + "-" + dmy[1];

    }

    // Year-month-day so plain text sorting works; anything else sorts last.
    function dateSortKey(value) {
        var s = String(value || "").trim();

        if (ISO_DATE.test(s)) return s;

        var dmy = DMY_DATE.exec(s);
        if (dmy) return dmy[3] + "-" + dmy[2] + "-" + dmy[1];

        return "0000-00-00";
    }

    // A YYYY-MM-DD date the way the visitor's language writes it - "Oct 3,
    // 2026", "3 okt. 2026" - or the plain date if it will not parse. Used by
    // the article list and the article page.
    function localDate(iso) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
        if (!m) return iso || "";

        var lang = (global.i18n && global.i18n.lang) || "en";
        var date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

        try {
            return new Intl.DateTimeFormat(lang, {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC"
            }).format(date);
        } catch (e) {
            return iso;
        }
    }

    // A comfortable reading pace for the kind of writing on here. The number
    // is only ever a rough guide, so it is rounded up to whole minutes.
    var WORDS_PER_MINUTE = 200;

    // Counted from what is on the page rather than the Markdown, so link
    // addresses and formatting marks are not counted as words. Used by the
    // article page and the privacy page's byline (the byline in general.js).
    function readingMinutes(el) {
        var words = el.textContent.trim().split(/\s+/);

        var count = 0;
        for (var i = 0; i < words.length; i++) {
            if (words[i]) count++;
        }

        var minutes = Math.ceil(count / WORDS_PER_MINUTE);
        if (minutes < 1) minutes = 1;

        return minutes;
    }

    // An article's own icon, as Font Awesome classes - "fa-brands
    // fa-raspberry-pi". Checked wherever it's used, since it comes from the
    // front matter, and the editor only lets through what passes.
    var ICON_CLASSES = /^fa-[a-z]+( fa-[a-z0-9-]+)+$/;

    function isValidIcon(classes) {
        return ICON_CLASSES.test(classes || "");
    }

    // What an article without one of its own shows.
    var DEFAULT_ICON = "fa-solid fa-newspaper";

    global.ArticleFormat = {
        parse: parse,
        stringify: stringify,
        escapeHtml: escapeHtml,
        slugify: slugify,
        isValidSlug: isValidSlug,
        todayISO: todayISO,
        formatDate: formatDate,
        localDate: localDate,
        dateSortKey: dateSortKey,
        readingMinutes: readingMinutes,
        isValidIcon: isValidIcon,
        DEFAULT_ICON: DEFAULT_ICON,
        INDEX_URL: "/assets/content/articles/index.json",
        DIR_URL: "/assets/content/articles/"
    };
})(window);

/* ---------- Reading and writing the article files (ArticleStore) ---------- */

(function (global) {
    "use strict";

    var AF = global.ArticleFormat;
    var DB_NAME = "aridan-articles";
    var STORE = "handles";
    var KEY = "articlesDir";

    // Editing is only offered locally; on the live site the files are read only.
    function isLocalHost() {
        var host = location.hostname;

        if (!host) return true;
        if (host === "localhost") return true;
        if (host === "::1") return true;
        if (host.endsWith(".local")) return true;
        if (host.endsWith(".lan")) return true;

        var IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        var parts = host.match(IPV4);
        if (!parts) return false;

        var first = Number(parts[1]);
        var second = Number(parts[2]);

        if (first === 127) return true;                     // loopback
        if (first === 169 && second === 254) return true;   // link-local
        return false;
    }

    function isSupported() {
        return typeof global.showDirectoryPicker === "function";
    }

    function isEditingAvailable() {
        return isLocalHost() && isSupported();
    }

    // IndexedDB rather than localStorage: a directory handle is a live object,
    // and localStorage only holds text.
    function openDb() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, 1);

            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE);
                }
            };

            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function idb(mode, fn) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, mode);
                var req = fn(tx.objectStore(STORE));
                req.onsuccess = function () { resolve(req.result); };
                req.onerror = function () { reject(req.error); };
            });
        });
    }

    function rememberDir(handle) {
        return idb("readwrite", function (store) {
            return store.put(handle, KEY);
        });
    }

    function recallDir() {
        return idb("readonly", function (store) {
            return store.get(KEY);
        }).catch(function () {
            return null;
        });
    }

    function forgetDir() {
        return idb("readwrite", function (store) {
            return store.delete(KEY);
        }).catch(function () {
        });
    }

    // A remembered handle survives a reload but its permission does not, and the
    // prompt to re-ask is only allowed during a real click - which is what
    // `interactive` means here.
    function verifyPermission(handle, interactive) {
        var opts = { mode: "readwrite" };

        return handle.queryPermission(opts).then(function (state) {
            if (state === "granted") return true;
            if (!interactive) return false;

            return handle.requestPermission(opts).then(function (result) {
                return result === "granted";
            });
        });
    }

    function savedDir(interactive) {
        if (!isSupported()) return Promise.resolve(null);

        return recallDir().then(function (saved) {
            if (!saved) return null;

            return verifyPermission(saved, interactive).then(function (allowed) {
                if (allowed) return saved;
                return null;
            });
        }).catch(function () {
            return null;
        });
    }

    function pickDir() {
        if (!isSupported()) return Promise.resolve(null);

        var options = { id: "aridan-articles", mode: "readwrite" };

        return global.showDirectoryPicker(options)
            .then(function (picked) {
                // Failing to remember it only costs another pick next time.
                return rememberDir(picked)
                    .catch(function (err) {
                        debug.warn("Couldn't remember the folder:", err);
                    })
                    .then(function () {
                        return picked;
                    });
            })
            .catch(function (err) {
                if (err && err.name === "AbortError") return null;
                throw err;
            });
    }

    function getDir(interactive) {
        return savedDir(interactive).then(function (handle) {
            if (handle || !interactive) return handle;
            return pickDir();
        });
    }

    function fileName(slug) {
        if (!AF.isValidSlug(slug)) throw new Error("Invalid article name: " + slug);
        return slug + ".md";
    }

    function fileHandle(dir, slug, options) {
        try {
            return dir.getFileHandle(fileName(slug), options);
        } catch (err) {
            return Promise.reject(err);
        }
    }

    function isMissing(err) {
        return !!err && (err.name === "NotFoundError" || err.name === "TypeMismatchError");
    }

    function writeFile(dir, name, contents) {
        return dir.getFileHandle(name, { create: true })
            .then(function (handle) {
                return handle.createWritable();
            })
            .then(function (writable) {
                return writable.write(contents).then(function () {
                    return writable.close();
                });
            });
    }

    function readArticle(dir, slug) {
        return fileHandle(dir, slug)
            .then(function (handle) {
                return handle.getFile();
            })
            .then(function (file) {
                return file.text();
            });
    }

    function writeArticle(dir, slug, contents) {
        try {
            return writeFile(dir, fileName(slug), contents);
        } catch (err) {
            return Promise.reject(err);
        }
    }

    function deleteArticle(dir, slug) {
        try {
            return dir.removeEntry(fileName(slug));
        } catch (err) {
            return Promise.reject(err);
        }
    }

    // There is no "does this exist" call, so asking and catching is the way.
    function exists(dir, slug) {
        return fileHandle(dir, slug)
            .then(function () {
                return true;
            })
            .catch(function (err) {
                if (isMissing(err)) return false;
                throw err;
            });
    }

    // dir.values() hands back one entry at a time, each as a promise, so this
    // recurses per entry rather than looping.
    function listSlugs(dir) {
        var slugs = [];
        var entries = dir.values();
        var MARKDOWN = /\.md$/i;

        function step() {
            return entries.next().then(function (res) {
                if (res.done) return slugs;

                var entry = res.value;

                var isMarkdownFile = entry.kind === "file" && MARKDOWN.test(entry.name);
                if (isMarkdownFile) {
                    var slug = entry.name.replace(MARKDOWN, "");
                    if (AF.isValidSlug(slug)) slugs.push(slug);
                }

                return step();
            });
        }

        return step();
    }

    // What the article list shows on a card, read out of one article's file.
    function indexEntry(dir, slug) {
        return readArticle(dir, slug).then(function (text) {
            var meta = AF.parse(text).meta;

            var entry = {
                slug: slug,
                title: meta.title || "",
                date: meta.date || "",
                preview: meta.preview || ""
            };

            // Only articles with a cover have one - see scripts/cover.js.
            if (meta.image) {
                entry.image = meta.image;
            }

            return entry;
        });
    }

    // index.json is what the live site reads, so it is rewritten after any
    // change. It carries each card's title, date, preview and cover too, so the
    // article list is one fetch rather than one per article.
    function rebuildIndex(dir) {
        return listSlugs(dir).then(function (slugs) {
            slugs.sort();

            return Promise.all(slugs.map(function (slug) {
                return indexEntry(dir, slug);
            })).then(function (entries) {
                var json = JSON.stringify(entries, null, 4) + "\n";

                return writeFile(dir, "index.json", json).then(function () {
                    return slugs;
                });
            });
        });
    }

    // Catches the wrong folder before anything is written into it.
    function looksLikeArticlesDir(dir) {
        return dir.getFileHandle("index.json")
            .then(function () {
                return true;
            })
            .catch(function (err) {
                if (!isMissing(err)) throw err;

                return listSlugs(dir).then(function (slugs) {
                    return slugs.length > 0;
                });
            })
            .catch(function () {
                return false;
            });
    }

    // Everything in the folder that has no business in the articles folder -
    // anything but .md files and index.json, subfolders included. Picking
    // the repo root by mistake passes looksLikeArticlesDir(), since
    // README.md counts as an article, but not this. Hidden files (.DS_Store
    // and the like) are left out; every folder can have those.
    function strayEntries(dir) {
        var strays = [];
        var entries = dir.values();

        function step() {
            return entries.next().then(function (res) {
                if (res.done) return strays;

                var entry = res.value;
                var name = entry.name;

                if (name.startsWith(".")) return step();

                if (entry.kind === "directory") {
                    strays.push(name + "/");
                } else if (name !== "index.json" && !/\.md$/i.test(name)) {
                    strays.push(name);
                }

                return step();
            });
        }

        return step().catch(function () {
            return [];
        });
    }

    var UNSUPPORTED = "You need to use a Chromium browser to save or delete articles.";
    var CANNOT_SAVE = "Use a Chromium browser to save articles.";
    var CANNOT_DELETE = "Use a Chromium browser to delete articles.";

    function t(text) {
        if (global.i18n) return global.i18n.t(text);
        return text;
    }

    global.ArticleStore = {
        get UNSUPPORTED() { return t(UNSUPPORTED); },
        get CANNOT_SAVE() { return t(CANNOT_SAVE); },
        get CANNOT_DELETE() { return t(CANNOT_DELETE); },
        isLocalHost: isLocalHost,
        isSupported: isSupported,
        isEditingAvailable: isEditingAvailable,
        savedDir: savedDir,
        pickDir: pickDir,
        getDir: getDir,
        forgetDir: forgetDir,
        looksLikeArticlesDir: looksLikeArticlesDir,
        strayEntries: strayEntries,
        readArticle: readArticle,
        writeArticle: writeArticle,
        deleteArticle: deleteArticle,
        exists: exists,
        listSlugs: listSlugs,
        rebuildIndex: rebuildIndex
    };
})(window);

/* ---------- The "more" menu (ArticleMenu) ---------- */

/* The "more" menu: a round glass button that opens a small list, used to keep
   Delete one step away from a stray click on the article page and in the
   editor. Styled in editor.css.

   A menu can be written straight into the HTML (the editor) or built with
   ArticleMenu.create() (the article page, whose buttons are made in
   the edit buttons below). Either way it looks like this:

       <span class="articleMenu">
           <button class="button articleMenuButton" aria-haspopup="menu"
                   aria-expanded="false">...</button>
           <div class="articleMenuList" role="menu" hidden>
               <button role="menuitem">...</button>
           </div>
       </span>
*/
(function (global) {
    "use strict";

    var openGroup = null;

    function t(text) {
        if (global.i18n) return global.i18n.t(text);
        return text;
    }

    function partsOf(group) {
        return {
            toggle: group.querySelector(".articleMenuButton"),
            menu: group.querySelector(".articleMenuList")
        };
    }

    // Disabled items are skipped, so the arrow keys never land on one.
    function itemsOf(menu) {
        return Array.from(menu.querySelectorAll("[role=menuitem]")).filter(function (el) {
            return !el.disabled;
        });
    }

    function open(group, focusFirst) {
        if (openGroup && openGroup !== group) close(openGroup, false);

        var parts = partsOf(group);
        parts.menu.hidden = false;
        parts.toggle.setAttribute("aria-expanded", "true");
        openGroup = group;

        if (focusFirst) itemsOf(parts.menu)[0]?.focus();
    }

    function close(group, refocus) {
        if (!group) return;

        var parts = partsOf(group);
        parts.menu.hidden = true;
        parts.toggle.setAttribute("aria-expanded", "false");
        if (openGroup === group) openGroup = null;

        if (refocus) parts.toggle.focus();
    }

    function wire(group) {
        if (group.dataset.menuWired) return;
        group.dataset.menuWired = "true";

        var parts = partsOf(group);
        var toggle = parts.toggle;
        var menu = parts.menu;

        toggle.addEventListener("click", function () {
            if (menu.hidden) open(group, false);
            else close(group, false);
        });

        // Opened from the keyboard, focus goes straight into the menu.
        toggle.addEventListener("keydown", function (e) {
            if (e.key !== "ArrowDown" && e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            open(group, true);
        });

        // Picking an item closes the menu, whatever the item goes on to do.
        menu.addEventListener("click", function (e) {
            if (e.target.closest("[role=menuitem]")) close(group, false);
        });

        menu.addEventListener("keydown", function (e) {
            var items = itemsOf(menu);
            var index = items.indexOf(document.activeElement);

            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                var step = 1;
                if (e.key === "ArrowUp") step = -1;
                items[(index + step + items.length) % items.length]?.focus();
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close(group, true);
            } else if (e.key === "Tab") {
                close(group, false);
            }
        });
    }

    // items: the links and buttons to put in the menu, in order.
    function create(items) {
        var group = document.createElement("span");
        group.className = "articleMenu";

        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "button articleMenuButton";
        toggle.setAttribute("aria-haspopup", "menu");
        toggle.setAttribute("aria-expanded", "false");
        toggle.innerHTML = '<i class="fa-solid fa-ellipsis" aria-hidden="true"></i>';

        var menu = document.createElement("div");
        menu.className = "articleMenuList";
        menu.setAttribute("role", "menu");
        menu.hidden = true;

        for (const item of items) {
            item.setAttribute("role", "menuitem");
            menu.appendChild(item);
        }

        function label() {
            toggle.title = t("More options");
            toggle.setAttribute("aria-label", t("More options"));
        }
        label();
        if (global.i18n) global.i18n.onChange(label);

        group.appendChild(toggle);
        group.appendChild(menu);
        wire(group);
        return group;
    }

    // A click anywhere outside the open menu closes it.
    document.addEventListener("click", function (e) {
        if (!openGroup) return;
        if (openGroup.contains(e.target)) return;
        close(openGroup, false);
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && openGroup) close(openGroup, true);
    });

    // Menus written into the HTML.
    function wireAll() {
        document.querySelectorAll(".articleMenu").forEach(wire);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wireAll);
    } else {
        wireAll();
    }

    global.ArticleMenu = { create: create, close: close };
})(window);

/* ---------- One article, on /articles/view/ ---------- */

(function () {
    "use strict";

    var AF = window.ArticleFormat;

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
        if (!AF.isValidIcon(classes)) return;

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
        // The privacy page is a .full-article too, with .legal, and its text
        // is in the page already.
        if (!document.querySelector(".full-article:not(.legal)")) return;

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

/* ---------- The list of articles, on /articles/ ---------- */

(function () {
    "use strict";

    var AF = window.ArticleFormat;

    function articleUrl(slug) {
        return "/articles/view/?article=" + encodeURIComponent(slug);
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
        // Every page's <main> is main.container, so the list page is told
        // apart by its loading skeletons instead.
        if (!document.querySelector(".articleSkeletons")) return;

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

/* ---------- Edit and delete buttons, on my own machine ---------- */

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
        return "/articles/edit/?article=" + encodeURIComponent(slug);
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
        // Delete is kept behind the "more" menu - see the "more" menu above. Should a
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
            // the article page's part adds that says it actually loaded.
            if (document.querySelector(".full-article.isLoaded")) {
                var slug = new URLSearchParams(location.search).get("article");
                if (slug) decorateArticle(slug);
            }

            return;
        }

        // The editor and the privacy page load this file too, and New article
        // belongs on the list only. Its loading skeletons are what tell it apart.
        if (!document.querySelector(".articleSkeletons")) return;

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

/* ---------- The editor, on /articles/new/ and /articles/edit/ ---------- */

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
        return "/articles/view/?article=" + encodeURIComponent(slug);
    }

    /* ---------- The body: one pane, looking the way the article will ----------
     * Written in a ProseMirror editor that wears the article page's own
     * styles (.article-content), so what you type is what readers get, and
     * read from and saved as Markdown through prosemirror-markdown. It lives
     * in src/vendor/prosemirror/ rather than coming from a CDN - see
     * scripts/vendor-prosemirror.js for why - and is only fetched here.
     *
     * The page's own textarea stays: it is the "Markdown" view, one or the
     * other and never side by side, and what's left to type in if the editor
     * can't load. Everything else only talks to bodyEditor.
     */
    var PM_DIR = "/src/vendor/prosemirror/";
    var PM_MODULES = ["model", "state", "view", "markdown", "commands", "keymap", "history", "inputrules", "schema-list"];

    // Set once ProseMirror has loaded: the modules, the schema, the Markdown
    // parser and serializer, and the view itself.
    var rich = null;
    var showingMarkdown = false;

    var bodyEditor = {
        get: function () {
            if (!rich || showingMarkdown) return el.body.value;
            return serializeBody(rich.view.state.doc);
        },
        set: function (text) {
            el.body.value = text || "";
            if (!rich) return;

            // A fresh state rather than a change to the old one: undo
            // shouldn't be able to take a loaded article back to empty.
            rich.view.updateState(createBodyState(el.body.value));
            refreshToolbar();
        }
    };

    function loadProseMirror() {
        var imports = PM_MODULES.map(function (name) {
            return import(PM_DIR + "prosemirror-" + name + ".js");
        });

        return Promise.all(imports).then(function (modules) {
            var pm = {};
            PM_MODULES.forEach(function (name, i) {
                pm[name] = modules[i];
            });
            return pm;
        });
    }

    // prosemirror-markdown's schema - CommonMark: headings, quotes, lists,
    // code, links, images - with three changes for the way articles look:
    //   - a code block shows its language, as data-language for editor.css
    //   - a bulleted list remembers its bullet, so "- " stays "- " on save
    //     instead of becoming the "* " prosemirror-markdown writes by default
    //   - a list made here is tight, with no blank lines between its items,
    //     like the ones in the articles. One read from a file keeps whatever
    //     it was.
    function buildSchema(pm) {
        var base = pm.markdown.schema;
        var nodes = base.spec.nodes;

        var codeBlock = Object.assign({}, nodes.get("code_block"), {
            toDOM: function (node) {
                var attrs = {};
                if (node.attrs.params) {
                    attrs["data-params"] = node.attrs.params;
                    attrs["data-language"] = node.attrs.params;
                }
                return ["pre", attrs, ["code", 0]];
            }
        });

        var bulletSpec = nodes.get("bullet_list");
        var bulletList = Object.assign({}, bulletSpec, {
            attrs: Object.assign({}, bulletSpec.attrs, {
                tight: { default: true },
                bullet: { default: "-" }
            })
        });

        var orderedSpec = nodes.get("ordered_list");
        var orderedList = Object.assign({}, orderedSpec, {
            attrs: Object.assign({}, orderedSpec.attrs, { tight: { default: true } })
        });

        nodes = nodes
            .update("code_block", codeBlock)
            .update("bullet_list", bulletList)
            .update("ordered_list", orderedList);

        return new pm.model.Schema({ nodes: nodes, marks: base.spec.marks });
    }

    function buildParser(pm, schema) {
        var defaults = pm.markdown.defaultMarkdownParser;
        var tokens = Object.assign({}, defaults.tokens);

        var bulletTokens = tokens.bullet_list;
        tokens.bullet_list = Object.assign({}, bulletTokens, {
            getAttrs: function (token, stream, index) {
                var attrs = bulletTokens.getAttrs(token, stream, index);
                attrs.bullet = token.markup || "-";
                return attrs;
            }
        });

        return new pm.markdown.MarkdownParser(schema, defaults.tokenizer, tokens);
    }

    function parseBody(text) {
        var doc = rich.parser.parse(text || "");
        if (doc) return doc;
        return rich.schema.topNodeType.createAndFill();
    }

    // prosemirror-markdown ends without a newline; files here end with one.
    function serializeBody(doc) {
        var text = rich.pm.markdown.defaultMarkdownSerializer.serialize(doc);
        if (!text) return "";
        return text + "\n";
    }

    /* ---------- Typing Markdown turns into formatting ----------
     * The shortcuts Typora and Bear have: "## " is a heading, "**word**" is
     * bold, and so on. Backspace straight after one undoes it, leaving what
     * was typed. */

    // **bold**, *italic*, `code`: the text between the markers gets the
    // mark, and the markers go. The lookbehinds keep "**" from also counting
    // as two "*", and a word like snake_case from turning italic.
    function markRule(pattern, markType) {
        var InputRule = rich.pm.inputrules.InputRule;

        return new InputRule(pattern, function (state, match, start, end) {
            var marks = [markType.create()];
            var text = rich.schema.text(match[1], marks);

            var tr = state.tr.replaceWith(start, end, text);

            // So what's typed next isn't bold too.
            tr.removeStoredMark(markType);
            return tr;
        });
    }

    function linkRule() {
        var InputRule = rich.pm.inputrules.InputRule;
        var link = rich.schema.marks.link;

        return new InputRule(/\[([^\]]+)\]\(([^)\s]+)\)$/, function (state, match, start, end) {
            var text = rich.schema.text(match[1], [link.create({ href: match[2] })]);

            var tr = state.tr.replaceWith(start, end, text);
            tr.removeStoredMark(link);
            return tr;
        });
    }

    // "---" on a line of its own is a divider, with a fresh paragraph after it.
    function dividerRule() {
        var InputRule = rich.pm.inputrules.InputRule;
        var nodes = rich.schema.nodes;

        return new InputRule(/^---$/, function (state, match, start) {
            var $start = state.doc.resolve(start);
            if ($start.parent.type !== nodes.paragraph) return null;

            var before = $start.before();
            var after = $start.after();

            var tr = state.tr.replaceWith(before, after, [
                nodes.horizontal_rule.create(),
                nodes.paragraph.create()
            ]);

            var cursor = before + 2;
            tr.setSelection(rich.pm.state.TextSelection.create(tr.doc, cursor));
            return tr;
        });
    }

    function buildInputRules() {
        var rules = rich.pm.inputrules;
        var nodes = rich.schema.nodes;
        var marks = rich.schema.marks;

        return rules.inputRules({
            rules: [
                rules.textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading, function (match) {
                    return { level: match[1].length };
                }),
                rules.wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
                rules.wrappingInputRule(/^\s*([-+*])\s$/, nodes.bullet_list, function (match) {
                    return { bullet: match[1] };
                }),
                rules.wrappingInputRule(/^(\d+)\.\s$/, nodes.ordered_list, function (match) {
                    return { order: Number(match[1]) };
                }, function (match, node) {
                    return node.childCount + node.attrs.order === Number(match[1]);
                }),
                rules.textblockTypeInputRule(/^```([\w+-]*)\s$/, nodes.code_block, function (match) {
                    return { params: match[1] || "" };
                }),
                dividerRule(),
                markRule(/(?<![*\w])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, marks.strong),
                markRule(/(?<![*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, marks.em),
                markRule(/(?<![_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, marks.em),
                markRule(/(?<!`)`([^`]+)`$/, marks.code),
                linkRule()
            ]
        });
    }

    /* ---------- What the toolbar and the keyboard do ---------- */

    function markIsActive(state, markType) {
        var selection = state.selection;

        if (selection.empty) {
            var marks = state.storedMarks || selection.$from.marks();
            return Boolean(markType.isInSet(marks));
        }

        return state.doc.rangeHasMark(selection.from, selection.to, markType);
    }

    function blockIs(state, nodeType, attrs) {
        var parent = state.selection.$from.parent;
        if (parent.type !== nodeType) return false;
        if (!attrs) return true;

        for (var key in attrs) {
            if (parent.attrs[key] !== attrs[key]) return false;
        }
        return true;
    }

    // Whether the cursor is somewhere inside a list or quote of this type.
    function isInside(state, nodeType) {
        var $from = state.selection.$from;

        for (var depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type === nodeType) return true;
        }
        return false;
    }

    // Pressing the button for what's already there takes it away again, the
    // way Bold does in any word processor.
    function toggleHeading(level) {
        return function (state, dispatch) {
            var nodes = rich.schema.nodes;
            var setBlockType = rich.pm.commands.setBlockType;

            if (blockIs(state, nodes.heading, { level: level })) {
                return setBlockType(nodes.paragraph)(state, dispatch);
            }
            return setBlockType(nodes.heading, { level: level })(state, dispatch);
        };
    }

    function toggleList(listType) {
        return function (state, dispatch) {
            var listItem = rich.schema.nodes.list_item;

            if (isInside(state, listType)) {
                return rich.pm["schema-list"].liftListItem(listItem)(state, dispatch);
            }
            return rich.pm["schema-list"].wrapInList(listType)(state, dispatch);
        };
    }

    function toggleQuote(state, dispatch) {
        var quote = rich.schema.nodes.blockquote;

        if (isInside(state, quote)) {
            return rich.pm.commands.lift(state, dispatch);
        }
        return rich.pm.commands.wrapIn(quote)(state, dispatch);
    }

    // From the toolbar, a new code block asks which language it's in, for
    // the label in its corner and the colours on the article page. Typing
    // ```js does the same without asking.
    function toggleCodeBlock(state, dispatch) {
        var nodes = rich.schema.nodes;
        var setBlockType = rich.pm.commands.setBlockType;

        if (blockIs(state, nodes.code_block)) {
            return setBlockType(nodes.paragraph)(state, dispatch);
        }

        if (!setBlockType(nodes.code_block)(state)) return false;
        if (!dispatch) return true;

        var language = prompt(t("Which language is the code in? (js, css, bash…)"), "");
        if (language === null) return false;

        language = language.trim().split(/\s+/)[0] || "";
        return setBlockType(nodes.code_block, { params: language })(state, dispatch);
    }

    // The stretch of text around the cursor that is one link, so it can be
    // changed or taken off as a whole without selecting it first.
    function linkAround(state) {
        var link = rich.schema.marks.link;
        var $pos = state.selection.$from;
        var parent = $pos.parent;

        var index = $pos.index();
        var child = parent.maybeChild(index);
        var mark = child ? link.isInSet(child.marks) : null;

        if (!mark && index > 0) {
            index = index - 1;
            child = parent.child(index);
            mark = link.isInSet(child.marks);
        }

        if (!mark) return null;

        var first = index;
        var last = index;
        while (first > 0 && mark.isInSet(parent.child(first - 1).marks)) first--;
        while (last < parent.childCount - 1 && mark.isInSet(parent.child(last + 1).marks)) last++;

        var from = $pos.start();
        for (var i = 0; i < first; i++) from += parent.child(i).nodeSize;

        var to = from;
        for (var j = first; j <= last; j++) to += parent.child(j).nodeSize;

        return { from: from, to: to, mark: mark };
    }

    function editLink(state, dispatch) {
        var link = rich.schema.marks.link;
        var around = linkAround(state);

        if (!around && state.selection.empty && !dispatch) return true;
        if (!dispatch) return true;

        var current = "";
        if (around) current = around.mark.attrs.href;

        var href = prompt(t("Link address (leave it empty to remove the link)"), current);
        if (href === null) return false;
        href = href.trim();

        var tr = state.tr;

        if (around) {
            tr.removeMark(around.from, around.to, link);
            if (href) tr.addMark(around.from, around.to, link.create({ href: href }));
        } else if (!href) {
            return false;
        } else if (state.selection.empty) {
            // Nothing selected: the address itself becomes the link's text.
            tr.replaceSelectionWith(rich.schema.text(href, [link.create({ href: href })]), false);
        } else {
            tr.addMark(state.selection.from, state.selection.to, link.create({ href: href }));
        }

        dispatch(tr.scrollIntoView());
        return true;
    }

    function buildKeymap() {
        var commands = rich.pm.commands;
        var history = rich.pm.history;
        var lists = rich.pm["schema-list"];
        var nodes = rich.schema.nodes;
        var marks = rich.schema.marks;

        var hardBreak = function (state, dispatch) {
            if (dispatch) {
                dispatch(state.tr.replaceSelectionWith(nodes.hard_break.create()).scrollIntoView());
            }
            return true;
        };

        return {
            "Mod-z": history.undo,
            "Shift-Mod-z": history.redo,
            "Mod-y": history.redo,
            "Backspace": rich.pm.inputrules.undoInputRule,

            "Mod-b": commands.toggleMark(marks.strong),
            "Mod-i": commands.toggleMark(marks.em),
            "Mod-`": commands.toggleMark(marks.code),
            "Mod-k": editLink,

            "Mod-Alt-0": commands.setBlockType(nodes.paragraph),
            "Mod-Alt-2": toggleHeading(2),
            "Mod-Alt-3": toggleHeading(3),

            "Enter": lists.splitListItem(nodes.list_item),
            "Mod-[": lists.liftListItem(nodes.list_item),
            "Mod-]": lists.sinkListItem(nodes.list_item),
            "Shift-Enter": commands.chainCommands(commands.exitCode, hardBreak)
        };
    }

    function createBodyState(text) {
        var pmState = rich.pm.state;

        return pmState.EditorState.create({
            doc: parseBody(text),
            plugins: [
                buildInputRules(),
                rich.pm.keymap.keymap(buildKeymap()),
                rich.pm.keymap.keymap(rich.pm.commands.baseKeymap),
                rich.pm.history.history()
            ]
        });
    }

    /* ---------- The toolbar ----------
     * The header's glass, as a bar that stays in reach under it while the
     * article scrolls past. Built here rather than written into the two
     * editor pages, so they can't drift apart. */

    // Cmd on a Mac, Ctrl everywhere else - the same key ProseMirror's "Mod" is.
    var MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

    var TOOLS = [
        { id: "h2", text: "H2", label: "Heading", keys: "Alt+2", run: function () { return toggleHeading(2); },
          active: function (state) { return blockIs(state, rich.schema.nodes.heading, { level: 2 }); } },
        { id: "h3", text: "H3", label: "Subheading", keys: "Alt+3", run: function () { return toggleHeading(3); },
          active: function (state) { return blockIs(state, rich.schema.nodes.heading, { level: 3 }); } },
        { separator: true },
        { id: "bold", icon: "fa-bold", label: "Bold", keys: "B", run: function () { return rich.pm.commands.toggleMark(rich.schema.marks.strong); },
          active: function (state) { return markIsActive(state, rich.schema.marks.strong); } },
        { id: "italic", icon: "fa-italic", label: "Italic", keys: "I", run: function () { return rich.pm.commands.toggleMark(rich.schema.marks.em); },
          active: function (state) { return markIsActive(state, rich.schema.marks.em); } },
        { id: "code", icon: "fa-code", label: "Code", keys: "`", run: function () { return rich.pm.commands.toggleMark(rich.schema.marks.code); },
          active: function (state) { return markIsActive(state, rich.schema.marks.code); } },
        { id: "link", icon: "fa-link", label: "Link", keys: "K", run: function () { return editLink; },
          active: function (state) { return markIsActive(state, rich.schema.marks.link); } },
        { separator: true },
        { id: "bullets", icon: "fa-list-ul", label: "Bulleted list", run: function () { return toggleList(rich.schema.nodes.bullet_list); },
          active: function (state) { return isInside(state, rich.schema.nodes.bullet_list); } },
        { id: "numbers", icon: "fa-list-ol", label: "Numbered list", run: function () { return toggleList(rich.schema.nodes.ordered_list); },
          active: function (state) { return isInside(state, rich.schema.nodes.ordered_list); } },
        { id: "quote", icon: "fa-quote-left", label: "Quote", run: function () { return toggleQuote; },
          active: function (state) { return isInside(state, rich.schema.nodes.blockquote); } },
        { id: "codeBlock", icon: "fa-terminal", label: "Code block", run: function () { return toggleCodeBlock; },
          active: function (state) { return blockIs(state, rich.schema.nodes.code_block); } },
        { separator: true },
        { id: "undo", icon: "fa-rotate-left", label: "Undo", keys: "Z", run: function () { return rich.pm.history.undo; } },
        { id: "redo", icon: "fa-rotate-right", label: "Redo", keys: "Shift+Z", run: function () { return rich.pm.history.redo; } }
    ];

    var toolbar = null;
    var toolButtons = {};
    var markdownButton = null;

    function toolTitle(tool) {
        var label = t(tool.label);
        if (!tool.keys) return label;
        return label + " (" + MOD_KEY + tool.keys + ")";
    }

    function buildToolbar() {
        toolbar = document.createElement("div");
        toolbar.className = "editorToolbar";
        toolbar.setAttribute("role", "toolbar");

        TOOLS.forEach(function (tool) {
            if (tool.separator) {
                var line = document.createElement("span");
                line.className = "editorToolbarSeparator";
                line.setAttribute("aria-hidden", "true");
                toolbar.appendChild(line);
                return;
            }

            var button = document.createElement("button");
            button.type = "button";
            button.className = "editorTool";
            button.dataset.tool = tool.id;

            if (tool.icon) {
                button.innerHTML = '<i class="fa-solid ' + tool.icon + '" aria-hidden="true"></i>';
            } else {
                button.innerHTML = '<span aria-hidden="true">' + tool.text + "</span>";
            }

            // Pressing a button mustn't take the focus, or the selection it
            // is about to change would be gone by the time it acts on it.
            button.addEventListener("mousedown", function (event) {
                event.preventDefault();
            });

            button.addEventListener("click", function () {
                var command = tool.run();
                command(rich.view.state, rich.view.dispatch, rich.view);
                rich.view.focus();
            });

            toolButtons[tool.id] = button;
            toolbar.appendChild(button);
        });

        var spacer = document.createElement("span");
        spacer.className = "editorToolbarSpacer";
        toolbar.appendChild(spacer);

        markdownButton = document.createElement("button");
        markdownButton.type = "button";
        markdownButton.className = "editorTool editorMarkdownToggle";
        markdownButton.innerHTML = '<i class="fa-brands fa-markdown" aria-hidden="true"></i>';
        markdownButton.addEventListener("click", toggleMarkdown);
        toolbar.appendChild(markdownButton);

        labelToolbar();
        return toolbar;
    }

    // Every name in the toolbar, again whenever the language changes.
    function labelToolbar() {
        if (!toolbar) return;

        toolbar.setAttribute("aria-label", t("Formatting"));

        TOOLS.forEach(function (tool) {
            if (tool.separator) return;
            var button = toolButtons[tool.id];
            button.title = toolTitle(tool);
            button.setAttribute("aria-label", t(tool.label));
        });

        markdownButton.title = t("Show the Markdown");
        markdownButton.setAttribute("aria-label", t("Markdown"));
    }

    // Pressed for whatever is at the cursor, and greyed out for whatever
    // can't be done there. In the Markdown view only the way back works.
    function refreshToolbar() {
        if (!toolbar || !rich) return;

        var state = rich.view.state;

        TOOLS.forEach(function (tool) {
            if (tool.separator) return;
            var button = toolButtons[tool.id];

            var canRun = !showingMarkdown && tool.run()(state);
            button.disabled = !canRun;

            // Only while you're in the body: otherwise it would light up
            // whatever is at a cursor nobody has put there.
            if (tool.active) {
                var on = !showingMarkdown && rich.view.hasFocus() && tool.active(state);
                button.setAttribute("aria-pressed", on ? "true" : "false");
            }
        });

        markdownButton.setAttribute("aria-pressed", showingMarkdown ? "true" : "false");
    }

    function toggleMarkdown() {
        if (showingMarkdown) {
            showRich();
        } else {
            showMarkdown();
        }
    }

    function showMarkdown() {
        el.body.value = serializeBody(rich.view.state.doc);
        showingMarkdown = true;

        rich.view.dom.hidden = true;
        el.body.hidden = false;
        fitToText(el.body);
        el.body.focus({ preventScroll: true });

        renderByline();
        refreshToolbar();
    }

    // Back from the Markdown, through a change to the document rather than
    // a new one, so undo can still go back past it.
    function showRich() {
        var doc = parseBody(el.body.value);
        var state = rich.view.state;

        if (!doc.eq(state.doc)) {
            var tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
            rich.view.dispatch(tr);
        }

        showingMarkdown = false;
        el.body.hidden = true;
        rich.view.dom.hidden = false;
        rich.view.focus();

        renderByline();
        refreshToolbar();
    }

    // Right under the header, which is sticky too and changes height with
    // the window.
    function placeToolbar() {
        var header = document.querySelector("header");
        if (!header || !toolbar) return;

        var below = Math.round(header.getBoundingClientRect().height) + 8;
        toolbar.style.setProperty("--editorToolbarTop", below + "px");
    }

    function mountRichEditor(pm) {
        rich = { pm: pm };
        rich.schema = buildSchema(pm);
        rich.parser = buildParser(pm, rich.schema);

        var field = el.body.closest(".editorField");
        var pane = document.createElement("div");

        rich.view = new pm.view.EditorView(pane, {
            state: createBodyState(el.body.value),
            attributes: function (state) {
                var empty = state.doc.childCount === 1 &&
                    state.doc.firstChild.isTextblock &&
                    state.doc.firstChild.content.size === 0;

                return {
                    class: "article-content editorRich",
                    role: "textbox",
                    "aria-multiline": "true",
                    "aria-labelledby": "fieldBodyLabel",
                    "data-empty": empty ? "true" : "false",
                    "data-placeholder": t("Write here. Start a line with ## for a heading, or wrap words in ** for bold.")
                };
            },
            dispatchTransaction: function (tr) {
                var next = rich.view.state.apply(tr);
                rich.view.updateState(next);
                if (tr.docChanged) {
                    markDirty();
                    scheduleByline();
                }
                refreshToolbar();
            }
        });

        field.insertBefore(buildToolbar(), el.body);
        field.insertBefore(rich.view.dom, el.body);
        pane.remove();

        el.body.hidden = true;
        field.classList.add("isRich");

        placeToolbar();
        window.addEventListener("resize", placeToolbar);

        // The selection moving doesn't go through dispatchTransaction when
        // it's only a click, so the toolbar listens for that too.
        rich.view.dom.addEventListener("focus", refreshToolbar);
        rich.view.dom.addEventListener("blur", refreshToolbar);
        document.addEventListener("selectionchange", function () {
            if (rich.view.hasFocus()) refreshToolbar();
        });

        if (window.i18n) {
            window.i18n.onChange(function () {
                labelToolbar();
                // Redraws the attributes, and with them the placeholder.
                rich.view.setProps({});
            });
        }

        refreshToolbar();
    }

    // If ProseMirror can't load - offline, say - the textarea is still there
    // to write Markdown in, as it was before the editor existed.
    function startRichEditor() {
        return loadProseMirror()
            .then(mountRichEditor)
            .catch(function (err) {
                console.error("[articles.js] The editor couldn't load, so the body is plain Markdown:", err);
            });
    }

    /* ---------- The hero ----------
     * The top of the page is the article's own hero, as the article page
     * shows it: its icon, its title as the big heading, and its summary.
     * The title and summary are textareas made to look like the text they
     * become - textareas rather than inputs so a long title wraps onto a
     * second line the way it will on the article page. */

    // Grows with what's in it, like the heading and paragraph it stands for.
    function fitToText(field) {
        field.style.height = "auto";
        field.style.height = field.scrollHeight + "px";
    }

    // A title or summary is one line in the front matter, so Enter moves on
    // to the next field instead, and anything pasted in loses its line breaks.
    function keepOnOneLine(field, next) {
        field.addEventListener("keydown", function (event) {
            if (event.key !== "Enter") return;
            if (event.isComposing) return;

            event.preventDefault();
            next();
        });

        field.addEventListener("input", function () {
            if (/[\r\n]/.test(field.value)) {
                field.value = field.value.replace(/\s*[\r\n]+\s*/g, " ");
            }
            fitToText(field);
            markDirty();
        });
    }

    function focusBody() {
        if (rich && !showingMarkdown) {
            rich.view.focus();
            return;
        }
        el.body.focus();
    }

    /* ---------- The byline ----------
     * The article page's date and reading time, counted from what's being
     * written as it changes, and the file name it will be saved as. */
    var bylineTimer = 0;

    function bodyForCounting() {
        if (rich && !showingMarkdown) return rich.view.dom;

        // readingMinutes() only needs something with text in it.
        return { textContent: el.body.value };
    }

    function renderByline() {
        if (el.date) {
            el.date.setAttribute("datetime", articleDate);
            el.date.textContent = AF.localDate(articleDate);
        }

        if (el.readingTime) {
            var minutes = AF.readingMinutes(bodyForCounting());
            el.readingTime.textContent = t("{0} min read", minutes);
        }
    }

    // Counting every word on every keystroke is wasted work on a long
    // article; a moment after typing stops is soon enough.
    function scheduleByline() {
        window.clearTimeout(bylineTimer);
        bylineTimer = window.setTimeout(renderByline, 400);
    }

    // As wide as what's in it, so ".md" sits right after the name. Measured
    // in the field's own font: the size attribute counts characters, which
    // is only a rough guess at the width in a proportional font.
    var measureCanvas = null;

    function fitSlug() {
        if (!measureCanvas) measureCanvas = document.createElement("canvas");

        var context = measureCanvas.getContext("2d");
        var style = getComputedStyle(el.slug);
        context.font = style.font;

        var text = el.slug.value || el.slug.placeholder;
        var width = context.measureText(text).width;

        var padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        el.slug.style.width = Math.ceil(width + padding + 2) + "px";
    }

    /* ---------- The icon ----------
     * Pressing the hero's icon offers a few that suit the kind of things I
     * write about, and a way to type in any other Font Awesome icon. It's
     * saved as icon: in the front matter, which the article page and its
     * share picture both use (the picture only once scripts/cover.js is run
     * again). The newspaper is what an article without one shows, so
     * picking it takes the icon: line out. */
    var ICON_CHOICES = [
        "fa-solid fa-newspaper",
        "fa-brands fa-raspberry-pi",
        "fa-brands fa-apple",
        "fa-brands fa-linux",
        "fa-brands fa-windows",
        "fa-brands fa-github",
        "fa-solid fa-code",
        "fa-solid fa-terminal",
        "fa-solid fa-microchip",
        "fa-solid fa-server",
        "fa-solid fa-shield-halved",
        "fa-solid fa-globe",
        "fa-solid fa-music",
        "fa-solid fa-closed-captioning",
        "fa-solid fa-droplet",
        "fa-solid fa-wrench",
        "fa-solid fa-desktop",
        "fa-solid fa-mobile-screen",
        "fa-solid fa-gamepad",
        "fa-solid fa-lightbulb"
    ];

    var iconPicker = null;

    function currentIcon() {
        if (AF.isValidIcon(extraMeta.icon)) return extraMeta.icon;
        return AF.DEFAULT_ICON;
    }

    function renderIcon() {
        if (!el.icon) return;
        el.icon.className = currentIcon() + " icon-background";

        if (!iconPicker) return;
        for (var button of iconPicker.querySelectorAll("[data-icon]")) {
            var chosen = button.dataset.icon === currentIcon();
            button.setAttribute("aria-pressed", chosen ? "true" : "false");
        }
    }

    function setIcon(classes) {
        if (classes === AF.DEFAULT_ICON) {
            delete extraMeta.icon;
        } else {
            extraMeta.icon = classes;
        }

        renderIcon();
        markDirty();
    }

    // "fa-brands fa-raspberry-pi" as "raspberry pi", for screen readers and
    // the tooltip - Font Awesome's names are readable enough on their own.
    function iconName(classes) {
        var last = classes.split(" ").pop();
        return last.replace(/^fa-/, "").replace(/-/g, " ");
    }

    function buildIconPicker() {
        iconPicker = document.createElement("div");
        iconPicker.className = "iconPicker";
        iconPicker.id = "iconPicker";
        iconPicker.setAttribute("role", "group");
        iconPicker.hidden = true;

        var grid = document.createElement("div");
        grid.className = "iconPickerGrid";

        ICON_CHOICES.forEach(function (classes) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "iconChoice";
            button.dataset.icon = classes;
            button.title = iconName(classes);
            button.setAttribute("aria-label", iconName(classes));
            button.innerHTML = '<i class="' + classes + '" aria-hidden="true"></i>';

            button.addEventListener("click", function () {
                setIcon(classes);
                closeIconPicker(true);
            });

            grid.appendChild(button);
        });

        var other = document.createElement("button");
        other.type = "button";
        other.className = "iconOther";
        other.addEventListener("click", askForIcon);

        iconPicker.appendChild(grid);
        iconPicker.appendChild(other);

        el.iconButton.parentElement.appendChild(iconPicker);
        el.iconButton.setAttribute("aria-controls", iconPicker.id);

        labelIconPicker();
        renderIcon();
    }

    function labelIconPicker() {
        if (!iconPicker) return;
        iconPicker.setAttribute("aria-label", t("Icons"));
        iconPicker.querySelector(".iconOther").textContent = t("Another icon…");
    }

    function askForIcon() {
        var typed = prompt(t('Font Awesome classes for the icon, like "fa-solid fa-rocket"'), currentIcon());
        if (typed === null) return;

        typed = typed.trim().replace(/\s+/g, " ");

        if (!AF.isValidIcon(typed)) {
            status(t('"{0}" isn\'t a Font Awesome icon - it should look like "fa-solid fa-rocket".', typed), "error");
            return;
        }

        setIcon(typed);
        closeIconPicker(true);
    }

    function openIconPicker() {
        if (!iconPicker) buildIconPicker();

        iconPicker.hidden = false;
        el.iconButton.setAttribute("aria-expanded", "true");

        var chosen = iconPicker.querySelector('[aria-pressed="true"]');
        if (!chosen) chosen = iconPicker.querySelector("button");
        chosen.focus();
    }

    function closeIconPicker(returnFocus) {
        if (!iconPicker || iconPicker.hidden) return;

        iconPicker.hidden = true;
        el.iconButton.setAttribute("aria-expanded", "false");

        if (returnFocus) el.iconButton.focus();
    }

    function bindIconPicker() {
        el.iconButton.addEventListener("click", function () {
            if (iconPicker && !iconPicker.hidden) {
                closeIconPicker(true);
                return;
            }
            openIconPicker();
        });

        // Closes on a click anywhere else, or Escape, like the "more" menu.
        document.addEventListener("click", function (event) {
            if (!iconPicker || iconPicker.hidden) return;
            if (iconPicker.contains(event.target)) return;
            if (el.iconButton.contains(event.target)) return;
            closeIconPicker(false);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key !== "Escape") return;
            if (!iconPicker || iconPicker.hidden) return;
            closeIconPicker(true);
        });
    }

    var currentDir = null;

    // False until the folder saved last time has been looked up, which is
    // async - the bar shows skeleton bars until then rather than saying
    // "No folder selected yet" and changing its mind a moment later.
    var folderKnown = false;

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

    // Which state the folder is in, which picks the bar's icon and colour
    // in editor.css. The bar is only there while it needs something from
    // you - no folder yet, one that might be the wrong one, or a browser
    // that can't save. Once a good folder is chosen it moves into the
    // byline, in front of the file name, and the bar goes. While the folder
    // saved last time is still being looked up, neither shows: most of the
    // time there is one, and the bar would only flash up and go again.
    var FOLDER_ICONS = {
        empty: "fa-circle-exclamation",
        suspect: "fa-circle-exclamation",
        unsupported: "fa-circle-exclamation"
    };

    function folderState() {
        if (!Store.isSupported()) return "unsupported";
        if (!folderKnown) return "loading";
        if (!currentDir) return "empty";
        if (strays.length) return "suspect";
        return "ready";
    }

    function renderFolderBar() {
        var state = folderState();
        var barShown = state === "empty" || state === "suspect" || state === "unsupported";

        if (el.folderBar) {
            el.folderBar.hidden = !barShown;
            el.folderBar.dataset.state = state;
            if (el.folderState) el.folderState.textContent = folderText();
            if (el.folderIcon && FOLDER_ICONS[state]) {
                el.folderIcon.className = "fa-solid " + FOLDER_ICONS[state];
            }
        }

        if (el.pickFolder) {
            // The one thing to do while there is no folder, so it is the
            // primary button; after that it is only "Change".
            el.pickFolder.classList.toggle("primary", !currentDir);
            el.pickFolder.textContent = currentDir ? t("Change") : t("Select folder");
            el.pickFolder.title = currentDir
                ? t("Pick a different folder")
                : t("Pick assets/content/articles/");
        }

        if (el.folderLink) {
            el.folderLink.hidden = state !== "ready";
            if (currentDir) {
                el.folderLink.textContent = currentDir.name + "/";
                el.folderLink.title = t('Saving into "{0}".', currentDir.name) + " " + t("Pick a different folder");
                el.folderLink.setAttribute("aria-label", el.folderLink.title);
            }
        }
    }

    /* ---------- Saving, and what it says ----------
     * The Save button shows how a save is going: a loading ring and
     * "Saving…", a check and "Saved", or a cross when it failed. Anything
     * with more to say - why it failed, where a download went, a delete in
     * progress - goes in the small note under the buttons. One status at a
     * time: a new one replaces the last, and a change to the article clears
     * an error. */
    var SAVE_LOOKS = {
        idle: { icon: "fa-floppy-disk", label: "Save" },
        busy: { icon: null, label: "Saving…" },
        ok: { icon: "fa-circle-check", label: "Saved" },
        error: { icon: "fa-circle-xmark", label: "Save" }
    };

    var NOTE_ICONS = {
        busy: null,
        ok: "fa-circle-check",
        error: "fa-circle-xmark"
    };

    var SAVED_PAUSE_MS = 700;

    // { message, kind, fromSave } - kind is "busy", "ok" or "error".
    var currentStatus = null;

    function saveState() {
        if (!currentStatus) return "idle";
        if (currentStatus.kind === "error") {
            if (currentStatus.fromSave) return "error";
            return "idle";
        }
        if (currentStatus.fromSave) return currentStatus.kind;
        return "idle";
    }

    function loaderMarkup() {
        return '<div class="lds-ring smallLoader" aria-hidden="true"><div></div><div></div><div></div><div></div></div>';
    }

    function renderSaveButton() {
        if (!el.save) return;

        var state = saveState();
        var look = SAVE_LOOKS[state];
        el.save.dataset.state = state;

        var icon = loaderMarkup();
        if (look.icon) icon = '<i class="fa-solid ' + look.icon + '" aria-hidden="true"></i>';

        el.save.innerHTML = icon + "<span></span>";
        el.save.querySelector("span").textContent = t(look.label);
    }

    // The note under the buttons. Not for a save that's going or gone fine -
    // the button says all there is to say about those.
    function renderNote() {
        if (!el.note) return;

        var shown = currentStatus && !(currentStatus.fromSave && currentStatus.kind !== "error");
        el.note.hidden = !shown;
        if (!shown) return;

        el.note.dataset.kind = currentStatus.kind;

        var icon = loaderMarkup();
        var iconName = NOTE_ICONS[currentStatus.kind];
        if (iconName) icon = '<i class="fa-solid ' + iconName + '" aria-hidden="true"></i>';

        el.note.innerHTML = icon + "<span></span>";
        el.note.querySelector("span").textContent = currentStatus.message;
    }

    // status("") clears it. options.fromSave marks it as part of saving, so
    // the Save button shows it.
    function status(message, kind, options) {
        if (!message) {
            currentStatus = null;
        } else {
            currentStatus = {
                message: message,
                kind: kind || "busy",
                fromSave: Boolean(options && options.fromSave)
            };
        }

        renderSaveButton();
        renderNote();
    }

    function isShowingError() {
        return Boolean(currentStatus && currentStatus.kind === "error");
    }

    // A change to the article makes whatever the note last said - an error,
    // where a download went - out of date. Not while something is running.
    function markDirty() {
        dirty = true;
        if (!currentStatus) return;
        if (currentStatus.kind === "busy") return;
        if (el.save.disabled) return;
        status("");
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

        fitToText(el.title);
        fitToText(el.preview);
        renderIcon();
        renderByline();

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

    function reportProblem(problem, fromSave) {
        status(problem.message, "error", { fromSave: Boolean(fromSave) });
        if (problem.field) problem.field.focus({ preventScroll: false });
    }

    function setFolderState(dir) {
        folderKnown = true;
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

    function failed(key, arg, fromSave) {
        return function (err) {
            console.error(err);
            status(t(key, arg, err.message), "error", { fromSave: Boolean(fromSave) });
        };
    }

    function save(event) {
        if (event) event.preventDefault();
        if (busy) return;

        var problem = validate();
        if (problem) { reportProblem(problem, true); return; }

        if (!Store.isSupported()) {
            status(Store.UNSUPPORTED, "error", { fromSave: true });
            return;
        }

        var slug = el.slug.value.trim();
        var contents = buildFile();

        setBusy(true);
        status(t("Saving…"), "busy", { fromSave: true });

        ensureFolder()
            .then(function (dir) {
                if (!dir) {
                    status(t("No folder selected, so nothing was saved."), "error", { fromSave: true });
                    return;
                }

                return Store.exists(dir, slug).then(function (already) {
                    // Saving over the article being edited needs no confirmation.
                    var wouldClobber = already && slug !== originalSlug;

                    if (wouldClobber) {
                        var question = t("{0}.md already exists in this folder. Overwrite it?", slug);
                        if (!confirm(question)) {
                            status("");
                            return;
                        }
                    }

                    return Store.writeArticle(dir, slug, contents)
                        .then(function () {
                            return Store.rebuildIndex(dir);
                        })
                        .then(function () {
                            dirty = false;   // stops the "unsaved changes" prompt
                            status(t("Saved {0}.md. Opening it…", slug), "ok", { fromSave: true });

                            // Long enough to see the check in the Save
                            // button before the article opens.
                            window.setTimeout(function () {
                                location.href = viewUrl(slug);
                            }, SAVED_PAUSE_MS);
                        });
                });
            })
            .catch(failed("Couldn't save {0}.md: {1}", slug, true))
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
        status(t("Deleting…"), "busy");

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
        if (el.hero) el.hero.removeAttribute("data-loading");

        // Measured now: while hidden, the fields had no height to fit to.
        fitToText(el.title);
        fitToText(el.preview);
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
        fitSlug();
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

    // The editor is only linked to on my own machine (see the edit buttons above),
    // so anyone here on the live site came by typing the address in. They
    // get Cartman instead of the editor: the folder bar, the loader and the
    // form make way for him, and every button but the way back is switched
    // off. Gives back whether it locked, so init() can stop there.
    var AUTHORITY_LINE = "Respect my authoritah!";
    var AUTHORITY_GIF = "/assets/uploads/images/authoritah.webp";

    function respectMyAuthority() {
        if (Store.isLocalHost()) return false;

        var cartman = document.createElement("img");
        cartman.className = "authoritah";
        cartman.src = AUTHORITY_GIF;
        cartman.width = 500;
        cartman.height = 384;
        cartman.alt = "Cartman: " + AUTHORITY_LINE;

        if (el.folderBar) el.folderBar.replaceWith(cartman);
        el.folderBar = null;

        showSpinner(false);
        if (el.layout) el.layout.classList.add("hide");

        var buttons = [el.save, el.download, el.remove, document.querySelector(".articleMenuButton")];
        buttons.forEach(function (button) {
            disablePermanently(button, AUTHORITY_LINE);
        });

        return true;
    }

    function init() {
        el = {
            form: document.getElementById("editorForm"),
            title: document.getElementById("fieldTitle"),
            slug: document.getElementById("fieldSlug"),
            slugHint: document.getElementById("slugHint"),
            preview: document.getElementById("fieldPreview"),
            body: document.getElementById("fieldBody"),
            hero: document.querySelector(".editorHero"),
            icon: document.getElementById("articleIcon"),
            iconButton: document.getElementById("articleIconButton"),
            date: document.getElementById("editorDate"),
            readingTime: document.getElementById("editorReadingTime"),
            layout: document.querySelector(".editorLayout"),
            spinner: document.getElementById("loading"),
            folderBar: document.getElementById("editorFolderBar"),
            folderState: document.getElementById("editorFolderState"),
            folderIcon: document.getElementById("editorFolderIcon"),
            folderLink: document.getElementById("editorFolderLink"),
            note: document.getElementById("editorStatus"),
            pickFolder: document.getElementById("editorPickFolder"),
            save: document.getElementById("saveArticle"),
            download: document.getElementById("downloadArticle"),
            remove: document.getElementById("deleteArticle")
        };
        if (!el.form || !el.title) return;

        if (respectMyAuthority()) return;

        startRichEditor();

        el.form.addEventListener("input", markDirty);
        el.form.addEventListener("submit", save);
        // The title, summary and file name are up in the hero and the byline,
        // outside the form, so they report their own changes.
        keepOnOneLine(el.title, function () { el.preview.focus(); });
        keepOnOneLine(el.preview, focusBody);

        el.title.addEventListener("input", function () {
            if (!isEdit && !slugEditedByHand) {
                el.slug.value = AF.slugify(el.title.value);
                fitSlug();
            }
        });
        el.slug.addEventListener("input", function () {
            slugEditedByHand = el.slug.value.trim() !== "";
            fitSlug();
            markDirty();
        });

        // The Markdown view counts toward the reading time too, and grows
        // with what's typed into it, like the rich view does.
        el.body.addEventListener("input", function () {
            scheduleByline();
            if (rich) fitToText(el.body);
        });

        if (el.iconButton) bindIconPicker();

        fitSlug();
        renderIcon();
        renderByline();

        // Measured again once Jost has loaded: until then the width comes
        // from the fallback font, which is wider.
        if (document.fonts) {
            document.fonts.ready.then(function () {
                fitSlug();
                fitToText(el.title);
                fitToText(el.preview);
            });
        }

        window.addEventListener("resize", function () {
            fitToText(el.title);
            fitToText(el.preview);
        });

        el.download.addEventListener("click", download);
        if (el.remove) el.remove.addEventListener("click", remove);
        if (el.pickFolder) el.pickFolder.addEventListener("click", pickFolder);
        if (el.folderLink) el.folderLink.addEventListener("click", pickFolder);

        renderSaveButton();

        if (window.i18n) {
            window.i18n.onChange(function () {
                renderFolderBar();
                renderSaveButton();
                refreshDisabledReasons();
                renderByline();
                labelIconPicker();

                // Translated placeholders can be longer or shorter.
                fitToText(el.title);
                fitToText(el.preview);
                fitSlug();
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
