import { createM1SubmissionStore } from './m1-submission-store.mjs';
import {
  aggregateM1AdminCounts,
  m1RecordMatches,
} from './m1-admin-core.mjs';

async function readExportedRecords(store) {
  const exported = await store.openExport();
  if (!exported.stream) return [];
  let pending = '';
  const records = [];
  for await (const chunk of exported.stream) {
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) records.push(JSON.parse(line));
    }
  }
  if (pending.trim()) records.push(JSON.parse(pending));
  return records;
}

export function createM1FileAdminRepository(options = {}) {
  const store = createM1SubmissionStore(options);
  async function matching(filters, { ignoreStatus = false } = {}) {
    const records = await readExportedRecords(store);
    return records
      .filter((record) => m1RecordMatches(record, filters, { ignoreStatus }))
      .sort((left, right) => String(right.receivedAt || '').localeCompare(String(left.receivedAt || '')));
  }
  return Object.freeze({
    async list(filters, { limit, offset }) {
      const records = await matching(filters);
      return { records: records.slice(offset, offset + limit), total: records.length };
    },
    async getById(submissionId) {
      const records = await readExportedRecords(store);
      return records.find((record) => record?.submissionId === submissionId) || null;
    },
    async counts(filters) {
      return aggregateM1AdminCounts(await readExportedRecords(store), filters);
    },
    async exportRecords(filters, limit) {
      return (await matching(filters)).slice(0, limit);
    },
  });
}

export { createM1AdminEndpointHandlers, createM1AdminService } from './m1-admin-api.mjs';
export { M1_ADMIN_PERMISSIONS } from './m1-admin-core.mjs';
