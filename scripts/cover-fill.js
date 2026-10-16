// Fills cover.html in from its query string: ?title=...&preview=...&icon=...
(function () {
    "use strict";

    var params = new URLSearchParams(location.search);

    var title = params.get("title");
    if (title) {
        document.getElementById("title").textContent = title;
    }

    var preview = params.get("preview");
    if (preview) {
        document.getElementById("preview").textContent = preview;
    }

    // The article's icon, as its Font Awesome classes: "fa-solid fa-droplet".
    var icon = params.get("icon");
    if (icon) {
        document.getElementById("icon").className = icon;
    }
})();
