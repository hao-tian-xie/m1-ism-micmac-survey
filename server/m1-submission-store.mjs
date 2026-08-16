import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, open, stat, truncate } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const API_PATH = '/api/m1-submissions';
const HEALTH_PATH = `${API_PATH}/health`;
const EXPORT_PATH = `${API_PATH}/export`;
const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const FACTOR_IDS = Array.from({ length: 38 }, (_, index) => `F${index + 1}`);
const PAIRS = FACTOR_IDS.flatMap((leftId, leftIndex) => (
  FACTOR_IDS.slice(leftIndex + 1).map((rightId) => ({
    pairId: `${leftId}__${rightId}`,
    leftId,
    rightId,
  }))
));
const PAIR_COUNT = PAIRS.length;
const RELATION_DIRECTIONS = {
  V: [1, 0],
  A: [0, 1],
  X: [1, 1],
  O: [0, 0],
};

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function defaultDataFile() {
  return resolve(process.env.M1_SUBMISSIONS_FILE || 'data/m1-submissions.ndjson');
}

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function sameValue(actual, expected) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

function basicCredentials(request) {
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

async function readJson(request, maxBodyBytes) {
  const declaredSize = Number(request.headers['content-length']);
  if (Number.isFinite(declaredSize) && declaredSize > maxBodyBytes) {
    request.resume();
    throw new ApiError(413, 'Request body is too large');
  }

  const chunks = [];
  let receivedBytes = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maxBodyBytes) {
      tooLarge = true;
    } else {
      chunks.push(chunk);
    }
  }
  if (tooLarge) throw new ApiError(413, 'Request body is too large');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function matrixMatches(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((row, rowIndex) => (
      Array.isArray(row)
      && row.length === expected[rowIndex].length
      && row.every((value, columnIndex) => value === expected[rowIndex][columnIndex])
    ));
}

function isCompleteM1Submission(submission) {
  if (!submission || typeof submission !== 'object' || Array.isArray(submission)) return false;
  if (submission.schemaVersion !== 1 || submission.studyId !== 'M1-ESG-ISM-MICMAC') return false;
  if (submission.status !== 'complete') return false;
  if (!['zh-CN', 'zh-HK', 'en'].includes(submission.locale)) return false;
  if (typeof submission.clientSubmissionId !== 'string' || !submission.clientSubmissionId.trim()) return false;
  if (typeof submission.submittedAt !== 'string' || !Number.isFinite(Date.parse(submission.submittedAt))) return false;
  if (typeof submission.participant?.code !== 'string' || !submission.participant.code.trim()) return false;
  if (typeof submission.participant?.roleCode !== 'string' || !submission.participant.roleCode) return false;
  if (submission.participant?.experienceCode !== undefined
    && typeof submission.participant.experienceCode !== 'string') return false;
  if (submission.progress?.answered !== PAIR_COUNT
    || submission.progress?.total !== PAIR_COUNT
    || submission.progress?.complete !== true) return false;
  if (!Array.isArray(submission.factors)
    || submission.factors.length !== FACTOR_IDS.length
    || !submission.factors.every((factor, index) => factor?.id === FACTOR_IDS[index])) return false;
  if (!Array.isArray(submission.responses) || submission.responses.length !== PAIRS.length) return false;

  const responses = new Map(submission.responses.map((response) => [response?.pairId, response]));
  if (responses.size !== PAIRS.length) return false;
  const directMatrix = FACTOR_IDS.map(() => FACTOR_IDS.map(() => 0));
  const factorIndex = new Map(FACTOR_IDS.map((id, index) => [id, index]));

  for (const pair of PAIRS) {
    const response = responses.get(pair.pairId);
    const directions = RELATION_DIRECTIONS[response?.relation];
    if (!response
      || response.leftId !== pair.leftId
      || response.rightId !== pair.rightId
      || !directions
      || response.leftToRight !== directions[0]
      || response.rightToLeft !== directions[1]) return false;
    const leftIndex = factorIndex.get(pair.leftId);
    const rightIndex = factorIndex.get(pair.rightId);
    directMatrix[leftIndex][rightIndex] = directions[0];
    directMatrix[rightIndex][leftIndex] = directions[1];
  }

  const reachabilityMatrix = directMatrix.map((row, rowIndex) => (
    row.map((value, columnIndex) => (rowIndex === columnIndex ? 1 : value))
  ));
  return matrixMatches(submission.directInfluenceMatrix, directMatrix)
    && matrixMatches(submission.initialReachabilityMatrix, reachabilityMatrix);
}

export function createM1SubmissionStore({ dataFile = defaultDataFile() } = {}) {
  let writeQueue = Promise.resolve();
  let existingRecordsLoaded = false;
  let needsLeadingNewline = false;
  const recordsByClientId = new Map();

  function clientIdOf(submission) {
    return typeof submission?.clientSubmissionId === 'string'
      ? submission.clientSubmissionId.trim()
      : '';
  }

  async function loadExistingRecords() {
    if (existingRecordsLoaded) return;
    try {
      let byteOffset = 0;
      let corruptOffset = null;
      const lines = createInterface({
        input: createReadStream(dataFile),
        crlfDelay: Infinity,
      });
      for await (const line of lines) {
        const lineStart = byteOffset;
        byteOffset += Buffer.byteLength(line) + 1;
        if (!line) continue;
        if (corruptOffset !== null) throw new Error('Invalid NDJSON record before end of file');
        try {
          const record = JSON.parse(line);
          const clientId = clientIdOf(record.submission);
          if (clientId) {
            recordsByClientId.set(clientId, {
              submissionId: record.submissionId,
              receivedAt: record.receivedAt,
            });
          }
        } catch {
          corruptOffset = lineStart;
        }
      }
      if (corruptOffset !== null) await truncate(dataFile, corruptOffset);

      const fileStat = await stat(dataFile);
      if (fileStat.size > 0) {
        const handle = await open(dataFile, 'r');
        try {
          const lastByte = Buffer.alloc(1);
          await handle.read(lastByte, 0, 1, fileStat.size - 1);
          needsLeadingNewline = lastByte[0] !== 10;
        } finally {
          await handle.close();
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    existingRecordsLoaded = true;
  }

  return {
    async append(submission) {
      let record;
      const write = async () => {
        await loadExistingRecords();
        const clientId = clientIdOf(submission);
        if (clientId && recordsByClientId.has(clientId)) {
          record = recordsByClientId.get(clientId);
          return;
        }

        record = {
          submissionId: randomUUID(),
          receivedAt: new Date().toISOString(),
          submission,
        };
        await mkdir(dirname(dataFile), { recursive: true });
        const separator = needsLeadingNewline ? '\n' : '';
        await appendFile(dataFile, `${separator}${JSON.stringify(record)}\n`, 'utf8');
        needsLeadingNewline = false;
        if (clientId) {
          recordsByClientId.set(clientId, {
            submissionId: record.submissionId,
            receivedAt: record.receivedAt,
          });
        }
      };
      writeQueue = writeQueue.catch(() => undefined).then(write);
      await writeQueue;
      return record;
    },

    async openExport() {
      await writeQueue.catch(() => undefined);
      await loadExistingRecords();
      try {
        const fileStat = await stat(dataFile);
        return {
          size: fileStat.size,
          stream: fileStat.size > 0
            ? createReadStream(dataFile, { end: fileStat.size - 1 })
            : null,
        };
      } catch (error) {
        if (error.code === 'ENOENT') return { size: 0, stream: null };
        throw error;
      }
    },
  };
}

export function createM1SubmissionHandler(options = {}) {
  const store = createM1SubmissionStore(options);
  const adminUser = options.adminUser ?? process.env.M1_ADMIN_USER ?? '';
  const adminPassword = options.adminPassword ?? process.env.M1_ADMIN_PASSWORD ?? '';
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return function m1SubmissionHandler(request, response, next = () => {
    sendJson(response, 404, { error: 'Not found' });
  }) {
    const pathname = new URL(request.url, 'http://localhost').pathname;

    if (request.method === 'GET' && pathname === HEALTH_PATH) {
      sendJson(response, 200, { ok: true, service: 'm1-submissions' });
      return;
    }

    if (request.method === 'GET' && pathname === EXPORT_PATH) {
      if (!adminUser || !adminPassword) {
        sendJson(response, 503, { error: 'Admin access is not configured' });
        return;
      }

      const credentials = basicCredentials(request);
      const userMatches = sameValue(credentials?.user || '', adminUser);
      const passwordMatches = sameValue(credentials?.password || '', adminPassword);
      if (!userMatches || !passwordMatches) {
        sendJson(response, 401, { error: 'Authentication required' }, {
          'www-authenticate': 'Basic realm="M1 research data", charset="UTF-8"',
        });
        return;
      }

      void (async () => {
        try {
          const exported = await store.openExport();
          response.writeHead(200, {
            'cache-control': 'no-store',
            'content-disposition': 'attachment; filename="m1-submissions.ndjson"',
            'content-length': exported.size,
            'content-type': 'application/x-ndjson; charset=utf-8',
          });
          if (!exported.stream) {
            response.end();
            return;
          }
          exported.stream.once('error', () => response.destroy());
          exported.stream.pipe(response);
        } catch {
          sendJson(response, 500, { error: 'Submissions could not be exported' });
        }
      })();
      return;
    }

    if (request.method !== 'POST' || pathname !== API_PATH) {
      next();
      return;
    }

    const contentType = String(request.headers['content-type'] || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== 'application/json') {
      request.resume();
      sendJson(response, 415, { error: 'Content-Type must be application/json' });
      return;
    }

    void (async () => {
      try {
        const submission = await readJson(request, maxBodyBytes);
        if (!isCompleteM1Submission(submission)) {
          sendJson(response, 422, { error: 'Invalid M1 submission' });
          return;
        }
        const { submissionId, receivedAt } = await store.append(submission);
        sendJson(response, 201, { submissionId, receivedAt });
      } catch (error) {
        if (error instanceof ApiError) {
          sendJson(response, error.statusCode, { error: error.message });
          return;
        }
        if (error instanceof SyntaxError) {
          sendJson(response, 400, { error: 'Invalid JSON' });
          return;
        }
        sendJson(response, 500, { error: 'Submission could not be stored' });
      }
    })();
  };
}

export function m1SubmissionsPlugin(options = {}) {
  const handler = createM1SubmissionHandler(options);
  return {
    name: 'm1-submissions-api',
    configureServer(server) {
      server.middlewares.use(handler);
    },
  };
}
