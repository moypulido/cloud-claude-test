// Parses `git log --numstat` output into plain commit objects.
// Control characters delimit fields so subjects and bodies can contain anything.

const RECORD = '\x1e';
const FIELD = '\x1f';
const HEADER_END = '\x1d';

export const LOG_FORMAT = `${RECORD}%H${FIELD}%h${FIELD}%P${FIELD}%an${FIELD}%aI${FIELD}%s${FIELD}%b${HEADER_END}`;

const CONVENTIONAL = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<description>.+)$/i;
const CO_AUTHOR = /^co-authored-by:\s*(.+?)\s*<[^>]*>\s*$/gim;

export function parseLog(raw) {
  return raw
    .split(RECORD)
    .filter((record) => record.trim() !== '')
    .map(parseRecord);
}

function parseRecord(record) {
  const end = record.indexOf(HEADER_END);
  if (end === -1) throw new Error('Registro de git log sin fin de encabezado');

  const [hash, short, parents, author, date, subject, ...bodyParts] = record.slice(0, end).split(FIELD);
  const body = bodyParts.join(FIELD);
  const files = record
    .slice(end + 1)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseNumstat);

  return {
    hash,
    short,
    author,
    coAuthors: parseCoAuthors(body).filter((name) => name !== author),
    date,
    subject,
    ...parseConventional(subject),
    isMerge: parents.trim().split(/\s+/).length > 1,
    additions: sum(files, 'additions'),
    deletions: sum(files, 'deletions'),
    files,
  };
}

// "12\t3\tpath" — binary files report "-" for both counts.
export function parseNumstat(line) {
  const [added, deleted, ...rest] = line.split('\t');
  return {
    path: resolveRename(rest.join('\t')),
    additions: added === '-' ? 0 : Number(added),
    deletions: deleted === '-' ? 0 : Number(deleted),
    binary: added === '-',
  };
}

// numstat shows renames as "old => new" or "dir/{old => new}/file"; keep the new path.
export function resolveRename(path) {
  if (!path.includes(' => ')) return path;
  if (path.includes('{')) {
    return path.replace(/\{([^}]*) => ([^}]*)\}/g, (_, _from, to) => to).replace(/\/{2,}/g, '/');
  }
  return path.split(' => ')[1];
}

export function parseConventional(subject) {
  const match = CONVENTIONAL.exec(subject);
  if (!match) return { type: null, scope: null, breaking: false, description: subject };
  const { type, scope = null, breaking, description } = match.groups;
  return { type: type.toLowerCase(), scope, breaking: Boolean(breaking), description };
}

// Names only: emails stay out of the published site.
export function parseCoAuthors(body) {
  return [...new Set([...body.matchAll(CO_AUTHOR)].map((match) => match[1]))];
}

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}
