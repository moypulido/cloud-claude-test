// Builds the static site into _site/: copies site/ and writes data.json from the git history.

import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOG_FORMAT, parseLog } from './git-log.mjs';
import { countLanguages } from './languages.mjs';
import { fetchActivity } from './github-api.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}_site`;

const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// "https://user:token@github.com/owner/repo.git" → "owner/repo"
export function repositoryFromRemote(remote) {
  const match = /github\.com[:/](.+?\/.+?)(?:\.git)?\/?$/.exec(remote.trim());
  return match ? match[1] : null;
}

function readRepository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    return repositoryFromRemote(git('remote', 'get-url', 'origin'));
  } catch {
    return null;
  }
}

async function main() {
  const repository = readRepository();
  const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const runId = process.env.GITHUB_RUN_ID;

  const commits = parseLog(git('log', '--numstat', `--format=${LOG_FORMAT}`));
  const paths = git('ls-files', '-z').split('\0').filter(Boolean);
  const activity = await fetchActivity(repository, process.env.GITHUB_TOKEN);

  const data = {
    generatedAt: new Date().toISOString(),
    repository: repository && {
      name: repository,
      url: `${server}/${repository}`,
      sha: git('rev-parse', 'HEAD').trim(),
      ref: process.env.GITHUB_REF_NAME ?? git('rev-parse', '--abbrev-ref', 'HEAD').trim(),
    },
    run: runId
      ? {
          id: runId,
          number: process.env.GITHUB_RUN_NUMBER,
          event: process.env.GITHUB_EVENT_NAME,
          url: `${server}/${repository}/actions/runs/${runId}`,
        }
      : null,
    commits,
    languages: countLanguages(paths.map((path) => `${root}${path}`)),
    activity,
  };

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(`${root}site`, out, { recursive: true });
  writeFileSync(`${out}/data.json`, JSON.stringify(data));

  console.log(
    `Sitio generado en _site/: ${commits.length} commits, ${paths.length} archivos, ` +
      `${data.languages.length} lenguajes, actividad de API: ${activity ? 'sí' : 'no'}`,
  );

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, stepSummary(data));
  }
}

function stepSummary({ commits, languages, activity }) {
  const rows = languages.map((lang) => `| ${lang.name} | ${lang.files} | ${lang.lines} |`).join('\n');
  return [
    '### Repo Pulse',
    '',
    `- Commits: **${commits.length}**`,
    `- Último: \`${commits[0]?.short ?? '—'}\` ${commits[0]?.subject ?? ''}`,
    `- Issues / PRs desde la API: ${activity ? `${activity.issues.length} / ${activity.pulls.length}` : 'sin token'}`,
    '',
    '| Lenguaje | Archivos | Líneas |',
    '| --- | ---: | ---: |',
    rows,
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
