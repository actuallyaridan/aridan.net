# <img src="/assets/media/favicons/icon-192.png" width="32px" height="32px"> aridan.net
A modern, fast and lightweight website that can be used to show general information about a person.
Supports multiple languages and follows accessibility guidelines for a more open internet. 

## Articles

Each article is one markdown file in `assets/content/articles/`, and its front
matter is the only place its metadata lives:

```markdown
---
title: Hello, Liquid Glass
date: 2026-03-30
preview: One or two sentences, shown on the Articles listing.
categories:
  - name: Design
    color: blue
---

## Your first heading
```

`index.json` next to it is just a list of slugs, because a static file server
can't list a directory. Titles, dates and previews are read from the `.md`
files themselves, so the listing and the article page can never disagree.

Dates are stored as `YYYY-MM-DD` and shown as `DD/MM/YYYY`. Category colours
are `default` or `blue` (the only two `styles.css` defines).

`src/js/articleFormat.js` defines the format and is shared by the listing, the
article page and the editor. Its `parse()` and `stringify()` are inverses, so
anything the editor writes reads straight back.

## Editing articles

Open `/articles/` with Five Server running. On a local address the page grows a
**New article** button, and each article gets a pen and a trash can next to its
arrow:

| | |
| --- | --- |
| `/articles/new/` | write a new article |
| `/articles/edit/index.html?article=<slug>` | change an existing one |
| trash can on the listing | delete an article |

Saving or deleting writes to `assets/content/articles/` and rebuilds
`index.json` from what is actually in the folder, so the list can never be
wrong. You pick the folder once and the browser remembers it.

None of this exists in production. `src/js/articleStore.js` checks the hostname
the same way the Pi-hole page does - localhost, `.local`/`.lan`, loopback or a
private LAN address - and on aridan.net the buttons are never added to the page
at all.

The body is written in a WYSIWYG surface ([Toast UI
Editor](https://ui.toast.com/tui-editor), loaded from a CDN) which reads and
writes Markdown, so the files on disk are unchanged. There is a Markdown tab if
you prefer, and if the CDN can't be reached it falls back to a plain textarea.
The editing surface is restyled in `src/css/editor.css` to match the site's own
article styles, so what you see while writing is what the article will look
like - if you change `.article-content` in `styles.css`, update that block too.
Note that saving normalises the markdown slightly - a blank line after a
heading, `*` for bullets instead of `-`. It renders identically.

Saving to the folder needs the File System Access API (Chrome, Edge, Opera).
In Firefox or Safari the buttons are all still there and the editor works the
same - **Download .md** just becomes the way to save. It downloads the article
under its proper file name, so for an edit you replace the file of the same
name in `assets/content/articles/`. Deleting has no equivalent fallback, so
there the trash can is shown disabled, and the listing shows the same style of
warning banner the Projects page uses for the GitHub rate limit.

An existing article's file name is fixed while editing, since renaming it would
change the article's address and break any links to it.

## Contributors

- Adnan Bukvic (a.k.a. aridan) / [@actuallyaridan](https://github.com/actuallyaridan)

- Slade Watkins / [@sladewatkins](https://github.com/sladewatkins)

- Dexrn ZacAttack (a.k.a Zach) / [@dexrnzacattack](https://github.com/dexrnzacattack)

- Dhiren Vasnani / [@dhirenvasnani](https://github.com/dhirenvasnani)

## The fine print

Currently hosted using Cloudlfare. 

Copyright (c) 2024 Adnan Bukvic under the MIT license
