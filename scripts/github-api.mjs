// Fetches recent issues and pull requests from the GitHub REST API.
// Only runs where a token is available (GitHub Actions); otherwise the site omits the section.

const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';

export async function fetchActivity(repository, token, fetchImpl = fetch) {
  if (!repository || !token) return null;

  const request = async (path) => {
    const response = await fetchImpl(`${API}/repos/${repository}/${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GET ${path} → ${response.status}`);
    return response.json();
  };

  try {
    const [pulls, issues] = await Promise.all([
      request('pulls?state=all&sort=created&direction=desc&per_page=10'),
      request('issues?state=all&sort=created&direction=desc&per_page=20'),
    ]);
    return {
      pulls: pulls.map(toPull),
      // The issues endpoint also returns pull requests; keep real issues only.
      issues: issues.filter((issue) => !issue.pull_request).slice(0, 10).map(toIssue),
    };
  } catch (error) {
    console.warn(`::warning::No se pudo leer la API de GitHub: ${error.message}`);
    return null;
  }
}

export function toPull(pull) {
  return {
    number: pull.number,
    title: pull.title,
    state: pull.merged_at ? 'merged' : pull.state,
    draft: Boolean(pull.draft),
    author: pull.user?.login ?? null,
    createdAt: pull.created_at,
    url: pull.html_url,
  };
}

export function toIssue(issue) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    author: issue.user?.login ?? null,
    comments: issue.comments,
    labels: (issue.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name)),
    createdAt: issue.created_at,
    url: issue.html_url,
  };
}
