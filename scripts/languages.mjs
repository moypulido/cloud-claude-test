// Counts lines per language across tracked files, by extension.

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

const LANGUAGES = {
  '.js': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.jsx': 'JavaScript',
  '.css': 'CSS',
  '.html': 'HTML',
  '.md': 'Markdown',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.json': 'JSON',
  '.svg': 'SVG',
  '.py': 'Python',
  '.sh': 'Shell',
};

const IGNORED = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

export function languageFor(path) {
  return LANGUAGES[extname(path).toLowerCase()] ?? 'Otros';
}

export function countLines(text) {
  if (text === '') return 0;
  const lines = text.split('\n').length;
  return text.endsWith('\n') ? lines - 1 : lines;
}

export function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

export function countLanguages(paths, read = (path) => readFileSync(path)) {
  const totals = new Map();
  for (const path of paths) {
    if (IGNORED.has(basename(path))) continue;
    let buffer;
    try {
      buffer = read(path);
    } catch {
      continue; // listed by git but missing on disk (e.g. deleted, not yet committed)
    }
    if (isBinary(buffer)) continue;
    const name = languageFor(path);
    const entry = totals.get(name) ?? { name, files: 0, lines: 0 };
    entry.files += 1;
    entry.lines += countLines(buffer.toString('utf8'));
    totals.set(name, entry);
  }
  return [...totals.values()].sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
}
