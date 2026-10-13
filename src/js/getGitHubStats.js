const GITHUB_API = "https://api.github.com/repos/";

// GitHub allows 60 unauthenticated requests an hour per address.
function showRateLimitNotice() {
    const el = document.getElementById("rateLimitGitHub");
    if (el) el.style.display = "flex";
}

// 1600 reads as 1.6K, the way GitHub shows it. Rounded down, so a repo is
// never shown with more stars than it has.
function formatGitHubCount(n) {
    if (n < 1000) return String(n);

    const floored = Math.floor(n / 100) / 10;
    return floored.toLocaleString(undefined, { maximumFractionDigits: 1 }) + "K";
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

            if (starsEl) starsEl.textContent = formatGitHubCount(data.stargazers_count);
            if (forksEl) forksEl.textContent = formatGitHubCount(data.forks_count);
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

    if (starsEl) starsEl.textContent = formatGitHubCount(stars);
    if (forksEl) forksEl.textContent = formatGitHubCount(forks);
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
