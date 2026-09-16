import {
  applySourceSelections,
  buildDirectMatrix,
  buildSubmission,
  createPairs,
  selectedTargetsForSource,
  tryWriteStorage,
} from './survey-core.mjs';
import { displayTopicName, localisedFactors, studyConfig } from './survey-config.mjs?v=topic-definitions-contains-20260908';
import { copy, languageNames, locales } from './translations.mjs?v=subjective-m1-freeze-v1';
import { resolveSubmissionEndpoint } from './api-endpoint.mjs';
import { resolveLocale } from './locale-state.mjs';
import { guideStepsForScreen } from './guide-steps.mjs';
import { canNavigateToStage, topicIsAvailable } from './navigation-rules.mjs';
import { attachTopicDefinitionHints } from './topic-definition-hints.mjs';

const STORAGE_KEY = `bextools:${studyConfig.id}:${studyConfig.version}`;
const NONE_VALUE = '__none__';
const factors = studyConfig.factors;
const factorIds = factors.map((factor) => factor.id);
const pairs = createPairs(factors);
const qualitativeQuestionIds = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
const maxQualitativeAnswerLength = 3000;
const app = document.querySelector('#app');
const languageSwitch = document.querySelector('#language-switch');
const guideButton = document.querySelector('#guide-button');
const guideButtonLabel = document.querySelector('#guide-button-label');
const esrsPdfLink = document.querySelector('#esrs-pdf-link');
const esrsPdfLinkLabel = document.querySelector('#esrs-pdf-link-label');
const guideOverlay = document.querySelector('#guide-overlay');
const guideSpotlight = document.querySelector('#guide-spotlight');
const guideCallout = document.querySelector('#guide-callout');
const guideDialogStep = document.querySelector('#guide-dialog-step');
const guideDialogTitle = document.querySelector('#guide-dialog-title');
const guideDialogCopy = document.querySelector('#guide-dialog-copy');
const guideDots = document.querySelector('#guide-dots');
const guidePrevious = document.querySelector('#guide-previous');
const guideNext = document.querySelector('#guide-next');
const guideClose = document.querySelector('#guide-close');
const roleKeys = ['roleOperations', 'roleEsg', 'roleTechnology', 'roleManagement', 'roleAcademic', 'roleOther'];
const experienceKeys = ['exp1', 'exp2', 'exp3', 'exp4'];
let storageAvailable = true;
let detachTopicDefinitionHints = () => {};

function preferredLocale() {
  return resolveLocale({
    queryLocale: new URLSearchParams(window.location.search).get('lang'),
    browserLocale: navigator.language || '',
    locales,
  });
}

function emptySelections() {
  return Object.fromEntries(factorIds.map((id) => [id, []]));
}

function blankQualitativeAnswers() {
  return Object.fromEntries([...qualitativeQuestionIds, 'q7'].map((id) => [id, '']));
}

function blankState(locale = preferredLocale()) {
  return {
    locale,
    screen: 'welcome',
    participant: { code: '', role: '', experience: '' },
    answers: {},
    factorSelections: emptySelections(),
    noInfluenceFactors: [],
    reviewedFactors: [],
    currentIndex: 0,
    editingFromReview: false,
    showValidation: false,
    completedAt: '',
    submissionId: '',
    clientSubmissionId: '',
    qualitativeAnswers: blankQualitativeAnswers(),
    qualitativeSectionComplete: false,
    feedbackToken: '',
    frozenResultCard: null,
    frozenResultVerified: false,
    frozenResultState: 'idle',
    feedbackSubmittedAt: '',
    feedbackState: 'idle',
    submitState: 'idle',
    confirmNewResponse: false,
  };
}

function validTargetIds(sourceId, values) {
  if (!Array.isArray(values)) return [];
  const allowed = new Set(factorIds.filter((id) => id !== sourceId));
  return factorIds.filter((id) => allowed.has(id) && values.includes(id));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return blankState();

    const answers = saved.answers || {};
    const factorSelections = Object.fromEntries(factorIds.map((sourceId) => {
      const stored = saved.factorSelections?.[sourceId];
      const inferred = selectedTargetsForSource(answers, pairs, sourceId);
      return [sourceId, validTargetIds(sourceId, Array.isArray(stored) ? stored : inferred)];
    }));
    const legacyComplete = pairs.every((pair) => answers[pair.id]?.relation);
    const reviewedFactors = Array.isArray(saved.reviewedFactors)
      ? factorIds.filter((id) => saved.reviewedFactors.includes(id))
      : legacyComplete ? [...factorIds] : [];
    const noInfluenceFactors = Array.isArray(saved.noInfluenceFactors)
      ? factorIds.filter((id) => saved.noInfluenceFactors.includes(id))
      : reviewedFactors.filter((id) => factorSelections[id].length === 0);
    const submissionId = String(saved.submissionId || '');
    const locale = resolveLocale({
      queryLocale: new URLSearchParams(window.location.search).get('lang'),
      savedLocale: saved.locale,
      browserLocale: navigator.language || '',
      locales,
    });

    return {
      ...blankState(locale),
      ...saved,
      locale,
      screen: 'welcome',
      answers,
      factorSelections,
      noInfluenceFactors,
      reviewedFactors,
      participant: { ...blankState(locale).participant, ...(saved.participant || {}) },
      qualitativeAnswers: Object.fromEntries([...qualitativeQuestionIds, 'q7'].map((id) => [
        id,
        typeof saved.qualitativeAnswers?.[id] === 'string'
          ? saved.qualitativeAnswers[id].slice(0, maxQualitativeAnswerLength)
          : '',
      ])),
      qualitativeSectionComplete: saved.qualitativeSectionComplete === true,
      feedbackToken: String(saved.feedbackToken || ''),
      frozenResultCard: saved.frozenResultCard && typeof saved.frozenResultCard === 'object'
        ? saved.frozenResultCard
        : null,
      frozenResultVerified: false,
      frozenResultState: 'idle',
      feedbackSubmittedAt: String(saved.feedbackSubmittedAt || ''),
      feedbackState: 'idle',
      currentIndex: Math.min(Math.max(Number(saved.currentIndex) || 0, 0), factors.length - 1),
      editingFromReview: false,
      submitState: 'idle',
      completedAt: submissionId ? saved.completedAt || '' : '',
      submissionId,
    };
  } catch {
    storageAvailable = false;
    return blankState();
  }
}

let state = loadState();
let guideIndex = 0;
let guideReturnScreen = state.screen;
let guideIsOpen = false;
let guideSessionSteps = guideStepsForScreen(state.screen);

function t(key, values = {}) {
  const template = copy[state.locale][key] || copy.en[key] || key;
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

function localeText(value) {
  return value?.[state.locale] || value?.en || '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function reviewedCount() {
  return state.reviewedFactors.length;
}

function allTopicsReviewed() {
  return reviewedCount() === factors.length;
}

function progressPercent() {
  return factors.length ? Math.round((reviewedCount() / factors.length) * 100) : 0;
}

function directLinkCount() {
  return factorIds.reduce((total, id) => total + (state.factorSelections[id]?.length || 0), 0);
}

function factorFor(id) {
  const factor = factors.find((item) => item.id === id);
  return {
    id: factor.id,
    label: displayTopicName(factor.name, state.locale),
    description: localeText(factor.description),
  };
}

function selectedTargets(sourceId) {
  return validTargetIds(sourceId, state.factorSelections[sourceId]);
}

function createClientSubmissionId() {
  if (typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  if (typeof window.crypto?.getRandomValues === 'function') {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `m1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createFeedbackCapabilityToken() {
  const bytes = new Uint8Array(32);
  if (typeof window.crypto?.getRandomValues !== 'function') {
    throw new Error('secure random token generation is unavailable');
  }
  window.crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function hasExplicitNone(sourceId) {
  return state.noInfluenceFactors.includes(sourceId);
}

function persist() {
  if (!storageAvailable) return false;

  const snapshot = {
    ...state,
    screen: undefined,
    editingFromReview: false,
    submitState: 'idle',
  };
  try {
    storageAvailable = tryWriteStorage(window.localStorage, STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    storageAvailable = false;
  }
  return storageAvailable;
}

function pageTop() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function focusPageHeading() {
  document.querySelector('[data-page-title]')?.focus({ preventScroll: true });
}

function goTo(screen, { scroll = true } = {}) {
  state.screen = screen;
  render();
  if (scroll) pageTop();
  focusPageHeading();
}

function navigateToStage(targetStage) {
  if (!canNavigateToStage(state.screen, targetStage)) return;
  const fromReview = state.screen === 'review';

  if (targetStage === 'profile') {
    state.editingFromReview = fromReview;
    state.showValidation = false;
    goTo('profile');
    return;
  }

  if (targetStage === 'survey') {
    state.currentIndex = fromReview ? 0 : Math.min(state.currentIndex, factors.length - 1);
    state.editingFromReview = fromReview;
    goTo('survey');
    return;
  }

  if (targetStage === 'qualitative') {
    state.editingFromReview = false;
    goTo('qualitative');
  }
}

function navigateToTopic(index) {
  if (state.screen !== 'survey' || !Number.isInteger(index) || !factors[index]) return;
  const factor = factors[index];
  if (!topicIsAvailable(index, state.currentIndex, state.reviewedFactors, factor.id)) return;
  state.currentIndex = index;
  persist();
  render();
  pageTop();
  focusPageHeading();
}

function renderLanguages() {
  const languageLabel = {
    'zh-CN': '语言切换',
    'zh-HK': '語言切換',
    en: 'Language',
  }[state.locale];
  languageSwitch.setAttribute('aria-label', languageLabel);
  languageSwitch.innerHTML = locales.map((locale) => `
    <button type="button" data-locale="${locale}" class="${state.locale === locale ? 'is-active' : ''}" aria-pressed="${state.locale === locale}">
      ${languageNames[locale]}
    </button>
  `).join('');
}

function renderHomeLink() {
  const homeLink = document.querySelector('.brand');
  if (!homeLink) return;
  const url = new URL('./', window.location.href);
  url.searchParams.set('lang', state.locale);
  homeLink.href = `${url.pathname}${url.search}${url.hash}`;
}

function renderGuide() {
  if (!guideOverlay) return;
  guideButtonLabel.textContent = t('guideButton');
  guideButton.title = t('guideTitle');
  guideButton.setAttribute('aria-label', t('guideTitle'));
  if (esrsPdfLinkLabel) esrsPdfLinkLabel.textContent = t('esrsPdfLabel');
  if (esrsPdfLink) {
    esrsPdfLink.title = t('esrsPdfTitle');
    esrsPdfLink.setAttribute('aria-label', t('esrsPdfTitle'));
  }
  guideOverlay.hidden = !guideIsOpen;
  if (!guideIsOpen) return;

  const step = guideSessionSteps[guideIndex];
  if (!step) return;
  guideDialogStep.textContent = t('guideStep', { i: guideIndex + 1, total: guideSessionSteps.length });
  guideDialogTitle.textContent = t(step.title);
  guideDialogCopy.textContent = t(step.text);
  guideCallout.setAttribute('aria-label', t(step.title));
  guideClose.setAttribute('aria-label', t('guideClose'));
  guidePrevious.textContent = t('guidePrevious');
  guidePrevious.disabled = guideIndex === 0;
  guideNext.textContent = guideIndex === guideSessionSteps.length - 1 ? t('guideFinish') : t('guideNext');
  guideDots.innerHTML = guideSessionSteps.map((item, index) => `<span class="${index === guideIndex ? 'is-active' : ''}"></span>`).join('');
  requestAnimationFrame(positionGuide);
}

function positionGuide(allowScrollAdjust = false) {
  if (!guideIsOpen || !guideOverlay || guideOverlay.hidden) return;
  const step = guideSessionSteps[guideIndex];
  const target = document.querySelector(step.target);
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const padding = 7;
  guideSpotlight.style.left = `${Math.max(8, rect.left - padding)}px`;
  guideSpotlight.style.top = `${Math.max(8, rect.top - padding)}px`;
  guideSpotlight.style.width = `${Math.max(24, rect.width + padding * 2)}px`;
  guideSpotlight.style.height = `${Math.max(24, rect.height + padding * 2)}px`;

  const calloutWidth = guideCallout.offsetWidth || 320;
  const calloutHeight = guideCallout.offsetHeight || 240;
  const gap = 16;
  const edge = 16;
  let left = rect.right + gap;
  let top = rect.top;

  if (left + calloutWidth > window.innerWidth - edge) {
    const leftSide = rect.left - calloutWidth - gap;
    if (leftSide >= edge) {
      left = leftSide;
    } else {
      left = rect.left;
      top = rect.bottom + gap;
    }
  }
  if (top + calloutHeight > window.innerHeight - edge) {
    top = rect.top - calloutHeight - gap;
  }
  if (top < edge) top = edge;
  if (left + calloutWidth > window.innerWidth - edge) left = window.innerWidth - calloutWidth - edge;
  if (left < edge) left = edge;

  const targetRight = rect.left + rect.width;
  const targetBottom = rect.top + rect.height;
  const overlapsTarget = left < targetRight + padding
    && left + calloutWidth > rect.left - padding
    && top < targetBottom + padding
    && top + calloutHeight > rect.top - padding;
  if (overlapsTarget && !allowScrollAdjust) {
    target.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' });
    requestAnimationFrame(() => positionGuide(true));
    return;
  }

  guideCallout.style.left = `${left}px`;
  guideCallout.style.top = `${top}px`;
}

function showGuideStep(index) {
  if (!guideSessionSteps.length) return;
  guideIndex = Math.min(Math.max(index, 0), guideSessionSteps.length - 1);
  const step = guideSessionSteps[guideIndex];
  if (guideReturnScreen === 'welcome' && state.screen !== step.screen) {
    state.screen = step.screen;
    render();
  } else {
    renderGuide();
  }

  requestAnimationFrame(() => {
    const target = document.querySelector(step.target);
    target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    requestAnimationFrame(positionGuide);
  });
  guideNext?.focus({ preventScroll: true });
}

function openGuide() {
  guideReturnScreen = state.screen;
  guideSessionSteps = guideStepsForScreen(state.screen);
  guideIsOpen = true;
  guideIndex = 0;
  showGuideStep(0);
}

function closeGuide() {
  if (!guideIsOpen) return;
  guideIsOpen = false;
  state.screen = guideReturnScreen;
  render();
  guideButton?.focus({ preventScroll: true });
}

function renderStepper() {
  const activeIndex = {
    profile: 0,
    survey: 1,
    qualitative: 2,
    review: 3,
    complete: 4,
  }[state.screen] ?? 0;
  const steps = [t('stepProfile'), t('stepSurvey'), t('stepQualitative'), t('stepReview'), t('stepResult')];
  const stageIds = ['profile', 'survey', 'qualitative', 'review', 'complete'];
  const stageItems = steps.map((label, index) => {
    const stage = stageIds[index];
    const isActive = index === activeIndex;
    const isDone = index < activeIndex;
    const canGoBack = canNavigateToStage(state.screen, stage);
    const stepContent = `
      <span>${String(index + 1).padStart(2, '0')}</span>
      <b>${escapeHtml(label)}</b>
    `;
    return `
      <li class="${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}" ${isActive ? 'aria-current="step"' : ''}>
        ${canGoBack
          ? `<button class="step-link" type="button" data-action="stage-nav" data-stage="${stage}" aria-label="${escapeHtml(label)}">${stepContent}</button>`
          : stepContent}
      </li>
    `;
  }).join('');
  const topicDirectory = state.screen === 'survey' ? `
    <nav class="topic-index" aria-label="${escapeHtml(t('topicDirectoryLabel'))}">
      <div class="topic-index-grid">
        ${factors.map((factor, index) => {
          const number = String(index + 1).padStart(2, '0');
          const isActive = index === state.currentIndex;
          const isDone = state.reviewedFactors.includes(factor.id);
          const available = topicIsAvailable(index, state.currentIndex, state.reviewedFactors, factor.id);
          return `
            <button
              class="topic-index-item ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}"
              type="button"
              data-action="topic-index"
              data-topic-index="${index}"
              aria-label="${escapeHtml(t('topicDirectoryItem', { n: number }))}"
              ${isActive ? 'aria-current="step"' : ''}
              ${available ? '' : 'disabled'}
            >${number}</button>
          `;
        }).join('')}
      </div>
    </nav>
  ` : '';

  return `
    <aside class="step-sidebar" aria-label="${escapeHtml(t('progressLabel'))}">
      <div class="mini-brand">ESG</div>
      <ol class="steps">
        ${stageItems}
      </ol>
      <div class="sidebar-progress">
        <div class="sidebar-progress-copy">
          <span>${escapeHtml(t('progressLabel'))}</span>
          <b data-progress-percent>${progressPercent()}%</b>
        </div>
        <progress class="native-progress" max="${factors.length}" value="${reviewedCount()}" aria-label="${escapeHtml(t('progressLabel'))}"></progress>
      </div>
      ${topicDirectory}
    </aside>
  `;
}

function renderShell(content, className = '') {
  return `
    <main class="app-shell ${className}">
      ${renderStepper()}
      <section class="content-stage">${content}</section>
    </main>
  `;
}

function renderWelcome() {
  const hasProgress = reviewedCount() > 0
    || factorIds.some((id) => selectedTargets(id).length || hasExplicitNone(id))
    || state.participant.code;
  const factorCards = [
    ['environment', 'categoryEnvironment'],
    ['social', 'categorySocial'],
    ['governance', 'categoryGovernance'],
  ].map(([category, labelKey]) => {
    const categoryFactors = factors.filter((factor) => factor.category === category);
    const cards = categoryFactors.map((factor) => `
      <details class="factor-preview">
        <summary><span>${factor.id}</span><b>${escapeHtml(displayTopicName(factor.name, state.locale))}</b><i aria-hidden="true">+</i></summary>
        <p>${escapeHtml(localeText(factor.description))}</p>
      </details>
    `).join('');
    return `
      <section class="topic-category" data-category="${category}">
        <h3 class="topic-category-title">${escapeHtml(t(labelKey))}</h3>
        <div class="factor-preview-grid">${cards}</div>
      </section>
    `;
  }).join('');

  return `
    <main class="welcome-page">
      <section class="welcome-hero">
        <div class="welcome-copy">
          <p class="eyebrow">${escapeHtml(t('eyebrow'))}</p>
          <h1 data-page-title tabindex="-1">${escapeHtml(t('heroTitle'))}</h1>
          <div class="scope-card">
            <span>${escapeHtml(t('scopeLabel'))}</span>
            <p>${escapeHtml(localeText(studyConfig.scope))}</p>
          </div>

          <div class="study-stats" aria-label="${escapeHtml(t('overviewLabel'))}">
            <span class="study-summary">${escapeHtml(t('minutesUnit'))}</span>
          </div>

          <button class="primary-button hero-button" type="button" data-action="start">
            ${escapeHtml(hasProgress ? t('continue') : t('start'))}<span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section class="factor-section">
        <div class="section-heading">
          <div><p class="eyebrow">ESG</p><h2>${escapeHtml(t('factorList'))}</h2></div>
        </div>
        <div class="factor-category-list">${factorCards}</div>
      </section>
    </main>
  `;
}

function renderProfile() {
  const codeHasError = state.showValidation && !state.participant.code.trim();
  const roleHasError = state.showValidation && !state.participant.role;
  const hasError = codeHasError || roleHasError;
  const roleOptions = roleKeys.map((key) => `
    <option value="${key}" ${state.participant.role === key ? 'selected' : ''}>${escapeHtml(t(key))}</option>
  `).join('');
  const experiences = experienceKeys.map((key) => `
    <label class="radio-card">
      <input type="radio" name="experience" value="${key}" ${state.participant.experience === key ? 'checked' : ''} />
      <span>${escapeHtml(t(key))}</span>
    </label>
  `).join('');

  return renderShell(`
    <div class="form-page">
      <header class="page-heading">
        <p class="eyebrow">${escapeHtml(t('profileEyebrow'))}</p>
        <h1 data-page-title tabindex="-1">${escapeHtml(t('profileTitle'))}</h1>
      </header>

      <form class="profile-form" id="profile-form" novalidate>
        <label class="field-group">
          <span>${escapeHtml(t('codeLabel'))}<em>*</em></span>
          <input name="code" type="text" maxlength="36" autocomplete="off" required aria-required="true" value="${escapeHtml(state.participant.code)}" placeholder="${escapeHtml(t('codePlaceholder'))}" aria-invalid="${codeHasError}" ${codeHasError ? 'aria-describedby="profile-error"' : ''} />
        </label>

        <label class="field-group">
          <span>${escapeHtml(t('roleLabel'))}<em>*</em></span>
          <select name="role" required aria-required="true" aria-invalid="${roleHasError}" ${roleHasError ? 'aria-describedby="profile-error"' : ''}>
            <option value="">${escapeHtml(t('rolePlaceholder'))}</option>
            ${roleOptions}
          </select>
        </label>

        <fieldset class="field-group experience-group">
          <legend>${escapeHtml(t('experienceLabel'))}</legend>
          <div class="radio-grid">${experiences}</div>
        </fieldset>

        ${hasError ? `<p class="form-error" id="profile-error" role="alert">${escapeHtml(t('requiredMessage'))}</p>` : ''}

        <div class="form-actions">
          <button class="text-button" type="button" data-action="back-welcome"><span aria-hidden="true">←</span>${escapeHtml(t('back'))}</button>
          <button class="primary-button" type="submit">${escapeHtml(t('beginTopics'))}<span aria-hidden="true">→</span></button>
        </div>
      </form>
    </div>
  `, 'form-shell');
}

function targetOption(source, target) {
  const selected = selectedTargets(source.id).includes(target.id);
  return `
    <label class="target-option ${selected ? 'is-selected' : ''}" aria-expanded="false">
      <input type="checkbox" name="direct-target" value="${target.id}" data-source-id="${source.id}" ${selected ? 'checked' : ''} />
      <span class="target-code">${target.id}</span>
      <span class="target-copy">
        <strong>${escapeHtml(target.label)}</strong>
      </span>
      <span class="target-definition" role="tooltip" hidden aria-hidden="true">${escapeHtml(target.description)}</span>
    </label>
  `;
}

function toggleTopicNotes(button) {
  const notes = document.querySelector('.topic-notes');
  if (!notes) return;
  const isOpen = notes.hidden;
  notes.hidden = !isOpen;
  notes.classList.toggle('is-open', isOpen);
  button.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) notes.focus({ preventScroll: true });
}

function closeTopicNotes() {
  const notes = document.querySelector('.topic-notes');
  const button = document.querySelector('[data-action="toggle-topic-notes"]');
  if (!notes || notes.hidden) return;
  notes.hidden = true;
  notes.classList.remove('is-open');
  button?.setAttribute('aria-expanded', 'false');
}

function renderSurvey() {
  const source = factorFor(factors[state.currentIndex].id);
  const targets = factors
    .filter((factor) => factor.id !== source.id)
    .map((factor) => factorFor(factor.id));
  const noneSelected = hasExplicitNone(source.id);
  const hasChoice = selectedTargets(source.id).length > 0 || noneSelected;
  const isLast = state.currentIndex === factors.length - 1;
  const topicNotes = targets.map((target) => `
    <li><b>${escapeHtml(target.id)} · ${escapeHtml(target.label)}</b><span>${escapeHtml(target.description)}</span></li>
  `).join('');

  return renderShell(`
    <div class="survey-page topic-survey">
      <header class="survey-topline">
        <p class="eyebrow">${escapeHtml(t('surveyEyebrow'))}</p>
      </header>

      <div class="topic-workspace">
        <section class="source-topic" aria-labelledby="source-topic-name">
          <span class="topic-kicker">${escapeHtml(t('ifLabel'))}</span>
          <div class="source-topic-main">
            <div class="source-topic-head">
              <div class="source-topic-body">
                <span class="source-code">${source.id}</span>
                <h2 id="source-topic-name">${escapeHtml(source.label)}</h2>
                <p>${escapeHtml(source.description)}</p>
              </div>
              <div class="source-progress">
                <div class="source-progress-copy">
                  <span class="pair-position">${escapeHtml(t('topicPosition', { i: state.currentIndex + 1, total: factors.length }))}</span>
                </div>
                <progress max="${factors.length}" value="${reviewedCount()}" aria-label="${escapeHtml(t('progressLabel'))}"></progress>
              </div>
            </div>
          </div>
        </section>

        <section class="topic-decision">
          <div class="topic-question">
            <div class="topic-question-line">
              <span class="question-kicker">${escapeHtml(t('thenLabel'))}</span>
              <h1 data-page-title tabindex="-1">${escapeHtml(t('topicQuestion'))}</h1>
            </div>
            <p class="choice-hint" id="choice-help">${escapeHtml(t('selectTargets'))}</p>
          </div>

          <fieldset class="target-fieldset" aria-describedby="choice-help">
            <legend class="visually-hidden">${escapeHtml(t('targetLegend'))}</legend>
            <div class="target-list">
              ${targets.map((target) => targetOption(source, target)).join('')}
              <label class="target-option none-option ${noneSelected ? 'is-selected' : ''}">
                <input type="checkbox" name="direct-target" value="${NONE_VALUE}" data-source-id="${source.id}" ${noneSelected ? 'checked' : ''} />
                <span class="target-code">—</span>
                <span class="target-copy">
                  <strong>${escapeHtml(t('noneOption'))}</strong>
                </span>
              </label>
            </div>
          </fieldset>
        </section>
      </div>

      <div class="survey-actions topic-actions">
        <button class="text-button" type="button" data-action="previous-topic" ${state.currentIndex === 0 ? 'disabled' : ''}>
          <span aria-hidden="true">←</span>${escapeHtml(t('previousTopic'))}
        </button>
        <button class="text-button topic-notes-toggle" type="button" data-action="toggle-topic-notes" aria-expanded="false">
          <span aria-hidden="true">i</span>${escapeHtml(t('topicNotesButton'))}
        </button>
        <button class="primary-button" type="button" data-action="confirm-topic" ${hasChoice ? '' : 'disabled'}>
          ${escapeHtml(state.editingFromReview ? t('confirmAndReview') : isLast ? t('confirmAndQualitative') : t('confirmAndNext'))}<span aria-hidden="true">→</span>
        </button>
      </div>
      <section class="topic-notes" aria-label="${escapeHtml(t('candidateNotes'))}" hidden tabindex="-1">
        <h2>${escapeHtml(t('candidateNotes'))}</h2>
        <ul>${topicNotes}</ul>
      </section>
    </div>
  `, 'survey-shell');
}

function renderQualitative() {
  const questions = qualitativeQuestionIds.map((id, index) => {
    const question = t(`qualitativeQ${index + 1}`);
    const countId = `qualitative-count-${id}`;
    return `
      <label class="field-group note-field qualitative-field" for="qualitative-${id}">
        <span class="qualitative-question-label"><i>${String(index + 1).padStart(2, '0')}</i>${escapeHtml(question)}</span>
        <textarea
          id="qualitative-${id}"
          name="qualitative-answer"
          data-question-id="${id}"
          maxlength="${maxQualitativeAnswerLength}"
          rows="5"
          aria-describedby="${countId}"
          placeholder="${escapeHtml(t('qualitativePlaceholder'))}"
        >${escapeHtml(state.qualitativeAnswers[id])}</textarea>
        <small id="${countId}" data-char-count="${id}">${escapeHtml(t('qualitativeCharCount', { n: state.qualitativeAnswers[id].length }))}</small>
      </label>
    `;
  }).join('');

  return renderShell(`
    <div class="form-page qualitative-page">
      <header class="page-heading">
        <p class="eyebrow">${escapeHtml(t('qualitativeEyebrow'))}</p>
        <h1 data-page-title tabindex="-1">${escapeHtml(t('qualitativeTitle'))}</h1>
        <p>${escapeHtml(t('qualitativeIntro'))}</p>
      </header>

      <p class="qualitative-privacy">${escapeHtml(t('qualitativePrivacy'))}</p>

      <form class="qualitative-form" id="qualitative-form">
        <div class="qualitative-fields">${questions}</div>
        <div class="form-actions">
          <button class="text-button" type="button" data-action="back-to-survey"><span aria-hidden="true">←</span>${escapeHtml(t('qualitativeBack'))}</button>
          <button class="primary-button" type="submit">${escapeHtml(t('qualitativeContinue'))}<span aria-hidden="true">→</span></button>
        </div>
      </form>
    </div>
  `, 'form-shell qualitative-shell');
}

function renderMatrix() {
  const localFactors = localisedFactors(state.locale);
  const matrix = buildDirectMatrix(localFactors, state.answers);
  const idIndex = new Map(localFactors.map((factor, index) => [factor.id, index]));

  function cell(rowFactor, columnFactor) {
    if (rowFactor.id === columnFactor.id) return '<td class="matrix-self">·</td>';
    const value = matrix[idIndex.get(rowFactor.id)][idIndex.get(columnFactor.id)];
    if (value === null) return '<td class="matrix-empty"></td>';
    return `<td class="matrix-${value}">${value}</td>`;
  }

  return `
    <p class="matrix-swipe-hint">${escapeHtml(t('matrixSwipeHint'))}</p>
    <div class="matrix-scroll" tabindex="0" role="region" aria-labelledby="matrix-title">
      <table class="direction-matrix">
        <thead><tr><th></th>${localFactors.map((factor) => `<th title="${escapeHtml(factor.label)}">${factor.id}</th>`).join('')}</tr></thead>
        <tbody>
          ${localFactors.map((rowFactor) => `
            <tr><th title="${escapeHtml(rowFactor.label)}">${rowFactor.id}</th>${localFactors.map((columnFactor) => cell(rowFactor, columnFactor)).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function pairArrow(relation) {
  return { V: '→', A: '←', X: '↔', O: '—' }[relation] || '?';
}

function pairRelationText(relation) {
  return {
    V: t('leftToRightShort'),
    A: t('rightToLeftShort'),
    X: t('bothDirectionsShort'),
    O: t('noRelationShort'),
  }[relation] || t('unanswered');
}

function renderPairReview(isLocked = false) {
  return pairs.map((pair, index) => {
    const left = factorFor(pair.leftId);
    const right = factorFor(pair.rightId);
    const relation = state.answers[pair.id]?.relation;
    return `
      <div class="pair-review-row">
        <span class="pair-review-index">${index + 1}</span>
        <span class="pair-review-factors">
          <button type="button" data-action="edit-topic" data-factor-id="${left.id}" aria-label="${escapeHtml(t('editTopicLabel', { topic: left.label }))}" ${isLocked ? 'disabled' : ''}>${escapeHtml(left.label)}</button>
          <i aria-hidden="true">${pairArrow(relation)}</i>
          <button type="button" data-action="edit-topic" data-factor-id="${right.id}" aria-label="${escapeHtml(t('editTopicLabel', { topic: right.label }))}" ${isLocked ? 'disabled' : ''}>${escapeHtml(right.label)}</button>
        </span>
        <span class="pair-review-result">${escapeHtml(pairRelationText(relation))}</span>
      </div>
    `;
  }).join('');
}

function renderReview() {
  const isSubmitting = state.submitState === 'submitting';
  const topicRows = factors.map((factor, index) => {
    const source = factorFor(factor.id);
    const selected = selectedTargets(source.id).map((id) => factorFor(id).label);
    return `
      <button class="topic-review-row" type="button" data-action="edit-topic" data-factor-id="${source.id}" ${isSubmitting ? 'disabled' : ''}>
        <span class="review-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="topic-review-source"><b>${escapeHtml(source.label)}</b><small>${source.id}</small></span>
        <span class="topic-review-result"><i aria-hidden="true">→</i>${escapeHtml(selected.length ? selected.join(t('listSeparator')) : t('noneResult'))}</span>
        <span class="review-edit">${escapeHtml(t('edit'))} →</span>
      </button>
    `;
  }).join('');
  return renderShell(`
    <div class="review-page">
      <header class="page-heading review-heading">
        <p class="eyebrow">${escapeHtml(t('reviewEyebrow'))}</p>
        <h1 data-page-title tabindex="-1">${escapeHtml(t('reviewTitle'))}</h1>
      </header>

      <div class="review-summary">
        <article><span>${escapeHtml(t('confirmedTopics'))}</span><b>${reviewedCount()} / ${factors.length}</b></article>
        <article><span>${escapeHtml(t('directLinks'))}</span><b>${directLinkCount()}</b></article>
        <article><span>${escapeHtml(t('allTopics'))}</span><b>${factors.length}</b></article>
      </div>

      <div class="review-actions">
        <button class="text-button" type="button" data-action="back-qualitative" ${isSubmitting ? 'disabled' : ''}><span aria-hidden="true">←</span>${escapeHtml(t('back'))}</button>
        <button class="primary-button" type="button" data-action="submit-response" ${isSubmitting || !allTopicsReviewed() || !state.qualitativeSectionComplete ? 'disabled' : ''}>
          ${escapeHtml(isSubmitting ? t('submitting') : t('submitResponse'))}<span aria-hidden="true">→</span>
        </button>
      </div>
      ${state.submitState === 'error' ? `
        <div class="submit-error" role="alert">
          <span>${escapeHtml(t('submitError'))}</span>
          <button type="button" data-action="submit-response">${escapeHtml(t('retrySubmit'))}</button>
        </div>
      ` : ''}

      <section class="review-panel topic-list-panel">
        <div class="panel-heading">
          <div><h2>${escapeHtml(t('topicListTitle'))}</h2></div>
        </div>
        <div class="topic-review-list">${topicRows}</div>
      </section>

      <details class="review-panel pair-check-panel">
        <summary class="matrix-summary">
          <span><b>${escapeHtml(t('pairListTitle'))}</b></span>
          <i aria-hidden="true">+</i>
        </summary>
        <div class="pair-review-list">${renderPairReview(isSubmitting)}</div>
      </details>

      <details class="review-panel matrix-panel">
        <summary class="matrix-summary">
          <span><b id="matrix-title">${escapeHtml(t('matrixTitle'))}</b></span>
          <i aria-hidden="true">+</i>
        </summary>
        ${renderMatrix()}
      </details>
    </div>
  `, 'review-shell');
}

function renderFrozenTopicList(titleKey, topics = []) {
  const rows = topics.map((topic) => `
    <li>
      <span class="frozen-topic-code">${escapeHtml(topic.id)}</span>
      <span class="frozen-topic-label">${escapeHtml(topic.label)}</span>
      <b>${escapeHtml(topic.count)}</b>
    </li>
  `).join('');
  return `
    <section class="frozen-topic-group">
      <h3>${escapeHtml(t(titleKey))}</h3>
      ${rows ? `<ol>${rows}</ol>` : `<p>${escapeHtml(t('noStructure'))}</p>`}
    </section>
  `;
}

function renderFrozenResultCard() {
  const result = state.frozenResultCard;
  if (!result) return '';
  return `
    <section class="frozen-result-card" aria-labelledby="frozen-result-title">
      <header>
        <p class="eyebrow">${escapeHtml(t('stepResult'))}</p>
        <h2 id="frozen-result-title">${escapeHtml(t('frozenResultTitle'))}</h2>
        <p>${escapeHtml(t('frozenResultIntro'))}</p>
      </header>
      <div class="frozen-result-stats">
        <article><span>${escapeHtml(t('frozenResultTopics'))}</span><b>${escapeHtml(result.topicCount)}</b></article>
        <article><span>${escapeHtml(t('frozenResultDirectLinks'))}</span><b>${escapeHtml(result.directLinkCount)}</b></article>
      </div>
      <div class="frozen-result-groups">
        ${renderFrozenTopicList('leadingTopics', result.leadingTopics)}
        ${renderFrozenTopicList('receivingTopics', result.receivingTopics)}
      </div>
    </section>
  `;
}

function renderComplete() {
  const resultIsVerified = state.frozenResultVerified && state.frozenResultCard;
  const isSavingFeedback = state.feedbackState === 'saving';
  const countId = 'feedback-q7-count';
  const verification = resultIsVerified
    ? renderFrozenResultCard()
    : state.frozenResultState === 'loading'
      ? `<p class="result-verification-status" role="status">${escapeHtml(t('resultProofWait'))}</p>`
      : `<div class="result-verification-error" role="alert"><p>${escapeHtml(t('resultProofError'))}</p><button class="secondary-button" type="button" data-action="verify-result">${escapeHtml(t('retryResult'))}</button></div>`;
  const feedback = resultIsVerified && !state.feedbackSubmittedAt ? `
    <form class="feedback-form" id="feedback-form">
      <label class="field-group note-field" for="qualitative-q7">
        <span>${escapeHtml(t('feedbackTitle'))}</span>
        <textarea id="qualitative-q7" name="feedback-answer" maxlength="${maxQualitativeAnswerLength}" rows="6" aria-describedby="feedback-q7-help ${countId}" placeholder="${escapeHtml(t('feedbackPlaceholder'))}">${escapeHtml(state.qualitativeAnswers.q7)}</textarea>
        <small id="feedback-q7-help">${escapeHtml(t('feedbackHelper'))}</small>
        <small id="${countId}" data-char-count="q7">${escapeHtml(t('qualitativeCharCount', { n: state.qualitativeAnswers.q7.length }))}</small>
      </label>
      <div class="form-actions">
        <button class="primary-button" type="submit" ${isSavingFeedback ? 'disabled' : ''}>
          ${escapeHtml(isSavingFeedback ? t('savingFeedback') : t('saveFeedback'))}<span aria-hidden="true">→</span>
        </button>
      </div>
      ${state.feedbackState === 'error' ? `<div class="submit-error" role="alert"><span>${escapeHtml(t('feedbackSubmitError'))}</span><button type="button" data-action="save-feedback">${escapeHtml(t('retryFeedback'))}</button></div>` : ''}
    </form>
  ` : '';
  const savedFeedback = state.feedbackSubmittedAt ? `
    <section class="feedback-saved" role="status">
      <h2>${escapeHtml(t('feedbackCompleteTitle'))}</h2>
      <p>${escapeHtml(t('feedbackCompleteText'))}</p>
    </section>
  ` : '';
  const canStartAgain = Boolean(state.feedbackSubmittedAt) || state.frozenResultState === 'error';

  return renderShell(`
    <div class="complete-page">
      <h1 data-page-title tabindex="-1">${escapeHtml(state.feedbackSubmittedAt ? t('feedbackCompleteTitle') : t('completeTitle'))}</h1>
      <div class="receipt-block">
        <span>${escapeHtml(t('receiptLabel'))}</span>
        <strong>${escapeHtml(state.submissionId)}</strong>
      </div>
      ${verification}
      ${feedback}
      ${savedFeedback}
      ${canStartAgain ? `
        <div class="complete-actions">
          <button class="secondary-button ${state.confirmNewResponse ? 'confirm-reset' : ''}" type="button" data-action="new-response">
            ${escapeHtml(state.confirmNewResponse ? t('confirmNewResponse') : t('newResponse'))}
          </button>
        </div>
      ` : ''}
    </div>
  `, 'complete-shell');
}

function render() {
  document.documentElement.lang = state.locale;
  document.body.dataset.screen = state.screen;
  document.title = `${localeText(studyConfig.title)} | ESG Study`;
  document.querySelector('meta[name="description"]').content = t('heroTitle');
  document.querySelector('#brand-subtitle').textContent = t('brand').replace('BEXtools', '').trim();
  renderHomeLink();
  renderLanguages();

  detachTopicDefinitionHints();
  app.innerHTML = {
    welcome: renderWelcome,
    profile: renderProfile,
    survey: renderSurvey,
    qualitative: renderQualitative,
    review: renderReview,
    complete: renderComplete,
  }[state.screen]();
  detachTopicDefinitionHints = state.screen === 'survey'
    ? attachTopicDefinitionHints(document.querySelector('.target-list'))
    : () => {};
  renderGuide();
}

function profileIsReady() {
  return Boolean(state.participant.code.trim() && state.participant.role);
}

function updateProfileValidation() {
  if (!state.showValidation) return;
  const codeIsValid = Boolean(state.participant.code.trim());
  const roleIsValid = Boolean(state.participant.role);
  const codeInput = document.querySelector('[name="code"]');
  const roleSelect = document.querySelector('[name="role"]');
  codeInput?.setAttribute('aria-invalid', String(!codeIsValid));
  if (codeIsValid) codeInput?.removeAttribute('aria-describedby');
  else codeInput?.setAttribute('aria-describedby', 'profile-error');
  roleSelect?.setAttribute('aria-invalid', String(!roleIsValid));
  if (roleIsValid) roleSelect?.removeAttribute('aria-describedby');
  else roleSelect?.setAttribute('aria-describedby', 'profile-error');
  if (codeIsValid && roleIsValid) {
    state.showValidation = false;
    document.querySelector('#profile-error')?.remove();
  }
}

function firstUnreviewedIndex() {
  const index = factors.findIndex((factor) => !state.reviewedFactors.includes(factor.id));
  return index < 0 ? 0 : index;
}

function markCurrentTopicPending(sourceId) {
  state.reviewedFactors = state.reviewedFactors.filter((id) => id !== sourceId);
  state.completedAt = '';
  state.submissionId = '';
  state.clientSubmissionId = '';
  state.qualitativeAnswers = blankQualitativeAnswers();
  state.qualitativeSectionComplete = false;
  state.feedbackToken = '';
  state.frozenResultCard = null;
  state.frozenResultVerified = false;
  state.frozenResultState = 'idle';
  state.feedbackSubmittedAt = '';
  state.feedbackState = 'idle';
  state.submitState = 'idle';
}

function updateSurveySelectionUi(sourceId) {
  const selected = new Set(selectedTargets(sourceId));
  const noneSelected = hasExplicitNone(sourceId);
  document.querySelectorAll('[name="direct-target"]').forEach((input) => {
    const checked = input.value === NONE_VALUE ? noneSelected : selected.has(input.value);
    input.checked = checked;
    input.closest('.target-option')?.classList.toggle('is-selected', checked);
  });

  const confirmButton = document.querySelector('[data-action="confirm-topic"]');
  if (confirmButton) confirmButton.disabled = !selected.size && !noneSelected;

  document.querySelectorAll('[data-progress-percent]').forEach((node) => {
    node.textContent = `${progressPercent()}%`;
  });
  document.querySelectorAll('progress').forEach((node) => {
    node.value = reviewedCount();
  });
}

function confirmCurrentTopic() {
  const sourceId = factors[state.currentIndex].id;
  const selected = selectedTargets(sourceId);
  if (!selected.length && !hasExplicitNone(sourceId)) return;

  state.answers = applySourceSelections(state.answers, pairs, sourceId, selected);
  if (!state.reviewedFactors.includes(sourceId)) state.reviewedFactors.push(sourceId);
  state.reviewedFactors = factorIds.filter((id) => state.reviewedFactors.includes(id));
  const returnToReview = state.editingFromReview;
  state.editingFromReview = false;
  persist();

  if (returnToReview) {
    if (allTopicsReviewed()) {
      goTo('review');
    } else {
      state.currentIndex = firstUnreviewedIndex();
      persist();
      render();
      pageTop();
      focusPageHeading();
    }
    return;
  }

  if (state.currentIndex === factors.length - 1 && allTopicsReviewed()) {
    goTo('qualitative');
    return;
  }

  state.currentIndex += 1;
  persist();
  render();
  pageTop();
  focusPageHeading();
}

function buildCurrentSubmission() {
  const participant = {
    code: state.participant.code.trim(),
    role: state.participant.role ? t(state.participant.role) : '',
    roleCode: state.participant.role,
    experience: state.participant.experience ? t(state.participant.experience) : '',
    experienceCode: state.participant.experience,
  };
  const submission = buildSubmission({
    studyId: studyConfig.id,
    locale: state.locale,
    participant,
    factors: localisedFactors(state.locale),
    answers: state.answers,
    submittedAt: new Date().toISOString(),
  });

  return {
    ...submission,
    clientSubmissionId: state.clientSubmissionId,
    status: 'complete',
    collectionMethod: 'source-topic-multi-select-plus-qualitative-v1',
    qualitativeSectionComplete: state.qualitativeSectionComplete,
    qualitativeAnswers: Object.fromEntries(qualitativeQuestionIds.map((id) => [
      id,
      state.qualitativeAnswers[id].trim(),
    ])),
    confirmedTopics: {
      ids: [...state.reviewedFactors],
      total: factors.length,
      complete: allTopicsReviewed(),
    },
    sourceSelections: factorIds.map((sourceId) => ({
      sourceId,
      targetIds: selectedTargets(sourceId),
      noDirectInfluence: hasExplicitNone(sourceId),
    })),
    study: {
      title: localeText(studyConfig.title),
      scope: localeText(studyConfig.scope),
      factorVersion: studyConfig.version,
      relationDefinition: t('directOnly'),
      coding: { V: 'i→j', A: 'j→i', X: 'i↔j', O: 'no direct influence' },
    },
  };
}

function submissionResourceUrl(...segments) {
  const endpoint = new URL(resolveSubmissionEndpoint(), window.location.href);
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/${segments.map(encodeURIComponent).join('/')}`;
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint.toString();
}

function isFrozenResultCard(value, submissionId) {
  return value && typeof value === 'object'
    && value.version === 'm1-direct-structure-card-v1'
    && value.submissionId === submissionId
    && typeof value.frozenAt === 'string'
    && Number.isFinite(Date.parse(value.frozenAt))
    && value.topicCount === factors.length
    && Number.isInteger(value.directLinkCount)
    && Array.isArray(value.leadingTopics)
    && Array.isArray(value.receivingTopics);
}

async function loadFrozenResult() {
  if (!state.submissionId) return;
  if (state.feedbackSubmittedAt && state.frozenResultCard) {
    state.frozenResultVerified = true;
    state.frozenResultState = 'verified';
    state.feedbackState = 'success';
    if (state.screen !== 'complete') goTo('complete');
    else render();
    return;
  }
  state.frozenResultState = 'loading';
  state.frozenResultVerified = false;
  state.feedbackState = 'idle';
  if (state.screen !== 'complete') goTo('complete');
  else render();

  if (!state.feedbackToken) {
    state.frozenResultState = 'error';
    render();
    return;
  }

  try {
    const response = await fetch(submissionResourceUrl(state.submissionId, 'frozen-result'), {
      headers: { authorization: `Bearer ${state.feedbackToken}` },
    });
    if (!response.ok) throw new Error('frozen result verification failed');
    const payload = await response.json();
    if (!isFrozenResultCard(payload.resultCard, state.submissionId)) {
      throw new Error('frozen result is invalid');
    }
    state.frozenResultCard = payload.resultCard;
    state.frozenResultVerified = true;
    state.frozenResultState = 'verified';
    state.feedbackSubmittedAt = String(payload.feedbackSubmittedAt || '');
    persist();
    render();
  } catch {
    state.frozenResultState = 'error';
    state.frozenResultVerified = false;
    render();
  }
}

async function submitFeedback() {
  if (!state.frozenResultVerified || !state.frozenResultCard || state.feedbackSubmittedAt
    || state.feedbackState === 'saving') return;
  state.feedbackState = 'saving';
  render();
  try {
    const response = await fetch(submissionResourceUrl(state.submissionId, 'feedback'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${state.feedbackToken}`,
      },
      body: JSON.stringify({ answer: state.qualitativeAnswers.q7.trim() }),
    });
    if (!response.ok) throw new Error('feedback submit failed');
    const receipt = await response.json();
    if (!receipt.feedbackSubmittedAt) throw new Error('missing feedback receipt');
    state.feedbackSubmittedAt = receipt.feedbackSubmittedAt;
    state.qualitativeAnswers.q7 = '';
    state.feedbackToken = '';
    state.feedbackState = 'success';
    persist();
    render();
    pageTop();
    focusPageHeading();
  } catch {
    state.feedbackState = 'error';
    render();
  }
}

async function submitResponse() {
  if (!allTopicsReviewed() || !state.qualitativeSectionComplete || state.submitState === 'submitting') return;
  let clientSubmissionId = state.clientSubmissionId;
  state.submitState = 'submitting';
  render();

  try {
    if (!clientSubmissionId) {
      clientSubmissionId = createClientSubmissionId();
      state.clientSubmissionId = clientSubmissionId;
      persist();
    }
    if (!state.feedbackToken) {
      state.feedbackToken = createFeedbackCapabilityToken();
      persist();
    }
    const response = await fetch(resolveSubmissionEndpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${state.feedbackToken}`,
      },
      body: JSON.stringify(buildCurrentSubmission()),
    });
    if (!response.ok) throw new Error('submit failed');
    const receipt = await response.json();
    if (!receipt.submissionId || !isFrozenResultCard(receipt.resultCard, receipt.submissionId)) {
      throw new Error('missing frozen result');
    }
    if (state.clientSubmissionId !== clientSubmissionId) return;

    state.submissionId = receipt.submissionId;
    state.completedAt = receipt.receivedAt || new Date().toISOString();
    state.frozenResultCard = receipt.resultCard;
    state.frozenResultVerified = true;
    state.frozenResultState = 'verified';
    state.feedbackSubmittedAt = '';
    state.qualitativeAnswers = {
      ...state.qualitativeAnswers,
      ...Object.fromEntries(qualitativeQuestionIds.map((id) => [id, ''])),
    };
    state.submitState = 'success';
    persist();
    goTo('complete');
  } catch {
    if (clientSubmissionId && state.clientSubmissionId !== clientSubmissionId) return;
    state.submitState = 'error';
    render();
    document.querySelector('.submit-error')?.focus?.();
  }
}

languageSwitch.addEventListener('click', (event) => {
  const button = event.target.closest('[data-locale]');
  if (!button) return;
  state.locale = button.dataset.locale;
  const url = new URL(window.location.href);
  url.searchParams.set('lang', state.locale);
  window.history.replaceState(null, '', url);
  persist();
  render();
  languageSwitch.querySelector(`[data-locale="${state.locale}"]`)?.focus({ preventScroll: true });
});

guideButton?.addEventListener('click', openGuide);
guideClose?.addEventListener('click', closeGuide);
guidePrevious?.addEventListener('click', () => {
  if (guideIndex === 0) return;
  showGuideStep(guideIndex - 1);
});
guideNext?.addEventListener('click', () => {
  if (guideIndex === guideSessionSteps.length - 1) {
    closeGuide();
    return;
  }
  showGuideStep(guideIndex + 1);
});
guideOverlay?.addEventListener('click', (event) => {
  if (event.target === guideOverlay) closeGuide();
});
guideOverlay?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeGuide();
  }
});
window.addEventListener('resize', positionGuide);
window.addEventListener('scroll', positionGuide, { passive: true });

app.addEventListener('submit', (event) => {
  if (event.target.id === 'qualitative-form') {
    event.preventDefault();
    state.qualitativeSectionComplete = true;
    persist();
    goTo('review');
    return;
  }
  if (event.target.id === 'feedback-form') {
    event.preventDefault();
    void submitFeedback();
    return;
  }
  if (event.target.id !== 'profile-form') return;
  event.preventDefault();
  state.showValidation = true;
  if (!profileIsReady()) {
    render();
    document.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  state.showValidation = false;
  state.currentIndex = firstUnreviewedIndex();
  persist();
  goTo('survey');
});

app.addEventListener('input', (event) => {
  if (event.target.name === 'code') {
    state.participant.code = event.target.value;
    updateProfileValidation();
    persist();
    return;
  }
  if (event.target.name === 'qualitative-answer') {
    const questionId = event.target.dataset.questionId;
    if (!qualitativeQuestionIds.includes(questionId)) return;
    state.qualitativeAnswers[questionId] = event.target.value.slice(0, maxQualitativeAnswerLength);
    document.querySelector(`[data-char-count="${questionId}"]`)?.replaceChildren(
      document.createTextNode(t('qualitativeCharCount', { n: state.qualitativeAnswers[questionId].length })),
    );
    persist();
    return;
  }
  if (event.target.name === 'feedback-answer') {
    state.qualitativeAnswers.q7 = event.target.value.slice(0, maxQualitativeAnswerLength);
    document.querySelector('[data-char-count="q7"]')?.replaceChildren(
      document.createTextNode(t('qualitativeCharCount', { n: state.qualitativeAnswers.q7.length })),
    );
    persist();
  }
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.name === 'role') {
    state.participant.role = target.value;
    updateProfileValidation();
    persist();
    return;
  }
  if (target.name === 'experience') {
    state.participant.experience = target.value;
    persist();
    return;
  }
  if (target.name !== 'direct-target') return;

  const sourceId = target.dataset.sourceId;
  if (target.value === NONE_VALUE) {
    state.factorSelections[sourceId] = [];
    state.noInfluenceFactors = target.checked
      ? [...new Set([...state.noInfluenceFactors, sourceId])]
      : state.noInfluenceFactors.filter((id) => id !== sourceId);
  } else {
    const selected = new Set(selectedTargets(sourceId));
    if (target.checked) selected.add(target.value);
    else selected.delete(target.value);
    state.factorSelections[sourceId] = factorIds.filter((id) => selected.has(id));
    state.noInfluenceFactors = state.noInfluenceFactors.filter((id) => id !== sourceId);
  }

  markCurrentTopicPending(sourceId);
  persist();
  updateSurveySelectionUi(sourceId);
});

app.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (state.submitState === 'submitting') return;

  switch (button.dataset.action) {
    case 'stage-nav':
      navigateToStage(button.dataset.stage);
      break;
    case 'topic-index':
      navigateToTopic(Number(button.dataset.topicIndex));
      break;
    case 'start':
      if (state.submissionId) {
        void loadFrozenResult();
      } else if (profileIsReady() && allTopicsReviewed()) {
        goTo(state.qualitativeSectionComplete ? 'review' : 'qualitative');
      } else if (profileIsReady()) {
        state.currentIndex = firstUnreviewedIndex();
        goTo('survey');
      } else {
        goTo('profile');
      }
      break;
    case 'back-welcome':
      goTo('welcome');
      break;
    case 'previous-topic':
      if (state.currentIndex > 0) state.currentIndex -= 1;
      state.editingFromReview = false;
      persist();
      render();
      pageTop();
      focusPageHeading();
      break;
    case 'toggle-topic-notes':
      toggleTopicNotes(button);
      break;
    case 'confirm-topic':
      confirmCurrentTopic();
      break;
    case 'edit-topic':
      state.currentIndex = factors.findIndex((factor) => factor.id === button.dataset.factorId);
      state.editingFromReview = true;
      persist();
      goTo('survey');
      break;
    case 'back-to-survey':
      state.currentIndex = factors.length - 1;
      state.editingFromReview = false;
      persist();
      goTo('survey');
      break;
    case 'back-qualitative':
      goTo('qualitative');
      break;
    case 'verify-result':
      void loadFrozenResult();
      break;
    case 'save-feedback':
      void submitFeedback();
      break;
    case 'back-survey':
      state.currentIndex = factors.length - 1;
      state.editingFromReview = true;
      persist();
      goTo('survey');
      break;
    case 'submit-response':
      void submitResponse();
      break;
    case 'new-response':
      if (!state.confirmNewResponse) {
        state.confirmNewResponse = true;
        render();
        document.querySelector('[data-action="new-response"]')?.focus({ preventScroll: true });
        break;
      }
      {
        const locale = state.locale;
        try {
          if (storageAvailable) window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          storageAvailable = false;
        }
        state = blankState(locale);
        render();
        pageTop();
        focusPageHeading();
      }
      break;
    default:
      break;
  }
});

document.addEventListener('click', (event) => {
  if (state.screen !== 'survey') return;
  const notes = document.querySelector('.topic-notes');
  const toggle = event.target.closest?.('[data-action="toggle-topic-notes"]');
  if (!notes || notes.hidden || toggle || notes.contains(event.target)) return;
  closeTopicNotes();
});

render();
