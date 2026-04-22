import { spawn } from 'child_process';

import { repoRoot } from './paths.mjs';
import { syncPersistentToWorkspace, syncWorkspaceToPersistent } from './persistence.mjs';

const actionDefinitions = {
  doctor: {
    label: 'Doctor',
    description: 'Validate runtime prerequisites and required local files.',
    command: ['doctor.mjs'],
  },
  verify: {
    label: 'Verify Pipeline',
    description: 'Check tracker integrity, report links, and canonical statuses.',
    command: ['verify-pipeline.mjs'],
  },
  normalize: {
    label: 'Normalize Statuses',
    description: 'Convert non-canonical statuses inside the applications tracker.',
    command: ['normalize-statuses.mjs'],
  },
  dedup: {
    label: 'Deduplicate Tracker',
    description: 'Remove duplicate company-role entries from the applications tracker.',
    command: ['dedup-tracker.mjs'],
  },
  merge: {
    label: 'Merge Tracker Additions',
    description: 'Merge pending TSV additions into the main applications tracker.',
    command: ['merge-tracker.mjs'],
  },
  scan: {
    label: 'Scan Portals',
    description: 'Run the zero-token scanner against the configured portals.',
    command: ['scan.mjs'],
  },
  liveness: {
    label: 'Check Liveness',
    description: 'Run the liveness checker against tracked jobs that support it.',
    command: ['check-liveness.mjs'],
  },
};

let activeRun = null;
let lastRun = null;

function collectProcessOutput(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, CI: process.env.CI || 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('close', exitCode => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });

    child.on('error', error => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
  });
}

export function getActionsState() {
  return {
    running: activeRun,
    lastRun,
    available: Object.entries(actionDefinitions).map(([id, definition]) => ({
      id,
      label: definition.label,
      description: definition.description,
    })),
  };
}

export async function runAction(actionId) {
  const definition = actionDefinitions[actionId];
  if (!definition) {
    throw new Error(`Unknown action: ${actionId}`);
  }

  if (activeRun) {
    throw new Error(`Another action is already running: ${activeRun.id}`);
  }

  await syncPersistentToWorkspace();

  const startedAt = new Date().toISOString();
  activeRun = {
    id: actionId,
    label: definition.label,
    startedAt,
  };

  try {
    const result = await collectProcessOutput(process.execPath, definition.command);
    await syncWorkspaceToPersistent();

    lastRun = {
      id: actionId,
      label: definition.label,
      startedAt,
      finishedAt: new Date().toISOString(),
      ...result,
    };

    return lastRun;
  } finally {
    activeRun = null;
  }
}
