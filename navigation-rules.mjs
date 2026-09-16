const stageOrder = ['profile', 'interview', 'survey', 'review', 'results', 'complete'];

export function stageIndex(screen) {
  return stageOrder.indexOf(screen);
}

export function canNavigateToStage(currentScreen, targetStage, {
  m1Started = false,
  m1Frozen = false,
  m1FreezeAttempted = false,
} = {}) {
  const currentIndex = stageIndex(currentScreen);
  const targetIndex = stageIndex(targetStage);
  return !m1Frozen
    && !m1FreezeAttempted
    && currentScreen !== 'results'
    && currentScreen !== 'complete'
    && currentIndex >= 0
    && targetIndex >= 0
    && !(m1Started && targetStage !== 'survey')
    && targetIndex < currentIndex;
}

export function topicIsAvailable(index, currentIndex, reviewedIds, factorId) {
  return index <= currentIndex || reviewedIds.includes(factorId);
}

export function canStartM1({ profileReady, interviewComplete, m1Frozen }) {
  return Boolean(profileReady && interviewComplete && !m1Frozen);
}

export function canFreezeM1({ interviewComplete, m1Started, allTopicsReviewed, m1Frozen }) {
  return Boolean(interviewComplete && m1Started && allTopicsReviewed && !m1Frozen);
}

export function canShowQ7({ interviewComplete, m1Frozen, resultSnapshot }) {
  return Boolean(interviewComplete && m1Frozen && resultSnapshot);
}
