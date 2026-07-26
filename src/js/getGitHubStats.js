async function updateGitHubRepoStats(repos) {
    const baseUrl = "https://api.github.com/repos/";

    for (const repo of repos) {
        const [owner, repoName] = repo.split('/');
        const url = `${baseUrl}${owner}/${repoName}`;

        try {
            const response = await fetch(url);

            if (response.status === 403) {
                // Handle rate limiting by showing the warning element
                const rateLimitEl = document.getElementById("rateLimitGitHub");
                if (rateLimitEl) {
                    rateLimitEl.style.display = "flex";
                }
                console.warn(`Rate limited by GitHub API when fetching ${repo}`);
                break; // Exit loop if rate limited
            }

            if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
            const data = await response.json();

            const starsId = `stars-${owner}-${repoName}`;
            const forksId = `forks-${owner}-${repoName}`;

            const starsEl = document.getElementById(starsId);
            const forksEl = document.getElementById(forksId);

            if (starsEl) starsEl.textContent = data.stargazers_count;
            if (forksEl) forksEl.textContent = data.forks_count;
        } catch (error) {
            console.error(`Failed to fetch stats for ${repo}:`, error);
        }
    }
}

// Some projects are a group of repos shown as one entry (the WSL suite), so their
// stars and forks are added up and written to a single pair of elements.
async function updateGitHubGroupStats(groupId, repos) {
    const baseUrl = "https://api.github.com/repos/";
    let stars = 0;
    let forks = 0;

    for (const repo of repos) {
        try {
            const response = await fetch(`${baseUrl}${repo}`);

            if (response.status === 403) {
                // Handle rate limiting by showing the warning element
                const rateLimitEl = document.getElementById("rateLimitGitHub");
                if (rateLimitEl) {
                    rateLimitEl.style.display = "flex";
                }
                console.warn(`Rate limited by GitHub API when fetching ${repo}`);
                return; // Leave the old values in place
            }

            if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
            const data = await response.json();

            stars += data.stargazers_count;
            forks += data.forks_count;
        } catch (error) {
            console.error(`Failed to fetch stats for ${repo}:`, error);
            return; // A partial sum would be misleading, so keep the old values
        }
    }

    const starsEl = document.getElementById(`stars-${groupId}`);
    const forksEl = document.getElementById(`forks-${groupId}`);

    if (starsEl) starsEl.textContent = stars;
    if (forksEl) forksEl.textContent = forks;
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