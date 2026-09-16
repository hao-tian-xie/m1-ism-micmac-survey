import {
  M1_ADMIN_PERMISSIONS,
  M1AdminExportLimitError,
  M1AdminQueryError,
  m1AdminCsv,
  m1AdminDetail,
  m1AdminListItem,
  parseM1AdminQuery,
  validateM1SubmissionId,
} from './m1-admin-core.mjs';

const DEFAULT_MAX_EXPORT_SUBMISSIONS = 100;

function jsonResponse(value, status = 200, headers = {}) {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}

function errorResponse(error) {
  if (error instanceof M1AdminQueryError) {
    return jsonResponse({ error: 'invalid-query', field: error.field, message: error.message }, 400);
  }
  if (error instanceof M1AdminExportLimitError) {
    return jsonResponse({ error: 'export-limit', limit: error.limit, message: error.message }, 413);
  }
  return jsonResponse({ error: 'admin-request-failed' }, 500);
}

export function createM1AdminService({ repository, maxExportSubmissions = DEFAULT_MAX_EXPORT_SUBMISSIONS }) {
  if (!repository || typeof repository.list !== 'function'
    || typeof repository.getById !== 'function'
    || typeof repository.counts !== 'function'
    || typeof repository.exportRecords !== 'function') {
    throw new TypeError('A complete M1 admin repository is required');
  }
  if (!Number.isSafeInteger(maxExportSubmissions) || maxExportSubmissions < 1 || maxExportSubmissions > 1_000) {
    throw new TypeError('maxExportSubmissions must be an integer between 1 and 1000');
  }
  return {
    async list(query) {
      const offset = (query.page - 1) * query.pageSize;
      const result = await repository.list(query, { limit: query.pageSize, offset });
      const items = result.records.map(m1AdminListItem).filter(Boolean);
      return {
        items,
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: result.total ? Math.ceil(result.total / query.pageSize) : 0,
        generatedAt: new Date().toISOString(),
      };
    },
    async detail(submissionId) {
      const record = await repository.getById(submissionId);
      return record ? m1AdminDetail(record) : null;
    },
    async counts(filters) {
      return {
        ...await repository.counts(filters),
        generatedAt: new Date().toISOString(),
      };
    },
    async exportCsv(filters) {
      const records = await repository.exportRecords(filters, maxExportSubmissions + 1);
      if (records.length > maxExportSubmissions) {
        throw new M1AdminExportLimitError(maxExportSubmissions);
      }
      return m1AdminCsv(records);
    },
  };
}

export function createM1AdminEndpointHandlers({
  repository,
  authorize,
  maxExportSubmissions = DEFAULT_MAX_EXPORT_SUBMISSIONS,
} = {}) {
  if (typeof authorize !== 'function') {
    throw new TypeError('An authorize(request, permission) callback is required');
  }
  const service = createM1AdminService({ repository, maxExportSubmissions });

  async function authorized(request, permission, action) {
    try {
      if (!await authorize(request, permission)) {
        return jsonResponse({ error: 'authentication-required' }, 401);
      }
      return await action();
    } catch (error) {
      return errorResponse(error);
    }
  }

  return Object.freeze({
    list(request) {
      return authorized(request, M1_ADMIN_PERMISSIONS.list, async () => {
        const query = parseM1AdminQuery(request.url);
        return jsonResponse(await service.list(query));
      });
    },
    detail(request, submissionId) {
      return authorized(request, M1_ADMIN_PERMISSIONS.detail, async () => {
        const id = validateM1SubmissionId(submissionId);
        const detail = await service.detail(id);
        return detail
          ? jsonResponse(detail)
          : jsonResponse({ error: 'submission-not-found' }, 404);
      });
    },
    counts(request) {
      return authorized(request, M1_ADMIN_PERMISSIONS.counts, async () => {
        const filters = parseM1AdminQuery(request.url, { paginate: false });
        return jsonResponse(await service.counts(filters));
      });
    },
    exportCsv(request) {
      return authorized(request, M1_ADMIN_PERMISSIONS.export, async () => {
        const filters = parseM1AdminQuery(request.url, { paginate: false });
        const csv = await service.exportCsv(filters);
        const stamp = new Date().toISOString().slice(0, 10);
        return new Response(csv, {
          status: 200,
          headers: {
            'cache-control': 'no-store',
            'content-disposition': `attachment; filename="m1-submissions-${stamp}.csv"`,
            'content-type': 'text/csv; charset=utf-8',
            'x-content-type-options': 'nosniff',
          },
        });
      });
    },
  });
}
