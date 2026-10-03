/* The "more" menu: a round glass button that opens a small list, used to keep
   Delete one step away from a stray click on the article page and in the
   editor. Styled in editor.css.

   A menu can be written straight into the HTML (the editor) or built with
   ArticleMenu.create() (the article page, whose buttons are made in
   articleAdmin.js). Either way it looks like this:

       <span class="articleMenu">
           <button class="button articleMenuButton" aria-haspopup="menu"
                   aria-expanded="false">...</button>
           <div class="articleMenuList" role="menu" hidden>
               <button role="menuitem">...</button>
           </div>
       </span>
*/
(function (global) {
    "use strict";

    var openGroup = null;

    function t(text) {
        if (global.i18n) return global.i18n.t(text);
        return text;
    }

    function partsOf(group) {
        return {
            toggle: group.querySelector(".articleMenuButton"),
            menu: group.querySelector(".articleMenuList")
        };
    }

    // Disabled items are skipped, so the arrow keys never land on one.
    function itemsOf(menu) {
        return Array.from(menu.querySelectorAll("[role=menuitem]")).filter(function (el) {
            return !el.disabled;
        });
    }

    function open(group, focusFirst) {
        if (openGroup && openGroup !== group) close(openGroup, false);

        var parts = partsOf(group);
        parts.menu.hidden = false;
        parts.toggle.setAttribute("aria-expanded", "true");
        openGroup = group;

        if (focusFirst) itemsOf(parts.menu)[0]?.focus();
    }

    function close(group, refocus) {
        if (!group) return;

        var parts = partsOf(group);
        parts.menu.hidden = true;
        parts.toggle.setAttribute("aria-expanded", "false");
        if (openGroup === group) openGroup = null;

        if (refocus) parts.toggle.focus();
    }

    function wire(group) {
        if (group.dataset.menuWired) return;
        group.dataset.menuWired = "true";

        var parts = partsOf(group);
        var toggle = parts.toggle;
        var menu = parts.menu;

        toggle.addEventListener("click", function () {
            if (menu.hidden) open(group, false);
            else close(group, false);
        });

        // Opened from the keyboard, focus goes straight into the menu.
        toggle.addEventListener("keydown", function (e) {
            if (e.key !== "ArrowDown" && e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            open(group, true);
        });

        // Picking an item closes the menu, whatever the item goes on to do.
        menu.addEventListener("click", function (e) {
            if (e.target.closest("[role=menuitem]")) close(group, false);
        });

        menu.addEventListener("keydown", function (e) {
            var items = itemsOf(menu);
            var index = items.indexOf(document.activeElement);

            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                var step = 1;
                if (e.key === "ArrowUp") step = -1;
                items[(index + step + items.length) % items.length]?.focus();
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close(group, true);
            } else if (e.key === "Tab") {
                close(group, false);
            }
        });
    }

    // items: the links and buttons to put in the menu, in order.
    function create(items) {
        var group = document.createElement("span");
        group.className = "articleMenu";

        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "button articleMenuButton";
        toggle.setAttribute("aria-haspopup", "menu");
        toggle.setAttribute("aria-expanded", "false");
        toggle.innerHTML = '<i class="fa-solid fa-ellipsis" aria-hidden="true"></i>';

        var menu = document.createElement("div");
        menu.className = "articleMenuList";
        menu.setAttribute("role", "menu");
        menu.hidden = true;

        for (const item of items) {
            item.setAttribute("role", "menuitem");
            menu.appendChild(item);
        }

        function label() {
            toggle.title = t("More options");
            toggle.setAttribute("aria-label", t("More options"));
        }
        label();
        if (global.i18n) global.i18n.onChange(label);

        group.appendChild(toggle);
        group.appendChild(menu);
        wire(group);
        return group;
    }

    // A click anywhere outside the open menu closes it.
    document.addEventListener("click", function (e) {
        if (!openGroup) return;
        if (openGroup.contains(e.target)) return;
        close(openGroup, false);
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && openGroup) close(openGroup, true);
    });

    // Menus written into the HTML.
    function wireAll() {
        document.querySelectorAll(".articleMenu").forEach(wire);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wireAll);
    } else {
        wireAll();
    }

    global.ArticleMenu = { create: create, close: close };
})(window);
