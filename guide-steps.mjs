const welcomeSteps = [
  { screen: 'welcome', target: '.hero-button', title: 'guideWelcomeTitle', text: 'guideWelcomeText' },
  { screen: 'profile', target: '.profile-form [name="code"]', title: 'guideCodeTitle', text: 'guideCodeText' },
  { screen: 'profile', target: '.profile-form [name="role"]', title: 'guideRoleTitle', text: 'guideRoleText' },
  { screen: 'profile', target: '.profile-form [name="experience"]', title: 'guideExperienceTitle', text: 'guideExperienceText' },
  { screen: 'profile', target: '.profile-form .primary-button', title: 'guideStartTitle', text: 'guideStartText' },
  { screen: 'interview', target: '.interview-form', title: 'guideInterviewTitle', text: 'guideInterviewText' },
  { screen: 'survey', target: '.source-topic', title: 'guideIfTitle', text: 'guideIfText' },
  { screen: 'survey', target: '.target-fieldset', title: 'guideThenTitle', text: 'guideThenText' },
  { screen: 'survey', target: '.topic-notes', title: 'guideNotesTitle', text: 'guideNotesText' },
  { screen: 'survey', target: '.topic-actions .primary-button', title: 'guideNextTitle', text: 'guideNextText' },
  { screen: 'review', target: '.review-actions .primary-button', title: 'guideFreezeTitle', text: 'guideFreezeText' },
  { screen: 'results', target: '.results-locked-message', title: 'guideInterpretTitle', text: 'guideInterpretText' },
  { screen: 'complete', target: '.complete-page', title: 'guideSubmitTitle', text: 'guideSubmitText' },
];

const completeStep = {
  screen: 'complete',
  target: '.complete-actions',
  title: 'guideCompleteTitle',
  text: 'guideCompleteText',
};

const localSteps = {
  profile: welcomeSteps.filter((step) => step.screen === 'profile'),
  interview: welcomeSteps.filter((step) => step.screen === 'interview'),
  survey: welcomeSteps.filter((step) => step.screen === 'survey'),
  review: welcomeSteps.filter((step) => step.screen === 'review'),
  results: [
    { screen: 'results', target: '.result-card', title: 'guideInterpretTitle', text: 'guideInterpretText' },
    { screen: 'results', target: '#q7-response', title: 'guideInterpretTitle', text: 'guideInterpretText' },
  ],
  complete: [completeStep],
};

export function guideStepsForScreen(screen) {
  if (screen === 'welcome') return welcomeSteps;
  return localSteps[screen] || [];
}
