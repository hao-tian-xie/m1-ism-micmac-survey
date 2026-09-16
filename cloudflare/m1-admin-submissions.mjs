const STATUS_EXPRESSION = `COALESCE(
  json_extract(record_json, '$.submission.status'),
  json_extract(record_json, '$.status'),
  'unknown'
)`;
const LOCALE_EXPRESSION = `COALESCE(
  json_extract(record_json, '$.submission.locale'),
  json_extract(record_json, '$.locale'),
  'unknown'
)`;
const PARTICIPANT_CODE_EXPRESSION = `COALESCE(
  json_extract(record_json, '$.submission.participant.code'),
  json_extract(record_json, '$.participant.code'),
  ''
)`;
const ROLE_CODE_EXPRESSION = `COALESCE(
  json_extract(record_json, '$.submission.participant.roleCode'),
  json_extract(record_json, '$.participant.roleCode'),
  ''
)`;
const EXPERIENCE_CODE_EXPRESSION = `COALESCE(
  json_extract(record_json, '$.submission.participant.experienceCode'),
  json_extract(record_json, '$.participant.experienceCode'),
  ''
)`;

function likePattern(value) {
  return `%${String(value).replace(/[\\%_]/g, '\\$&')}%`;
}

function whereClause(filters, { ignoreStatus = false } = {}) {
  const clauses = [];
  const values = [];
  if (filters.q) {
    clauses.push(`(
      lower(submission_id) LIKE lower(?) ESCAPE '\\'
      OR lower(${PARTICIPANT_CODE_EXPRESSION}) LIKE lower(?) ESCAPE '\\'
      OR lower(${ROLE_CODE_EXPRESSION}) LIKE lower(?) ESCAPE '\\'
      OR lower(${EXPERIENCE_CODE_EXPRESSION}) LIKE lower(?) ESCAPE '\\'
    )`);
    const pattern = likePattern(filters.q);
    values.push(pattern, pattern, pattern, pattern);
  }
  if (filters.locale) {
    clauses.push(`${LOCALE_EXPRESSION} = ?`);
    values.push(filters.locale);
  }
  if (!ignoreStatus && filters.status) {
    clauses.push(`${STATUS_EXPRESSION} = ?`);
    values.push(filters.status);
  }
  if (filters.from) {
    clauses.push('received_at >= ?');
    values.push(filters.from);
  }
  if (filters.to) {
    clauses.push('received_at <= ?');
    values.push(filters.to);
  }
  return {
    sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

function prepared(db, sql, values) {
  return db.prepare(sql).bind(...values);
}

function parseStoredRow(row) {
  if (!row || typeof row.record_json !== 'string') {
    throw new Error('Submission row is missing record_json');
  }
  const stored = JSON.parse(row.record_json);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new Error('Submission row has invalid record_json');
  }
  if (stored.submission && typeof stored.submission === 'object' && !Array.isArray(stored.submission)) {
    return {
      ...stored,
      submissionId: String(row.submission_id || stored.submissionId || ''),
      receivedAt: String(row.received_at || stored.receivedAt || ''),
    };
  }
  return {
    submissionId: String(row.submission_id || ''),
    receivedAt: String(row.received_at || ''),
    resultCard: stored.resultCard || stored.m1FrozenResult || null,
    submission: stored,
  };
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export function createM1D1AdminRepository(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new TypeError('A D1 database binding is required');
  }
  return Object.freeze({
    async list(filters, { limit, offset }) {
      const where = whereClause(filters);
      const [rowsResult, countResult] = await db.batch([
        prepared(db, `SELECT submission_id, received_at, record_json
          FROM submissions${where.sql}
          ORDER BY received_at DESC, submission_id DESC
          LIMIT ? OFFSET ?`, [...where.values, limit, offset]),
        prepared(db, `SELECT COUNT(*) AS total, COALESCE(MAX(received_at), '') AS latest_received_at
          FROM submissions${where.sql}`, where.values),
      ]);
      const total = Number(rowsOf(countResult)[0]?.total || 0);
      return { records: rowsOf(rowsResult).map(parseStoredRow), total };
    },

    async getById(submissionId) {
      const row = await db.prepare(
        `SELECT submission_id, received_at, record_json
         FROM submissions WHERE submission_id = ? LIMIT 1`,
      ).bind(submissionId).first();
      return row ? parseStoredRow(row) : null;
    },

    async counts(filters) {
      const where = whereClause(filters, { ignoreStatus: true });
      const [totalResult, statusResult, localeResult] = await db.batch([
        prepared(db, `SELECT COUNT(*) AS total, COALESCE(MAX(received_at), '') AS latest_received_at
          FROM submissions${where.sql}`, where.values),
        prepared(db, `SELECT ${STATUS_EXPRESSION} AS value, COUNT(*) AS count
          FROM submissions${where.sql}
          GROUP BY ${STATUS_EXPRESSION}
          ORDER BY value ASC`, where.values),
        prepared(db, `SELECT ${LOCALE_EXPRESSION} AS value, COUNT(*) AS count
          FROM submissions${where.sql}
          GROUP BY ${LOCALE_EXPRESSION}
          ORDER BY value ASC`, where.values),
      ]);
      return {
        total: Number(rowsOf(totalResult)[0]?.total || 0),
        latestReceivedAt: String(rowsOf(totalResult)[0]?.latest_received_at || ''),
        byStatus: Object.fromEntries(rowsOf(statusResult)
          .map((row) => [String(row.value || 'unknown'), Number(row.count || 0)])),
        byLocale: Object.fromEntries(rowsOf(localeResult)
          .map((row) => [String(row.value || 'unknown'), Number(row.count || 0)])),
      };
    },

    async exportRecords(filters, limit) {
      const where = whereClause(filters);
      const result = await prepared(db, `SELECT submission_id, received_at, record_json
        FROM submissions${where.sql}
        ORDER BY received_at DESC, submission_id DESC
        LIMIT ?`, [...where.values, limit]).all();
      return rowsOf(result).map(parseStoredRow);
    },
  });
}
