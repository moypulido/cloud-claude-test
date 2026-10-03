import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changelog, dailyCounts, dayKey, heatmapWeeks, level, relativeTime, summarize, topFiles } from '../site/assets/stats.js';
import { countLanguages, countLines, languageFor } from '../scripts/languages.mjs';

const commit = (overrides) => ({
  hash: 'h',
  short: 'h',
  author: 'Ana',
  coAuthors: [],
  date: '2026-10-01T12:00:00-06:00',
  subject: 'x',
  type: null,
  scope: null,
  breaking: false,
  description: 'x',
  isMerge: false,
  additions: 0,
  deletions: 0,
  files: [],
  ...overrides,
});

test('summarize counts people, files and lines', () => {
  const stats = summarize([
    commit({ coAuthors: ['Claude'], additions: 5, deletions: 1, files: [{ path: 'a', additions: 5, deletions: 1 }] }),
    commit({ author: 'Claude', additions: 2, files: [{ path: 'a', additions: 2, deletions: 0 }, { path: 'b', additions: 0, deletions: 0 }] }),
  ]);
  assert.deepEqual(stats, { commits: 2, contributors: 2, files: 2, additions: 7, deletions: 1 });
});

test('heatmapWeeks ends on the current week, Monday first', () => {
  const today = new Date(2026, 9, 3); // sábado 3 oct 2026
  const counts = dailyCounts([commit({ date: new Date(2026, 9, 1, 10).toISOString() })]);
  const weeks = heatmapWeeks(counts, today, 4);
  assert.equal(weeks.length, 4);
  assert.equal(weeks[0][0].date.getDay(), 1);
  const last = weeks.at(-1);
  assert.equal(last[5].key, dayKey(today));
  assert.equal(last[5].future, false);
  assert.equal(last[6].future, true);
  assert.equal(last[3].count, 1); // jueves 1 oct
});

test('level buckets counts into quartiles of the max', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 8].map((n) => level(n, 8)), [0, 1, 1, 2, 2, 4]);
  assert.equal(level(3, 0), 4);
});

test('changelog groups by type and skips merges', () => {
  const sections = changelog([
    commit({ type: 'feat', description: 'a' }),
    commit({ type: 'ci', description: 'b' }),
    commit({ type: null, description: 'c' }),
    commit({ isMerge: true, description: 'merge' }),
  ]);
  assert.deepEqual(
    sections.map((s) => [s.title, s.entries.map((e) => e.description)]),
    [
      ['Nuevas funciones', ['a']],
      ['CI y automatización', ['b']],
      ['Otros', ['c']],
    ],
  );
});

test('topFiles ranks by commits then churn', () => {
  const files = topFiles([
    commit({ files: [{ path: 'a', additions: 1, deletions: 0 }, { path: 'b', additions: 50, deletions: 0 }] }),
    commit({ files: [{ path: 'a', additions: 1, deletions: 1 }, { path: 'c', additions: 60, deletions: 0 }] }),
  ]);
  assert.deepEqual(files.map((f) => f.path), ['a', 'c', 'b']);
  assert.deepEqual(files[0], { path: 'a', commits: 2, additions: 2, deletions: 1 });
});

test('relativeTime speaks Spanish', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  assert.equal(relativeTime('2026-10-03T11:57:00Z', now), 'hace 3 minutos');
  assert.equal(relativeTime('2026-10-02T12:00:00Z', now), 'ayer');
});

test('languages are counted by extension and skip binaries', () => {
  const files = {
    'a.js': Buffer.from('1\n2\n3\n'),
    'b.mjs': Buffer.from('1'),
    'c.md': Buffer.from(''),
    'd.png': Buffer.from([0x89, 0x50, 0x00, 0x01]),
    'package-lock.json': Buffer.from('{\n}\n'),
  };
  const result = countLanguages(Object.keys(files), (path) => files[path]);
  assert.deepEqual(result, [
    { name: 'JavaScript', files: 2, lines: 4 },
    { name: 'Markdown', files: 1, lines: 0 },
  ]);
  assert.equal(languageFor('x.unknown'), 'Otros');
  assert.equal(countLines('a\nb'), 2);
});
