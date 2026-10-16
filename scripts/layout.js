#!/usr/bin/env node
/* The header, menu and footer every page shares, written into each page.
 *
 * There is no build step - Cloudflare serves the HTML as it is in the repo -
 * so the shared parts still have to be in every page. This keeps them the
 * same: each page marks where they go,
 *
 *     <!-- shared:header -->
 *     ...
 *     <!-- /shared:header -->
 *
 * and this script replaces whatever is between the markers with the copy in
 * src/partials/<name>.html. Edit the partial, run this, commit the pages.
 *
 *     node scripts/layout.js           write the partials into every page
 *     node scripts/layout.js --check   only say which pages are out of date,
 *                                      and exit with 1 if any are
 *
 * Two things differ from page to page, and are worked out here rather than
 * kept in the partials:
 *
 *   - Which link is the current page. A link to the page itself, or to the
 *     section it is in (/articles/ on /articles/view/), gets
 *     aria-current="page", and its <li>, if it is in one, class="active".
 *     "/" only counts on the homepage, or every page would be in it. The
 *     settings button opens a panel rather than going anywhere, but on
 *     /settings/ itself it is marked the same way.
 *
 *   - Optional bits. A marker can name flags - <!-- shared:footer lyrics -->
 *     - and the partial's <!-- if lyrics --> ... <!-- /if lyrics --> lines
 *     are only kept on pages that name that flag.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PARTIALS = path.join(ROOT, "src", "partials");

// Not pages, or not ours.
const SKIP_DIRS = new Set([".git", ".wrangler", "node_modules", "partials"]);

// One whole marker line, with its indentation, name and any flags.
const OPEN_MARKER = /^([ \t]*)<!-- shared:([a-z-]+)((?: [a-z-]+)*) -->$/;

const IF_OPEN = /^[ \t]*<!-- if ([a-z-]+) -->$/;
const IF_CLOSE = /^[ \t]*<!-- \/if ([a-z-]+) -->$/;

// A link to one of our own pages. Social links point elsewhere.
const OWN_LINK = /<a ([^>]*?)href="(\/[^"]*)"([^>]*)>/g;

const SETTINGS_BUTTON = ' data-action="settings"';
const SETTINGS_URL = "/settings/";

function main() {
  const checkOnly = process.argv.includes("--check");

  const pages = findPages(ROOT);
  const outOfDate = [];
  let stamped = 0;

  for (const file of pages) {
    const before = fs.readFileSync(file, "utf8");

    // A page with no markers is not part of the shared layout.
    if (!before.includes("<!-- shared:")) continue;

    const after = stamp(before, urlOf(file), file);
    stamped++;

    if (after === before) continue;

    outOfDate.push(path.relative(ROOT, file));

    if (!checkOnly) {
      fs.writeFileSync(file, after);
    }
  }

  if (checkOnly) {
    if (outOfDate.length) {
      console.log("Out of date - run node scripts/layout.js:");
      for (const file of outOfDate) {
        console.log("  " + file);
      }
      process.exit(1);
    }

    console.log("All " + stamped + " pages are up to date.");
    return;
  }

  console.log("Updated " + outOfDate.length + " of " + stamped + " pages.");
  for (const file of outOfDate) {
    console.log("  " + file);
  }
}

function findPages(dir) {
  const found = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      found.push(...findPages(full));
      continue;
    }

    if (entry.name.endsWith(".html")) {
      found.push(full);
    }
  }

  found.sort();
  return found;
}

// The address the page is served at: contact/index.html is /contact/, and
// 404.html is /404.html.
function urlOf(file) {
  const relative = path.relative(ROOT, file).split(path.sep).join("/");

  if (relative === "index.html") return "/";

  if (relative.endsWith("/index.html")) {
    const folder = relative.slice(0, -"index.html".length);
    return "/" + folder;
  }

  return "/" + relative;
}

function stamp(html, url, file) {
  const lines = html.split("\n");
  const out = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const open = line.match(OPEN_MARKER);

    if (!open) {
      out.push(line);
      i++;
      continue;
    }

    const name = open[2];
    const flags = open[3].trim().split(" ").filter(Boolean);

    const closeLine = open[1] + "<!-- /shared:" + name + " -->";
    const close = lines.indexOf(closeLine, i + 1);
    if (close === -1) {
      fail(file, "has <!-- shared:" + name + " --> with no " + closeLine.trim() + " after it");
    }

    out.push(line);
    out.push(...render(name, flags, url, file));
    out.push(closeLine);

    i = close + 1;
  }

  return out.join("\n");
}

function render(name, flags, url, file) {
  const partialFile = path.join(PARTIALS, name + ".html");
  if (!fs.existsSync(partialFile)) {
    fail(file, "wants src/partials/" + name + ".html, which does not exist");
  }

  let text = fs.readFileSync(partialFile, "utf8");

  // An editor's final newline would leave a blank line before the end marker.
  if (text.endsWith("\n")) {
    text = text.slice(0, -1);
  }

  const lines = keepFlagged(text.split("\n"), flags, partialFile);
  return lines.map((line) => markCurrent(line, url));
}

// Drops the <!-- if flag --> blocks this page has not asked for, and the
// if-markers themselves either way.
function keepFlagged(lines, flags, partialFile) {
  const kept = [];
  let skipping = "";

  for (const line of lines) {
    const ifOpen = line.match(IF_OPEN);
    if (ifOpen) {
      if (!flags.includes(ifOpen[1])) {
        skipping = ifOpen[1];
      }
      continue;
    }

    const ifClose = line.match(IF_CLOSE);
    if (ifClose) {
      if (skipping === ifClose[1]) {
        skipping = "";
      }
      continue;
    }

    if (skipping) continue;
    kept.push(line);
  }

  if (skipping) {
    fail(partialFile, "has <!-- if " + skipping + " --> with no <!-- /if " + skipping + " -->");
  }

  return kept;
}

function markCurrent(line, url) {
  // A link that is commented out, like the Minecraft one, stays as it is.
  if (line.trim().startsWith("<!--")) return line;

  let marked = line.replace(OWN_LINK, (whole, before, href, after) => {
    if (!isCurrent(href, url)) return whole;
    return "<a " + before + 'href="' + href + '"' + after + ' aria-current="page">';
  });

  if (url === SETTINGS_URL && marked.includes(SETTINGS_BUTTON)) {
    marked = marked.replace(SETTINGS_BUTTON, ' aria-current="page"' + SETTINGS_BUTTON);
  }

  if (marked === line) return line;

  // The pill behind the current item in the nav.
  return marked.replace("<li>", '<li class="active">');
}

function isCurrent(href, url) {
  if (href === "/") return url === "/";

  // Only folders have pages under them.
  if (!href.endsWith("/")) return href === url;

  return url.startsWith(href);
}

function fail(file, message) {
  console.error(path.relative(ROOT, file) + " " + message + ".");
  process.exit(2);
}

main();
