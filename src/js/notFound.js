/* The 404 page's easter egg. Pressing the dizzy face gets Kenny's treatment:
 * "Oh my God, they killed this page!", then "You bastards!" - through the
 * same filter as the song titles, so with "Hide explicit language" on (the
 * default) the site censors its own joke. */
(function () {
    "use strict";

    const FIRST_LINE = "Oh my God, they killed this page!";
    const SECOND_LINE = "You bastards!";

    // Long enough to read the first line before the second takes its place.
    const SECOND_LINE_AFTER_MS = 1800;
    const SHOWN_MS = 4500;

    function init() {
        const icon = document.querySelector("main .info .icon");
        if (!icon) return;
        if (typeof speechBubble !== "function") return;

        const bubble = speechBubble(icon, { centered: true });
        let secondLineTimer = 0;

        function secondLine() {
            let text = SECOND_LINE;
            if (window.Profanity) text = window.Profanity.clean(text);

            bubble.show(text, SHOWN_MS);
        }

        function killed() {
            window.clearTimeout(secondLineTimer);

            bubble.show(FIRST_LINE);
            secondLineTimer = window.setTimeout(secondLine, SECOND_LINE_AFTER_MS);
        }

        // A button as far as keyboards and screen readers are concerned,
        // without changing how the icon looks.
        icon.setAttribute("role", "button");
        icon.setAttribute("tabindex", "0");
        icon.setAttribute("aria-label", "Poke the page");
        icon.classList.add("pokeable");

        icon.addEventListener("click", killed);

        icon.addEventListener("keydown", function (event) {
            if (event.key !== "Enter" && event.key !== " ") return;

            event.preventDefault();
            killed();
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
