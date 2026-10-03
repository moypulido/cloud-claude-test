import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOG_FORMAT, parseConventional, parseCoAuthors, parseLog, parseNumstat, resolveRename } from '../scripts/git-log.mjs';
import { repositoryFromRemote } from '../scripts/build.mjs';

test('parseConventional splits type, scope and breaking marker', () => {
  assert.deepEqual(parseConventional('feat(ui)!: nuevo tema'), {
    type: 'feat',
    scope: 'ui',
    breaking: true,
    description: 'nuevo tema',
  });
  assert.deepEqual(parseConventional('Initial commit'), {
    type: null,
    scope: null,
    breaking: false,
    description: 'Initial commit',
  });
});

test('parseCoAuthors keeps names only and dedupes', () => {
  const body = 'Algo\n\nCo-Authored-By: Ana <ana@example.com>\nco-authored-by: Ana <ana@example.com>\nCo-authored-by: Luis Pérez <l@x.mx>';
  assert.deepEqual(parseCoAuthors(body), ['Ana', 'Luis Pérez']);
});

test('parseNumstat handles binaries and renames', () => {
  assert.deepEqual(parseNumstat('-\t-\tlogo.png'), { path: 'logo.png', additions: 0, deletions: 0, binary: true });
  assert.equal(resolveRename('src/{old => new}/a.js'), 'src/new/a.js');
  assert.equal(resolveRename('src/{ => lib}/a.js'), 'src/lib/a.js');
  assert.equal(resolveRename('a.js => b.js'), 'b.js');
});

test('parseLog reads a real repository', () => {
  const dir = mkdtempSync(join(tmpdir(), 'repo-pulse-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Ana',
        GIT_AUTHOR_EMAIL: 'ana@example.com',
        GIT_COMMITTER_NAME: 'Ana',
        GIT_COMMITTER_EMAIL: 'ana@example.com',
      },
    });

  git('init', '-q');
  writeFileSync(join(dir, 'a.txt'), 'uno\ndos\n');
  git('add', '.');
  git('commit', '-q', '-m', 'feat: primer archivo');
  writeFileSync(join(dir, 'a.txt'), 'uno\ntres\n');
  git('commit', '-q', '-am', 'fix(a): corrige | línea', '-m', 'Detalle\ncon\x1fseparador\n\nCo-Authored-By: Claude <noreply@anthropic.com>');

  const commits = parseLog(git('log', '--numstat', `--format=${LOG_FORMAT}`));
  assert.equal(commits.length, 2);

  const [latest, first] = commits;
  assert.equal(latest.type, 'fix');
  assert.equal(latest.scope, 'a');
  assert.equal(latest.description, 'corrige | línea');
  assert.deepEqual(latest.coAuthors, ['Claude']);
  assert.deepEqual(latest.files, [{ path: 'a.txt', additions: 1, deletions: 1, binary: false }]);
  assert.equal(latest.isMerge, false);
  assert.equal(first.additions, 2);
  assert.equal(first.author, 'Ana');
  assert.match(first.date, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(JSON.stringify(commits).includes('ana@example.com'), false);
});

test('repositoryFromRemote handles https, ssh and tokens', () => {
  assert.equal(repositoryFromRemote('https://github.com/moypulido/cloud-claude-test'), 'moypulido/cloud-claude-test');
  assert.equal(repositoryFromRemote('https://x:tok@github.com/o/r.git\n'), 'o/r');
  assert.equal(repositoryFromRemote('git@github.com:o/r.git'), 'o/r');
  assert.equal(repositoryFromRemote('https://gitlab.com/o/r'), null);
});
