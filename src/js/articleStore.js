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
                        console.warn("Couldn't remember the folder:", err);
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

    // index.json is what the live site reads, so it is rewritten after any change.
    function rebuildIndex(dir) {
        return listSlugs(dir).then(function (slugs) {
            slugs.sort();

            var json = JSON.stringify(slugs, null, 4) + "\n";

            return writeFile(dir, "index.json", json).then(function () {
                return slugs;
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
        readArticle: readArticle,
        writeArticle: writeArticle,
        deleteArticle: deleteArticle,
        exists: exists,
        listSlugs: listSlugs,
        rebuildIndex: rebuildIndex
    };
})(window);
