import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, open, readFile, rename, stat, truncate, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import {
  MAX_QUALITATIVE_ANSWER_LENGTH,
  buildM1ResultSnapshot,
  m1ResultSnapshotMatches,
  qualitativeAnswersAreComplete,
} from '../survey-core.mjs';

const API_PATH = '/api/m1-submissions';
const HEALTH_PATH = `${API_PATH}/health`;
const EXPORT_PATH = `${API_PATH}/export`;
const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const FACTOR_VERSION = 'esrs-set1-subtopics-v2-38-verified';
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
  if (![1, 2].includes(submission.schemaVersion)
    || submission.studyId !== 'M1-ESG-ISM-MICMAC'
    || submission.study?.factorVersion !== FACTOR_VERSION) return false;
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
  if (!matrixMatches(submission.directInfluenceMatrix, directMatrix)
    || !matrixMatches(submission.initialReachabilityMatrix, reachabilityMatrix)) return false;
  if (submission.schemaVersion === 1) return true;

  const qualitative = submission.qualitativeResponses;
  const snapshot = submission.m1ResultSnapshot;
  const submittedAt = Date.parse(submission.submittedAt);
  return qualitative?.phase === 'before-m1'
    && typeof qualitative.completedAt === 'string'
    && Number.isFinite(Date.parse(qualitative.completedAt))
    && qualitativeAnswersAreComplete(qualitative.answers, MAX_QUALITATIVE_ANSWER_LENGTH)
    && Date.parse(qualitative.completedAt) <= Date.parse(snapshot?.frozenAt)
    && Date.parse(snapshot?.frozenAt) <= submittedAt
    && m1ResultSnapshotMatches({
      snapshot,
      factorVersion: FACTOR_VERSION,
      factors: submission.factors,
      directInfluenceMatrix: submission.directInfluenceMatrix,
    })
    && typeof submission.q7Response === 'string'
    && Boolean(submission.q7Response.trim())
    && submission.q7Response.length <= MAX_QUALITATIVE_ANSWER_LENGTH;
}

const FREEZE_CONTENT_FIELDS = [
  'schemaVersion', 'studyId', 'clientSubmissionId', 'locale', 'study', 'participant',
  'progress', 'factors', 'responses', 'initialReachabilityMatrix', 'directInfluenceMatrix',
  'confirmedTopics', 'sourceSelections', 'qualitativeResponses',
];

function isFreezeRequest(submission) {
  if (!submission || submission.schemaVersion !== 2
    || submission.phase !== 'm1-freeze'
    || submission.status !== 'm1-freeze-request'
    || typeof submission.requestedAt !== 'string'
    || !Number.isFinite(Date.parse(submission.requestedAt))
    || Object.hasOwn(submission, 'm1ResultSnapshot')
    || Object.hasOwn(submission, 'q7Response')) return false;
  let snapshot;
  try {
    snapshot = buildM1ResultSnapshot({
      factorVersion: FACTOR_VERSION,
      frozenAt: submission.requestedAt,
      factors: submission.factors,
      directInfluenceMatrix: submission.directInfluenceMatrix,
    });
  } catch {
    return false;
  }
  const candidate = {
    ...submission,
    status: 'complete',
    submittedAt: submission.requestedAt,
    m1ResultSnapshot: snapshot,
    q7Response: 'freeze-validation',
  };
  delete candidate.phase;
  delete candidate.requestedAt;
  return isCompleteM1Submission(candidate);
}

function isFinalizeRequest(request) {
  return request?.schemaVersion === 2
    && request.phase === 'q7-finalize'
    && request.studyId === 'M1-ESG-ISM-MICMAC'
    && typeof request.clientSubmissionId === 'string'
    && Boolean(request.clientSubmissionId.trim())
    && typeof request.freezeReceiptId === 'string'
    && Boolean(request.freezeReceiptId.trim())
    && typeof request.q7Response === 'string'
    && Boolean(request.q7Response.trim())
    && request.q7Response.length <= MAX_QUALITATIVE_ANSWER_LENGTH;
}

function sameFreezePayload(stored, request) {
  if (!stored || !request) return false;
  return JSON.stringify(FREEZE_CONTENT_FIELDS.map((field) => stored[field]))
    === JSON.stringify(FREEZE_CONTENT_FIELDS.map((field) => request[field]));
}

function isTimestampForStore(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
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
          if (clientId) recordsByClientId.set(clientId, record);
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
        if (clientId) recordsByClientId.set(clientId, record);
      };
      writeQueue = writeQueue.catch(() => undefined).then(write);
      await writeQueue;
      return record;
    },

    async freeze(submission) {
      let record;
      const write = async () => {
        await loadExistingRecords();
        const clientId = clientIdOf(submission);
        const existing = recordsByClientId.get(clientId);
        if (existing) {
          if (!sameFreezePayload(existing.submission, submission)
            || !existing.submission.m1ResultSnapshot
            || !isTimestampForStore(existing.submission.m1ResultSnapshot.frozenAt)) {
            throw new ApiError(409, 'This response ID is already tied to different or incomplete data');
          }
          record = existing;
          return;
        }

        const receivedAt = new Date().toISOString();
        const m1ResultSnapshot = buildM1ResultSnapshot({
          factorVersion: FACTOR_VERSION,
          frozenAt: receivedAt,
          factors: submission.factors,
          directInfluenceMatrix: submission.directInfluenceMatrix,
        });
        const frozenSubmission = {
          ...submission,
          phase: 'm1-frozen',
          status: 'm1-frozen',
          frozenAt: receivedAt,
          m1ResultSnapshot,
        };
        delete frozenSubmission.requestedAt;
        record = { submissionId: `M1-${randomUUID()}`, receivedAt, submission: frozenSubmission };
        await mkdir(dirname(dataFile), { recursive: true });
        const separator = needsLeadingNewline ? '\n' : '';
        await appendFile(dataFile, `${separator}${JSON.stringify(record)}\n`, 'utf8');
        needsLeadingNewline = false;
        recordsByClientId.set(clientId, record);
      };
      writeQueue = writeQueue.catch(() => undefined).then(write);
      await writeQueue;
      return record;
    },

    async finalize(request) {
      let record;
      const write = async () => {
        await loadExistingRecords();
        const frozen = recordsByClientId.get(request.clientSubmissionId);
        if (!frozen || frozen.submissionId !== request.freezeReceiptId) {
          throw new ApiError(409, 'A matching frozen M1 response was not found');
        }
        const previous = frozen.submission;
        if (previous.status === 'complete') {
          if (previous.q7Response !== request.q7Response) {
            throw new ApiError(409, 'This frozen response has already been finalized');
          }
          record = frozen;
          return;
        }
        if (previous.status !== 'm1-frozen'
          || !m1ResultSnapshotMatches({
            snapshot: previous.m1ResultSnapshot,
            factorVersion: FACTOR_VERSION,
            factors: previous.factors,
            directInfluenceMatrix: previous.directInfluenceMatrix,
          })) throw new ApiError(409, 'The stored M1 result is not frozen');

        const receivedAt = new Date().toISOString();
        const completeSubmission = {
          ...previous,
          phase: 'q7-finalize',
          status: 'complete',
          submittedAt: receivedAt,
          q7Response: request.q7Response,
        };
        if (!isCompleteM1Submission(completeSubmission)) {
          throw new ApiError(422, 'The frozen response could not be finalized');
        }
        record = { ...frozen, receivedAt, submission: completeSubmission };
        await replaceRecord(record);
        recordsByClientId.set(request.clientSubmissionId, record);
      };
      writeQueue = writeQueue.catch(() => undefined).then(write);
      await writeQueue;
      return record;
    },

    async openExport() {
      await writeQueue.catch(() => undefined);
      await loadExistingRecords();
      try {
        const text = await readFile(dataFile, 'utf8');
        const lines = text.split('\n').filter(Boolean).filter((line) => {
          try {
            return JSON.parse(line)?.submission?.status !== 'm1-frozen';
          } catch {
            return false;
          }
        });
        const body = lines.length ? `${lines.join('\n')}\n` : '';
        return {
          size: Buffer.byteLength(body),
          stream: body ? Readable.from([Buffer.from(body)]) : null,
        };
      } catch (error) {
        if (error.code === 'ENOENT') return { size: 0, stream: null };
        throw error;
      }
    },
  };

  async function replaceRecord(nextRecord) {
    const content = await readFile(dataFile, 'utf8');
    let replaced = false;
    const lines = content.split('\n').filter(Boolean).map((line) => {
      const current = JSON.parse(line);
      if (clientIdOf(current.submission) === clientIdOf(nextRecord.submission)) {
        replaced = true;
        return JSON.stringify(nextRecord);
      }
      return line;
    });
    if (!replaced) throw new ApiError(409, 'The frozen response is no longer available');
    const temporaryFile = `${dataFile}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, `${lines.join('\n')}\n`, 'utf8');
    await rename(temporaryFile, dataFile);
    needsLeadingNewline = false;
  }
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
        if (submission?.phase === 'm1-freeze') {
          if (!isFreezeRequest(submission)) {
            sendJson(response, 422, { error: 'Invalid M1 freeze request' });
            return;
          }
          const record = await store.freeze(submission);
          sendJson(response, 201, {
            submissionId: record.submissionId,
            receivedAt: record.receivedAt,
            frozenAt: record.submission.m1ResultSnapshot.frozenAt,
            m1ResultSnapshot: record.submission.m1ResultSnapshot,
          });
          return;
        }
        if (submission?.phase === 'q7-finalize') {
          if (!isFinalizeRequest(submission)) {
            sendJson(response, 422, { error: 'Invalid Q7 finalization request' });
            return;
          }
          const record = await store.finalize(submission);
          sendJson(response, 201, {
            submissionId: record.submissionId,
            receivedAt: record.receivedAt,
          });
          return;
        }
        if (submission?.schemaVersion !== 1 || !isCompleteM1Submission(submission)) {
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
