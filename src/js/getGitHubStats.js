const GITHUB_API = "https://api.github.com/repos/";

// GitHub allows 60 unauthenticated requests an hour per address.
function showRateLimitNotice() {
    const el = document.getElementById("rateLimitGitHub");
    if (el) el.style.display = "flex";
}

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

async function updateGitHubRepoStats(repos) {
    for (const repo of repos) {
        const [owner, repoName] = repo.split('/');
        const url = GITHUB_API + owner + "/" + repoName;

        try {
            const response = await fetch(url);

            if (response.status === 403) {
                showRateLimitNotice();
                debug.warn("Rate limited by GitHub API when fetching " + repo);
                break;
            }

            if (!response.ok) {
                throw new Error("GitHub API error: " + response.status);
            }

            const data = await response.json();

            const starsEl = document.getElementById("stars-" + owner + "-" + repoName);
            const forksEl = document.getElementById("forks-" + owner + "-" + repoName);

            showCount(starsEl, data.stargazers_count);
            showCount(forksEl, data.forks_count);
        } catch (error) {
            console.error("Failed to fetch stats for " + repo + ":", error);
        }
    }
}

// One card for several repos. Any failure abandons the group, so no half totals.
async function updateGitHubGroupStats(groupId, repos) {
    let stars = 0;
    let forks = 0;

    for (const repo of repos) {
        try {
            const response = await fetch(GITHUB_API + repo);

            if (response.status === 403) {
                showRateLimitNotice();
                debug.warn("Rate limited by GitHub API when fetching " + repo);
                return;
            }

            if (!response.ok) {
                throw new Error("GitHub API error: " + response.status);
            }

            const data = await response.json();

            stars += data.stargazers_count;
            forks += data.forks_count;
        } catch (error) {
            console.error("Failed to fetch stats for " + repo + ":", error);
            return;
        }
    }

    const starsEl = document.getElementById("stars-" + groupId);
    const forksEl = document.getElementById("forks-" + groupId);

    showCount(starsEl, stars);
    showCount(forksEl, forks);
}

updateGitHubGroupStats("wsl", [
    "actuallyaridan/linux-devmgmt",
    "actuallyaridan/linux-control",
    "actuallyaridan/linux-minesweeper",
]);

updateGitHubRepoStats([
    "actuallyaridan/NeoFreeBird",
    "dimdenGD/OldTwitter",
    "actuallyaridan/aridan.net",
    "actuallyaridan/chirp",
]);
