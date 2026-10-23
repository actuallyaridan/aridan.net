<div align="center">

  <img src="./assets/media/favicons/icon-192.png" width="64" height="64" alt="">

  # aridan.net
  <i>My personal website, at <a href="https://aridan.net">aridan.net</a></i>

  <p>
    A modern, fast and lightweight website that can be used to show general information about a person. Supports multiple languages and follows accessibility guidelines for a more open internet.
  </p>

</div>
<br>

| | | |
|:-------------------------:|:-------------------------:|:-------------------------:|
| <img src="./screenshots/now-playing.webp" alt="The homepage in the light theme, with the Apple Music card showing the song playing right now, its progress bar, and the Lyrics and Recently played buttons."> | <img src="./screenshots/last-played.webp" alt="The homepage in the dark theme with nothing playing, so the card shows the last played song and how long ago it was."> | <img src="./screenshots/settings.webp" alt="The settings panel slid out from the right, with language, theme, accent colour, and the general, performance, accessibility and developer toggles."> |
| <img src="./screenshots/projects.webp" alt="The Projects page in the dark theme, with the Ongoing and Paused tabs and the Windows-alike Software for Linux project and its live star and fork counts."> | <img src="./screenshots/articles.webp" alt="The Articles page in the light theme, listing articles as cards with their preview and date."> | <img src="./screenshots/hobbies.webp" alt="The Hobbies page in the dark theme, with the Hackintosh and iPods tabs."> |
| <img src="./screenshots/mobile-home.webp" alt="The homepage on a phone in the light theme, with the last played card under the header."> | <img src="./screenshots/mobile-menu.webp" alt="The mobile menu in the dark theme, with the page pushed aside and the navigation links listed on the right."> | <img src="./screenshots/mobile-settings.webp" alt="The settings panel on a phone, slid out over the page."> |

## Contributors

- Adnan Bukvic (a.k.a. aridan) / [@actuallyaridan](https://github.com/actuallyaridan)

- Slade Watkins / [@sladewatkins](https://github.com/sladewatkins)

- Dexrn ZacAttack (a.k.a Zach) / [@dexrnzacattack](https://github.com/dexrnzacattack)

- Dhiren Vasnani / [@dhirenvasnani](https://github.com/dhirenvasnani)

## Scripts

There's no build step, but a few scripts in `scripts/` help keep things in
order. They're all run by hand, and what they write is committed like any other
change, so the deploy stays exactly as it is.

- `node scripts/layout.js` - the header, menu and footer live in
  `src/partials/`, and each page marks where they go with
  `<!-- shared:header -->` comments. Edit the partial, run this, and every page
  gets the change. `--check` only reports pages that are out of date.
- `node scripts/cover.js <slug>` - draws the picture an article is shared
  with, from its title, preview and `icon:` front matter, using headless
  Chromium. Add `--icon="fa-brands fa-raspberry-pi"` to set the icon.
- `python3 scripts/placeholders.py` - makes the tiny blurred previews every
  image shows while it loads, and writes them into `src/css/styles.css`.
  Run it after adding or changing an image. Needs Pillow.
- `node scripts/vendor-prosemirror.js` - downloads ProseMirror, the engine
  under the article editor, into `src/vendor/prosemirror/`. It's self-hosted
  because jsDelivr's builds would load several copies of its core, which
  breaks it. Change a version in the script and run it to update.

## The fine print

Currently hosted using Cloudflare Pages. The files under `functions/` are
Cloudflare Pages Functions - they serve `/sitemap.xml` and `/feed.xml`, and
rewrite the metadata on article pages so shared links unfurl properly. They
don't run under a plain static server, so those three routes only work on a
real deploy or under `wrangler pages dev`.

Copyright (c) 2026 Adnan Bukvic under the MIT license
