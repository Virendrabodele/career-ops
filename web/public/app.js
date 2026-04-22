const overviewCards = document.getElementById('overviewCards');
const editors = document.getElementById('editors');
const applicationsTable = document.getElementById('applicationsTable');
const reportsList = document.getElementById('reportsList');
const outputsList = document.getElementById('outputsList');
const actions = document.getElementById('actions');
const actionOutput = document.getElementById('actionOutput');
const storageMeta = document.getElementById('storageMeta');
const refreshButton = document.getElementById('refreshButton');
const editorTemplate = document.getElementById('editorTemplate');

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

function card(label, value, detail = '') {
  return `
    <article class="card">
      <p class="card-label">${label}</p>
      <p class="card-value">${value}</p>
      <p class="card-detail">${detail}</p>
    </article>
  `;
}

function formatCounts(counts) {
  const entries = Object.entries(counts || {});
  if (entries.length === 0) return 'No tracked statuses yet.';
  return entries
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
}

function renderOverview(state) {
  overviewCards.innerHTML = [
    card('Tracked Applications', state.overview.total, formatCounts(state.overview.counts)),
    card('Actionable', state.overview.actionable, 'Not skipped, rejected, or discarded'),
    card('With PDF', state.overview.withPdf, 'Generated output in /output'),
    card(
      'Average Score',
      state.overview.avgScore ?? 'N/A',
      state.actions.running ? `Running: ${state.actions.running.label}` : 'No active action',
    ),
  ].join('');

  storageMeta.textContent = `Persistent root: ${state.storage.persistentRoot}`;
}

async function saveEditor(fileKey, textarea, button) {
  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    await requestJson(`/api/files/${fileKey}`, {
      method: 'PUT',
      body: JSON.stringify({ content: textarea.value }),
    });
    button.textContent = 'Saved';
    setTimeout(() => {
      button.textContent = 'Save';
      button.disabled = false;
    }, 900);
  } catch (error) {
    button.textContent = 'Retry';
    button.disabled = false;
    actionOutput.textContent = error.message;
  }
}

function renderEditors(fileMap, setupChecks) {
  editors.innerHTML = '';

  for (const [key, label] of Object.entries({
    profile: 'Profile',
    cv: 'CV',
    jd: 'Current JD',
    portals: 'Portals',
    articleDigest: 'Article Digest',
  })) {
    const file = fileMap[key];
    if (!file) continue;

    const fragment = editorTemplate.content.cloneNode(true);
    const article = fragment.querySelector('.editor-card');
    const heading = fragment.querySelector('h3');
    const summary = fragment.querySelector('p');
    const textarea = fragment.querySelector('textarea');
    const button = fragment.querySelector('button');
    const setupState = setupChecks.find(check => check.key === key);

    heading.textContent = label;
    summary.textContent = `${file.relPath} · ${setupState?.present ? 'Configured' : 'Needs attention'}`;
    textarea.value = file.content;
    button.addEventListener('click', () => saveEditor(key, textarea, button));

    article.dataset.fileKey = key;
    editors.appendChild(fragment);
  }
}

function renderApplications(state) {
  applicationsTable.innerHTML = state.applications
    .map(
      application => `
        <tr>
          <td>${application.date || '—'}</td>
          <td>${application.company || '—'}</td>
          <td>${application.role || '—'}</td>
          <td>${application.scoreRaw || '—'}</td>
          <td><span class="status-pill">${application.status || '—'}</span></td>
          <td>${
            application.reportPath
              ? `<a href="/downloads/reports/${application.reportPath.split('/').pop()}" target="_blank" rel="noreferrer">Open</a>`
              : '—'
          }</td>
        </tr>
      `,
    )
    .join('');
}

function renderFiles(target, files, collection) {
  target.innerHTML = files.length
    ? files
        .map(
          file => `
            <li>
              <a href="/downloads/${collection}/${file.name}" target="_blank" rel="noreferrer">${file.name}</a>
              <span>${new Date(file.updatedAt).toLocaleString()}</span>
            </li>
          `,
        )
        .join('')
    : '<li class="empty">Nothing here yet.</li>';
}

async function runAction(actionId, button) {
  button.disabled = true;
  button.textContent = 'Running...';
  actionOutput.textContent = `Running ${actionId}...`;

  try {
    const result = await requestJson(`/api/actions/${actionId}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const output = [result.result.stdout, result.result.stderr]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    actionOutput.textContent = output || `${result.result.label} finished with exit code ${result.result.exitCode}.`;
    await loadState();
  } catch (error) {
    actionOutput.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Run';
  }
}

function renderActions(state) {
  actions.innerHTML = '';

  for (const action of state.actions.available) {
    const cardNode = document.createElement('article');
    cardNode.className = 'action-card';
    cardNode.innerHTML = `
      <div>
        <h3>${action.label}</h3>
        <p>${action.description}</p>
      </div>
      <button class="button secondary" type="button">Run</button>
    `;

    const button = cardNode.querySelector('button');
    button.addEventListener('click', () => runAction(action.id, button));
    actions.appendChild(cardNode);
  }

  if (state.actions.lastRun) {
    const last = state.actions.lastRun;
    actionOutput.textContent = `Last run: ${last.label} · exit ${last.exitCode}\n\n${[
      last.stdout,
      last.stderr,
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim()}`;
  }
}

async function loadState() {
  refreshButton.disabled = true;
  try {
    const state = await requestJson('/api/state');
    renderOverview(state);
    renderEditors(state.editableFiles || {}, state.setupChecks);
    renderApplications(state);
    renderFiles(reportsList, state.reports, 'reports');
    renderFiles(outputsList, state.outputs, 'output');
    renderActions(state);
  } catch (error) {
    actionOutput.textContent = error.message;
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener('click', loadState);

loadState();
