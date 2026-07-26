/* Projects page: the Ongoing / Paused tabs.

   Every project section carries a data-status, and the nav under the page
   description shows one status at a time so only the relevant ones are on
   screen. The choice is kept in the URL (/projects/#paused) so a paused
   project can still be linked to directly. */
(function () {
    const DEFAULT_STATUS = "ongoing";

    // The separators between sections are only visible on mobile, but they still
    // space the sections out on desktop, so they follow their section in or out.
    function isSeparator(el) {
        return el != null && el.tagName === "HR" && el.classList.contains("onMobile");
    }

    function show(status) {
        let lastShown = null;

        document.querySelectorAll("main .section[data-status]").forEach((section) => {
            const visible = section.dataset.status === status;
            section.classList.toggle("hide", !visible);
            if (isSeparator(section.nextElementSibling)) {
                section.nextElementSibling.classList.toggle("hide", !visible);
            }
            if (visible) lastShown = section;
        });

        // Nothing follows the last section shown, so it doesn't need a separator.
        if (lastShown && isSeparator(lastShown.nextElementSibling)) {
            lastShown.nextElementSibling.classList.add("hide");
        }

        document.querySelectorAll(".projectFilter li").forEach((li) => {
            const button = li.querySelector("button[data-status]");
            if (!button) return;
            const active = button.dataset.status === status;
            li.classList.toggle("active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });

        if (typeof repositionNavPills === "function") repositionNavPills();
    }

    function init() {
        const filter = document.querySelector(".projectFilter");
        if (!filter) return;

        const buttons = [...filter.querySelectorAll("button[data-status]")];
        buttons.forEach((button) => {
            button.addEventListener("click", () => {
                show(button.dataset.status);
                history.replaceState(null, "", "#" + button.dataset.status);
            });
        });

        const statuses = buttons.map((button) => button.dataset.status);
        const fromHash = () => {
            const status = location.hash.slice(1);
            return statuses.includes(status) ? status : DEFAULT_STATUS;
        };

        // Someone arriving on /projects/#paused from elsewhere, or changing the
        // hash by hand, gets the tab they asked for.
        window.addEventListener("hashchange", () => show(fromHash()));
        show(fromHash());
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
