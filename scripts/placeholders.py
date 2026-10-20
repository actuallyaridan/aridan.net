#!/usr/bin/env python3
"""The blurred previews that stand in for the site's images while they load.

    python3 scripts/placeholders.py

Every image the pages show - each <img> in the HTML, and the photos the CSS
uses as backgrounds - gets a tiny copy of itself: blurred, shrunk to 24px
along its longest side, saved as WebP and written into styles.css as text.
That is a couple of hundred bytes each, there from the first frame, and the
real image paints over it when it arrives. Each <img> also gets its shape
(aspect-ratio), so its box is the right size before it has loaded - without
it, a photo sized only by its width is 0px tall until then, and the page
jumps when it arrives. See "Images still on their way"
in styles.css for how they are shown and taken away again.

The previews go between the generated:placeholders markers in styles.css,
replacing whatever was there. Run it again after adding or changing an
image; anything between the markers is rewritten, so don't edit it by hand.

Needs Pillow (`pip install pillow`). Images on other sites - the GitHub
logos on the projects page - are downloaded to make theirs.

Skipped: SVGs, which are drawings with nothing to blur, and GIFs, which here
are only the South Park reactions shown on hover.
"""

import base64
import io
import os
import re
import sys
import urllib.request

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STYLES = os.path.join(ROOT, "src", "css", "styles.css")
CSS_DIR = os.path.join(ROOT, "src", "css")

# Not pages, or not ours.
SKIP_DIRS = {".git", ".wrangler", "node_modules", "partials", "scripts"}

# Long enough that it reads as the picture, short enough to be a few hundred
# bytes. The browser stretches it to the image's size, which blurs it more.
PREVIEW_SIZE = 24
PREVIEW_QUALITY = 45

PREVIEWABLE = (".webp", ".png", ".jpg", ".jpeg")

OPEN_MARKER = "/* generated:placeholders"
CLOSE_MARKER = "/* /generated:placeholders */"

IMG_SRC = re.compile(r'<img\b[^>]*?\bsrc="([^"]+)"', re.S)

# Photos used as a CSS background, like the homepage banner. Data URLs are
# the previews themselves.
CSS_URL = re.compile(r"url\((/assets/[^)\"']+)\)")


def main():
    images = find_img_sources()
    backgrounds = find_css_backgrounds()

    rules = []
    variables = []

    for src in images:
        made = make_preview(src)
        if made is None:
            continue

        preview, width, height = made
        rules.append(img_rule(src, preview, width, height))

    for src in backgrounds:
        made = make_preview(src)
        if made is None:
            continue

        preview = made[0]
        variables.append("    " + variable_name(src) + ": url(" + preview + ");")

    block = build_block(variables, rules)
    write_block(block)

    print("Wrote previews for " + str(len(rules)) + " images and "
          + str(len(variables)) + " backgrounds.")


def find_pages():
    pages = []

    for folder, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

        for name in files:
            if name.endswith(".html"):
                pages.append(os.path.join(folder, name))

    pages.sort()
    return pages


def find_img_sources():
    found = []

    for page in find_pages():
        with open(page, encoding="utf-8") as f:
            html = f.read()

        for src in IMG_SRC.findall(html):
            if not src.lower().endswith(PREVIEWABLE):
                continue
            if src not in found:
                found.append(src)

    return found


def find_css_backgrounds():
    found = []

    for name in sorted(os.listdir(CSS_DIR)):
        if not name.endswith(".css"):
            continue

        with open(os.path.join(CSS_DIR, name), encoding="utf-8") as f:
            css = f.read()

        for src in CSS_URL.findall(css):
            if not src.lower().endswith(PREVIEWABLE):
                continue
            if src not in found:
                found.append(src)

    return found


def read_image(src):
    if src.startswith("https://"):
        request = urllib.request.Request(src, headers={"User-Agent": "aridan.net placeholders"})
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read()

    if src.startswith("/"):
        path = os.path.join(ROOT, src.lstrip("/"))
        with open(path, "rb") as f:
            return f.read()

    raise ValueError("Not a site path or an https address: " + src)


def make_preview(src):
    try:
        data = read_image(src)
    except Exception as error:
        print("Skipped " + src + ": " + str(error), file=sys.stderr)
        return None

    image = Image.open(io.BytesIO(data))

    # Kept transparent where the image is, so a logo's preview is the logo
    # rather than the logo on a box.
    image = image.convert("RGBA")

    width, height = image.size
    longest = max(width, height)
    scale = PREVIEW_SIZE / longest

    small_width = max(1, round(width * scale))
    small_height = max(1, round(height * scale))

    # Blurred before shrinking, by about one preview pixel, so it comes out
    # soft rather than as a few blocky squares.
    radius = longest / PREVIEW_SIZE / 2
    image = image.filter(ImageFilter.GaussianBlur(radius=radius))
    image = image.resize((small_width, small_height), Image.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, "WEBP", quality=PREVIEW_QUALITY, method=6)

    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return ("data:image/webp;base64," + encoded, width, height)


def img_rule(src, preview, width, height):
    lines = [
        'img[src="' + src + '"] {',
        "    aspect-ratio: " + str(width) + " / " + str(height) + ";",
        "    background-image: url(" + preview + ");",
        "}",
    ]
    return "\n".join(lines)


# /assets/uploads/images/banner.webp -> --placeholder-banner
def variable_name(src):
    stem = os.path.splitext(os.path.basename(src))[0]
    stem = re.sub(r"[^a-zA-Z0-9]+", "-", stem).strip("-").lower()
    return "--placeholder-" + stem


def build_block(variables, rules):
    parts = [
        OPEN_MARKER,
        "   Written by scripts/placeholders.py: change the images, then run it",
        "   again, rather than editing in here. */",
    ]

    if variables:
        parts.append(":root {")
        parts.extend(variables)
        parts.append("}")

    for rule in rules:
        parts.append("")
        parts.append(rule)

    parts.append(CLOSE_MARKER)
    return "\n".join(parts)


def write_block(block):
    with open(STYLES, encoding="utf-8") as f:
        css = f.read()

    start = css.find(OPEN_MARKER)
    end = css.find(CLOSE_MARKER)

    if start == -1 or end == -1:
        print("styles.css has no " + OPEN_MARKER + " ... " + CLOSE_MARKER
              + " block to write into.", file=sys.stderr)
        sys.exit(2)

    end = end + len(CLOSE_MARKER)
    css = css[:start] + block + css[end:]

    with open(STYLES, "w", encoding="utf-8") as f:
        f.write(css)


if __name__ == "__main__":
    main()
