// vt3 observations are directional. Missing judgments never become zeros.
export const EXPERT_PROTOCOL_VERSION = 'vt3';
export const ASSIGNMENT_PLAN_ID = 'vt3-balanced-12-v1';
export const GROUP_REVIEW_STATES = Object.freeze(['reviewed', 'unable', 'unreviewed']);
export const SOURCE_STATES = Object.freeze(['selected', 'none', 'unable']);
export const REVERSE_STATES = Object.freeze(['not_asked', 'support', 'no_support', 'unable']);

export function topicGroup(factor) {
  return factor.category || 'other';
}

export function targetGroups(factors, sourceId) {
  return [...new Set(factors.filter((factor) => factor.id !== sourceId).map(topicGroup))];
}

export function balancedSourceOrder(factors) {
  const groups = [...new Set(factors.map(topicGroup))];
  return groups.flatMap((group, groupIndex) => {
    const members = factors.filter((factor) => topicGroup(factor) === group);
    return members.map((factor, index) => ({
      id: factor.id, position: (index + 0.5) / members.length, groupIndex,
    }));
  }).sort((a, b) => a.position - b.position || a.groupIndex - b.groupIndex).map(({ id }) => id);
}

export function sourceAssignment(factors, batch) {
  if (!Number.isInteger(batch) || batch < 1 || batch > 10) return null;
  const order = balancedSourceOrder(factors);
  const count = Math.min(12, order.length);
  return {
    planId: ASSIGNMENT_PLAN_ID,
    batch,
    sourceIds: Array.from({ length: count }, (_, index) => order[((batch - 1) * count + index) % order.length]),
  };
}

export function blankSourceJudgment(factors, sourceId) {
  return {
    sourceId,
    status: '',
    targetIds: [],
    groupReviews: Object.fromEntries(targetGroups(factors, sourceId).map((group) => [group, ''])),
  };
}

export function sourceJudgmentError(row, factors) {
  const ids = factors.map(({ id }) => id);
  if (!row || !ids.includes(row.sourceId) || !SOURCE_STATES.includes(row.status)) return 'source-status';
  const groups = targetGroups(factors, row.sourceId);
  if (!row.groupReviews || Object.keys(row.groupReviews).length !== groups.length
    || groups.some((group) => !GROUP_REVIEW_STATES.includes(row.groupReviews[group]))) return 'group-review';
  const targets = row.targetIds;
  if (!Array.isArray(targets) || targets.some((id) => id === row.sourceId || !ids.includes(id))
    || targets.length !== new Set(targets).size) return 'targets';
  const orderedTargets = ids.filter((id) => targets.includes(id));
  if (targets.some((id, index) => id !== orderedTargets[index])) return 'targets';
  if (row.status === 'selected' && !targets.length) return 'select-target';
  if (row.status === 'none' && (targets.length || !groups.some((group) => row.groupReviews[group] === 'reviewed'))) return 'none-scope';
  if (row.status === 'unable' && (targets.length || groups.some((group) => row.groupReviews[group] !== 'unable'))) return 'unable-scope';
  if (row.explanation !== undefined) {
    const explanation = row.explanation;
    if (!explanation || !targets.includes(explanation.targetId)
      || typeof explanation.note !== 'string' || explanation.note.length > 800
      || !REVERSE_STATES.includes(explanation.reverse)) return 'explanation';
  }
  return null;
}

export function expertMatrices(factors, rows = []) {
  const ids = factors.map(({ id }) => id);
  const rowById = new Map(rows.map((row) => [row.sourceId, row]));
  const directInfluenceMatrix = ids.map(() => ids.map(() => null));
  const judgmentStatusMatrix = ids.map((sourceId, sourceIndex) => ids.map((targetId, targetIndex) => {
    if (sourceIndex === targetIndex) {
      directInfluenceMatrix[sourceIndex][targetIndex] = 0;
      return 'self';
    }
    const row = rowById.get(sourceId);
    if (!row) return 'unassigned';
    const group = topicGroup(factors[targetIndex]);
    const review = row.groupReviews?.[group];
    if (row.status !== 'unable' && row.targetIds.includes(targetId)) { directInfluenceMatrix[sourceIndex][targetIndex] = 1; return 'support'; }
    if (row.status === 'unable' || review === 'unable') return 'unable';
    if (review !== 'reviewed') return 'unreviewed';
    const selected = row.targetIds.includes(targetId);
    directInfluenceMatrix[sourceIndex][targetIndex] = selected ? 1 : 0;
    return selected ? 'support' : 'no_support';
  }));
  for (const row of rows) {
    const explanation = row.explanation;
    if (!explanation || explanation.reverse === 'not_asked') continue;
    const from = ids.indexOf(explanation.targetId);
    const to = ids.indexOf(row.sourceId);
    if (from < 0 || to < 0) throw new Error('explanation');
    const value = explanation.reverse === 'support' ? 1 : explanation.reverse === 'no_support' ? 0 : null;
    const current = directInfluenceMatrix[from][to];
    if (value !== null && current !== null && current !== value) throw new Error('reverse-conflict');
    // A follow-up may add an explicit reverse judgment to an uncovered cell.
    // An uncertain follow-up cannot erase an already confirmed judgment.
    if (current === null) {
      directInfluenceMatrix[from][to] = value;
      judgmentStatusMatrix[from][to] = explanation.reverse;
    }
  }
  const responses = [];
  const codes = { '1,0': 'V', '0,1': 'A', '1,1': 'X', '0,0': 'O' };
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      const forward = directInfluenceMatrix[left][right];
      const reverse = directInfluenceMatrix[right][left];
      responses.push({
        pairId: `${ids[left]}__${ids[right]}`,
        leftId: ids[left], rightId: ids[right],
        relation: forward === null || reverse === null ? null : codes[`${forward},${reverse}`],
        leftToRight: forward, rightToLeft: reverse,
      });
    }
  }
  const coverage = { support: 0, no_support: 0, unable: 0, unreviewed: 0, unassigned: 0 };
  judgmentStatusMatrix.flat().forEach((status) => { if (status !== 'self') coverage[status] += 1; });
  coverage.judged = coverage.support + coverage.no_support;
  coverage.total = ids.length * (ids.length - 1);
  return {
    responses, directInfluenceMatrix, judgmentStatusMatrix, coverage,
    initialReachabilityMatrix: directInfluenceMatrix.map((row, i) => row.map((value, j) => i === j ? 1 : value)),
  };
}

export function expertSubmissionFields({ factors, assignment, sourceSelections }) {
  return {
    protocolVersion: EXPERT_PROTOCOL_VERSION,
    wordingVersion: 'vt3-20261023',
    assignment,
    sourceSelections,
    confirmedTopics: { ids: assignment.sourceIds, total: assignment.sourceIds.length, complete: true },
    progress: { answered: sourceSelections.length, total: assignment.sourceIds.length, complete: true, unit: 'source-tasks' },
    ...expertMatrices(factors, sourceSelections),
  };
}

function sameValue(left, right) {
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, i) => sameValue(value, right[i]));
  if (left && typeof left === 'object') {
    return right && typeof right === 'object' && !Array.isArray(right)
      && Object.keys(left).length === Object.keys(right).length
      && Object.keys(left).every((key) => sameValue(left[key], right[key]));
  }
  return left === right;
}

export function validateExpertSubmission(record, factors) {
  if (record.protocolVersion !== EXPERT_PROTOCOL_VERSION || record.wordingVersion !== 'vt3-20261023') return 'invalid-protocol';
  const assignment = sourceAssignment(factors, record.assignment?.batch);
  if (!assignment || !sameValue(assignment, record.assignment)) return 'invalid-assignment';
  if (record.presentationOrder !== undefined && (!Array.isArray(record.presentationOrder) || record.presentationOrder.length !== assignment.sourceIds.length || new Set(record.presentationOrder).size !== assignment.sourceIds.length || record.presentationOrder.some((id) => !assignment.sourceIds.includes(id)))) return 'invalid-presentation-order';
  const rows = record.sourceSelections;
  if (!Array.isArray(rows) || rows.length !== assignment.sourceIds.length
    || rows.some((row, i) => row?.sourceId !== assignment.sourceIds[i])) return 'invalid-source-tasks';
  for (const row of rows) {
    const error = sourceJudgmentError(row, factors);
    if (error) return `invalid-${error}`;
    const allowedKeys = ['sourceId', 'status', 'targetIds', 'groupReviews', 'explanation'];
    if (Object.keys(row).some((key) => !allowedKeys.includes(key))) return 'invalid-source-fields';
    if (row.explanation && Object.keys(row.explanation).some((key) => !['targetId', 'note', 'reverse'].includes(key))) return 'invalid-explanation';
  }
  let expected;
  try { expected = expertSubmissionFields({ factors, assignment, sourceSelections: rows }); }
  catch (error) { return error.message; }
  for (const key of ['responses', 'directInfluenceMatrix', 'initialReachabilityMatrix', 'judgmentStatusMatrix', 'coverage', 'progress', 'confirmedTopics']) {
    if (['responses', 'directInfluenceMatrix', 'initialReachabilityMatrix', 'judgmentStatusMatrix'].includes(key) && record[key] === undefined) continue;
    if (!sameValue(expected[key], record[key])) return `invalid-${key}`;
  }
  return null;
}
