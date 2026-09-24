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
