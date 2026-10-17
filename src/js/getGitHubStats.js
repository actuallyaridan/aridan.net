// The counts come from /api/github, which asks GitHub on the site's behalf and
// remembers the answer - see functions/api/github.js. Which repos each number
// is for is written on the element itself, in data-github-stars or
// data-github-forks; a card for a group of repos lists them all, separated by
// commas, and shows the total.
const GITHUB_STATS_URL = "/api/github";

// Counts from the number written in the page to the live one, so a change
// since the page was last edited ticks up in front of you. The page's own
// number is only ever a whole one - "371", never "1.6K" - and anything else
// counts from 0.
function showCount(el, value) {
    if (!el) return;

    if (!window.countTo) {
        el.textContent = formatGitHubCount(value);
        return;
    }

    let from = 0;
    const written = el.textContent.trim();
    if (/^\d+$/.test(written)) {
        from = Number(written);
    }

    window.countTo(el, value, formatGitHubCount, {
        from: from,
        whole: true,
        during: function (n) {
            return formatGitHubCount(n, true);
        }
    });
}

// 1600 reads as 1.6K, the way GitHub shows it. Rounded down, so a repo is
// never shown with more stars than it has.
// `steady` keeps the decimal even when it is a 0 - "2.0K" rather than "2K" -
// for the numbers on the way while one counts up, which would otherwise
// change length every few frames and make the number jump sideways.
function formatGitHubCount(n, steady) {
    if (n < 1000) return String(n);

    const options = { maximumFractionDigits: 1 };
    if (steady) {
        options.minimumFractionDigits = 1;
    }

    const floored = Math.floor(n / 100) / 10;
    return floored.toLocaleString(undefined, options) + "K";
}

// The total for a comma-separated list of repos, or null if any of them is
// missing - a group shows its old number rather than a total that is short.
function totalFor(list, repos, field) {
    let total = 0;

    for (const part of list.split(",")) {
        const counts = repos[part.trim()];
        if (!counts) return null;

        total += counts[field];
    }

    return total;
}

function fillCounts(repos, attribute, field) {
    for (const el of document.querySelectorAll("[" + attribute + "]")) {
        const total = totalFor(el.getAttribute(attribute), repos, field);
        if (total === null) continue;

        showCount(el, total);
    }
}

// If this fails the page keeps the numbers written into it, which were right
// when it was last edited. That is close enough not to need a warning.
async function updateGitHubStats() {
    let data;
    try {
        const response = await fetch(GITHUB_STATS_URL);
        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        data = await response.json();
    } catch (error) {
        debug.warn("Could not load GitHub stats:", error);
        return;
    }

    if (!data || !data.repos) return;

    fillCounts(data.repos, "data-github-stars", "stars");
    fillCounts(data.repos, "data-github-forks", "forks");
}

updateGitHubStats();
