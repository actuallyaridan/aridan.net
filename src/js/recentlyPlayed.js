/* Recently played: the songs I have listened to lately, in a dialog opened from
 * the button under the music card.
 *
 * The list is kept by the presence Worker (aridan-presence), which sees every
 * song the agent reports whether or not Discord is open. It is only fetched
 * when the dialog is opened, so a visit that never opens it costs nothing.
 *
 * The button only shows while the card has a song in it, playing or last
 * played - with no music at all there is nothing to look back on.
 */
(() => {
    "use strict";

    const RECENT_URL = "https://presence.aridan.net/recent";

    // Apple's covers are 96px here, twice the size they are shown at, for
    // high-density screens.
    const ART_SIZE = 96;

    // Asked again on opening only if the last answer is older than this. The
    // list changes once a song at most, so anything more is wasted.
    const FRESH_MS = 30 * 1000;

    // The "ago" times are redrawn while the dialog is open, so one left open
    // does not say "now" about a song from an hour ago.
    const AGO_REFRESH_MS = 60 * 1000;

    // Biggest first: the first unit the time fits at least one of is the one
    // it is told in. The same as lanyard.js.
    const AGO_UNITS = [
        { unit: "year", seconds: 365 * 24 * 60 * 60 },
        { unit: "month", seconds: 30 * 24 * 60 * 60 },
        { unit: "week", seconds: 7 * 24 * 60 * 60 },
        { unit: "day", seconds: 24 * 60 * 60 },
        { unit: "hour", seconds: 60 * 60 },
        { unit: "minute", seconds: 60 },
    ];

    const button = document.getElementById("recentBtn");
    if (!button) return;

    let dialog = null;
    let list = null;
    let status = null;

    let tracks = null;
    let fetchedAt = 0;
    let loading = false;
    let agoTimer = 0;

    function t(en) {
        if (window.i18n) return window.i18n.t(en);
        return en;
    }

    function markup() {
        return `
<dialog id="recentDialog" class="emailDialog recentDialog" aria-labelledby="recentDialogTitle">
    <p class="emailDialogIcon"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></p>
    <h2 id="recentDialogTitle">Recently played</h2>
    <p class="modalDescription">The last songs I listened to, newest first.</p>
    <p class="recentStatus" role="status" aria-live="polite"></p>
    <ol class="recentList"></ol>
    <div class="modalButtons">
        <button type="button" class="button recentClose">Close</button>
    </div>
</dialog>`;
    }

    function inject() {
        document.body.insertAdjacentHTML("beforeend", markup().trim());

        dialog = document.getElementById("recentDialog");
        list = dialog.querySelector(".recentList");
        status = dialog.querySelector(".recentStatus");

        dialog.querySelector(".recentClose").addEventListener("click", () => dialog.close());

        // A click on the backdrop lands on the <dialog> itself, never its children.
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) dialog.close();
        });

        dialog.addEventListener("close", () => {
            clearInterval(agoTimer);
            agoTimer = 0;
        });

        button.addEventListener("click", open);

        window.i18n?.onChange(translate);
        translate();

        if (window.Lanyard) {
            window.Lanyard.subscribe(onPresence);
        }
    }

    /* ---------- The button ---------- */

    function onPresence(presence) {
        let hasMusic = false;

        if (window.Lanyard.appleMusic(presence)) {
            hasMusic = true;
        }
        if (window.Lanyard.lastPlayed(presence)) {
            hasMusic = true;
        }

        button.classList.toggle("hide", !hasMusic);

        // A new song means the list has changed. Only redrawn here if it is
        // open; otherwise the next opening asks for it anyway.
        if (dialog.open) {
            fetchedAt = 0;
            load();
        }
    }

    /* ---------- The dialog ---------- */

    function open() {
        dialog.showModal();

        if (tracks) {
            render();
        }

        if (Date.now() - fetchedAt > FRESH_MS) {
            load();
        }

        clearInterval(agoTimer);
        agoTimer = setInterval(updateTimes, AGO_REFRESH_MS);
    }

    async function load() {
        if (loading) return;
        loading = true;

        // Only said while there is nothing on screen yet. With an older list
        // already showing, it is quietly replaced instead.
        if (!tracks) {
            setStatus(t("Loading…"));
        }

        try {
            const response = await fetch(RECENT_URL, { cache: "no-store" });
            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }

            const body = await response.json();

            let received = [];
            if (body && Array.isArray(body.tracks)) {
                received = body.tracks;
            }

            tracks = received;
            fetchedAt = Date.now();
            render();
        } catch (error) {
            debug.warn("Could not load recently played:", error);

            if (!tracks) {
                setStatus(t("Couldn't load the list. Try again later."));
            }
        } finally {
            loading = false;
        }
    }

    function setStatus(text) {
        status.textContent = text;
        status.hidden = !text;
    }

    function render() {
        list.replaceChildren();

        if (!tracks.length) {
            setStatus(t("Nothing played yet."));
            return;
        }

        setStatus("");

        for (const track of tracks) {
            list.appendChild(row(track));
        }
    }

    function row(track) {
        const activity = track.activity || {};

        const title = shown(activity.details || "");
        const artist = shown(artistOf(activity.state));

        const item = document.createElement("li");
        item.className = "recentTrack";

        // The whole row is the link, so it is one tab stop and one big target.
        const link = document.createElement("a");
        link.className = "recentLink";
        link.href = appleMusicSearch(activity);
        link.target = "_blank";
        link.rel = "noopener";
        link.title = t("Listen on Apple Music");

        link.appendChild(cover(activity));

        const text = document.createElement("span");
        text.className = "recentText";

        const titleEl = document.createElement("span");
        titleEl.className = "recentTitle titleColor";
        titleEl.textContent = title;
        text.appendChild(titleEl);

        const artistEl = document.createElement("span");
        artistEl.className = "recentArtist subtitleColor";
        artistEl.textContent = artist;
        text.appendChild(artistEl);

        link.appendChild(text);

        const when = document.createElement("time");
        when.className = "recentWhen subtitleColor";
        when.dateTime = new Date(track.at).toISOString();
        when.title = new Date(track.at).toLocaleString(currentLanguage());
        when.dataset.at = String(track.at);

        if (track.playing) {
            when.dataset.playing = "true";
        }

        when.textContent = whenText(when);
        link.appendChild(when);

        item.appendChild(link);
        return item;
    }

    // Through Discord's proxy or Apple's own sizing, never a full-size file:
    // the Cider host's originals can be tens of megabytes. With no small copy
    // to be had, the row gets a music note instead.
    function cover(activity) {
        const art = window.Lanyard ? window.Lanyard.artwork(activity) : null;

        let url = "";
        if (art && art.proxy) {
            url = art.proxy(ART_SIZE);
        } else if (art && art.mzstatic) {
            url = art.mzstatic(ART_SIZE);
        } else if (art && art.appAsset) {
            url = art.appAsset(ART_SIZE);
        }

        if (!url) {
            return noteInstead();
        }

        // The title and artist are right beside it, so it says nothing new.
        const img = document.createElement("img");
        img.className = "recentArt";
        img.src = url;
        img.alt = "";
        img.width = 48;
        img.height = 48;
        img.loading = "lazy";
        img.decoding = "async";
        img.draggable = false;

        // A cover that has gone away leaves the note rather than a broken image.
        img.addEventListener("error", () => {
            img.replaceWith(noteInstead());
        });

        return img;
    }

    function noteInstead() {
        const placeholder = document.createElement("span");
        placeholder.className = "recentArt recentArtEmpty";
        placeholder.setAttribute("aria-hidden", "true");
        placeholder.innerHTML = '<i class="fa-solid fa-music"></i>';
        return placeholder;
    }

    // A search rather than the exact song: the card's exact lookup takes
    // several requests to Apple per song, which is a lot for twenty of them,
    // and the song is almost always the first result anyway. The real names
    // are searched for, not the censored ones shown.
    function appleMusicSearch(activity) {
        const parts = [];

        if (activity.details) {
            parts.push(activity.details);
        }

        const artist = artistOf(activity.state);
        if (artist) {
            parts.push(artist);
        }

        return "https://music.apple.com/search?term=" + encodeURIComponent(parts.join(" "));
    }

    function whenText(el) {
        if (el.dataset.playing === "true") {
            return t("Playing now");
        }

        return timeAgo(Number(el.dataset.at));
    }

    function updateTimes() {
        for (const el of list.querySelectorAll(".recentWhen")) {
            el.textContent = whenText(el);
        }
    }

    // Translated here rather than through i18n.js's selectors, since the
    // dialog is built after the page has already been translated once.
    function translate() {
        dialog.querySelector("h2").textContent = t("Recently played");
        dialog.querySelector(".modalDescription").textContent = t("The last songs I listened to, newest first.");
        dialog.querySelector(".recentClose").textContent = t("Close");

        // The rows carry translated text of their own - "Playing now", the
        // "ago" times and the link titles - so they are drawn again.
        if (tracks && dialog.open) {
            render();
        }
    }

    /* ---------- Helpers ---------- */

    // "3 hours ago", in whichever language the site is in. The same as
    // timeAgo() in lanyard.js.
    function timeAgo(at) {
        const elapsed = Math.max(0, (Date.now() - at) / 1000);
        const format = relativeTimeFormat();

        // numeric: "auto" turns 0 seconds into "now" rather than "in 0 seconds".
        if (elapsed < 60) {
            return format.format(0, "second");
        }

        for (const step of AGO_UNITS) {
            if (elapsed >= step.seconds) {
                const count = Math.floor(elapsed / step.seconds);
                return format.format(-count, step.unit);
            }
        }

        return format.format(0, "second");
    }

    function relativeTimeFormat() {
        // numeric: "auto" says "yesterday" rather than "1 day ago".
        const options = { numeric: "auto" };

        try {
            return new Intl.RelativeTimeFormat(currentLanguage(), options);
        } catch {
            return new Intl.RelativeTimeFormat("en", options);
        }
    }

    function currentLanguage() {
        if (window.i18n && window.i18n.lang) return window.i18n.lang;
        return "en";
    }

    // Cider puts "by " in front of the artist. Anchored, so an artist with
    // "by" inside their name keeps it. The same as artistOf() in lanyard.js.
    function artistOf(state) {
        return String(state || "").trim().replace(/^by\s+/i, "");
    }

    // What a song or artist is called on screen - see profanity.js.
    function shown(text) {
        if (window.Profanity) return window.Profanity.clean(text);
        return text;
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject);
    else inject();
})();
