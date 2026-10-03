// Pure data helpers shared by the browser (app.js) and the Node tests.

export const CHANGELOG_SECTIONS = [
  { title: 'Nuevas funciones', types: ['feat'] },
  { title: 'Correcciones', types: ['fix'] },
  { title: 'Documentación', types: ['docs'] },
  { title: 'CI y automatización', types: ['ci', 'build'] },
  { title: 'Mantenimiento', types: ['chore', 'refactor', 'perf', 'style', 'test'] },
  { title: 'Otros', types: [] },
];

export function summarize(commits) {
  const people = new Set();
  const files = new Set();
  let additions = 0;
  let deletions = 0;
  for (const commit of commits) {
    people.add(commit.author);
    commit.coAuthors.forEach((name) => people.add(name));
    commit.files.forEach((file) => files.add(file.path));
    additions += commit.additions;
    deletions += commit.deletions;
  }
  return { commits: commits.length, contributors: people.size, files: files.size, additions, deletions };
}

const pad = (n) => String(n).padStart(2, '0');

// Calendar day in the viewer's time zone.
export function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dailyCounts(commits) {
  const counts = new Map();
  for (const commit of commits) {
    const key = dayKey(commit.date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// Columns of 7 days (Monday first), ending with the week that contains `today`.
export function heatmapWeeks(counts, today = new Date(), weeks = 26) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekday = (end.getDay() + 6) % 7;
  const startOffset = -weekday - (weeks - 1) * 7;
  const columns = [];
  for (let week = 0; week < weeks; week++) {
    const days = [];
    for (let day = 0; day < 7; day++) {
      // Constructing from parts keeps days whole across DST changes.
      const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() + startOffset + week * 7 + day);
      const key = dayKey(date);
      days.push({ date, key, count: counts.get(key) ?? 0, future: date > end });
    }
    columns.push(days);
  }
  return columns;
}

// 0 = no commits, 1–4 = quartiles of the busiest day.
export function level(count, max) {
  if (count <= 0) return 0;
  return Math.min(4, Math.ceil((count / Math.max(max, 1)) * 4));
}

export function changelog(commits) {
  const sections = CHANGELOG_SECTIONS.map((section) => ({ ...section, entries: [] }));
  const fallback = sections[sections.length - 1];
  for (const commit of commits) {
    if (commit.isMerge) continue;
    const section = sections.find((s) => s.types.includes(commit.type)) ?? fallback;
    section.entries.push(commit);
  }
  return sections.filter((section) => section.entries.length > 0);
}

export function topFiles(commits, limit = 8) {
  const files = new Map();
  for (const commit of commits) {
    for (const file of commit.files) {
      const entry = files.get(file.path) ?? { path: file.path, commits: 0, additions: 0, deletions: 0 };
      entry.commits += 1;
      entry.additions += file.additions;
      entry.deletions += file.deletions;
      files.set(file.path, entry);
    }
  }
  return [...files.values()]
    .sort(
      (a, b) =>
        b.commits - a.commits || b.additions + b.deletions - (a.additions + a.deletions) || a.path.localeCompare(b.path),
    )
    .slice(0, limit);
}

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

export function relativeTime(date, now = new Date(), locale = 'es') {
  const seconds = (new Date(date) - now) / 1000;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'second');
}
