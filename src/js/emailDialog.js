/* The email dialog. Any link marked data-email-dialog opens it instead of
 * jumping straight to a mail app, so people without one set up still get the
 * address. Without JavaScript the link is a plain mailto: and still works.
 * A native <dialog> gives focus trapping, Escape and an inert page for free.
 */
(() => {
    "use strict";

    const ADDRESS = "adnan@aridan.net";

    function t(en) {
        return window.i18n ? window.i18n.t(en) : en;
    }

    function markup() {
        return `
<dialog id="emailDialog" class="emailDialog" aria-labelledby="emailDialogTitle">
    <p class="emailDialogIcon"><i class="fa-solid fa-envelope" aria-hidden="true"></i></p>
    <h2 id="emailDialogTitle">Email</h2>
    <p class="modalDescription">Open it in your mail app, or copy the address and send it from wherever you like.</p>
    <div class="emailAddress">
        <span>${ADDRESS}</span>
        <button type="button" class="noUI emailCopy" title="Copy address" aria-label="Copy address"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
    </div>
    <p class="emailCopied" role="status" aria-live="polite"></p>
    <div class="modalButtons">
        <a class="button primary" href="mailto:${ADDRESS}"></i>Open mail app</a>
        <button type="button" class="button emailClose">Close</button>
    </div>
</dialog>`;
    }

    let dialog = null;
    let resetTimer = null;

    function copied(ok) {
        const status = dialog.querySelector(".emailCopied");
        const icon = dialog.querySelector(".emailCopy > i");

        // Success is shown by the checkmark alone; the words stay for screen readers.
        if (ok) status.innerHTML = `<span class="visuallyHidden">${t("Copied to clipboard")}</span>`;
        else status.textContent = t("Couldn't copy - select the address instead");
        icon.className = ok ? "fa-solid fa-check" : "fa-regular fa-copy";

        // Select it for them, so Ctrl+C is all that is left to do.
        if (!ok) window.getSelection()?.selectAllChildren(dialog.querySelector(".emailAddress > span"));

        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
            status.textContent = "";
            icon.className = "fa-regular fa-copy";
        }, 2000);
    }

    function copy() {
        if (!navigator.clipboard) {
            copied(false);
            return;
        }
        navigator.clipboard.writeText(ADDRESS).then(() => copied(true), () => copied(false));
    }

    // Translated here rather than through i18n.js's selectors, since the
    // dialog is built after the page has already been translated once.
    function translate() {
        dialog.querySelector("h2").textContent = t("Email");
        dialog.querySelector(".modalDescription").textContent =
            t("Open it in your mail app, or copy the address and send it from wherever you like.");
        dialog.querySelector(".primary").lastChild.nodeValue = t("Open mail app");
        dialog.querySelector(".emailClose").textContent = t("Close");

        const copyBtn = dialog.querySelector(".emailCopy");
        copyBtn.title = t("Copy address");
        copyBtn.setAttribute("aria-label", t("Copy address"));
    }

    function inject() {
        document.body.insertAdjacentHTML("beforeend", markup().trim());
        dialog = document.getElementById("emailDialog");

        dialog.querySelector(".emailCopy").addEventListener("click", copy);
        dialog.querySelector(".emailClose").addEventListener("click", () => dialog.close());

        // Choosing the mail app is the end of the job, so the dialog goes too.
        dialog.querySelector(".primary").addEventListener("click", () => dialog.close());

        // A click on the backdrop lands on the <dialog> itself, never its children.
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) dialog.close();
        });

        for (const link of document.querySelectorAll("[data-email-dialog]")) {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                dialog.showModal();
            });
        }

        window.i18n?.onChange(translate);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject);
    else inject();
})();
