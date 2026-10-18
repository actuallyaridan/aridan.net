#!/usr/bin/env node
/* ProseMirror, the engine under the article editor, copied into the repo.
 *
 * Why not straight from a CDN like everything else: ProseMirror is a dozen
 * small packages that all have to share one copy of prosemirror-model (and
 * of prosemirror-transform and prosemirror-state). jsDelivr's +esm builds
 * pin each package's dependencies on their own, so loading ten of them that
 * way brought in six different prosemirror-models - and ProseMirror breaks
 * the moment a document made by one copy meets code from another.
 *
 * Each package also ships as a single ES module that imports the others by
 * name. So this downloads those files at the versions below, points their
 * imports at each other, and writes them to src/vendor/prosemirror/. One
 * copy of everything, no bundler, and the deploy stays as it is.
 *
 * markdown-it, which prosemirror-markdown uses to read Markdown, stays on
 * jsDelivr: nothing in it depends on ProseMirror, and its +esm build has
 * one copy of each of its own dependencies.
 *
 *     node scripts/vendor-prosemirror.js
 *
 * To update, change a version below, run it, and commit what it wrote.
 * Pick versions at least two weeks old.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src", "vendor", "prosemirror");

const CDN = "https://cdn.jsdelivr.net/npm/";

const PACKAGES = {
  "prosemirror-model": "1.25.12",
  "prosemirror-transform": "1.12.2",
  "prosemirror-state": "1.4.4",
  "prosemirror-view": "1.42.6",
  "prosemirror-markdown": "1.13.8",
  "prosemirror-commands": "1.7.2",
  "prosemirror-keymap": "1.2.3",
  "prosemirror-history": "1.5.1",
  "prosemirror-inputrules": "1.5.1",
  "prosemirror-schema-list": "1.5.1",

  // Small helpers the packages above import.
  "orderedmap": "2.1.1",
  "rope-sequence": "1.3.4",
  "w3c-keyname": "2.2.8",
};

// The one import that is left pointing at the CDN - see the top of the file.
const MARKDOWN_IT = CDN + "markdown-it@14.3.2/+esm";

// Every import and export ... from, with the name it imports.
const IMPORT = /\b(from|import)(\s*)(["'])([^"']+)\3/g;

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const licenses = [];

  for (const [name, version] of Object.entries(PACKAGES)) {
    const base = CDN + name + "@" + version + "/";

    const pkg = JSON.parse(await download(base + "package.json"));
    const entry = moduleEntry(pkg, name);

    const source = await download(base + entry);
    const rewritten = rewriteImports(source, name);

    const header =
      "/* " + name + " " + version + ", from npm (" + (pkg.license || "see LICENSES.md") + ").\n" +
      " * Written by scripts/vendor-prosemirror.js - change it there, not here. */\n";

    fs.writeFileSync(path.join(OUT, name + ".js"), header + rewritten);

    licenses.push(await licenseFor(base, name, version));

    console.log("  " + name + " " + version);
  }

  fs.writeFileSync(path.join(OUT, "LICENSES.md"), licenses.join("\n\n"));

  console.log("Wrote " + Object.keys(PACKAGES).length + " packages to " + path.relative(ROOT, OUT) + "/");
}

// The ES module build. Every package here names it in "module", or in
// exports["."].import - w3c-keyname only has "main", which is an ES module too.
function moduleEntry(pkg, name) {
  let entry = pkg.module;

  if (!entry && pkg.exports && pkg.exports["."]) {
    const dot = pkg.exports["."];

    if (typeof dot === "string") {
      entry = dot;
    } else if (typeof dot.import === "string") {
      entry = dot.import;
    } else if (dot.import && typeof dot.import.default === "string") {
      entry = dot.import.default;
    }
  }

  if (!entry) {
    entry = pkg.main;
  }

  if (!entry) {
    fail(name + " has no entry point in its package.json");
  }

  return entry.replace(/^\.\//, "");
}

function rewriteImports(source, from) {
  return source.replace(IMPORT, (whole, keyword, space, quote, target) => {
    if (target === "markdown-it") {
      return keyword + space + quote + MARKDOWN_IT + quote;
    }

    if (Object.prototype.hasOwnProperty.call(PACKAGES, target)) {
      return keyword + space + quote + "./" + target + ".js" + quote;
    }

    // A package this list doesn't have would be loaded from nowhere, so it
    // is better to stop here than to find out in the browser.
    fail(from + " imports " + target + ", which isn't in PACKAGES");
  });
}

async function licenseFor(base, name, version) {
  for (const file of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
    const response = await fetch(base + file);

    if (response.ok) {
      const text = (await response.text()).trim();
      return "## " + name + " " + version + "\n\n```\n" + text + "\n```";
    }
  }

  fail(name + " has no LICENSE file");
}

async function download(url) {
  const response = await fetch(url);

  if (!response.ok) {
    fail(url + " responded " + response.status);
  }

  return response.text();
}

function fail(message) {
  console.error("vendor-prosemirror: " + message);
  process.exit(1);
}

main();
