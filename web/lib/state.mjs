import path from 'path';
import { promises as fs } from 'fs';

import {
  editableFiles,
  persistentRoot,
  repoRoot,
  resolveRepoPath,
} from './paths.mjs';
import { readEditableFile, syncPersistentToWorkspace } from './persistence.mjs';

const SCORE_REGEX = /(\d+\.?\d*)\/5/;
const REPORT_REGEX = /\[(\d+)\]\(([^)]+)\)/;

function normalizeStatus(value = '') {
  const clean = value.replaceAll('**', '').trim().toLowerCase();
  if (clean.includes('interview') || clean.includes('entrevista')) return 'interview';
  if (clean.includes('offer') || clean.includes('oferta')) return 'offer';
  if (clean.includes('responded') || clean.includes('respondido')) return 'responded';
  if (
    clean.includes('applied') ||
    clean.includes('aplicado') ||
    clean.includes('aplicada') ||
    clean === 'sent'
  ) {
    return 'applied';
  }
  if (clean.includes('reject') || clean.includes('rechaz')) return 'rejected';
  if (
    clean.includes('discard') ||
    clean.includes('descart') ||
    clean.includes('cerrada') ||
    clean.includes('cancelada')
  ) {
    return 'discarded';
  }
  if (
    clean.includes('skip') ||
    clean.includes('no aplicar') ||
    clean.includes('geo blocker')
  ) {
    return 'skip';
  }
  return 'evaluated';
}

function parseApplications(content) {
  const applications = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.startsWith('|---') || trimmed.startsWith('| #')) {
      continue;
    }

    let fields = [];
    if (trimmed.includes('\t')) {
      const normalized = trimmed.replace(/^\|/, '').trim();
      fields = normalized.split('\t').map(part => part.trim().replace(/^\||\|$/g, ''));
    } else {
      fields = trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(part => part.trim());
    }

    if (fields.length < 8) {
      continue;
    }

    const scoreMatch = fields[4]?.match(SCORE_REGEX);
    const reportMatch = fields[7]?.match(REPORT_REGEX);
    const normalizedStatus = normalizeStatus(fields[5]);

    applications.push({
      date: fields[1] || '',
      company: fields[2] || '',
      role: fields[3] || '',
      scoreRaw: fields[4] || '',
      score: scoreMatch ? Number(scoreMatch[1]) : null,
      status: fields[5] || '',
      statusNormalized: normalizedStatus,
      hasPdf: fields[6]?.includes('✅') || false,
      reportNumber: reportMatch?.[1] || null,
      reportPath: reportMatch?.[2] || null,
      notes: fields[8] || '',
    });
  }

  applications.sort((left, right) => {
    if (left.date && right.date && left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }
    return (Number(right.reportNumber) || 0) - (Number(left.reportNumber) || 0);
  });

  return applications;
}

function summarizeApplications(applications) {
  const counts = {};
  let actionable = 0;
  let withPdf = 0;
  let scored = 0;
  let scoreTotal = 0;

  for (const app of applications) {
    counts[app.statusNormalized] = (counts[app.statusNormalized] || 0) + 1;
    if (app.hasPdf) withPdf += 1;
    if (!['skip', 'discarded', 'rejected'].includes(app.statusNormalized)) actionable += 1;
    if (typeof app.score === 'number') {
      scoreTotal += app.score;
      scored += 1;
    }
  }

  return {
    total: applications.length,
    actionable,
    withPdf,
    avgScore: scored > 0 ? Number((scoreTotal / scored).toFixed(2)) : null,
    counts,
  };
}

async function safeRead(relPath) {
  try {
    return await fs.readFile(resolveRepoPath(relPath), 'utf8');
  } catch {
    return null;
  }
}

async function listFiles(relPath, extension) {
  const directory = resolveRepoPath(relPath);

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter(entry => entry.isFile() && entry.name !== '.gitkeep' && entry.name.endsWith(extension))
        .map(async entry => {
          const fullPath = path.join(directory, entry.name);
          const stats = await fs.stat(fullPath);
          return {
            name: entry.name,
            relPath: `${relPath}/${entry.name}`.replaceAll('\\', '/'),
            size: stats.size,
            updatedAt: stats.mtime.toISOString(),
          };
        }),
    );

    files.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return files;
  } catch {
    return [];
  }
}

export async function loadAppState(actionsState) {
  await syncPersistentToWorkspace();

  const applicationsRaw =
    (await safeRead('data/applications.md')) || (await safeRead('applications.md')) || '';
  const applications = parseApplications(applicationsRaw);
  const overview = summarizeApplications(applications);
  const reports = await listFiles('reports', '.md');
  const outputs = await listFiles('output', '.pdf');

  const setupChecks = await Promise.all(
    Object.entries(editableFiles).map(async ([key, definition]) => {
      const content = await safeRead(definition.relPath);
      return {
        key,
        label: definition.label,
        relPath: definition.relPath,
        present: Boolean(content && content.trim()),
      };
    }),
  );

  const editableFileEntries = await Promise.all(
    Object.keys(editableFiles).map(async key => [key, await readEditableFile(key)]),
  );

  return {
    environment: {
      render: process.env.RENDER === 'true' || process.env.RENDER === '1',
      nodeEnv: process.env.NODE_ENV || 'development',
      repoRoot,
      persistentRoot,
    },
    setupChecks,
    editableFiles: Object.fromEntries(editableFileEntries),
    overview,
    actions: actionsState,
    applications: applications.slice(0, 100),
    reports: reports.slice(0, 50),
    outputs: outputs.slice(0, 50),
  };
}
