/* Settings > Developer options > Component versions. Lists the libraries the
 * site loads from a CDN and whether each is the newest release, as worked out
 * by /api/versions. Loaded by settings.js the first time that page is opened,
 * so pages that never use it never download it.
 */
(() => {
    "use strict";

    // Translated at the moment they are shown, through i18n.js, with {0}
    // standing in for a version number.
    function t(text, ...args) {
        if (window.i18n) return window.i18n.t(text, ...args);

        let out = text;
        for (let i = 0; i < args.length; i++) {
            out = out.split("{" + i + "}").join(args[i]);
        }
        return out;
    }

    const STATUS_LABELS = {
        current: "Up to date",
        outdated: "Update available",
        pending: "Newer release not on cdnjs yet",
        unpinned: "Automatic",
        unknown: "Couldn't check"
    };

    // One status per loaded version, since a library pinned at two versions
    // can be current on some pages and behind on others.
    function statusOf(component, entry) {
        if (!entry.version) return "unpinned";
        if (component.error || !component.latest) return "unknown";
        if (entry.version === component.latest) return "current";

        // Behind, but the newer release is not on the CDN to switch to yet.
        if (!component.onCdn) return "pending";

        return "outdated";
    }

    // The lines under the name, one per <p>.
    function detailsOf(component, entry, status) {
        if (status === "unpinned") {
            return [t("Installed: {0}", component.latest), t("Updates install automatically")];
        }

        const installed = t("Installed: {0}", entry.version);

        // The error itself is left in English - it is the upstream's own
        // message, for whoever is debugging it.
        if (status === "unknown") {
            return [installed, component.error || t("No latest version found")];
        }

        if (status === "current") {
            return [installed, t("Already up to date")];
        }

        if (status === "pending") {
            return [installed, t("Available: {0} (not on cdnjs yet)", component.latest)];
        }

        return [installed, t("Available: {0}", component.latest)];
    }

    function element(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function itemFor(component, entry) {
        const status = statusOf(component, entry);

        const item = element("li", "versionItem");
        item.dataset.status = status;

        const head = element("div", "versionHead");
        head.appendChild(element("span", "versionName", component.name));
        head.appendChild(element("span", "versionBadge", t(STATUS_LABELS[status])));
        item.appendChild(head);

        for (const line of detailsOf(component, entry, status)) {
            item.appendChild(element("p", "versionDetail", line));
        }

        return item;
    }

    function render(results, data) {
        results.textContent = "";

        const list = element("ul", "versionList");

        for (const component of data.components) {
            for (const entry of component.versions) {
                list.appendChild(itemFor(component, entry));
            }
        }

        if (!list.children.length) {
            results.appendChild(element("p", "versionDetail", t("No CDN components found.")));
            return;
        }

        results.appendChild(list);
    }

    // As many as the site loads today, so the list is about the height it
    // will be when the real rows replace these.
    const SKELETON_ROWS = 4;

    // Grey rows shaped like the real ones - a name, a badge and two lines -
    // while /api/versions answers. The hidden text is what the live region
    // reads out in their place.
    function skeleton() {
        const wrap = element("div");

        const list = element("ul", "versionList skeleton");
        list.setAttribute("aria-hidden", "true");

        for (let i = 0; i < SKELETON_ROWS; i++) {
            const item = element("li", "versionItem versionSkeleton");

            const head = element("div", "versionHead");
            head.appendChild(element("span", "skeletonBar skeletonName"));
            head.appendChild(element("span", "skeletonBar skeletonBadge"));
            item.appendChild(head);

            item.appendChild(element("span", "skeletonBar skeletonDetail"));
            item.appendChild(element("span", "skeletonBar skeletonDetail short"));

            list.appendChild(item);
        }

        wrap.appendChild(list);
        wrap.appendChild(element("span", "visuallyHidden", t("Checking...")));
        return wrap;
    }

    // Every time the page is opened, so it is never showing an old answer.
    async function run(results) {
        results.textContent = "";
        results.appendChild(skeleton());

        try {
            const res = await fetch("/api/versions", { cache: "no-store" });
            if (!res.ok) throw new Error("/api/versions responded " + res.status);

            const data = await res.json();
            debug.log(data);
            render(results, data);
        } catch (err) {
            console.error("[versionCheck.js]", err);
            results.textContent = "";
            results.appendChild(element("p", "versionDetail", t("Couldn't check versions: {0}", err.message)));
        }
    }

    window.VersionCheck = { run: run };
})();
