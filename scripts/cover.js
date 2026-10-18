#!/usr/bin/env node
/* Draws the picture an article is shared with, and sets the article up to
 * use it.
 *
 *     node scripts/cover.js <slug> [--icon="fa-solid fa-droplet"]
 *
 * The title, preview and icon come from the article's front matter. The
 * icon is its Font Awesome classes - `icon: fa-brands fa-raspberry-pi` - and
 * is also what the article page shows in place of the newspaper. --icon sets
 * it, and writes it into the front matter for next time. With none at all,
 * the cover gets the newspaper too.
 *
 * The picture is drawn
 * by cover.html in headless Chromium (CHROMIUM=... to use another browser)
 * and saved to assets/uploads/images/articles/<slug>.jpg. The article's
 * front matter and index.json then get an `image:` pointing at it, which is
 * what the share card reads.
 *
 * Run it again after changing a title, and the picture is drawn again.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ARTICLES = path.join(ROOT, "assets", "content", "articles");
const INDEX = path.join(ARTICLES, "index.json");
const COVERS = path.join(ROOT, "assets", "uploads", "images", "articles");
const TEMPLATE = path.join(__dirname, "cover.html");

const WIDTH = 1200;
const HEIGHT = 630;

// Long enough for the font, the icons from the CDN and the banner to land
// before the picture is taken. Headless Chromium has no "fully loaded" to
// wait for when taking a screenshot from the command line.
const LOAD_BUDGET_MS = 5000;

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

// The same check articles.js makes before using one.
const ICON_CLASSES = /^fa-[a-z]+( fa-[a-z0-9-]+)+$/;

const DEFAULT_ICON = "fa-solid fa-newspaper";

function main() {
  const args = process.argv.slice(2);

  let slug = "";
  let newIcon = "";

  for (const arg of args) {
    if (arg.startsWith("--icon=")) {
      newIcon = arg.slice("--icon=".length).trim();
    } else if (!arg.startsWith("--")) {
      slug = arg;
    }
  }

  if (!slug) {
    console.error('Usage: node scripts/cover.js <slug> [--icon="fa-solid fa-droplet"]');
    process.exit(2);
  }

  if (newIcon && !ICON_CLASSES.test(newIcon)) {
    console.error('--icon wants Font Awesome classes, like --icon="fa-brands fa-raspberry-pi".');
    process.exit(2);
  }

  const articleFile = path.join(ARTICLES, slug + ".md");
  if (!fs.existsSync(articleFile)) {
    console.error("No article at " + path.relative(ROOT, articleFile) + ".");
    process.exit(2);
  }

  let text = fs.readFileSync(articleFile, "utf8");

  if (newIcon) {
    text = setFrontMatter(articleFile, text, "icon", newIcon);
  }

  const meta = readFrontMatter(text);

  let icon = DEFAULT_ICON;
  if (meta.icon && ICON_CLASSES.test(meta.icon)) {
    icon = meta.icon;
  }

  const output = path.join(COVERS, slug + ".jpg");
  fs.mkdirSync(COVERS, { recursive: true });

  let title = slug;
  if (meta.title) {
    title = meta.title;
  }

  let preview = "";
  if (meta.preview) {
    preview = meta.preview;
  }

  draw(title, preview, icon, output);

  const imagePath = "/" + path.relative(ROOT, output).split(path.sep).join("/");
  setFrontMatter(articleFile, text, "image", imagePath);
  setIndexImage(slug, imagePath);

  console.log("Drew " + path.relative(ROOT, output) + " and pointed " + slug + " at it.");
}

function draw(title, preview, icon, output) {
  const params = new URLSearchParams();
  params.set("title", title);
  params.set("preview", preview);
  params.set("icon", icon);

  const url = "file://" + TEMPLATE + "?" + params.toString();

  // A profile of its own, so this never touches, or waits on, a browser
  // that is already open.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cover-"));

  let browser = "chromium";
  if (process.env.CHROMIUM) {
    browser = process.env.CHROMIUM;
  }

  try {
    execFileSync(browser, [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--user-data-dir=" + profile,
      "--window-size=" + WIDTH + "," + HEIGHT,
      "--virtual-time-budget=" + LOAD_BUDGET_MS,
      // The extension decides the format, so this comes out as a JPEG.
      "--screenshot=" + output,
      url,
    ], { stdio: "ignore" });
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

// Only the plain `key: value` lines, which is all the front matter has.
function readFrontMatter(text) {
  const meta = {};

  const match = text.match(FRONT_MATTER);
  if (!match) return meta;

  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;

    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    meta[key] = value;
  }

  return meta;
}

// Sets one `key: value` line, in place if it is already there, and hands
// back the file as it now is.
function setFrontMatter(file, text, key, value) {
  const match = text.match(FRONT_MATTER);
  if (!match) {
    console.error(path.relative(ROOT, file) + " has no front matter to add " + key + " to.");
    process.exit(1);
  }

  const lines = match[1].split(/\r?\n/);
  const newLine = key + ": " + value;

  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(key + ":")) {
      lines[i] = newLine;
      replaced = true;
    }
  }

  if (!replaced) {
    lines.push(newLine);
  }

  const frontMatter = "---\n" + lines.join("\n") + "\n---\n";
  const rest = text.slice(match[0].length);
  const updated = frontMatter + rest;

  fs.writeFileSync(file, updated);
  return updated;
}

// The article list reads index.json rather than every article, so the image
// goes in there too - the editor does the same when it saves.
function setIndexImage(slug, imagePath) {
  const list = JSON.parse(fs.readFileSync(INDEX, "utf8"));

  for (const entry of list) {
    if (entry && entry.slug === slug) {
      entry.image = imagePath;
    }
  }

  fs.writeFileSync(INDEX, JSON.stringify(list, null, 4) + "\n");
}

main();
