(function () {
    const DEFAULT_STATUS = "ongoing";

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

        window.addEventListener("hashchange", () => {
            const status = location.hash.slice(1);
            if (statuses.includes(status)) show(status);
        });
        show(fromHash());
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
