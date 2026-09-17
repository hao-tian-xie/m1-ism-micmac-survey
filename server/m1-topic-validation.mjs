import { toPublicQuestionnaireConfig } from './question-config-model.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from './m1-default-question-config.mjs';

export const M1_FACTOR_VERSION = 'esrs-set1-subtopics-v2-38-verified';
export const RELATION_DIRECTIONS = Object.freeze({
  V: [1, 0],
  A: [0, 1],
  X: [1, 1],
  O: [0, 0],
});

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function topicFactorIds(value) {
  if (!Array.isArray(value)) return null;
  const ids = value.map((factor) => typeof factor === 'string' ? factor : factor?.id);
  return ids.every((id) => typeof id === 'string') ? ids : null;
}

export function topicFactorIdsMatch(left, right) {
  const leftIds = topicFactorIds(left);
  const rightIds = topicFactorIds(right);
  return Boolean(leftIds && rightIds
    && leftIds.length === rightIds.length
    && leftIds.every((id, index) => id === rightIds[index]));
}

function labelForTopic(topic, locale) {
  const value = topic?.name?.[locale] || topic?.name?.en || topic?.id || '';
  return value.replace(/^ESRS\s+[ESG][1-5]\s*·\s*/u, '');
}

function descriptionForTopic(topic, locale) {
  return topic?.description?.[locale] || topic?.description?.en || '';
}

function topicToFactor(topic, locale) {
  return {
    id: topic.id,
    ...(Array.isArray(topic.sourceIds) ? { sourceIds: [...topic.sourceIds] } : {}),
    ...(topic.category ? { category: topic.category } : {}),
    label: labelForTopic(topic, locale),
    description: descriptionForTopic(topic, locale),
  };
}

function pairsForIds(ids) {
  return ids.flatMap((leftId, leftIndex) => ids.slice(leftIndex + 1).map((rightId) => ({
    pairId: `${leftId}__${rightId}`,
    leftId,
    rightId,
  })));
}

function snapshotIdForContext(context) {
  let hash = 2166136261;
  for (const id of context.ids) {
    for (const character of id) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 0;
    hash = Math.imul(hash, 16777619);
  }
  return `M1-ESG-ISM-MICMAC:topics:${context.revision}:${(hash >>> 0).toString(36)}`;
}

function snapshotTopics(snapshot) {
  const value = Array.isArray(snapshot?.topics) && snapshot.topics.length
    ? snapshot
    : M1_DEFAULT_QUESTIONNAIRE_CONFIG;
  try {
    return toPublicQuestionnaireConfig({
      schemaVersion: value.schemaVersion,
      questionnaireId: value.questionnaireId,
      modules: value.modules || [],
      topics: value.topics,
      revision: Number.isSafeInteger(snapshot?.revision) ? snapshot.revision : 0,
    }).topics;
  } catch {
    return [];
  }
}

export function buildM1TopicContext(snapshot, locale = 'en') {
  const topics = snapshotTopics(snapshot);
  const factors = topics.map((topic) => topicToFactor(topic, locale));
  const ids = factors.map((factor) => factor.id);
  return {
    revision: Number.isSafeInteger(snapshot?.revision) ? snapshot.revision : 0,
    topics,
    factors,
    ids,
    pairs: pairsForIds(ids),
  };
}

export function legacyM1TopicContext(locale = 'en') {
  return buildM1TopicContext({ ...M1_DEFAULT_QUESTIONNAIRE_CONFIG, revision: 0 }, locale);
}

export async function resolveM1TopicContext(submission, questionStore) {
  const hasRevision = Object.prototype.hasOwnProperty.call(submission || {}, 'questionnaireConfigRevision');
  if (!hasRevision) return legacyM1TopicContext(submission?.locale || 'en');
  if (!Number.isSafeInteger(submission.questionnaireConfigRevision)
    || submission.questionnaireConfigRevision < 0
    || !questionStore || typeof questionStore.readRevision !== 'function') return null;
  let snapshot;
  try {
    snapshot = await questionStore.readRevision(submission.questionnaireConfigRevision);
  } catch {
    return null;
  }
  if (!snapshot || snapshot.revision !== submission.questionnaireConfigRevision) return null;
  const context = buildM1TopicContext(snapshot, submission.locale || 'en');
  return context.ids.length >= 2 ? context : null;
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

function topicSnapshotMatches(value, context) {
  if (value === undefined) return true;
  if (!isObject(value)) return false;
  if (value.revision !== undefined && value.revision !== context.revision) return false;
  if (value.questionnaireConfigRevision !== undefined
    && value.questionnaireConfigRevision !== context.revision) return false;
  const ids = value.ids === undefined ? value.topicIds : value.ids;
  if (ids !== undefined && (!Array.isArray(ids)
    || ids.length !== context.ids.length
    || ids.some((id, index) => id !== context.ids[index]))) return false;
  if (value.topicIds !== undefined && (!Array.isArray(value.topicIds)
    || value.topicIds.length !== context.ids.length
    || value.topicIds.some((id, index) => id !== context.ids[index]))) return false;
  if (value.count !== undefined && value.count !== context.ids.length) return false;
  if (value.snapshotId !== undefined
    && (typeof value.snapshotId !== 'string'
      || value.snapshotId !== snapshotIdForContext(context))) return false;
  return true;
}

function topLevelTopicSnapshotMatches(record, context) {
  if (record.topicRevision !== undefined && record.topicRevision !== context.revision) return false;
  if (record.topicSnapshotId !== undefined
    && (typeof record.topicSnapshotId !== 'string'
      || record.topicSnapshotId !== snapshotIdForContext(context))) return false;
  if (record.topicIds !== undefined && (!Array.isArray(record.topicIds)
    || record.topicIds.length !== context.ids.length
    || record.topicIds.some((id, index) => id !== context.ids[index]))) return false;
  return true;
}

export function canonicalTopicSnapshot(context) {
  return {
    revision: context.revision,
    ids: [...context.ids],
    count: context.ids.length,
  };
}

// Validates the topic-dependent part of a final submission. This function only
// uses the immutable context passed by resolveM1TopicContext; callers must not
// substitute the current public configuration for a historical revision.
export function validateM1TopicSubmission(record, context) {
  if (!context || context.ids.length < 2) return 'invalid-topics';
  const ids = context.ids;
  const pairs = context.pairs;
  const pairCount = pairs.length;
  if (record.progress?.answered !== pairCount
    || record.progress?.total !== pairCount
    || record.progress?.complete !== true) {
    return 'invalid-progress';
  }
  if (!Array.isArray(record.factors)
    || record.factors.length !== ids.length
    || !record.factors.every((factor, index) => factor?.id === ids[index])) return 'invalid-factors';
  if (!Array.isArray(record.responses) || record.responses.length !== pairCount) return 'incomplete-responses';
  if (!isObject(record.confirmedTopics)
    || !Array.isArray(record.confirmedTopics.ids)
    || record.confirmedTopics.ids.length !== ids.length
    || record.confirmedTopics.total !== ids.length
    || record.confirmedTopics.complete !== true
    || record.confirmedTopics.ids.some((id, index) => id !== ids[index])) return 'invalid-topics';
  if (!Array.isArray(record.sourceSelections) || record.sourceSelections.length !== ids.length
    || record.sourceSelections.some((selection, index) => selection?.sourceId !== ids[index])) return 'invalid-selections';
  if (!topicSnapshotMatches(record.topicSnapshot, context)
    || !topLevelTopicSnapshotMatches(record, context)) return 'invalid-topic-snapshot';

  const responses = new Map(record.responses.map((response) => [response?.pairId, response]));
  if (responses.size !== pairCount) return 'invalid-response';
  const directMatrix = ids.map(() => ids.map(() => 0));
  const factorIndex = new Map(ids.map((id, index) => [id, index]));
  for (const pair of pairs) {
    const response = responses.get(pair.pairId);
    const directions = RELATION_DIRECTIONS[response?.relation];
    if (!isObject(response)
      || response.leftId !== pair.leftId
      || response.rightId !== pair.rightId
      || !directions
      || response.leftToRight !== directions[0]
      || response.rightToLeft !== directions[1]) return 'invalid-response';
    directMatrix[factorIndex.get(pair.leftId)][factorIndex.get(pair.rightId)] = directions[0];
    directMatrix[factorIndex.get(pair.rightId)][factorIndex.get(pair.leftId)] = directions[1];
  }
  const expectedReachabilityMatrix = directMatrix.map((row, rowIndex) => (
    row.map((value, columnIndex) => (rowIndex === columnIndex ? 1 : value))
  ));
  if (!matrixMatches(record.directInfluenceMatrix, directMatrix)
    || !matrixMatches(record.initialReachabilityMatrix, expectedReachabilityMatrix)) return 'invalid-matrix';
  for (const [index, selection] of record.sourceSelections.entries()) {
    const expectedTargets = ids.filter((_, targetIndex) => (
      targetIndex !== index && directMatrix[index][targetIndex] === 1
    ));
    if (!isObject(selection)
      || typeof selection.noDirectInfluence !== 'boolean'
      || !Array.isArray(selection.targetIds)
      || selection.targetIds.length !== expectedTargets.length
      || expectedTargets.some((id, targetIndex) => selection.targetIds[targetIndex] !== id)
      || selection.noDirectInfluence !== (expectedTargets.length === 0)) return 'invalid-selections';
  }
  return null;
}

export function canonicalizeM1TopicFields(record, context) {
  const next = { ...record };
  // Topic labels/descriptions are configuration data, not participant input.
  // Persist only the immutable ids; result cards and exports resolve labels
  // from the historical config revision held by the caller.
  next.factors = context.ids.map((id) => ({ id }));
  const canonical = canonicalTopicSnapshot(context);
  canonical.snapshotId = snapshotIdForContext(context);
  canonical.questionnaireConfigRevision = context.revision;
  canonical.topicIds = [...context.ids];
  next.topicSnapshot = canonical;
  next.topicRevision = context.revision;
  next.topicIds = [...context.ids];
  if (canonical.snapshotId) next.topicSnapshotId = canonical.snapshotId;
  return next;
}

export function directMatrixForM1Submission(record, context) {
  const ids = context.ids;
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const matrix = ids.map(() => ids.map(() => 0));
  for (const response of record.responses || []) {
    const directions = RELATION_DIRECTIONS[response?.relation];
    const left = indexById.get(response?.leftId);
    const right = indexById.get(response?.rightId);
    if (directions && left !== undefined && right !== undefined) {
      matrix[left][right] = directions[0];
      matrix[right][left] = directions[1];
    }
  }
  return matrix;
}
