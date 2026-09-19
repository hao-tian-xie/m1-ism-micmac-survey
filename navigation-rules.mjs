// The collection has three input stages. The final receipt is shown as stage 04;
// there is deliberately no intermediate review/freeze stage. Sidebar movement
// remains backward-only, with one resume rule for Step 02: unfinished Step 03
// can be resumed, while completed Step 03 may proceed to Step 04. Step 04's
// sidebar entry deliberately does not validate Step 02; final submission does.
const stageOrder = ['profile', 'qualitative', 'survey', 'complete'];

export function stageIndex(screen) {
  return stageOrder.indexOf(screen);
}

function canResumeFromQualitative(targetStage, { surveyComplete = false } = {}) {
  if (targetStage === 'survey') return !surveyComplete;
  if (targetStage === 'complete') return Boolean(surveyComplete);
  return false;
}

export function canNavigateToStage(currentScreen, targetStage, {
  allowComplete = false,
  surveyComplete = false,
} = {}) {
  const currentIndex = stageIndex(currentScreen);
  const targetIndex = stageIndex(targetStage);
  const canMoveBackward = (currentScreen !== 'complete' || allowComplete)
    && currentIndex >= 0
    && targetIndex >= 0
    && targetIndex < currentIndex;
  if (canMoveBackward) return true;

  // Step 02 is the only place where the sidebar may resume a later step.
  // Before all topics are reviewed, it may return to Step 03; afterward it
  // may return to Step 04. Step 02 validity is checked at final submission.
  if (currentScreen !== 'qualitative') return false;
  return canResumeFromQualitative(targetStage, { surveyComplete });
}

export function topicIsAvailable(index, currentIndex, reviewedIds, factorId) {
  return index <= currentIndex || reviewedIds.includes(factorId);
}
