import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createM1SubmissionHandler } from './m1-submission-store.mjs';

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(text);
}

async function serveStatic(request, response, distDir) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    sendText(response, 400, 'Bad request');
    return;
  }

  const root = resolve(distDir);
  let filePath = resolve(root, `.${pathname}`);
  const relativePath = relative(root, filePath);
  if (relativePath.startsWith(`..${sep}`) || relativePath === '..') {
    sendText(response, 404, 'Not found');
    return;
  }

  try {
    let fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = join(filePath, 'index.html');
      fileStat = await stat(filePath);
    }
    if (!fileStat.isFile()) throw new Error('Not a file');

    response.writeHead(200, {
      'content-length': fileStat.size,
      'content-type': CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch {
    sendText(response, 404, 'Not found');
  }
}

export function createM1ProductionServer({
  distDir = resolve(process.env.M1_DIST_DIR || 'dist'),
  dataFile,
  adminUser,
  adminPassword,
} = {}) {
  const apiHandler = createM1SubmissionHandler({ dataFile, adminUser, adminPassword });
  return createServer((request, response) => {
    apiHandler(request, response, () => {
      void serveStatic(request, response, distDir);
    });
  });
}

const isMainModule = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '0.0.0.0';
  createM1ProductionServer().listen(port, host, () => {
    console.log(`M1 production server listening on http://${host}:${port}`);
  });
}
