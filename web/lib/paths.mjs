import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, '..', '..');
export const publicRoot = path.join(repoRoot, 'web', 'public');
export const defaultDataRoot = path.join(repoRoot, '.render-data');
export const persistentRoot = path.resolve(
  process.env.CAREER_OPS_DATA_ROOT || process.env.RENDER_DISK_MOUNT_PATH || defaultDataRoot,
);

export const managedItems = [
  { type: 'file', relPath: 'cv.md' },
  { type: 'file', relPath: 'article-digest.md' },
  { type: 'file', relPath: 'config/profile.yml' },
  { type: 'file', relPath: 'portals.yml' },
  { type: 'file', relPath: 'batch/batch-input.tsv' },
  { type: 'file', relPath: 'batch/batch-state.tsv' },
  { type: 'dir', relPath: 'data' },
  { type: 'dir', relPath: 'reports' },
  { type: 'dir', relPath: 'output' },
  { type: 'dir', relPath: 'jds' },
  { type: 'dir', relPath: 'batch/logs' },
  { type: 'dir', relPath: 'batch/tracker-additions' },
  { type: 'file', relPath: 'interview-prep/story-bank.md' },
];

export const editableFiles = {
  cv: {
    label: 'CV',
    relPath: 'cv.md',
    language: 'markdown',
  },
  articleDigest: {
    label: 'Article Digest',
    relPath: 'article-digest.md',
    language: 'markdown',
  },
  profile: {
    label: 'Profile',
    relPath: 'config/profile.yml',
    language: 'yaml',
  },
  portals: {
    label: 'Portals',
    relPath: 'portals.yml',
    language: 'yaml',
  },
};

export const downloadCollections = {
  reports: 'reports',
  output: 'output',
};

export function resolveRepoPath(relPath) {
  return path.join(repoRoot, relPath);
}

export function resolvePersistentPath(relPath) {
  return path.join(persistentRoot, relPath);
}
