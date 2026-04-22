import path from 'path';
import { promises as fs } from 'fs';

import {
  downloadCollections,
  editableFiles,
  managedItems,
  persistentRoot,
  repoRoot,
  resolvePersistentPath,
  resolveRepoPath,
} from './paths.mjs';

const seededFiles = {
  'cv.md': `# Your Name

Add your full CV here in markdown.

## Summary
- Senior AI engineer focused on applied AI systems, automation, and production delivery.

## Experience
- Add your work history, measurable outcomes, and technologies.
`,
  'article-digest.md': `# Article Digest

Optional proof points, case studies, portfolio summaries, and public metrics go here.
`,
  'jds/current-jd.md': `# Current Job Description

Paste the latest job description here when you want to compare your resume against one target role.
`,
  'data/applications.md': `# Applications

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
`,
  'data/pipeline.md': `# Pipeline

## Pendientes

## Procesadas
`,
  'data/scan-history.tsv': 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n',
  'batch/batch-input.tsv': 'id\turl\tsource\tnotes\n',
  'batch/batch-state.tsv': 'id\turl\tstatus\tstarted_at\tfinished_at\treport_num\terror\n',
};

const seededFromRepo = {
  'config/profile.yml': 'config/profile.example.yml',
  'portals.yml': 'templates/portals.example.yml',
  'interview-prep/story-bank.md': 'interview-prep/story-bank.md',
};

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

let storageQueue = Promise.resolve();

function withStorageLock(task) {
  const nextRun = storageQueue.then(task, task);
  storageQueue = nextRun.catch(() => {});
  return nextRun;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(sourcePath, destinationPath) {
  if (!(await pathExists(sourcePath))) {
    return;
  }

  const sourceStats = await fs.stat(sourcePath);
  if (sourceStats.isFile() && (await pathExists(destinationPath))) {
    const destinationStats = await fs.stat(destinationPath);
    if (destinationStats.isFile()) {
      const [sourceContent, destinationContent] = await Promise.all([
        fs.readFile(sourcePath),
        fs.readFile(destinationPath),
      ]);
      if (sourceContent.equals(destinationContent)) {
        return;
      }
    }
  }

  await ensureDirectory(path.dirname(destinationPath));
  await fs.cp(sourcePath, destinationPath, {
    force: true,
    recursive: true,
    preserveTimestamps: false,
  });
}

async function seedMissingFile(relPath, content) {
  const targetPath = resolvePersistentPath(relPath);
  if (await pathExists(targetPath)) {
    return;
  }
  await ensureDirectory(path.dirname(targetPath));
  await fs.writeFile(targetPath, content, 'utf8');
}

async function seedFromRepo(relPath, sourceRelPath) {
  const targetPath = resolvePersistentPath(relPath);
  if (await pathExists(targetPath)) {
    return;
  }

  const sourcePath = resolveRepoPath(sourceRelPath);
  if (!(await pathExists(sourcePath))) {
    return;
  }

  await copyIfExists(sourcePath, targetPath);
}

async function initializePersistentStorageUnlocked() {
  await ensureDirectory(persistentRoot);

  for (const item of managedItems) {
    const targetPath = resolvePersistentPath(item.relPath);
    if (item.type === 'dir') {
      await ensureDirectory(targetPath);
    } else {
      await ensureDirectory(path.dirname(targetPath));
    }
  }

  for (const [relPath, sourceRelPath] of Object.entries(seededFromRepo)) {
    await seedFromRepo(relPath, sourceRelPath);
  }

  for (const [relPath, content] of Object.entries(seededFiles)) {
    await seedMissingFile(relPath, content);
  }
}

export async function initializePersistentStorage() {
  return withStorageLock(() => initializePersistentStorageUnlocked());
}

async function syncPersistentToWorkspaceUnlocked() {
  await initializePersistentStorageUnlocked();

  for (const item of managedItems) {
    await copyIfExists(resolvePersistentPath(item.relPath), resolveRepoPath(item.relPath));
  }
}

export async function syncPersistentToWorkspace() {
  return withStorageLock(() => syncPersistentToWorkspaceUnlocked());
}

async function syncWorkspaceToPersistentUnlocked() {
  await initializePersistentStorageUnlocked();

  for (const item of managedItems) {
    await copyIfExists(resolveRepoPath(item.relPath), resolvePersistentPath(item.relPath));
  }
}

export async function syncWorkspaceToPersistent() {
  return withStorageLock(() => syncWorkspaceToPersistentUnlocked());
}

export async function readEditableFile(fileKey) {
  return withStorageLock(async () => {
    const file = editableFiles[fileKey];
    if (!file) {
      return null;
    }

    await syncPersistentToWorkspaceUnlocked();
    const filePath = resolveRepoPath(file.relPath);
    const content = await fs.readFile(filePath, 'utf8');

    return {
      ...file,
      key: fileKey,
      content,
    };
  });
}

export async function writeEditableFile(fileKey, content) {
  return withStorageLock(async () => {
    const file = editableFiles[fileKey];
    if (!file) {
      throw new Error(`Unknown editable file: ${fileKey}`);
    }

    const workspacePath = resolveRepoPath(file.relPath);
    const persistentPath = resolvePersistentPath(file.relPath);

    await ensureDirectory(path.dirname(workspacePath));
    await ensureDirectory(path.dirname(persistentPath));
    await fs.writeFile(workspacePath, content, 'utf8');
    await fs.writeFile(persistentPath, content, 'utf8');

    return {
      ...file,
      key: fileKey,
      bytes: Buffer.byteLength(content, 'utf8'),
    };
  });
}

export async function resolveDownloadFile(collectionKey, fileName) {
  const relDir = downloadCollections[collectionKey];
  if (!relDir) {
    throw new Error(`Unknown download collection: ${collectionKey}`);
  }

  const safeName = path.basename(fileName);
  const targetPath = resolveRepoPath(path.join(relDir, safeName));

  if (!(await pathExists(targetPath))) {
    throw new Error('File not found');
  }

  return {
    fileName: safeName,
    filePath: targetPath,
  };
}

export async function getStorageSnapshot() {
  return withStorageLock(async () => {
    await syncPersistentToWorkspaceUnlocked();

    const snapshot = {};
    for (const item of managedItems) {
      const targetPath = resolvePersistentPath(item.relPath);
      snapshot[item.relPath] = await pathExists(targetPath);
    }

    return {
      repoRoot,
      persistentRoot,
      snapshot,
    };
  });
}
