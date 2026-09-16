import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, open, readFile, rename, stat, truncate, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { buildM1ResultCard } from '../survey-core.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from './m1-default-question-config.mjs';
import { validateVersionedModuleAnswers, versionedModuleAnswersMode } from './m1-module-answer-validation.mjs';
import { createFileQuestionConfigStore } from './question-config-store.mjs';

const API_PATH = '/api/m1-submissions';
const HEALTH_PATH = `${API_PATH}/health`;
const EXPORT_PATH = `${API_PATH}/export`;
const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const MAX_QUALITATIVE_ANSWER_LENGTH = 3000;
const QUALITATIVE_QUESTION_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'];
const SERVER_OWNED_SUBMISSION_FIELDS = [
  'submissionId',
  'receivedAt',
  'resultCard',
  'm1FrozenResult',
  'qualitativeSubmittedAt',
  'feedbackSubmittedAt',
  'feedbackTokenHash',
  'feedbackToken',
  'editToken',
];
const LEGACY_RECORD_FIELDS = [
  'm1FrozenResult',
  'qualitativeSubmittedAt',
  'feedbackSubmittedAt',
  'feedbackTokenHash',
  'feedbackToken',
  'editToken',
];
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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameM1Submission(left, right) {
  // A browser may retry after a timeout with a newer client timestamp. The
  // client id is the idempotency key; substantive answers must be unchanged.
  const fields = [
    'schemaVersion', 'studyId', 'locale', 'participant', 'study', 'factors', 'responses',
    'initialReachabilityMatrix', 'directInfluenceMatrix', 'progress',
    'status', 'collectionMethod', 'qualitativeSectionComplete', 'qualitativeAnswers',
    'confirmedTopics', 'sourceSelections', 'questionnaireConfigRevision', 'moduleAnswers',
  ];
  return fields.every((field) => stableJson(left?.[field]) === stableJson(right?.[field]));
}

function sameM1Core(left, right) {
  const fields = [
    'schemaVersion', 'studyId', 'locale', 'participant', 'study', 'factors', 'responses',
    'initialReachabilityMatrix', 'directInfluenceMatrix', 'progress', 'status',
    'confirmedTopics', 'sourceSelections', 'questionnaireConfigRevision', 'moduleAnswers',
  ];
  return fields.every((field) => stableJson(left?.[field]) === stableJson(right?.[field]));
}

function legacyWrittenAnswersMatch(existing, incoming) {
  if (!existing || typeof existing !== 'object') return true;
  return Object.keys(existing).every((key) => QUALITATIVE_QUESTION_IDS.includes(key)
    && typeof existing[key] === 'string'
    && existing[key] === incoming?.[key]);
}

function hasServerOwnedSubmissionFields(submission) {
  return SERVER_OWNED_SUBMISSION_FIELDS.some((key) => (
    Object.prototype.hasOwnProperty.call(submission, key)
  ));
}

function qualitativeAnswersAreValid(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === QUALITATIVE_QUESTION_IDS.length
    && Object.keys(value).every((key) => QUALITATIVE_QUESTION_IDS.includes(key))
    && QUALITATIVE_QUESTION_IDS.every((key) => (
      typeof value[key] === 'string' && value[key].length <= MAX_QUALITATIVE_ANSWER_LENGTH
    ));
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
  if (hasServerOwnedSubmissionFields(submission)) return false;
  if (submission.schemaVersion !== 1
    || submission.studyId !== 'M1-ESG-ISM-MICMAC'
    || submission.study?.factorVersion !== FACTOR_VERSION) return false;
  if (submission.status !== 'complete') return false;
  if (!['zh-CN', 'zh-HK', 'en'].includes(submission.locale)) return false;
  if (typeof submission.clientSubmissionId !== 'string'
    || submission.clientSubmissionId.trim().length < 8
    || submission.clientSubmissionId.trim().length > 128) return false;
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

  // Legacy clients submit the fixed Q1-Q7 string map. Revisioned clients use
  // moduleAnswers as the canonical payload because an admin may change any of
  // those modules to a choice or judgement type.
  const moduleAnswersMode = versionedModuleAnswersMode(submission);
  if (moduleAnswersMode === 'legacy'
    && (submission.qualitativeSectionComplete !== true
      || !qualitativeAnswersAreValid(submission.qualitativeAnswers))) return false;
  if (moduleAnswersMode !== 'legacy'
    && submission.qualitativeAnswers !== undefined
    && !qualitativeAnswersAreValid(submission.qualitativeAnswers)) return false;
  if (!submission.confirmedTopics || !Array.isArray(submission.confirmedTopics.ids)
    || submission.confirmedTopics.ids.length !== FACTOR_IDS.length
    || submission.confirmedTopics.total !== FACTOR_IDS.length
    || submission.confirmedTopics.complete !== true) return false;
  if (!Array.isArray(submission.sourceSelections)
    || submission.sourceSelections.length !== FACTOR_IDS.length) return false;

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

  if (submission.confirmedTopics.ids.some((id, index) => id !== FACTOR_IDS[index])) return false;
  if (submission.sourceSelections.some((selection, index) => selection?.sourceId !== FACTOR_IDS[index])) return false;
  const reachabilityMatrix = directMatrix.map((row, rowIndex) => (
    row.map((value, columnIndex) => (rowIndex === columnIndex ? 1 : value))
  ));
  if (!matrixMatches(submission.directInfluenceMatrix, directMatrix)
    || !matrixMatches(submission.initialReachabilityMatrix, reachabilityMatrix)) return false;

  for (const [index, selection] of submission.sourceSelections.entries()) {
    const expectedTargets = FACTOR_IDS.filter((_, targetIndex) => (
      targetIndex !== index && directMatrix[index][targetIndex] === 1
    ));
    if (typeof selection.noDirectInfluence !== 'boolean'
      || !Array.isArray(selection.targetIds)
      || selection.targetIds.length !== expectedTargets.length
      || expectedTargets.some((id, targetIndex) => selection.targetIds[targetIndex] !== id)
      || selection.noDirectInfluence !== (expectedTargets.length === 0)) return false;
  }
  return true;
}

function serverResultCard(record, submissionId, receivedAt) {
  if (record.resultCard || record.submission?.resultCard || record.submission?.m1FrozenResult) {
    return record.resultCard || record.submission.resultCard || record.submission.m1FrozenResult;
  }
  if (!Array.isArray(record.submission?.factors)
    || !Array.isArray(record.submission?.directInfluenceMatrix)) return null;
  return buildM1ResultCard({
    submissionId,
    frozenAt: receivedAt,
    factors: record.submission.factors,
    directInfluenceMatrix: record.submission.directInfluenceMatrix,
  });
}

function stripLegacyRecordFields(record) {
  const next = { ...record };
  for (const key of LEGACY_RECORD_FIELDS) delete next[key];
  if (next.submission && typeof next.submission === 'object' && !Array.isArray(next.submission)) {
    next.submission = { ...next.submission };
    for (const key of ['resultCard', ...LEGACY_RECORD_FIELDS]) delete next.submission[key];
  }
  return next;
}

function publicReceipt(record) {
  return {
    submissionId: record.submissionId,
    receivedAt: record.receivedAt,
    resultCard: record.resultCard,
  };
}

export function createM1SubmissionStore({ dataFile = defaultDataFile() } = {}) {
  let writeQueue = Promise.resolve();
  let existingRecordsLoaded = false;
  let needsLeadingNewline = false;
  const recordsByClientId = new Map();
  const recordsBySubmissionId = new Map();

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
      const lines = createInterface({ input: createReadStream(dataFile), crlfDelay: Infinity });
      for await (const line of lines) {
        const lineStart = byteOffset;
        byteOffset += Buffer.byteLength(line) + 1;
        if (!line) continue;
        if (corruptOffset !== null) throw new Error('Invalid NDJSON record before end of file');
        try {
          const record = JSON.parse(line);
          const clientId = clientIdOf(record.submission);
          if (clientId && record.submissionId) {
            const entry = { rawRecord: record, submissionId: record.submissionId, receivedAt: record.receivedAt };
            recordsByClientId.set(clientId, entry);
            recordsBySubmissionId.set(record.submissionId, entry);
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

  async function replaceRecord(entry, updatedRecord) {
    const raw = await readFile(dataFile, 'utf8');
    const updated = raw.split(/(?<=\n)/).map((line) => {
      if (!line.trim()) return line;
      const candidate = JSON.parse(line);
      return candidate.submissionId === entry.submissionId
        ? `${JSON.stringify(updatedRecord)}\n`
        : line;
    }).join('');
    const temporaryPath = `${dataFile}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, updated, 'utf8');
    await rename(temporaryPath, dataFile);
    needsLeadingNewline = false;
    const nextEntry = { ...entry, rawRecord: updatedRecord };
    recordsBySubmissionId.set(updatedRecord.submissionId, nextEntry);
    const clientId = clientIdOf(updatedRecord.submission);
    if (clientId) recordsByClientId.set(clientId, nextEntry);
    return nextEntry;
  }

  return {
    async append(submission) {
      let record;
      const write = async () => {
        await loadExistingRecords();
        const clientId = clientIdOf(submission);
        if (clientId && recordsByClientId.has(clientId)) {
          const entry = recordsByClientId.get(clientId);
          const existingSubmission = entry.rawRecord.submission || {};
          const legacyAnswers = existingSubmission.qualitativeAnswers;
          const exactMatch = sameM1Submission(existingSubmission, submission);
          const legacyMatch = !exactMatch
            && sameM1Core(existingSubmission, submission)
            && legacyWrittenAnswersMatch(legacyAnswers, submission.qualitativeAnswers);
          if (!exactMatch && !legacyMatch) {
            throw new ApiError(409, 'Submission ID was already used for a different M1 response');
          }

          const resultCard = serverResultCard(entry.rawRecord, entry.submissionId, entry.receivedAt);
          const hasLegacyFields = LEGACY_RECORD_FIELDS.some((key) => (
            Object.prototype.hasOwnProperty.call(entry.rawRecord, key)
            || Object.prototype.hasOwnProperty.call(entry.rawRecord.submission || {}, key)
          )) || Object.prototype.hasOwnProperty.call(entry.rawRecord.submission || {}, 'resultCard');
          if (legacyMatch || !entry.rawRecord.resultCard || hasLegacyFields) {
            const updatedRecord = stripLegacyRecordFields({
              submissionId: entry.submissionId,
              receivedAt: entry.receivedAt,
              resultCard,
              submission: legacyMatch ? { ...existingSubmission, ...submission } : { ...existingSubmission },
            });
            record = (await replaceRecord(entry, updatedRecord)).rawRecord;
          } else {
            record = entry.rawRecord;
          }
          return;
        }

        const submissionId = randomUUID();
        const receivedAt = new Date().toISOString();
        const resultCard = Array.isArray(submission.factors)
          && Array.isArray(submission.directInfluenceMatrix)
          ? buildM1ResultCard({
            submissionId,
            frozenAt: receivedAt,
            factors: submission.factors,
            directInfluenceMatrix: submission.directInfluenceMatrix,
          })
          : null;
        record = { submissionId, receivedAt, resultCard, submission: { ...submission } };
        await mkdir(dirname(dataFile), { recursive: true });
        const separator = needsLeadingNewline ? '\n' : '';
        await appendFile(dataFile, `${separator}${JSON.stringify(record)}\n`, 'utf8');
        needsLeadingNewline = false;
        if (clientId) {
          const entry = { rawRecord: record, submissionId, receivedAt };
          recordsByClientId.set(clientId, entry);
          recordsBySubmissionId.set(submissionId, entry);
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
          stream: fileStat.size > 0 ? createReadStream(dataFile, { end: fileStat.size - 1 }) : null,
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
  const questionStore = options.questionStore || createFileQuestionConfigStore({
    dataFile: options.questionConfigFile,
    defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG,
  });
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
      const token = String(request.headers.authorization || '').match(/^Basic\s+(.+)$/i)?.[1] || '';
      let user = '';
      let password = '';
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const separator = decoded.indexOf(':');
        if (separator >= 0) {
          user = decoded.slice(0, separator);
          password = decoded.slice(separator + 1);
        }
      } catch { /* malformed credentials remain empty */ }
      if (user !== adminUser || password !== adminPassword) {
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
        const declaredSize = Number(request.headers['content-length']);
        if (Number.isFinite(declaredSize) && declaredSize > maxBodyBytes) {
          request.resume();
          throw new ApiError(413, 'Request body is too large');
        }
        const chunks = [];
        let receivedBytes = 0;
        for await (const chunk of request) {
          receivedBytes += chunk.length;
          if (receivedBytes > maxBodyBytes) {
            request.resume();
            throw new ApiError(413, 'Request body is too large');
          }
          chunks.push(chunk);
        }
        let submission;
        try {
          submission = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          sendJson(response, 400, { error: 'Invalid JSON' });
          return;
        }
        if (!isCompleteM1Submission(submission)) {
          sendJson(response, 422, { error: 'Invalid M1 submission' });
          return;
        }
        if (!await validateVersionedModuleAnswers(submission, questionStore)) {
          sendJson(response, 422, { error: 'Invalid M1 submission' });
          return;
        }
        const stored = await store.append(submission);
        sendJson(response, 201, publicReceipt(stored));
      } catch (error) {
        if (error instanceof ApiError) {
          sendJson(response, error.statusCode, { error: error.message });
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
