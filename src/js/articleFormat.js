(function (global) {
    "use strict";

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
        var risky =
            s === "" ||
            /^\s|\s$/.test(s) ||
            s.indexOf(": ") !== -1 ||
            s.indexOf(" #") !== -1 ||
            /^[-?:[\]{}#&*!|>%@`"']/.test(s) ||
            /^(true|false|null|yes|no|on|off|~)$/i.test(s);
        if (!risky) return s;
        return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }

    function splitKey(line) {
        var i = line.indexOf(":");
        if (i < 0) return null;
        var key = line.slice(0, i).trim();
        if (!/^[A-Za-z_][\w-]*$/.test(key)) return null;
        return { key: key, value: line.slice(i + 1).trim() };
    }

    function parse(text) {
        var src = String(text == null ? "" : text).replace(/^﻿/, "");
        var m = src.match(FENCE);
        if (!m) return { meta: {}, body: src.trim() };

        var meta = {};
        var lines = m[1].split(/\r?\n/);
        var listKey = null;
        var listItem = null;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line.trim() || /^\s*#/.test(line)) continue;

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

    var KEY_ORDER = ["title", "date", "preview", "categories"];

    function stringify(meta, body) {
        var keys = Object.keys(meta || {}).sort(function (a, b) {
            var ia = KEY_ORDER.indexOf(a), ib = KEY_ORDER.indexOf(b);
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
                    if (item && typeof item === "object") {
                        var subKeys = Object.keys(item).filter(function (sk) {
                            return item[sk] != null && item[sk] !== "";
                        });
                        if (!subKeys.length) return;
                        out.push("  - " + subKeys[0] + ": " + quoteIfNeeded(item[subKeys[0]]));
                        subKeys.slice(1).forEach(function (sk) {
                            out.push("    " + sk + ": " + quoteIfNeeded(item[sk]));
                        });
                    } else {
                        out.push("  - " + quoteIfNeeded(item));
                    }
                });
            } else {
                out.push(k + ": " + quoteIfNeeded(v));
            }
        });
        out.push("---", "");
        return out.join("\n") + "\n" + String(body || "").trim() + "\n";
    }

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function slugify(title) {
        return String(title || "")
            .toLowerCase()
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80);
    }

    function isValidSlug(slug) {
        return /^[a-z0-9][a-z0-9-]*$/.test(String(slug || ""));
    }

    function todayISO() {
        var d = new Date();
        return (
            d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0")
        );
    }

    function formatDate(value) {
        var s = String(value == null ? "" : value).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        var dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
        if (dmy) return dmy[3] + "-" + dmy[2] + "-" + dmy[1];
        return s;
    }

    function dateSortKey(value) {
        var s = String(value || "").trim();
        var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (iso) return s;
        var dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
        if (dmy) return dmy[3] + "-" + dmy[2] + "-" + dmy[1];
        return "0000-00-00";
    }

    global.ArticleFormat = {
        parse: parse,
        stringify: stringify,
        escapeHtml: escapeHtml,
        slugify: slugify,
        isValidSlug: isValidSlug,
        todayISO: todayISO,
        formatDate: formatDate,
        dateSortKey: dateSortKey,
        INDEX_URL: "/assets/content/articles/index.json",
        DIR_URL: "/assets/content/articles/"
    };
})(window);
