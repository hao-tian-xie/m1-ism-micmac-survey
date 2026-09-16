import {
  applySourceSelections,
  buildDirectMatrix,
  buildSubmission,
  m1ResultSnapshotMatches,
  createPairs,
  MAX_QUALITATIVE_ANSWER_LENGTH,
  qualitativeAnswersAreComplete,
  selectedTargetsForSource,
  tryWriteStorage,
} from './survey-core.mjs';
import { displayTopicName, localisedFactors, studyConfig } from './survey-config.mjs?v=topic-definitions-contains-20260908';
import { copy, languageNames, locales } from './translations.mjs?v=interview-freeze-q7-20260916';
import { resolveSubmissionEndpoint } from './api-endpoint.mjs';
import { resolveLocale } from './locale-state.mjs';
import { guideStepsForScreen } from './guide-steps.mjs';
import {
  canFreezeM1,
  canNavigateToStage,
  canShowQ7,
  canStartM1,
  topicIsAvailable,
} from './navigation-rules.mjs';
import { attachTopicDefinitionHints } from './topic-definition-hints.mjs';

const STORAGE_KEY = `bextools:${studyConfig.id}:${studyConfig.version}`;
const NONE_VALUE = '__none__';
const factors = studyConfig.factors;
const factorIds = factors.map((factor) => factor.id);
const pairs = createPairs(factors);
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
const interviewQuestionIds = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
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

function emptyInterviewResponses() {
  return Object.fromEntries(interviewQuestionIds.map((id) => [id, '']));
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function blankState(locale = preferredLocale()) {
  return {
    locale,
    screen: 'welcome',
    participant: { code: '', role: '', experience: '' },
    interviewResponses: emptyInterviewResponses(),
    interviewCompletedAt: '',
    m1StartedAt: '',
    m1FreezeAttempted: false,
    m1FrozenAt: '',
    m1FreezeReceiptId: '',
    freezeState: 'idle',
    m1ResultSnapshot: null,
    q7Response: '',
    answers: {},
    factorSelections: emptySelections(),
    noInfluenceFactors: [],
    reviewedFactors: [],
    currentIndex: 0,
    editingFromReview: false,
    showValidation: false,
    showInterviewValidation: false,
    showQ7Validation: false,
    completedAt: '',
    submissionId: '',
    clientSubmissionId: '',
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
    const interviewResponses = {
      ...emptyInterviewResponses(),
      ...(saved.interviewResponses && typeof saved.interviewResponses === 'object'
        ? Object.fromEntries(interviewQuestionIds.map((id) => [id, String(saved.interviewResponses[id] || '').slice(0, MAX_QUALITATIVE_ANSWER_LENGTH)]))
        : {}),
    };
    const interviewCompletedAt = qualitativeAnswersAreComplete(interviewResponses)
      && isTimestamp(saved.interviewCompletedAt)
      ? String(saved.interviewCompletedAt || '')
      : '';
    const m1StartedAt = interviewCompletedAt && isTimestamp(saved.m1StartedAt)
      ? String(saved.m1StartedAt)
      : '';
    const m1FreezeAttempted = Boolean(saved.m1FreezeAttempted);
    const submissionId = String(saved.submissionId || '');
    const locale = resolveLocale({
      queryLocale: new URLSearchParams(window.location.search).get('lang'),
      savedLocale: saved.locale,
      browserLocale: navigator.language || '',
      locales,
    });

    const savedFrozenAt = isTimestamp(saved.m1FrozenAt) ? String(saved.m1FrozenAt) : '';
    const m1FreezeReceiptId = String(saved.m1FreezeReceiptId || '');
    const freezeMatrix = buildDirectMatrix(localisedFactors(locale), answers).map((row, rowIndex) => (
        row.map((value, columnIndex) => (rowIndex === columnIndex ? 0 : value))
    ));
    const savedSnapshot = saved.m1ResultSnapshot;
    const m1Frozen = Boolean(savedFrozenAt
      && m1FreezeReceiptId
      && m1StartedAt
      && reviewedFactors.length === factors.length
      && pairs.every((pair) => answers[pair.id]?.relation)
      && m1ResultSnapshotMatches({
        snapshot: savedSnapshot,
        factorVersion: studyConfig.version,
        factors: localisedFactors(locale),
        directInfluenceMatrix: freezeMatrix,
      }));
    const m1ResultSnapshot = m1Frozen ? savedSnapshot : null;

    return {
      ...blankState(locale),
      ...saved,
      locale,
      screen: 'welcome',
      answers,
      factorSelections,
      noInfluenceFactors,
      reviewedFactors,
      interviewResponses,
      interviewCompletedAt,
      m1StartedAt,
      m1FreezeAttempted,
      m1FrozenAt: m1ResultSnapshot ? savedFrozenAt : '',
      m1FreezeReceiptId: m1ResultSnapshot ? m1FreezeReceiptId : '',
      freezeState: m1ResultSnapshot ? 'frozen' : (m1FreezeAttempted ? 'error' : 'idle'),
      m1ResultSnapshot,
      q7Response: String(saved.q7Response || '').slice(0, MAX_QUALITATIVE_ANSWER_LENGTH),
      participant: { ...blankState(locale).participant, ...(saved.participant || {}) },
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

function interviewIsComplete() {
  return qualitativeAnswersAreComplete(state.interviewResponses);
}

function m1IsFrozen() {
  return Boolean(state.m1FrozenAt && state.m1FreezeReceiptId && state.m1ResultSnapshot);
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
    showValidation: false,
    showInterviewValidation: false,
    showQ7Validation: false,
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
  if (!canNavigateToStage(state.screen, targetStage, {
    m1Started: Boolean(state.m1StartedAt),
    m1Frozen: m1IsFrozen(),
    m1FreezeAttempted: state.m1FreezeAttempted,
  })) return;
  const fromReview = state.screen === 'review';

  if (targetStage === 'profile') {
    state.editingFromReview = fromReview;
    state.showValidation = false;
    goTo('profile');
    return;
  }

  if (targetStage === 'interview') {
    state.showInterviewValidation = false;
    goTo('interview');
    return;
  }

  if (targetStage === 'survey') {
    state.currentIndex = fromReview ? 0 : Math.min(state.currentIndex, factors.length - 1);
    state.editingFromReview = fromReview;
    goTo('survey');
  }
}

function navigateToTopic(index) {
  if (state.screen !== 'survey' || m1IsFrozen() || !Number.isInteger(index) || !factors[index]) return;
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
    interview: 1,
    survey: 2,
    review: 3,
    results: 4,
    complete: 4,
  }[state.screen] ?? 0;
  const steps = [t('stepProfile'), t('stepInterview'), t('stepSurvey'), t('stepReview'), t('stepResults')];
  const stageIds = ['profile', 'interview', 'survey', 'review', 'results'];
  const stageItems = steps.map((label, index) => {
    const stage = stageIds[index];
    const isActive = state.screen !== 'complete' && index === activeIndex;
    const isDone = state.screen === 'complete' || index < activeIndex;
    const canGoBack = canNavigateToStage(state.screen, stage, {
      m1Started: Boolean(state.m1StartedAt),
      m1Frozen: m1IsFrozen(),
      m1FreezeAttempted: state.m1FreezeAttempted,
    });
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

function renderInterview() {
  const questions = interviewQuestionIds.map((id, index) => {
    const isInvalid = state.showInterviewValidation && !state.interviewResponses[id].trim();
    const questionId = `interview-${id}`;
    return `
      <fieldset class="interview-question-card">
        <legend>
          <span class="interview-question-number">Q${index + 1}</span>
          <span class="interview-question-copy">${escapeHtml(t(`interview${id.toUpperCase()}`))}<em aria-hidden="true">*</em></span>
        </legend>
        <textarea id="${questionId}" name="interview-${id}" data-interview-answer="${id}" rows="3" maxlength="${MAX_QUALITATIVE_ANSWER_LENGTH}" required aria-required="true" aria-invalid="${isInvalid}" ${isInvalid ? `aria-describedby="interview-error-${id}"` : ''} placeholder="${escapeHtml(t('interviewPlaceholder'))}">${escapeHtml(state.interviewResponses[id])}</textarea>
        ${isInvalid ? `<p class="form-error interview-field-error" id="interview-error-${id}" role="alert">${escapeHtml(t('interviewRequired'))}</p>` : ''}
      </fieldset>
    `;
  }).join('');
  const hasErrors = state.showInterviewValidation && !interviewIsComplete();

  return renderShell(`
    <div class="interview-page">
      <header class="page-heading interview-heading">
        <p class="eyebrow">${escapeHtml(t('interviewEyebrow'))}</p>
        <h1 data-page-title tabindex="-1">${escapeHtml(t('interviewTitle'))}</h1>
        <p>${escapeHtml(t('interviewIntro'))}</p>
        <p class="interview-privacy">${escapeHtml(t('interviewPrivacy'))}</p>
      </header>

      <form class="interview-form" id="interview-form" novalidate>
        <div class="interview-question-list">${questions}</div>
        ${hasErrors ? `<p class="form-error interview-error" id="interview-error" role="alert">${escapeHtml(t('requiredMessage'))}</p>` : ''}
        <div class="form-actions interview-actions">
          <button class="text-button" type="button" data-action="back-profile"><span aria-hidden="true">←</span>${escapeHtml(t('interviewBack'))}</button>
          <button class="primary-button" type="submit">${escapeHtml(t('interviewContinue'))}<span aria-hidden="true">→</span></button>
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
          ${escapeHtml(state.editingFromReview ? t('confirmAndReview') : isLast ? t('confirmAndReview') : t('confirmAndNext'))}<span aria-hidden="true">→</span>
        </button>
      </div>
      <section class="topic-notes" aria-label="${escapeHtml(t('candidateNotes'))}" hidden tabindex="-1">
        <h2>${escapeHtml(t('candidateNotes'))}</h2>
        <ul>${topicNotes}</ul>
      </section>
    </div>
  `, 'survey-shell');
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
  const isSubmitting = state.submitState === 'submitting' || state.freezeState === 'submitting';
  const freezeUnconfirmed = state.m1FreezeAttempted && !m1IsFrozen();
  const topicRows = factors.map((factor, index) => {
    const source = factorFor(factor.id);
    const selected = selectedTargets(source.id).map((id) => factorFor(id).label);
    return `
      <button class="topic-review-row" type="button" data-action="edit-topic" data-factor-id="${source.id}" ${isSubmitting || freezeUnconfirmed ? 'disabled' : ''}>
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
        <p>${escapeHtml(t('freezeNotice'))}</p>
      </header>

      <div class="review-summary">
        <article><span>${escapeHtml(t('confirmedTopics'))}</span><b>${reviewedCount()} / ${factors.length}</b></article>
        <article><span>${escapeHtml(t('directLinks'))}</span><b>${directLinkCount()}</b></article>
        <article><span>${escapeHtml(t('allTopics'))}</span><b>${factors.length}</b></article>
      </div>

      <div class="review-actions">
        <button class="text-button" type="button" data-action="back-survey" ${isSubmitting || freezeUnconfirmed ? 'disabled' : ''}><span aria-hidden="true">←</span>${escapeHtml(t('back'))}</button>
        <button class="primary-button" type="button" data-action="freeze-results" ${isSubmitting || freezeUnconfirmed || !allTopicsReviewed() ? 'disabled' : ''}>
          ${escapeHtml(state.freezeState === 'submitting' ? t('freezingResults') : t('freezeResults'))}<span aria-hidden="true">→</span>
        </button>
      </div>
      ${state.freezeState === 'error' ? `<div class="submit-error" role="alert"><span>${escapeHtml(t('freezeError'))}</span><button type="button" data-action="freeze-results">${escapeHtml(t('retryFreeze'))}</button></div>` : ''}

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
    </div>
  `, 'review-shell');
}

function renderResults() {
  if (!canShowQ7({
    interviewComplete: interviewIsComplete(),
    m1Frozen: m1IsFrozen(),
    resultSnapshot: state.m1ResultSnapshot,
  })) {
    return renderShell(`
      <div class="results-page">
        <header class="page-heading results-heading">
          <p class="eyebrow">${escapeHtml(t('resultsEyebrow'))}</p>
          <h1 data-page-title tabindex="-1">${escapeHtml(t('resultsTitle'))}</h1>
        </header>
        <p class="results-locked-message" role="status">${escapeHtml(t('q7MustWait'))}</p>
      </div>
    `, 'results-shell');
  }

  const snapshot = state.m1ResultSnapshot;
  const localFactors = localisedFactors(state.locale);
  const labelsById = new Map(localFactors.map((factor) => [factor.id, displayTopicName(factor.name, state.locale)]));
  const dateLabel = new Date(snapshot.frozenAt).toLocaleString(state.locale, { dateStyle: 'medium', timeStyle: 'short' });
  const metrics = snapshot.metrics;
  const rankList = (field) => [...metrics]
    .filter((item) => item[field] > 0)
    .sort((left, right) => right[field] - left[field] || factorIds.indexOf(left.id) - factorIds.indexOf(right.id))
    .slice(0, 5)
    .map((item) => `
      <li><span class="result-rank-topic"><b>${item.id}</b>${escapeHtml(labelsById.get(item.id) || item.id)}</span><strong>${item[field]}</strong></li>
    `).join('');
  const metricRows = metrics.map((item) => `
    <tr>
      <th scope="row"><span>${item.id}</span><b>${escapeHtml(labelsById.get(item.id) || item.id)}</b></th>
      <td>${item.drivingPower}</td>
      <td>${item.dependence}</td>
    </tr>
  `).join('');
  const q7Invalid = state.showQ7Validation && !state.q7Response.trim();

  return renderShell(`
    <div class="results-page">
      <header class="page-heading results-heading">
        <p class="eyebrow">${escapeHtml(t('resultsEyebrow'))}</p>
        <h1 data-page-title tabindex="-1">${escapeHtml(t('resultsTitle'))}</h1>
      </header>

      <section class="result-card" aria-labelledby="result-card-title">
        <div class="result-card-topline">
          <h2 id="result-card-title">${escapeHtml(t('resultFrozen'))}</h2>
          <span>${escapeHtml(dateLabel)}</span>
        </div>
        <p class="result-card-intro">${escapeHtml(t('resultCardIntro'))}</p>

        <div class="result-summary">
          <article><span>${escapeHtml(t('resultDirectLinks'))}</span><b>${snapshot.directLinkCount}</b></article>
          <article><span>${escapeHtml(t('allTopics'))}</span><b>${snapshot.metrics.length}</b></article>
        </div>

        <div class="result-highlights">
          <section>
            <h3>${escapeHtml(t('resultTopDrivers'))}</h3>
            <ol>${rankList('drivingPower') || `<li>${escapeHtml(t('noneResult'))}</li>`}</ol>
          </section>
          <section>
            <h3>${escapeHtml(t('resultTopReceivers'))}</h3>
            <ol>${rankList('dependence') || `<li>${escapeHtml(t('noneResult'))}</li>`}</ol>
          </section>
        </div>

        <section class="result-metrics-section">
          <h3>${escapeHtml(t('resultMetricHeading'))}</h3>
          <div class="result-metrics-scroll" role="region" tabindex="0" aria-label="${escapeHtml(t('resultMetricHeading'))}">
            <table class="result-metrics-table">
              <thead><tr><th scope="col">${escapeHtml(t('resultTopic'))}</th><th scope="col">${escapeHtml(t('resultDrivingPower'))}</th><th scope="col">${escapeHtml(t('resultDependence'))}</th></tr></thead>
              <tbody>${metricRows}</tbody>
            </table>
          </div>
        </section>
      </section>

      <section class="interpretation-section" aria-labelledby="interpretation-title">
        <header>
          <p class="eyebrow">${escapeHtml(t('interpretationTitle'))}</p>
          <h2 id="interpretation-title">${escapeHtml(t('interpretationQuestion'))}</h2>
        </header>
        <form class="interpretation-form" id="interpretation-form" novalidate>
          <textarea id="q7-response" name="q7-response" rows="5" maxlength="${MAX_QUALITATIVE_ANSWER_LENGTH}" required aria-required="true" aria-invalid="${q7Invalid}" ${state.submitState === 'error' ? 'readonly' : ''} ${q7Invalid ? 'aria-describedby="q7-error"' : ''} placeholder="${escapeHtml(t('interpretationPlaceholder'))}">${escapeHtml(state.q7Response)}</textarea>
          ${q7Invalid ? `<p class="form-error" id="q7-error" role="alert">${escapeHtml(t('interpretationRequired'))}</p>` : ''}
          <div class="form-actions result-actions">
            <span></span>
            <button class="primary-button" type="submit" ${state.submitState === 'submitting' ? 'disabled' : ''}>${escapeHtml(state.submitState === 'submitting' ? t('submitting') : t('submitResponse'))}<span aria-hidden="true">→</span></button>
          </div>
        </form>
        ${state.submitState === 'error' ? `
          <div class="submit-error" role="alert">
            <span>${escapeHtml(t('submitError'))}</span>
            <button type="button" data-action="submit-response">${escapeHtml(t('retrySubmit'))}</button>
          </div>
        ` : ''}
      </section>
    </div>
  `, 'results-shell');
}

function renderComplete() {
  return renderShell(`
    <div class="complete-page">
      <h1 data-page-title tabindex="-1">${escapeHtml(t('completeTitle'))}</h1>

      <div class="receipt-block">
        <span>${escapeHtml(t('receiptLabel'))}</span>
        <strong>${escapeHtml(state.submissionId)}</strong>
      </div>

      <div class="complete-actions">
        <button class="secondary-button ${state.confirmNewResponse ? 'confirm-reset' : ''}" type="button" data-action="new-response">
          ${escapeHtml(state.confirmNewResponse ? t('confirmNewResponse') : t('newResponse'))}
        </button>
      </div>
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
    interview: renderInterview,
    survey: renderSurvey,
    review: renderReview,
    results: renderResults,
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

function updateInterviewValidation() {
  if (!state.showInterviewValidation) return;
  interviewQuestionIds.forEach((id) => {
    const input = document.querySelector(`[data-interview-answer="${id}"]`);
    const isValid = Boolean(state.interviewResponses[id].trim());
    input?.setAttribute('aria-invalid', String(!isValid));
    if (isValid) {
      input?.removeAttribute('aria-describedby');
      document.querySelector(`#interview-error-${id}`)?.remove();
    } else {
      input?.setAttribute('aria-describedby', `interview-error-${id}`);
    }
  });
  if (interviewIsComplete()) {
    state.showInterviewValidation = false;
    document.querySelector('#interview-error')?.remove();
  }
}

function updateQ7Validation() {
  if (!state.showQ7Validation) return;
  const input = document.querySelector('#q7-response');
  const isValid = Boolean(state.q7Response.trim());
  input?.setAttribute('aria-invalid', String(!isValid));
  if (isValid) {
    state.showQ7Validation = false;
    input?.removeAttribute('aria-describedby');
    document.querySelector('#q7-error')?.remove();
  } else {
    input?.setAttribute('aria-describedby', 'q7-error');
  }
}

function enterM1() {
  if (!canStartM1({
    profileReady: profileIsReady(),
    interviewComplete: interviewIsComplete(),
    m1Frozen: m1IsFrozen(),
  })) return;
  state.interviewCompletedAt ||= new Date().toISOString();
  state.m1StartedAt ||= new Date().toISOString();
  state.currentIndex = firstUnreviewedIndex();
  state.showInterviewValidation = false;
  persist();
  goTo(allTopicsReviewed() ? 'review' : 'survey');
}

async function freezeM1Results() {
  if (!canFreezeM1({
    interviewComplete: interviewIsComplete(),
    m1Started: Boolean(state.m1StartedAt),
    allTopicsReviewed: allTopicsReviewed(),
    m1Frozen: m1IsFrozen(),
  }) || state.freezeState === 'submitting') return;

  const clientSubmissionId = state.clientSubmissionId || createClientSubmissionId();
  state.clientSubmissionId = clientSubmissionId;
  state.m1FreezeAttempted = true;
  state.freezeState = 'submitting';
  persist();
  render();

  try {
    const freezeRequest = {
      ...buildCurrentSubmission(),
      phase: 'm1-freeze',
      status: 'm1-freeze-request',
      requestedAt: new Date().toISOString(),
    };
    delete freezeRequest.submittedAt;
    delete freezeRequest.m1ResultSnapshot;
    delete freezeRequest.q7Response;
    const response = await fetch(resolveSubmissionEndpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(freezeRequest),
    });
    if (!response.ok) throw new Error('freeze failed');
    const receipt = await response.json();
    const localFactors = localisedFactors(state.locale);
    const directInfluenceMatrix = buildDirectMatrix(localFactors, state.answers).map((row, rowIndex) => (
      row.map((value, columnIndex) => (rowIndex === columnIndex ? 0 : value))
    ));
    if (!receipt.submissionId
      || !isTimestamp(receipt.frozenAt)
      || receipt.m1ResultSnapshot?.frozenAt !== receipt.frozenAt
      || !m1ResultSnapshotMatches({
        snapshot: receipt.m1ResultSnapshot,
        factorVersion: studyConfig.version,
        factors: localFactors,
        directInfluenceMatrix,
      })) throw new Error('invalid freeze receipt');
    if (state.clientSubmissionId !== clientSubmissionId) return;

    state.m1FreezeReceiptId = receipt.submissionId;
    state.m1FrozenAt = receipt.frozenAt;
    state.m1ResultSnapshot = receipt.m1ResultSnapshot;
    state.freezeState = 'frozen';
    state.showQ7Validation = false;
    persist();
    goTo('results');
  } catch {
    if (state.clientSubmissionId !== clientSubmissionId) return;
    state.freezeState = 'error';
    persist();
    render();
    document.querySelector('.submit-error')?.focus?.();
  }
}

function firstUnreviewedIndex() {
  const index = factors.findIndex((factor) => !state.reviewedFactors.includes(factor.id));
  return index < 0 ? 0 : index;
}

function markCurrentTopicPending(sourceId) {
  if (m1IsFrozen()) return;
  state.reviewedFactors = state.reviewedFactors.filter((id) => id !== sourceId);
  state.completedAt = '';
  state.submissionId = '';
  state.clientSubmissionId = '';
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
  if (state.screen !== 'survey' || m1IsFrozen()) return;
  const sourceId = factors[state.currentIndex].id;
  const selected = selectedTargets(sourceId);
  if (!selected.length && !hasExplicitNone(sourceId)) return;

  state.answers = applySourceSelections(state.answers, pairs, sourceId, selected);
  if (!state.reviewedFactors.includes(sourceId)) state.reviewedFactors.push(sourceId);
  state.reviewedFactors = factorIds.filter((id) => state.reviewedFactors.includes(id));
  const returnToReview = state.editingFromReview;
  state.editingFromReview = false;
  persist();

  if (returnToReview || state.currentIndex === factors.length - 1) {
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
    schemaVersion: 2,
    locale: state.locale,
    participant,
    factors: localisedFactors(state.locale),
    answers: state.answers,
    submittedAt: new Date().toISOString(),
  });

  return {
    ...submission,
    schemaVersion: 2,
    clientSubmissionId: state.clientSubmissionId,
    status: 'complete',
    collectionMethod: 'source-topic-multi-select-v1',
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
    qualitativeResponses: {
      phase: 'before-m1',
      completedAt: state.interviewCompletedAt,
      answers: Object.fromEntries(interviewQuestionIds.map((id) => [id, state.interviewResponses[id].trim()])),
    },
    m1ResultSnapshot: state.m1ResultSnapshot,
    q7Response: state.q7Response.trim(),
    study: {
      title: localeText(studyConfig.title),
      scope: localeText(studyConfig.scope),
      factorVersion: studyConfig.version,
      relationDefinition: t('directOnly'),
      coding: { V: 'i→j', A: 'j→i', X: 'i↔j', O: 'no direct influence' },
    },
  };
}

async function submitResponse() {
  if (!allTopicsReviewed()
    || !canShowQ7({
      interviewComplete: interviewIsComplete(),
      m1Frozen: m1IsFrozen(),
      resultSnapshot: state.m1ResultSnapshot,
    })
    || state.submitState === 'submitting') return;
  state.showQ7Validation = true;
  if (!state.q7Response.trim() || state.q7Response.length > MAX_QUALITATIVE_ANSWER_LENGTH) {
    render();
    document.querySelector('#q7-response')?.focus();
    return;
  }
  state.showQ7Validation = false;
  let clientSubmissionId = state.clientSubmissionId;
  state.submitState = 'submitting';
  render();

  try {
    if (!clientSubmissionId) {
      clientSubmissionId = createClientSubmissionId();
      state.clientSubmissionId = clientSubmissionId;
      persist();
    }
    const response = await fetch(resolveSubmissionEndpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 2,
        phase: 'q7-finalize',
        studyId: studyConfig.id,
        clientSubmissionId,
        freezeReceiptId: state.m1FreezeReceiptId,
        q7Response: state.q7Response.trim(),
      }),
    });
    if (!response.ok) throw new Error('submit failed');
    const receipt = await response.json();
    if (!receipt.submissionId) throw new Error('missing receipt');
    if (state.clientSubmissionId !== clientSubmissionId) return;

    state.submissionId = receipt.submissionId;
    state.completedAt = receipt.receivedAt || new Date().toISOString();
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
  event.preventDefault();
  if (event.target.id === 'profile-form') {
    state.showValidation = true;
    if (!profileIsReady()) {
      render();
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    state.showValidation = false;
    goTo('interview');
    return;
  }

  if (event.target.id === 'interview-form') {
    state.showInterviewValidation = true;
    if (!interviewIsComplete()) {
      render();
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    enterM1();
    return;
  }

  if (event.target.id === 'interpretation-form') void submitResponse();
});

app.addEventListener('input', (event) => {
  const target = event.target;
  if (target.name === 'code') {
    state.participant.code = target.value;
    updateProfileValidation();
    persist();
    return;
  }
  const interviewId = target.dataset.interviewAnswer;
  if (interviewId && interviewQuestionIds.includes(interviewId)) {
    state.interviewResponses[interviewId] = target.value;
    updateInterviewValidation();
    persist();
    return;
  }
  if (target.id === 'q7-response') {
    state.q7Response = target.value;
    updateQ7Validation();
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
  if (m1IsFrozen() || state.screen !== 'survey') return;

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
  if (state.submitState === 'submitting' || state.freezeState === 'submitting') return;

  switch (button.dataset.action) {
    case 'stage-nav':
      navigateToStage(button.dataset.stage);
      break;
    case 'topic-index':
      navigateToTopic(Number(button.dataset.topicIndex));
      break;
    case 'start':
      if (state.submissionId) {
        goTo('complete');
      } else if (m1IsFrozen()) {
        goTo('results');
      } else if (profileIsReady() && interviewIsComplete()) {
        enterM1();
      } else if (profileIsReady()) {
        goTo('interview');
      } else {
        goTo('profile');
      }
      break;
    case 'back-welcome':
      goTo('welcome');
      break;
    case 'back-profile':
      goTo('profile');
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
    case 'back-survey':
      if (m1IsFrozen()) break;
      state.currentIndex = factors.length - 1;
      state.editingFromReview = true;
      persist();
      goTo('survey');
      break;
    case 'freeze-results':
      void freezeM1Results();
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
