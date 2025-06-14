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

// Example usage:
updateGitHubRepoStats([
    "actuallyaridan/NeoFreeBird",
    "dimdenGD/OldTwitter",
    "actuallyaridan/aridan.net",
    "actuallyaridan/chirp",
]);