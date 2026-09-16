const finalQuestionStep = {
  screen: 'complete',
  target: '#qualitative-q7',
  title: 'guideFinalQuestionTitle',
  text: 'guideFinalQuestionText',
};

const finalSubmitStep = {
  screen: 'complete',
  target: '#final-submit-form .primary-button',
  title: 'guideFinalSubmitTitle',
  text: 'guideFinalSubmitText',
};

const welcomeSteps = [
  { screen: 'welcome', target: '.hero-button', title: 'guideWelcomeTitle', text: 'guideWelcomeText' },
  { screen: 'profile', target: '.profile-form [name="code"]', title: 'guideCodeTitle', text: 'guideCodeText' },
  { screen: 'profile', target: '.profile-form [name="role"]', title: 'guideRoleTitle', text: 'guideRoleText' },
  { screen: 'profile', target: '.profile-form .primary-button', title: 'guideStartTitle', text: 'guideStartText' },
  { screen: 'qualitative', target: '.qualitative-fields', title: 'guideQualitativeTitle', text: 'guideQualitativeText' },
  { screen: 'survey', target: '.source-topic', title: 'guideIfTitle', text: 'guideIfText' },
  { screen: 'survey', target: '.target-fieldset', title: 'guideThenTitle', text: 'guideThenText' },
  { screen: 'survey', target: '.topic-notes', title: 'guideNotesTitle', text: 'guideNotesText' },
  { screen: 'survey', target: '.topic-actions .primary-button', title: 'guideNextTitle', text: 'guideNextText' },
  finalQuestionStep,
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
  finalSubmitStep,
];

const localSteps = {
  profile: welcomeSteps.filter((step) => step.screen === 'profile'),
  survey: welcomeSteps.filter((step) => step.screen === 'survey'),
  qualitative: welcomeSteps.filter((step) => step.screen === 'qualitative'),
  complete: completeSteps,
};

export function guideStepsForScreen(screen, { submitted = false } = {}) {
  if (screen === 'welcome') return welcomeSteps;
  if (screen === 'complete' && submitted) return [submittedCompleteStep];
  return localSteps[screen] || [];
}
