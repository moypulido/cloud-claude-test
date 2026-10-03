import { changelog, dailyCounts, heatmapWeeks, level, relativeTime, summarize, topFiles } from './stats.js';

const LOCALE = 'es-MX';
const number = new Intl.NumberFormat(LOCALE);
const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 });
const longDate = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const monthName = new Intl.DateTimeFormat(LOCALE, { month: 'short' });

const $ = (id) => document.getElementById(id);

// Builds DOM nodes; strings become text nodes, so commit and issue titles are never parsed as HTML.
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') el.style.cssText = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
}

function svg(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

const plural = (n, one, many) => `${number.format(n)} ${n === 1 ? one : many}`;

/* Tooltip */

const tooltip = $('tooltip');

function showTooltip(content, x, y) {
  tooltip.replaceChildren(...content);
  tooltip.hidden = false;
  const { width, height } = tooltip.getBoundingClientRect();
  const left = Math.min(Math.max(8, x - width / 2), window.innerWidth - width - 8);
  const top = y - height - 12 < 8 ? y + 16 : y - height - 12;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

/* Theme */

function setupTheme() {
  $('theme-toggle').addEventListener('click', () => {
    const current =
      document.documentElement.dataset.theme ??
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('repo-pulse-theme', next);
    } catch {}
  });
}

/* Sections */

function renderHeader(data) {
  const { repository, run, generatedAt } = data;
  if (repository) {
    $('title').textContent = repository.name;
    document.title = `${repository.name} · Repo Pulse`;
    const link = $('repo-link');
    link.href = repository.url;
    link.hidden = false;
  }

  const parts = [h('span', {}, `Último build ${relativeTime(generatedAt)}`)];
  if (repository) {
    parts.push(
      ' · commit ',
      h('a', { href: `${repository.url}/commit/${repository.sha}`, class: 'mono' }, repository.sha.slice(0, 7)),
      ` en ${repository.ref}`,
    );
  }
  if (run) {
    parts.push(' · ', h('a', { href: run.url }, `run #${run.number}`), ` (${run.event})`);
  } else {
    parts.push(' · build local');
  }
  $('build-info').replaceChildren(...parts);
}

function renderTiles(commits) {
  const stats = summarize(commits);
  const tile = (label, value, note) =>
    h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), note && h('div', { class: 'tile-note' }, note));

  const first = commits.at(-1);
  $('tiles').replaceChildren(
    tile('Commits', number.format(stats.commits), first && `desde ${shortDate.format(new Date(first.date))}`),
    tile('Colaboradores', number.format(stats.contributors), 'autores y coautores'),
    tile('Archivos tocados', number.format(stats.files), 'en todo el historial'),
    tile(
      'Líneas cambiadas',
      compact.format(stats.additions + stats.deletions),
      h('span', {}, h('span', { class: 'delta-add' }, `+${number.format(stats.additions)}`), ' / ', h('span', { class: 'delta-del' }, `−${number.format(stats.deletions)}`)),
    ),
  );
}

function renderHeatmap(commits) {
  const counts = dailyCounts(commits);
  const weeks = heatmapWeeks(counts);
  const days = weeks.flat().filter((day) => !day.future);
  const max = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const active = days.filter((day) => day.count > 0);

  const cell = 12;
  const gap = 3;
  const step = cell + gap;
  const left = 26;
  const top = 18;
  const width = left + weeks.length * step;
  const height = top + 7 * step;

  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `${plural(total, 'commit', 'commits')} en ${plural(active.length, 'día activo', 'días activos')} durante las últimas ${weeks.length} semanas`,
  });

  // Month labels where a new month starts.
  let lastMonth = null;
  weeks.forEach((week, index) => {
    const month = week[0].date.getMonth();
    if (month !== lastMonth && index < weeks.length - 1) {
      const label = svg('text', { x: left + index * step, y: 10 });
      label.textContent = monthName.format(week[0].date).replace('.', '');
      root.append(label);
    }
    lastMonth = month;
  });

  ['L', '', 'X', '', 'V', '', ''].forEach((name, row) => {
    if (!name) return;
    const label = svg('text', { x: 0, y: top + row * step + cell - 2 });
    label.textContent = name;
    root.append(label);
  });

  const rects = new Map();
  weeks.forEach((week, column) => {
    week.forEach((day, row) => {
      if (day.future) return;
      const rect = svg('rect', {
        class: 'cell',
        x: left + column * step,
        y: top + row * step,
        width: cell,
        height: cell,
        rx: 2,
        fill: `var(--heat-${level(day.count, max)})`,
      });
      rects.set(`${column}:${row}`, { rect, day });
      root.append(rect);
    });
  });

  // Hit-test by position so the gaps between cells also count as hover targets.
  let current = null;
  const clear = () => {
    current?.rect.classList.remove('active');
    current = null;
    hideTooltip();
  };
  root.addEventListener('pointermove', (event) => {
    const box = root.getBoundingClientRect();
    const scale = width / box.width;
    const x = (event.clientX - box.left) * scale - left + gap / 2;
    const y = (event.clientY - box.top) * scale - top + gap / 2;
    const hit = rects.get(`${Math.floor(x / step)}:${Math.floor(y / step)}`);
    if (!hit || x < 0 || y < 0) return clear();
    if (hit !== current) {
      current?.rect.classList.remove('active');
      hit.rect.classList.add('active');
      current = hit;
    }
    const r = hit.rect.getBoundingClientRect();
    showTooltip(
      [h('strong', {}, plural(hit.day.count, 'commit', 'commits')), h('br'), longDate.format(hit.day.date)],
      r.left + r.width / 2,
      r.top,
    );
  });
  root.addEventListener('pointerleave', clear);

  $('heatmap').replaceChildren(root);
  $('activity-subtitle').textContent = `${plural(total, 'commit', 'commits')} en ${plural(active.length, 'día activo', 'días activos')}, últimas ${weeks.length} semanas`;

  $('activity-table').replaceChildren(
    active.length
      ? h(
          'table',
          {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Día'), h('th', { class: 'num' }, 'Commits'))),
          h('tbody', {}, active.reverse().map((day) => h('tr', {}, h('td', {}, longDate.format(day.date)), h('td', { class: 'num' }, number.format(day.count))))),
        )
      : h('p', { class: 'empty' }, 'Sin commits en este periodo.'),
  );
}

function renderLanguages(languages) {
  const total = languages.reduce((sum, lang) => sum + lang.lines, 0);
  const max = Math.max(1, ...languages.map((lang) => lang.lines));
  const container = $('languages');
  if (!languages.length) {
    container.replaceChildren(h('p', { class: 'empty' }, 'Sin archivos de texto rastreados.'));
    return;
  }
  container.replaceChildren(
    ...languages.map((lang) => {
      const share = total ? lang.lines / total : 0;
      const bar = h('div', { class: 'bar', style: `width: calc((100% - 7.5rem) * ${lang.lines / max})` });
      const row = h(
        'div',
        { class: 'bar-row' },
        h('div', { class: 'bar-name', title: lang.name }, lang.name),
        h('div', { class: 'bar-track' }, bar, h('span', { class: 'bar-value' }, `${compact.format(lang.lines)} · ${percent.format(share)}`)),
      );
      row.addEventListener('pointermove', (event) =>
        showTooltip(
          [h('strong', {}, lang.name), h('br'), `${plural(lang.lines, 'línea', 'líneas')} · ${plural(lang.files, 'archivo', 'archivos')}`],
          event.clientX,
          bar.getBoundingClientRect().top,
        ),
      );
      row.addEventListener('pointerleave', hideTooltip);
      return row;
    }),
  );
}

function renderFiles(commits) {
  const files = topFiles(commits);
  $('files').replaceChildren(
    files.length
      ? h(
          'table',
          {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Archivo'), h('th', { class: 'num' }, 'Commits'), h('th', { class: 'num' }, 'Líneas'))),
          h(
            'tbody',
            {},
            files.map((file) =>
              h(
                'tr',
                {},
                h('td', { class: 'path mono' }, file.path),
                h('td', { class: 'num' }, number.format(file.commits)),
                h('td', { class: 'num' }, h('span', { class: 'delta-add' }, `+${number.format(file.additions)}`), ' ', h('span', { class: 'delta-del' }, `−${number.format(file.deletions)}`)),
              ),
            ),
          ),
        )
      : h('p', { class: 'empty' }, 'Sin cambios todavía.'),
  );
}

const PULL_STATES = { open: 'Abierto', merged: 'Fusionado', closed: 'Cerrado' };
const ISSUE_STATES = { open: 'Abierto', closed: 'Cerrado' };

function renderActivity(activity) {
  if (!activity) return;
  $('activity-card').hidden = false;

  const list = (items, states, empty, meta) =>
    items.length
      ? items.map((item) =>
          h(
            'li',
            {},
            h('span', { class: `state ${item.state}` }, states[item.state] ?? item.state),
            h('div', {}, h('a', { href: item.url }, `#${item.number} ${item.title}`), h('span', { class: 'meta' }, meta(item))),
          ),
        )
      : [h('li', {}, h('p', { class: 'empty' }, empty))];

  $('pulls').replaceChildren(
    ...list(activity.pulls, PULL_STATES, 'Aún no hay pull requests.', (pull) =>
      [pull.author && `@${pull.author}`, relativeTime(pull.createdAt), pull.draft && 'borrador'].filter(Boolean).join(' · '),
    ),
  );
  $('issues').replaceChildren(
    ...list(activity.issues, ISSUE_STATES, 'Aún no hay issues.', (issue) =>
      [
        issue.author && `@${issue.author}`,
        relativeTime(issue.createdAt),
        issue.comments ? plural(issue.comments, 'comentario', 'comentarios') : null,
        ...issue.labels,
      ]
        .filter(Boolean)
        .join(' · '),
    ),
  );
}

function commitLink(repository, commit) {
  return repository
    ? h('a', { href: `${repository.url}/commit/${commit.hash}`, class: 'mono' }, commit.short)
    : h('span', { class: 'mono' }, commit.short);
}

function renderChangelog(commits, repository) {
  const sections = changelog(commits);
  $('changelog').replaceChildren(
    ...(sections.length
      ? sections.map((section) =>
          h(
            'div',
            {},
            h('h3', {}, `${section.title} (${section.entries.length})`),
            h(
              'ul',
              {},
              section.entries.map((commit) =>
                h(
                  'li',
                  {},
                  commit.breaking && h('span', { class: 'chip breaking' }, 'breaking'),
                  commit.breaking && ' ',
                  commit.scope && h('strong', {}, `${commit.scope}: `),
                  commit.description,
                  ' ',
                  commitLink(repository, commit),
                ),
              ),
            ),
          ),
        )
      : [h('p', { class: 'empty' }, 'Sin commits todavía.')]),
  );
}

function renderHistory(commits, repository) {
  const shown = commits.slice(0, 50);
  $('history-subtitle').textContent =
    commits.length > shown.length ? `Los ${shown.length} más recientes de ${number.format(commits.length)}` : plural(commits.length, 'commit', 'commits');

  $('history').replaceChildren(
    ...shown.map((commit) =>
      h(
        'li',
        { class: commit.isMerge ? 'merge' : null },
        h('div', { class: 'commit-subject' }, commit.type && h('span', { class: 'chip' }, commit.type), commit.type && ' ', commit.type ? commit.description : commit.subject),
        h(
          'div',
          { class: 'commit-meta' },
          h('span', {}, commit.author, commit.coAuthors.length ? ` con ${commit.coAuthors.join(', ')}` : ''),
          h('time', { datetime: commit.date, title: longDate.format(new Date(commit.date)) }, relativeTime(commit.date)),
          commitLink(repository, commit),
          !commit.isMerge &&
            h('span', {}, h('span', { class: 'delta-add' }, `+${number.format(commit.additions)}`), ' ', h('span', { class: 'delta-del' }, `−${number.format(commit.deletions)}`), ` · ${plural(commit.files.length, 'archivo', 'archivos')}`),
        ),
      ),
    ),
  );
}

async function main() {
  setupTheme();
  let data;
  try {
    const response = await fetch('data.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    $('build-info').textContent = `No se pudo cargar data.json (${error.message}). Ejecuta npm run build.`;
    return;
  }

  renderHeader(data);
  renderTiles(data.commits);
  renderHeatmap(data.commits);
  renderLanguages(data.languages);
  renderFiles(data.commits);
  renderActivity(data.activity);
  renderChangelog(data.commits, data.repository);
  renderHistory(data.commits, data.repository);
}

main();
