import http from 'http';
import path from 'path';
import { promises as fs } from 'fs';

import { runAction, getActionsState } from './lib/actions.mjs';
import { publicRoot } from './lib/paths.mjs';
import {
  getStorageSnapshot,
  initializePersistentStorage,
  readEditableFile,
  resolveDownloadFile,
  syncPersistentToWorkspace,
  writeEditableFile,
} from './lib/persistence.mjs';
import { loadAppState } from './lib/state.mjs';

const host = '0.0.0.0';
const port = Number(process.env.PORT || 10000);

const staticFiles = {
  '/': { type: 'text/html; charset=utf-8', fileName: 'index.html' },
  '/assets/app.js': { type: 'application/javascript; charset=utf-8', fileName: 'app.js' },
  '/assets/styles.css': { type: 'text/css; charset=utf-8', fileName: 'styles.css' },
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(message);
}

function parseBasicAuth(header = '') {
  if (!header.startsWith('Basic ')) {
    return null;
  }

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function isAuthorized(request) {
  const username = process.env.BASIC_AUTH_USERNAME;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!username && !password) {
    return true;
  }

  const credentials = parseBasicAuth(request.headers.authorization);
  return credentials?.username === username && credentials?.password === password;
}

function requireAuth(request, response) {
  if (request.url === '/health') {
    return true;
  }

  if (isAuthorized(request)) {
    return true;
  }

  response.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="career-ops"',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify({ error: 'Authentication required' }));
  return false;
}

async function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2_500_000) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });

    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function serveStaticFile(response, fileName, contentType) {
  const filePath = path.join(publicRoot, fileName);
  const content = await fs.readFile(filePath);
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': fileName === 'index.html' ? 'no-store' : 'public, max-age=600',
  });
  response.end(content);
}

async function handleApiRequest(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/state') {
    const payload = await loadAppState(getActionsState());
    payload.storage = await getStorageSnapshot();
    sendJson(response, 200, payload);
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/files/')) {
    const fileKey = url.pathname.split('/').pop();
    const file = await readEditableFile(fileKey);
    if (!file) {
      sendJson(response, 404, { error: 'Unknown file' });
      return;
    }
    sendJson(response, 200, file);
    return;
  }

  if (request.method === 'PUT' && url.pathname.startsWith('/api/files/')) {
    const fileKey = url.pathname.split('/').pop();
    const rawBody = await readRequestBody(request);
    const payload = JSON.parse(rawBody || '{}');
    if (typeof payload.content !== 'string') {
      sendJson(response, 400, { error: 'Expected string content' });
      return;
    }

    const result = await writeEditableFile(fileKey, payload.content);
    sendJson(response, 200, { ok: true, file: result });
    return;
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/actions/')) {
    const actionId = url.pathname.split('/').pop();
    const result = await runAction(actionId);
    sendJson(response, 200, { ok: result.exitCode === 0, result });
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/downloads/')) {
    const [, , collectionKey, fileName] = url.pathname.split('/');
    const file = await resolveDownloadFile(collectionKey, fileName);
    const content = await fs.readFile(file.filePath);
    const isPdf = file.fileName.toLowerCase().endsWith('.pdf');
    const contentType = isPdf ? 'application/pdf' : 'text/markdown; charset=utf-8';

    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${file.fileName}"`,
      'Cache-Control': 'no-store',
    });
    response.end(content);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      await syncPersistentToWorkspace();
      sendJson(response, 200, {
        ok: true,
        service: 'career-ops',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!requireAuth(request, response)) {
      return;
    }

    if (request.method === 'GET' && staticFiles[url.pathname]) {
      const staticFile = staticFiles[url.pathname];
      await serveStaticFile(response, staticFile.fileName, staticFile.type);
      return;
    }

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/downloads/')) {
      await handleApiRequest(request, response, url);
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(response, 500, {
      error: error.message,
    });
  }
});

await initializePersistentStorage();
await syncPersistentToWorkspace();

server.listen(port, host, () => {
  console.log(`career-ops web service listening on http://${host}:${port}`);
});
