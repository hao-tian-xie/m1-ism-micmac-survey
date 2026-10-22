const finalQuestionStep = {
  screen: 'complete',
  target: '.question-module-field',
  title: 'guideFinalQuestionTitle',
  text: 'guideFinalQuestionText',
};

const finalSubmitStep = {
  screen: 'complete',
  target: '#final-submit-form .primary-button',
  title: 'guideFinalSubmitTitle',
  text: 'guideFinalSubmitText',
};

const stageDirectoryStep = {
  screen: 'complete',
  target: '.steps',
  title: 'guideStageDirectoryTitle',
  text: 'guideStageDirectoryText',
};

const welcomeSteps = [
  { screen: 'welcome', target: '.hero-button', title: 'guideWelcomeTitle', text: 'guideWelcomeText' },
  { screen: 'profile', target: '.profile-form [name="code"]', title: 'guideCodeTitle', text: 'guideCodeText' },
  { screen: 'profile', target: '.profile-form [name="role"]', title: 'guideRoleTitle', text: 'guideRoleText' },
  { screen: 'profile', target: '[name="task-batch"]', title: 'guideBatchTitle', text: 'assignmentHelp' },
  { screen: 'profile', target: '.profile-form .primary-button', title: 'guideStartTitle', text: 'guideStartText' },
  { screen: 'qualitative', target: '.vt3-context', title: 'guideQualitativeTitle', text: 'guideQualitativeText' },
  { screen: 'survey', target: '.vt3-source', title: 'guideIfTitle', text: 'guideIfText' },
  { screen: 'survey', target: '.vt3-targets', title: 'guideThenTitle', text: 'guideThenText' },
  { screen: 'survey', target: '.vt3-source-meaning', title: 'guideNotesTitle', text: 'guideNotesText' },
  { screen: 'survey', target: '.vt3-target-group', title: 'guideHoverTitle', text: 'guideHoverText' },
  { screen: 'survey', target: '.vt3-task-actions .primary-button', title: 'guideNextTitle', text: 'guideNextText' },
  finalQuestionStep,
  stageDirectoryStep,
  finalSubmitStep,
];

const submittedCompleteStep = {
  screen: 'complete',
  target: '.complete-page',
  title: 'guideCompleteTitle',
  text: 'guideCompleteText',
};

const completeSteps = [
  finalQuestionStep,
  stageDirectoryStep,
  finalSubmitStep,
];

const localSteps = {
  orientation: [
    { screen: 'orientation', target: '.orientation-tabs', title: 'guideOrientationTitle', text: 'guideOrientationText' },
    { screen: 'orientation', target: '[data-action="orientation-continue"]', title: 'guideOrientationContinueTitle', text: 'guideOrientationContinueText' },
  ],
  profile: welcomeSteps.filter((step) => step.screen === 'profile'),
  survey: welcomeSteps.filter((step) => step.screen === 'survey'),
  qualitative: welcomeSteps.filter((step) => step.screen === 'qualitative'),
  complete: completeSteps,
};

export function guideStepsForScreen(screen, { submitted = false } = {}) {
  if (screen === 'welcome') return [welcomeSteps[0]];
  if (screen === 'complete' && submitted) return [submittedCompleteStep];
  return localSteps[screen] || [];
}
