# <img src="/assets/media/favicons/icon-192.png" width="32px" height="32px"> aridan.net
A modern, fast and lightweight website that can be used to show general information about a person.
Supports multiple languages and follows accessibility guidelines for a more open internet. 

## Contributors

- Adnan Bukvic (a.k.a. aridan) / [@actuallyaridan](https://github.com/actuallyaridan)

- Slade Watkins / [@sladewatkins](https://github.com/sladewatkins)

- Dexrn ZacAttack (a.k.a Zach) / [@dexrnzacattack](https://github.com/dexrnzacattack)

- Dhiren Vasnani / [@dhirenvasnani](https://github.com/dhirenvasnani)

## The fine print

Currently hosted using Cloudflare Pages. The files under `functions/` are
Cloudflare Pages Functions - they serve `/sitemap.xml` and `/feed.xml`, and
rewrite the metadata on article pages so shared links unfurl properly. They
don't run under a plain static server, so those three routes only work on a
real deploy or under `wrangler pages dev`.

Copyright (c) 2026 Adnan Bukvic under the MIT license
