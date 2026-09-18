export function clampIndex(index, total) {
  const lastIndex = Math.max(0, Number(total) - 1);
  return Math.min(Math.max(Number.isInteger(index) ? index : 0, 0), lastIndex);
}

export function advanceBeforeTopicQuestion({ index, total }) {
  const currentIndex = clampIndex(index, total);
  const lastIndex = Math.max(0, Number(total) - 1);
  if (currentIndex < lastIndex) {
    return { screen: 'qualitative', index: currentIndex + 1, complete: false };
  }
  return { screen: 'survey', index: currentIndex, complete: true };
}

export function previousBeforeTopicQuestion(index) {
  if (Number.isInteger(index) && index > 0) {
    return { screen: 'qualitative', index: index - 1 };
  }
  return { screen: 'profile', index: 0 };
}

export function previousAfterTopicQuestion(index) {
  if (Number.isInteger(index) && index > 0) {
    return { screen: 'complete', index: index - 1 };
  }
  return { screen: 'survey', index: 0 };
}

export function confirmTopicTransition({
  currentIndex,
  total,
  hasAfterTopics,
  reviewedIds = [],
  currentId,
  isLastTopic,
}) {
  const index = clampIndex(currentIndex, total);
  const reviewed = [...new Set(Array.isArray(reviewedIds) ? reviewedIds : [])];
  if (currentId && !reviewed.includes(currentId)) reviewed.push(currentId);
  const lastIndex = Math.max(0, Number(total) - 1);
  if (isLastTopic === false || (isLastTopic === undefined && index < lastIndex)) {
    return { screen: 'survey', currentIndex: index + 1, reviewedIds: reviewed };
  }
  return {
    screen: hasAfterTopics ? 'complete' : 'submit',
    currentIndex: index,
    reviewedIds: reviewed,
  };
}

export function advanceAfterTopicQuestion({ index, total }) {
  const currentIndex = clampIndex(index, total);
  const lastIndex = Math.max(0, Number(total) - 1);
  if (currentIndex < lastIndex) {
    return { screen: 'complete', index: currentIndex + 1, submit: false };
  }
  return { screen: 'submit', index: currentIndex, submit: true };
}
