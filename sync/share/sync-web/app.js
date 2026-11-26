// The sync status page. Everything shown comes from the API (sync-web); names and values from
// the GW2 API and the wiki are only ever set as text, never as HTML.
const TYPES = [
  { type: 'New Item', key: 'new', label: 'new', heading: 'New items' },
  { type: 'Item Returned', key: 'returned', label: 'returned', heading: 'Returned' },
  { type: 'Item Updated', key: 'updated', label: 'updated', heading: 'Updated' },
  { type: 'Item Removed', key: 'removed', label: 'removed', heading: 'Removed' },
];
const TRIGGERS = { schedule: 'Scheduled', manual: 'Manual', start: 'On start' };
const AREAS = { decorations: 'decoration files', categories: 'category files', changeLog: 'change log', images: 'images', other: 'other' };
const RUN_LIMIT = 200;
const ITEMS_SHOWN = 100;

const $ = (id) => document.getElementById(id);
const state = { status: null, runs: [], selected: null, detail: null, timer: null };

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

async function getJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

// ---- Formatting -------------------------------------------------------------------------

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const timeOnly = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

function formatWhen(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? `Today ${timeOnly.format(date)}` : dateTime.format(date);
}

function relative(iso) {
  if (!iso) return '';
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const [value, unit] =
    abs < 60 ? [seconds, 'second'] :
    abs < 3600 ? [Math.round(seconds / 60), 'minute'] :
    abs < 86400 ? [Math.round(seconds / 3600), 'hour'] :
    [Math.round(seconds / 86400), 'day'];
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(value, unit);
}

function duration(run) {
  const end = run.finishedAt ? new Date(run.finishedAt) : run.status === 'running' ? new Date() : null;
  if (!end) return '—';
  const seconds = Math.max(0, Math.round((end - new Date(run.startedAt)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function runStatus(run) {
  if (run.status === 'running') return { text: 'Running', tone: 'run' };
  if (run.status === 'success') return { text: run.dryRun ? 'Dry run' : 'Succeeded', tone: 'ok' };
  if (run.status === 'interrupted') return { text: 'Interrupted', tone: 'warn' };
  if (run.exitStatus === 143 || run.exitStatus === 130) return { text: 'Stopped', tone: 'warn' };
  return { text: 'Failed', tone: 'bad' };
}

function badge({ text, tone }) {
  return el('span', { class: `badge ${tone}`, text });
}

function plural(count, word) {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
}

function fileCount(files) {
  return files ? files.added + files.modified + files.deleted : 0;
}

function foundSomething(run) {
  return fileCount(run.files) > 0 || Object.values(run.counts ?? {}).some((count) => count > 0);
}

function commitLink(run, { long = false } = {}) {
  const sha = run.pushed ?? run.commit;
  if (!sha) return null;
  const text = long ? sha : sha.slice(0, 7);
  const repo = state.status?.repoWebUrl;
  if (run.pushed && repo) {
    return el('a', { href: `${repo}/commit/${run.pushed}`, target: '_blank', rel: 'noopener', text });
  }
  return el('code', { text: run.pushed ? text : `${text} (not pushed)` });
}

function chips(run) {
  const counts = run.counts ?? {};
  const list = TYPES.filter(({ type }) => counts[type] > 0).map(({ type, key, label }) =>
    el('span', { class: `chip ${key}`, text: `${counts[type].toLocaleString()} ${label}` })
  );
  const files = fileCount(run.files);
  if (files > 0) list.push(el('span', { class: 'chip files', text: plural(files, 'file') }));
  return list;
}

function formatValue(value) {
  if (value == null || value === '') return '(none)';
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((item) => typeof item !== 'object')) return value.join('\n');
  if (Array.isArray(value.ingredients)) {
    // A recipe: what it takes and where it comes from, rather than its JSON.
    const ingredients = [...value.ingredients]
      .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
      .map((ingredient) => `${ingredient.quantity ?? '?'} ${ingredient.item}`);
    const disciplines = Array.isArray(value.disciplines) ? value.disciplines.join(', ') : value.disciplines;
    const source = [disciplines, value.rating ? `rating ${value.rating}` : null, value.sheet ?? value.source]
      .filter(Boolean)
      .join(' · ');
    return [ingredients.join(', '), source].filter(Boolean).join('\n');
  }
  return JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ');
}

// ---- Status cards -----------------------------------------------------------------------

function renderStatus() {
  const status = state.status;
  if (!status) return;
  $('settings').textContent =
    `Hourly at :${String(status.syncMinute).padStart(2, '0')} UTC · branch ${status.branch} · ` +
    (status.push ? 'pushes to GitHub' : 'push off (PUSH=false)');

  const health = $('health');
  if (status.running) {
    health.className = 'badge run';
    health.textContent = 'Running now';
  } else if (status.healthy) {
    health.className = 'badge ok';
    health.textContent = 'Healthy';
  } else {
    health.className = 'badge bad';
    health.textContent = status.lastSuccessAt ? 'Unhealthy' : 'No successful run yet';
  }
  health.title = `Unhealthy after ${status.healthMaxAgeMinutes} minutes without a successful run`;

  const current = status.running ?? status.lastRun;
  if (current) {
    $('last-run').textContent = status.running ? `Running (${duration(current)})` : relative(current.finishedAt ?? current.startedAt);
    const { text } = runStatus(current);
    $('last-run-note').textContent = `${text} · ${formatWhen(current.startedAt)}${current.result ? ` · ${current.result}` : ''}`;
  } else {
    $('last-run').textContent = 'Never';
    $('last-run-note').textContent = 'No runs recorded yet';
  }

  $('next-run').textContent = status.nextRunAt ? relative(status.nextRunAt) : '—';
  $('next-run-note').textContent = status.nextRunAt ? formatWhen(status.nextRunAt) : '';

  $('last-success').textContent = status.lastSuccessAt ? relative(status.lastSuccessAt) : 'Never';
  $('last-success-note').textContent = status.lastSuccessAt ? formatWhen(status.lastSuccessAt) : '';

  const commitRun = status.lastCommitRun;
  const lastCommit = $('last-commit');
  const lastCommitNote = $('last-commit-note');
  if (commitRun) {
    lastCommit.textContent = relative(commitRun.startedAt);
    lastCommitNote.replaceChildren(formatWhen(commitRun.startedAt), ' · ', commitLink(commitRun) ?? '');
  } else {
    lastCommit.textContent = 'None recently';
    lastCommitNote.textContent = 'In the last 20 runs';
  }
}

// ---- Run list ---------------------------------------------------------------------------

function renderRuns() {
  const onlyChanges = $('only-changes').checked;
  const runs = onlyChanges ? state.runs.filter((run) => foundSomething(run) || run.status !== 'success') : state.runs;
  $('runs-empty').hidden = state.runs.length > 0;
  $('runs').replaceChildren(
    ...runs.map((run) => {
      const found = chips(run);
      const args = run.args?.length ? run.args.join(' ') : null;
      return el(
        'tr',
        {
          class: run.id === state.selected ? 'selected' : null,
          tabindex: 0,
          onclick: () => select(run.id),
          onkeydown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              select(run.id);
            }
          },
        },
        el('td', { class: 'when' }, formatWhen(run.startedAt), el('small', { text: relative(run.startedAt) })),
        el('td', {}, TRIGGERS[run.trigger] ?? run.trigger, args && el('small', {}, el('code', { text: args }))),
        el('td', {}, duration(run)),
        el('td', {}, badge(runStatus(run)), run.result && el('small', { text: run.result })),
        el('td', {}, found.length ? el('div', { class: 'chips' }, found) : el('span', { class: 'quiet', text: run.status === 'success' && !run.dryRun ? 'Nothing new' : '—' }))
      );
    })
  );
}

// ---- Run detail -------------------------------------------------------------------------

function renderGroup({ type, key, heading }, entries) {
  const list = el('ul', { class: 'items' });
  const show = (from, to) => {
    for (const entry of entries.slice(from, to)) list.append(renderEntry(entry, key));
  };
  show(0, ITEMS_SHOWN);
  const group = el('div', { class: 'group' }, el('h3', {}, el('span', { class: `chip ${key}`, text: heading }), el('span', { class: 'count', text: entries.length.toLocaleString() })), list);
  if (entries.length > ITEMS_SHOWN) {
    const more = el('button', {
      type: 'button',
      class: 'link more',
      text: `Show all ${entries.length.toLocaleString()}`,
      onclick: () => {
        show(ITEMS_SHOWN, entries.length);
        more.remove();
      },
    });
    group.append(more);
  }
  return group;
}

function renderEntry(entry) {
  const meta = [entry.collection === 'categories' ? 'category' : 'decoration', `#${entry.id}`];
  if (entry.day) meta.push(entry.day);
  const item = el(
    'li',
    {},
    el('div', { class: 'item-head' }, el('span', { class: 'item-name', text: entry.name ?? `#${entry.id}` }), el('span', { class: 'item-meta', text: meta.join(' · ') }))
  );
  if (entry.changes?.length) {
    item.append(
      el(
        'ul',
        { class: 'fields' },
        entry.changes.map((change) =>
          el(
            'li',
            {},
            el('span', { class: 'field-name', text: change.field }),
            el('div', { class: 'diff' }, el('span', { class: 'before', text: formatValue(change.before) }), el('span', { class: 'after', text: formatValue(change.after) }))
          )
        )
      )
    );
  }
  return item;
}

function renderDetail(first = false) {
  const run = state.detail;
  const section = $('detail');
  if (!run) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  $('detail-title').textContent = `Run · ${formatWhen(run.startedAt)}`;

  const facts = [
    ['Status', badge(runStatus(run))],
    ['Result', run.result ?? (run.status === 'running' ? 'In progress' : '—')],
    ['Trigger', TRIGGERS[run.trigger] ?? run.trigger],
    ['Started', `${formatWhen(run.startedAt)} (${relative(run.startedAt)})`],
    ['Finished', run.finishedAt ? `${formatWhen(run.finishedAt)} · took ${duration(run)}` : '—'],
    run.args?.length ? ['Options', el('code', { text: run.args.join(' ') })] : null,
    run.exitStatus ? ['Exit status', String(run.exitStatus)] : null,
    run.pushed || run.commit ? ['Commit', commitLink(run, { long: true })] : null,
    fileCount(run.files) > 0
      ? [
          'Files',
          Object.entries(run.files.byArea)
            .map(([area, counts]) => {
              const parts = [['added', counts.added], ['changed', counts.modified], ['deleted', counts.deleted]].filter(([, n]) => n > 0);
              return `${AREAS[area] ?? area}: ${parts.map(([word, n]) => `${n} ${word}`).join(', ')}`;
            })
            .join(' · '),
        ]
      : null,
  ].filter(Boolean);
  $('detail-facts').replaceChildren(...facts.flatMap(([term, value]) => [el('dt', { text: term }), el('dd', {}, value)]));

  const changes = run.changes ?? [];
  const container = $('detail-changes');
  if (changes.length === 0) {
    const message =
      run.status === 'running' ? 'Changes show here once the run commits.' :
      run.dryRun ? 'Dry runs change nothing; the log shows what the wiki returned.' :
      fileCount(run.files) > 0 ? 'No change log entries; only files changed (for example images or views).' :
      run.status === 'success' ? 'Nothing new: the API and wiki matched the stored data.' :
      'This run detected nothing. The log shows why it stopped.';
    container.replaceChildren(el('p', { class: 'empty', text: message }));
  } else {
    container.replaceChildren(
      ...TYPES.map((group) => [group, changes.filter((entry) => entry.type === group.type)])
        .filter(([, entries]) => entries.length > 0)
        .map(([group, entries]) => renderGroup(group, entries))
    );
  }

  if (first) {
    // Open the log straight away for a run that went wrong; otherwise on request.
    $('detail-log-text').textContent = 'Loading…';
    $('detail-log').open = run.status !== 'success' && run.status !== 'running';
    if ($('detail-log').open) loadLog();
  }
}

let logRequest = null;

async function loadLog() {
  const id = state.selected;
  if (!id || logRequest === id) return;
  logRequest = id;
  const pre = $('detail-log-text');
  try {
    const response = await fetch(`api/runs/${encodeURIComponent(id)}/log`, { cache: 'no-store' });
    const text = await response.text();
    if (state.selected !== id) return;
    const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
    pre.textContent = text || '(empty)';
    if (atBottom) pre.scrollTop = pre.scrollHeight;
  } catch (error) {
    pre.textContent = `Could not load the log: ${error.message}`;
  } finally {
    if (logRequest === id) logRequest = null;
  }
}

async function loadDetail() {
  if (!state.selected) {
    state.detail = null;
    renderDetail();
    return;
  }
  const id = state.selected;
  try {
    const run = await getJson(`api/runs/${encodeURIComponent(id)}`);
    if (state.selected !== id) return;
    const first = state.detail?.id !== id;
    state.detail = run;
    renderDetail(first);
    if (!first && $('detail-log').open) loadLog();
  } catch {
    state.detail = null;
    renderDetail();
  }
}

function select(id) {
  if (state.selected === id) return;
  state.selected = id;
  history.replaceState(null, '', id ? `#${id}` : location.pathname + location.search);
  renderRuns();
  loadDetail().then(() => id && $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

// ---- Refresh ----------------------------------------------------------------------------

async function refresh() {
  clearTimeout(state.timer);
  try {
    const [status, runs] = await Promise.all([getJson('api/status'), getJson(`api/runs?limit=${RUN_LIMIT}`)]);
    state.status = status;
    state.runs = runs;
    renderStatus();
    renderRuns();
    if (state.selected && (state.detail?.status === 'running' || state.detail?.id !== state.selected)) await loadDetail();
  } catch (error) {
    const health = $('health');
    health.className = 'badge bad';
    health.textContent = 'Status page offline';
    health.title = error.message;
  }
  state.timer = setTimeout(refresh, state.status?.running ? 5000 : 30000);
}

$('only-changes').checked = localStorage.getItem('onlyChanges') === '1';
$('only-changes').addEventListener('change', (event) => {
  localStorage.setItem('onlyChanges', event.target.checked ? '1' : '0');
  renderRuns();
});
$('detail-close').addEventListener('click', () => select(null));
$('detail-log').addEventListener('toggle', (event) => event.target.open && loadLog());
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh());

state.selected = location.hash.slice(1) || null;
refresh();
