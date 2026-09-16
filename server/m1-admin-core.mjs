const ALLOWED_LOCALES = new Set(['zh-CN', 'zh-HK', 'en']);
const QUALITATIVE_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'];
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100_000;
const MAX_QUERY_LENGTH = 120;
const STATUS_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/i;
const SUBMISSION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,159}$/i;

export const M1_ADMIN_PERMISSIONS = Object.freeze({
  list: 'm1:submissions:list',
  detail: 'm1:submissions:detail',
  counts: 'm1:submissions:counts',
  export: 'm1:submissions:export',
});

export class M1AdminQueryError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'M1AdminQueryError';
    this.field = field;
  }
}

export class M1AdminExportLimitError extends Error {
  constructor(limit) {
    super(`CSV export is limited to ${limit} submissions; narrow the filters and retry`);
    this.name = 'M1AdminExportLimitError';
    this.limit = limit;
  }
}

function oneValue(searchParams, field) {
  const values = searchParams.getAll(field);
  if (values.length > 1) throw new M1AdminQueryError(field, `${field} may only be supplied once`);
  return values[0] ?? '';
}

function integerValue(searchParams, field, fallback, { min, max }) {
  const raw = oneValue(searchParams, field);
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new M1AdminQueryError(field, `${field} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new M1AdminQueryError(field, `${field} must be between ${min} and ${max}`);
  }
  return value;
}

function dateValue(searchParams, field) {
  const raw = oneValue(searchParams, field).trim();
  if (!raw) return '';
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) throw new M1AdminQueryError(field, `${field} must be an ISO date or timestamp`);
  return new Date(timestamp).toISOString();
}

export function parseM1AdminQuery(input, { paginate = true } = {}) {
  const searchParams = input instanceof URLSearchParams
    ? input
    : new URL(input, 'http://localhost').searchParams;
  const allowed = new Set(['q', 'locale', 'status', 'from', 'to', ...(paginate ? ['page', 'pageSize'] : [])]);
  for (const field of searchParams.keys()) {
    if (!allowed.has(field)) throw new M1AdminQueryError(field, `${field} is not a supported query parameter`);
  }
  const q = oneValue(searchParams, 'q').trim().normalize('NFKC');
  if (q.length > MAX_QUERY_LENGTH) {
    throw new M1AdminQueryError('q', `q must not exceed ${MAX_QUERY_LENGTH} characters`);
  }
  const locale = oneValue(searchParams, 'locale').trim();
  if (locale && !ALLOWED_LOCALES.has(locale)) {
    throw new M1AdminQueryError('locale', 'locale must be zh-CN, zh-HK, or en');
  }
  const status = oneValue(searchParams, 'status').trim();
  if (status && !STATUS_PATTERN.test(status)) {
    throw new M1AdminQueryError('status', 'status contains unsupported characters');
  }
  const from = dateValue(searchParams, 'from');
  const to = dateValue(searchParams, 'to');
  if (from && to && from > to) {
    throw new M1AdminQueryError('to', 'to must not be earlier than from');
  }
  const filters = { q, locale, status, from, to };
  if (!paginate) return filters;
  const page = integerValue(searchParams, 'page', 1, { min: 1, max: MAX_PAGE });
  const pageSize = integerValue(searchParams, 'pageSize', DEFAULT_PAGE_SIZE, {
    min: 1,
    max: MAX_PAGE_SIZE,
  });
  return { ...filters, page, pageSize };
}

export function validateM1SubmissionId(value) {
  const submissionId = String(value || '').trim();
  if (!SUBMISSION_ID_PATTERN.test(submissionId)) {
    throw new M1AdminQueryError('submissionId', 'submissionId is invalid');
  }
  return submissionId;
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : '';
}

function finiteNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function pickResultCard(value) {
  if (!isObject(value)) return null;
  const rankedTopics = (items) => (Array.isArray(items) ? items : []).map((item) => ({
    id: stringOrEmpty(item?.id),
    label: stringOrEmpty(item?.label),
    count: finiteNumberOrNull(item?.count),
  }));
  return {
    version: stringOrEmpty(value.version),
    submissionId: stringOrEmpty(value.submissionId),
    frozenAt: stringOrEmpty(value.frozenAt),
    topicCount: finiteNumberOrNull(value.topicCount),
    directLinkCount: finiteNumberOrNull(value.directLinkCount),
    leadingTopics: rankedTopics(value.leadingTopics),
    receivingTopics: rankedTopics(value.receivingTopics),
  };
}

function canonicalRecord(record) {
  if (!isObject(record)) return null;
  const submission = isObject(record.submission) ? record.submission : record;
  const submissionId = stringOrEmpty(record.submissionId || record.submission_id
    || submission.resultCard?.submissionId || record.resultCard?.submissionId);
  const receivedAt = stringOrEmpty(record.receivedAt || record.received_at
    || record.resultCard?.frozenAt || submission.resultCard?.frozenAt);
  const resultCard = pickResultCard(record.resultCard || submission.resultCard
    || record.m1FrozenResult || submission.m1FrozenResult);
  return { submissionId, receivedAt, resultCard, submission };
}

function maskRespondentCode(value) {
  const code = stringOrEmpty(value);
  if (!code) return '';
  const characters = Array.from(code);
  if (characters.length <= 4) return '•'.repeat(characters.length);
  const visible = characters.slice(-4).join('');
  return `${'•'.repeat(Math.max(4, Math.min(8, characters.length - 4)))}${visible}`;
}

function qualitativeAnswers(value) {
  const source = isObject(value) ? value : {};
  return Object.fromEntries(QUALITATIVE_IDS.map((id) => [id, stringOrEmpty(source[id])]));
}

function pickedFactors(value) {
  return (Array.isArray(value) ? value : []).map((factor) => ({
    id: stringOrEmpty(factor?.id),
    label: stringOrEmpty(factor?.label),
    description: stringOrEmpty(factor?.description),
    category: stringOrEmpty(factor?.category),
    sourceIds: Array.isArray(factor?.sourceIds)
      ? factor.sourceIds.filter((id) => typeof id === 'string')
      : [],
  }));
}

function pickedResponses(value) {
  return (Array.isArray(value) ? value : []).map((response) => ({
    pairId: stringOrEmpty(response?.pairId),
    leftId: stringOrEmpty(response?.leftId),
    leftLabel: stringOrEmpty(response?.leftLabel),
    rightId: stringOrEmpty(response?.rightId),
    rightLabel: stringOrEmpty(response?.rightLabel),
    relation: stringOrEmpty(response?.relation),
    leftToRight: finiteNumberOrNull(response?.leftToRight),
    rightToLeft: finiteNumberOrNull(response?.rightToLeft),
    note: stringOrEmpty(response?.note),
  }));
}

function pickedMatrix(value) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => (Array.isArray(row)
    ? row.map((cell) => (cell === 0 || cell === 1 ? cell : null))
    : []));
}

function pickedModuleAnswers(value) {
  return (Array.isArray(value) ? value : []).map((answer) => {
    const rawValue = answer?.value;
    const pickedValue = typeof rawValue === 'string' || typeof rawValue === 'boolean'
      ? rawValue
      : Array.isArray(rawValue) && rawValue.every((item) => typeof item === 'string')
        ? [...rawValue]
        : null;
    return {
      moduleId: stringOrEmpty(answer?.moduleId),
      moduleVersion: finiteNumberOrNull(answer?.moduleVersion),
      type: stringOrEmpty(answer?.type),
      value: pickedValue,
    };
  });
}

export function m1AdminListItem(record) {
  const canonical = canonicalRecord(record);
  if (!canonical) return null;
  const { submission, resultCard } = canonical;
  const answers = qualitativeAnswers(submission.qualitativeAnswers);
  return {
    submissionId: canonical.submissionId,
    receivedAt: canonical.receivedAt,
    submittedAt: stringOrEmpty(submission.submittedAt),
    locale: stringOrEmpty(submission.locale),
    status: stringOrEmpty(submission.status) || 'unknown',
    participant: {
      codeMasked: maskRespondentCode(submission.participant?.code),
      roleCode: stringOrEmpty(submission.participant?.roleCode),
      experienceCode: stringOrEmpty(submission.participant?.experienceCode),
    },
    progress: {
      answered: finiteNumberOrNull(submission.progress?.answered),
      total: finiteNumberOrNull(submission.progress?.total),
      complete: submission.progress?.complete === true,
    },
    qualitativeAnsweredCount: Object.values(answers).filter((answer) => answer.trim()).length,
    result: resultCard ? {
      topicCount: resultCard.topicCount,
      directLinkCount: resultCard.directLinkCount,
    } : null,
  };
}

export function m1AdminDetail(record) {
  const canonical = canonicalRecord(record);
  if (!canonical) return null;
  const submission = canonical.submission;
  return {
    submissionId: canonical.submissionId,
    receivedAt: canonical.receivedAt,
    schemaVersion: finiteNumberOrNull(submission.schemaVersion),
    studyId: stringOrEmpty(submission.studyId),
    locale: stringOrEmpty(submission.locale),
    submittedAt: stringOrEmpty(submission.submittedAt),
    status: stringOrEmpty(submission.status) || 'unknown',
    collectionMethod: stringOrEmpty(submission.collectionMethod),
    participant: {
      code: stringOrEmpty(submission.participant?.code),
      role: stringOrEmpty(submission.participant?.role),
      roleCode: stringOrEmpty(submission.participant?.roleCode),
      experience: stringOrEmpty(submission.participant?.experience),
      experienceCode: stringOrEmpty(submission.participant?.experienceCode),
    },
    study: {
      title: stringOrEmpty(submission.study?.title),
      scope: stringOrEmpty(submission.study?.scope),
      factorVersion: stringOrEmpty(submission.study?.factorVersion),
      relationDefinition: stringOrEmpty(submission.study?.relationDefinition),
      coding: isObject(submission.study?.coding)
        ? Object.fromEntries(Object.entries(submission.study.coding)
          .filter(([key, value]) => ['V', 'A', 'X', 'O'].includes(key) && typeof value === 'string'))
        : {},
    },
    progress: {
      answered: finiteNumberOrNull(submission.progress?.answered),
      total: finiteNumberOrNull(submission.progress?.total),
      complete: submission.progress?.complete === true,
    },
    qualitativeSectionComplete: submission.qualitativeSectionComplete === true,
    qualitativeAnswers: qualitativeAnswers(submission.qualitativeAnswers),
    questionnaireConfigRevision: finiteNumberOrNull(submission.questionnaireConfigRevision),
    moduleAnswers: pickedModuleAnswers(submission.moduleAnswers),
    confirmedTopics: {
      ids: Array.isArray(submission.confirmedTopics?.ids)
        ? submission.confirmedTopics.ids.filter((id) => typeof id === 'string')
        : [],
      total: finiteNumberOrNull(submission.confirmedTopics?.total),
      complete: submission.confirmedTopics?.complete === true,
    },
    factors: pickedFactors(submission.factors),
    sourceSelections: (Array.isArray(submission.sourceSelections) ? submission.sourceSelections : [])
      .map((selection) => ({
        sourceId: stringOrEmpty(selection?.sourceId),
        targetIds: Array.isArray(selection?.targetIds)
          ? selection.targetIds.filter((id) => typeof id === 'string')
          : [],
        noDirectInfluence: selection?.noDirectInfluence === true,
      })),
    responses: pickedResponses(submission.responses),
    initialReachabilityMatrix: pickedMatrix(submission.initialReachabilityMatrix),
    directInfluenceMatrix: pickedMatrix(submission.directInfluenceMatrix),
    resultCard: canonical.resultCard,
  };
}

export function m1RecordMatches(record, filters = {}, { ignoreStatus = false } = {}) {
  const canonical = canonicalRecord(record);
  if (!canonical) return false;
  const submission = canonical.submission;
  if (filters.locale && submission.locale !== filters.locale) return false;
  if (!ignoreStatus && filters.status && (submission.status || 'unknown') !== filters.status) return false;
  if (filters.from && canonical.receivedAt < filters.from) return false;
  if (filters.to && canonical.receivedAt > filters.to) return false;
  if (filters.q) {
    const needle = filters.q.toLocaleLowerCase('en-US');
    const searchable = [
      canonical.submissionId,
      submission.participant?.code,
      submission.participant?.roleCode,
      submission.participant?.experienceCode,
    ].map(stringOrEmpty).join('\n').toLocaleLowerCase('en-US');
    if (!searchable.includes(needle)) return false;
  }
  return true;
}

function spreadsheetSafe(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  const text = spreadsheetSafe(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function m1AdminCsv(records) {
  const header = [
    'submission_id', 'received_at', 'submitted_at', 'status', 'locale',
    'participant_code', 'role_code', 'experience_code', 'result_version',
    'topic_count', 'direct_link_count', 'questionnaire_config_revision', 'module_answers_json',
    ...QUALITATIVE_IDS.map((id) => `qualitative_${id}`),
    'pair_id', 'left_id', 'left_label', 'right_id', 'right_label', 'relation_code',
    'left_to_right', 'right_to_left', 'note',
  ];
  const rows = [header];
  for (const record of records) {
    const detail = m1AdminDetail(record);
    if (!detail) continue;
    const responses = detail.responses.length ? detail.responses : [{}];
    for (const response of responses) {
      rows.push([
        detail.submissionId,
        detail.receivedAt,
        detail.submittedAt,
        detail.status,
        detail.locale,
        detail.participant.code,
        detail.participant.roleCode,
        detail.participant.experienceCode,
        detail.resultCard?.version,
        detail.resultCard?.topicCount,
        detail.resultCard?.directLinkCount,
        detail.questionnaireConfigRevision,
        JSON.stringify(detail.moduleAnswers),
        ...QUALITATIVE_IDS.map((id) => detail.qualitativeAnswers[id]),
        response.pairId,
        response.leftId,
        response.leftLabel,
        response.rightId,
        response.rightLabel,
        response.relation,
        response.leftToRight,
        response.rightToLeft,
        response.note,
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function aggregateM1AdminCounts(records, filters = {}) {
  const counts = { total: 0, latestReceivedAt: '', byStatus: {}, byLocale: {} };
  for (const record of records) {
    if (!m1RecordMatches(record, filters, { ignoreStatus: true })) continue;
    const canonical = canonicalRecord(record);
    const status = stringOrEmpty(canonical.submission.status) || 'unknown';
    const locale = stringOrEmpty(canonical.submission.locale) || 'unknown';
    counts.total += 1;
    if (canonical.receivedAt > counts.latestReceivedAt) counts.latestReceivedAt = canonical.receivedAt;
    counts.byStatus[status] = (counts.byStatus[status] || 0) + 1;
    counts.byLocale[locale] = (counts.byLocale[locale] || 0) + 1;
  }
  return counts;
}
