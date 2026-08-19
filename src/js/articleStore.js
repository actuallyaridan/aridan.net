(function (global) {
    "use strict";

    var AF = global.ArticleFormat;
    var DB_NAME = "aridan-articles";
    var STORE = "handles";
    var KEY = "articlesDir";

    function isLocalHost() {
        var h = location.hostname;
        if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".lan")) return true;
        if (h === "::1") return true;
        var m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (!m) return false;
        var a = Number(m[1]), b = Number(m[2]);
        if (a === 127) return true;
        if (a === 10) return true;
        if (a === 192 && b === 168) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 169 && b === 254) return true;
        return false;
    }

    function isSupported() {
        return typeof global.showDirectoryPicker === "function";
    }

    function isEditingAvailable() {
        return isLocalHost() && isSupported();
    }

    function openDb() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function () {
                if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
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

    function rememberDir(handle) { return idb("readwrite", function (s) { return s.put(handle, KEY); }); }
    function recallDir() { return idb("readonly", function (s) { return s.get(KEY); }).catch(function () { return null; }); }
    function forgetDir() { return idb("readwrite", function (s) { return s.delete(KEY); }).catch(function () {}); }

    function verifyPermission(handle, interactive) {
        var opts = { mode: "readwrite" };
        return handle.queryPermission(opts).then(function (state) {
            if (state === "granted") return true;
            if (!interactive) return false;
            return handle.requestPermission(opts).then(function (s) { return s === "granted"; });
        });
    }

    function getDir(interactive) {
        if (!isSupported()) return Promise.resolve(null);

        return recallDir().then(function (saved) {
            if (!saved) return null;
            return verifyPermission(saved, interactive).then(function (ok) {
                return ok ? saved : null;
            }).catch(function () { return null; });
        }).then(function (handle) {
            if (handle || !interactive) return handle;
            return global.showDirectoryPicker({ id: "aridan-articles", mode: "readwrite" })
                .then(function (picked) {
                    return rememberDir(picked)
                        .catch(function (err) { console.warn("Couldn't remember the folder:", err); })
                        .then(function () { return picked; });
                })
                .catch(function (err) {
                    if (err && err.name === "AbortError") return null;
                    throw err;
                });
        });
    }

    function fileName(slug) {
        if (!AF.isValidSlug(slug)) throw new Error("Invalid article name: " + slug);
        return slug + ".md";
    }

    function readArticle(dir, slug) {
        return dir.getFileHandle(fileName(slug))
            .then(function (fh) { return fh.getFile(); })
            .then(function (file) { return file.text(); });
    }

    function writeArticle(dir, slug, contents) {
        return dir.getFileHandle(fileName(slug), { create: true })
            .then(function (fh) { return fh.createWritable(); })
            .then(function (w) { return w.write(contents).then(function () { return w.close(); }); });
    }

    function deleteArticle(dir, slug) {
        return dir.removeEntry(fileName(slug));
    }

    function exists(dir, slug) {
        return dir.getFileHandle(fileName(slug))
            .then(function () { return true; })
            .catch(function () { return false; });
    }

    function listSlugs(dir) {
        var slugs = [];
        var it = dir.values();
        function step() {
            return it.next().then(function (res) {
                if (res.done) return slugs;
                var entry = res.value;
                if (entry.kind === "file" && /\.md$/i.test(entry.name)) {
                    var slug = entry.name.replace(/\.md$/i, "");
                    if (AF.isValidSlug(slug)) slugs.push(slug);
                }
                return step();
            });
        }
        return step();
    }

    function rebuildIndex(dir) {
        return listSlugs(dir).then(function (slugs) {
            slugs.sort();
            var json = JSON.stringify(slugs, null, 4) + "\n";
            return dir.getFileHandle("index.json", { create: true })
                .then(function (fh) { return fh.createWritable(); })
                .then(function (w) { return w.write(json).then(function () { return w.close(); }); })
                .then(function () { return slugs; });
        });
    }

    global.ArticleStore = {
        isLocalHost: isLocalHost,
        isSupported: isSupported,
        isEditingAvailable: isEditingAvailable,
        getDir: getDir,
        forgetDir: forgetDir,
        readArticle: readArticle,
        writeArticle: writeArticle,
        deleteArticle: deleteArticle,
        exists: exists,
        listSlugs: listSlugs,
        rebuildIndex: rebuildIndex
    };
})(window);
