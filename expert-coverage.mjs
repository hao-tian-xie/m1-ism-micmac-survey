import { GUIDED_WORDING_VERSION } from './guided-elicitation.mjs';

export function expertCoverage(records, desiredJudgments = 3) {
  if (!Number.isInteger(desiredJudgments) || desiredJudgments < 1) throw new Error('A positive integer judgment target is required.');
  const observations = new Map();
  const identities = new Set();
  let unidentifiedRecords = 0;
  let otherVersionRecords = 0;
  let topicScope;
  const sourceIds = new Set();
  const ordered = records.map((entry, position) => ({ record: entry.submission || entry, position }))
    .sort((a, b) => String(a.record.submittedAt || '').localeCompare(String(b.record.submittedAt || '')) || a.position - b.position);
  for (const { record } of ordered) {
    if (record.wordingVersion !== GUIDED_WORDING_VERSION) { otherVersionRecords++; continue; }
    const scope = record.topicSnapshotId || record.topicSnapshot?.snapshotId || record.topicSnapshot?.revision || record.topicRevision || record.questionnaireConfigRevision || 0;
    if (topicScope !== undefined && topicScope !== scope) throw new Error('Choose one topic revision per coverage report.');
    topicScope = scope;
    const code = record.participant?.code?.trim().toLowerCase();
    if (!code) { unidentifiedRecords++; continue; }
    const factors = record.factors || [];
    const ids = factors.map(factor => factor.id);
    const matrix = record.judgmentStatusMatrix;
    if (!Array.isArray(matrix) || matrix.length !== ids.length || matrix.some(row => !Array.isArray(row) || row.length !== ids.length)) continue;
    identities.add(code); ids.forEach(id => sourceIds.add(id));
    ids.forEach((sourceId, i) => ids.forEach((targetId, j) => {
      const status = matrix[i][j];
      if (i === j || !['support', 'no_support', 'unable', 'unreviewed'].includes(status)) return;
      const key = JSON.stringify([sourceId, targetId]);
      if (!observations.has(key)) observations.set(key, new Map());
      observations.get(key).set(code, status);
    }));
  }
  const directions = [...sourceIds].flatMap(sourceId => [...sourceIds].filter(id => id !== sourceId).map(targetId => {
    const counts = { support: 0, no_support: 0, unable: 0, unreviewed: 0 };
    for (const status of observations.get(JSON.stringify([sourceId, targetId]))?.values() || []) counts[status]++;
    const judged = counts.support + counts.no_support;
    return { sourceId, targetId, ...counts, judged, additionalJudgments: Math.max(0, desiredJudgments - judged), disagreement: counts.support > 0 && counts.no_support > 0 };
  }));
  return { wordingVersion: GUIDED_WORDING_VERSION, topicScope, desiredJudgments, records: records.length, independentCodes: identities.size, unidentifiedRecords, otherVersionRecords,
    directions, followUp: directions.filter(row => row.additionalJudgments > 0 || row.disagreement) };
}
