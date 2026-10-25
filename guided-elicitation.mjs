export const GUIDED_WORDING_VERSION = 'vt3-guided-20261025';
export const GUIDED_PLAN_ID = 'vt3-background-overlap-v2';
export const TARGET_STATES = Object.freeze(['support', 'no_support', 'unable', 'unreviewed']);
export const ASSIGNMENT_FOCI = Object.freeze(['balanced', 'environment', 'social', 'governance']);
export const TASK_COUNTS = Object.freeze([8, 10, 12]);

export function blankGuidedSource(factors, sourceId) {
  return syncGuidedRow(factors, {
    sourceId, freeRecall: '', recallStatus: '',
    targetReviews: Object.fromEntries(factors.filter(({ id }) => id !== sourceId).map(({ id }) => [id, 'unreviewed'])),
  });
}

export function syncGuidedRow(factors, row) {
  const targets = factors.filter(({ id }) => id !== row.sourceId);
  const targetIds = targets.filter(({ id }) => row.targetReviews[id] === 'support').map(({ id }) => id);
  const values = targets.map(({ id }) => row.targetReviews[id]);
  const status = targetIds.length ? 'selected' : values.includes('no_support') ? 'none'
    : values.every((value) => value === 'unable') ? 'unable' : 'partial';
  const groups = [...new Set(targets.map(({ category }) => category || 'other'))];
  const groupReviews = Object.fromEntries(groups.map((group) => {
    const states = targets.filter((factor) => (factor.category || 'other') === group).map(({ id }) => row.targetReviews[id]);
    return [group, states.includes('unreviewed') ? 'unreviewed' : states.includes('unable') ? 'unable' : 'reviewed'];
  }));
  return { ...row, status, targetIds, groupReviews };
}

export function setTargetReview(factors, row, targetId, value) {
  if (!TARGET_STATES.includes(value) || !Object.hasOwn(row.targetReviews, targetId)) return row;
  const next = { ...row, targetReviews: { ...row.targetReviews, [targetId]: value } };
  if (next.explanation?.targetId === targetId) delete next.explanation;
  return syncGuidedRow(factors, next);
}

export function guidedCounts(row) {
  const counts = { support: 0, no_support: 0, unable: 0, unreviewed: 0 };
  for (const status of Object.values(row.targetReviews || {})) if (Object.hasOwn(counts, status)) counts[status] += 1;
  return counts;
}

function rotate(items, offset) {
  if (!items.length) return [];
  const start = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

export function targetPages(factors, sourceId, batch = 1) {
  const sourceIndex = factors.findIndex(({ id }) => id === sourceId);
  const seed = sourceIndex + batch - 1;
  const targets = factors.filter(({ id }) => id !== sourceId);
  const groups = rotate([...new Set(targets.map(({ category }) => category || 'other'))], seed);
  return groups.flatMap((group) => {
    const members = rotate(targets.filter((factor) => (factor.category || 'other') === group), seed);
    const pageCount = Math.ceil(members.length / 7);
    const size = Math.ceil(members.length / pageCount);
    return Array.from({ length: pageCount }, (_, index) => ({
      group, ids: members.slice(index * size, (index + 1) * size).map(({ id }) => id),
    }));
  });
}

export function guidedAssignment(factors, batch, options, balancedOrder) {
  const { focus = 'balanced', taskCount = 12 } = options;
  if (!ASSIGNMENT_FOCI.includes(focus) || !TASK_COUNTS.includes(taskCount)) return null;
  const count = Math.min(taskCount, factors.length);
  let sourceIds;
  if (focus === 'balanced' || !factors.some((factor) => factor.category === focus)) {
    sourceIds = rotate(balancedOrder, (batch - 1) * count).slice(0, count);
  } else {
    const byId = new Map(factors.map((factor) => [factor.id, factor]));
    const primary = balancedOrder.filter((id) => byId.get(id).category === focus);
    const cross = balancedOrder.filter((id) => byId.get(id).category !== focus);
    const primaryCount = Math.min(primary.length, Math.ceil(count * .6));
    const crossCount = Math.min(cross.length, count - primaryCount);
    const chosenPrimary = rotate(primary, (batch - 1) * primaryCount).slice(0, count - crossCount);
    const chosenCross = rotate(cross, (batch - 1) * Math.max(1, crossCount)).slice(0, crossCount);
    sourceIds = [...chosenPrimary.map((id, i) => ({ id, at: (i + .5) / chosenPrimary.length })),
      ...chosenCross.map((id, i) => ({ id, at: (i + .5) / chosenCross.length }))]
      .sort((a, b) => a.at - b.at).map(({ id }) => id);
  }
  return { planId: GUIDED_PLAN_ID, batch, focus, taskCount, sourceIds };
}

export function guidedRowError(row, factors) {
  const targetIds = factors.filter(({ id }) => id !== row.sourceId).map(({ id }) => id);
  if (!row.targetReviews || typeof row.targetReviews !== 'object' || Array.isArray(row.targetReviews)
    || Object.keys(row.targetReviews).length !== targetIds.length
    || targetIds.some((id) => !TARGET_STATES.includes(row.targetReviews[id]))) return 'target-reviews';
  if (typeof row.freeRecall !== 'string' || row.freeRecall.length > 1200
    || !['recorded', 'skipped'].includes(row.recallStatus)
    || (row.recallStatus === 'recorded') !== Boolean(row.freeRecall.trim())) return 'recall';
  const synced = syncGuidedRow(factors, row);
  if (row.status !== synced.status || JSON.stringify(row.targetIds) !== JSON.stringify(synced.targetIds)
    || Object.keys(row.groupReviews || {}).length !== Object.keys(synced.groupReviews).length
    || Object.entries(synced.groupReviews).some(([key, value]) => row.groupReviews?.[key] !== value)) return 'target-reviews';
  if (row.explanation !== undefined) {
    const explanation = row.explanation;
    if (!explanation || typeof explanation !== 'object' || Array.isArray(explanation)
      || !targetIds.includes(explanation.targetId)
      || typeof explanation.note !== 'string' || explanation.note.length > 800
      || !['not_asked', 'support', 'no_support', 'unable'].includes(explanation.reverse)
      || !['direct', 'via', 'unclear'].includes(explanation.linkType)
      || typeof explanation.viaId !== 'string'
      || Object.keys(explanation).some((key) => !['targetId', 'note', 'reverse', 'linkType', 'viaId'].includes(key))) return 'explanation';
    const status = { direct: 'support', via: 'no_support', unclear: 'unable' }[explanation.linkType];
    if (row.targetReviews[explanation.targetId] !== status) return 'pathway';
    if (explanation.linkType === 'via' && (!targetIds.includes(explanation.viaId) || explanation.viaId === explanation.targetId)) return 'pathway';
    if (explanation.linkType !== 'via' && explanation.viaId !== '') return 'pathway';
  }
  return null;
}

export function checkpointPositions(total) {
  return [...new Set([Math.ceil(total / 3), Math.ceil(2 * total / 3)])].filter((n) => n > 0 && n < total);
}
