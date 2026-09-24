(function () {
    const DEFAULT_STATUS = "ongoing";

    // The rules between sections, hidden along with the section they follow.
    function isSeparator(el) {
        if (el == null) return false;
        if (el.tagName !== "HR") return false;
        return el.classList.contains("onMobile");
    }

    function show(status) {
        let lastShown = null;

        for (const section of document.querySelectorAll("main .section[data-status]")) {
            const visible = section.dataset.status === status;
            section.classList.toggle("hide", !visible);

            const next = section.nextElementSibling;
            if (isSeparator(next)) {
                next.classList.toggle("hide", !visible);
            }

            if (visible) lastShown = section;
        }

        // A rule after the last visible section would hang off the bottom.
        if (lastShown && isSeparator(lastShown.nextElementSibling)) {
            lastShown.nextElementSibling.classList.add("hide");
        }

        for (const li of document.querySelectorAll(".projectFilter li")) {
            const button = li.querySelector("button[data-status]");
            if (!button) continue;

            const active = button.dataset.status === status;

            li.classList.toggle("active", active);

            if (active) {
                button.setAttribute("aria-pressed", "true");
            } else {
                button.setAttribute("aria-pressed", "false");
            }
        }

        if (typeof repositionNavPills === "function") repositionNavPills();
    }

    function init() {
        const filter = document.querySelector(".projectFilter");
        if (!filter) return;

        const buttons = [...filter.querySelectorAll("button[data-status]")];

        for (const button of buttons) {
            button.addEventListener("click", () => {
                show(button.dataset.status);

                // replaceState, so flicking between filters does not fill up Back.
                history.replaceState(null, "", "#" + button.dataset.status);
            });
        }

        const statuses = buttons.map((button) => button.dataset.status);

        window.addEventListener("hashchange", () => {
            const status = location.hash.slice(1);
            if (statuses.includes(status)) show(status);
        });

        const fromUrl = location.hash.slice(1);
        if (statuses.includes(fromUrl)) {
            show(fromUrl);
        } else {
            show(DEFAULT_STATUS);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
