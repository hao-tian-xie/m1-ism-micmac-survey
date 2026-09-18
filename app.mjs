import {
  applySourceSelections,
  buildSubmission,
  createPairs,
  selectedTargetsForSource,
  tryWriteStorage,
} from './survey-core.mjs';
import { displayTopicName, studyConfig } from './survey-config.mjs?v=topic-definitions-contains-20260908';
import { copy, languageNames, locales } from './translations.mjs?v=live-question-config-v5';
import { resolveSubmissionEndpoint } from './api-endpoint.mjs';
import { resolveLocale } from './locale-state.mjs';
import { guideStepsForScreen } from './guide-steps.mjs?v=live-question-config-v5';
import { canNavigateToStage, topicIsAvailable } from './navigation-rules.mjs?v=live-question-config-v5';
import { joinTopicTextPages, splitTopicTextByFit, topicNodeFits } from './topic-pagination.mjs';
import {
  FALLBACK_PUBLIC_QUESTIONNAIRE,
  blankModuleValue,
  legacyQualitativeAnswers,
  loadPublicQuestionnaireConfig,
  moduleAnswerError,
  normalizeModuleValue,
  serializeModuleAnswer,
} from './public-questionnaire.mjs?v=live-question-config-v5';
import { attachTopicDefinitionHints } from './topic-definition-hints.mjs?v=live-question-config-v5';

const STORAGE_KEY_BASE = `bextools:${studyConfig.id}:${studyConfig.version}`;
const NONE_VALUE = '__none__';
let factors = studyConfig.factors;
let factorIds = factors.map((factor) => factor.id);
let pairs = createPairs(factors);
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
let questionnaireConfig = FALLBACK_PUBLIC_QUESTIONNAIRE;
let questionModules = [...questionnaireConfig.modules];
let detachTopicDefinitionHints = () => {};

function storageKeyForRevision(revision = questionnaireConfig.revision) {
  const questionnaireRevision = Number.isSafeInteger(revision) ? revision : 0;
  const topicRevision = Number.isSafeInteger(questionnaireConfig.topicRevision)
    ? questionnaireConfig.topicRevision
    : questionnaireRevision;
  const snapshotId = typeof questionnaireConfig.topicSnapshotId === 'string'
    ? questionnaireConfig.topicSnapshotId
    : '';
  let hash = 2166136261;
  for (const character of `${snapshotId}\u0000${factorIds.join('\u0000')}`) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${STORAGE_KEY_BASE}:q${questionnaireRevision}:t${topicRevision}:s${(hash >>> 0).toString(36)}`;
}

function activeFactorsFromConfig(config) {
  if (!Array.isArray(config?.topics)) return studyConfig.factors;
  return config.topics.map((topic) => ({
    id: topic.topicId || topic.id,
    name: topic.name,
    description: topic.description,
    category: topic.category || '',
    sourceIds: Array.isArray(topic.sourceIds) ? [...topic.sourceIds] : [topic.topicId || topic.id],
    ...(topic.esrs ? { esrs: topic.esrs } : {}),
  }));
}

function applyTopicConfig(config) {
  factors = activeFactorsFromConfig(config);
  factorIds = factors.map((factor) => factor.id);
  pairs = createPairs(factors);
}

function activeFactorLabel(factor, locale) {
  const raw = factor?.name ?? factor?.label ?? factor?.labels ?? factor?.id ?? '';
  return typeof raw === 'string' ? raw : displayTopicName(raw, locale);
}

function activeFactorDescription(factor, locale) {
  const raw = factor?.description ?? factor?.descriptions ?? '';
  return typeof raw === 'string' ? raw : (raw?.[locale] || raw?.en || '');
}

function localisedActiveFactors(locale) {
  return factors.map((factor) => ({
    id: factor.id,
    ...(Array.isArray(factor.sourceIds) ? { sourceIds: [...factor.sourceIds] } : {}),
    ...(factor.category ? { category: factor.category } : {}),
    label: activeFactorLabel(factor, locale),
    description: activeFactorDescription(factor, locale),
  }));
}

function topicSnapshot() {
  const revision = Number.isSafeInteger(questionnaireConfig.topicRevision)
    ? questionnaireConfig.topicRevision
    : questionnaireConfig.revision;
  let hash = 2166136261;
  for (const id of factorIds) {
    for (const character of id) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 0;
    hash = Math.imul(hash, 16777619);
  }
  const snapshotId = questionnaireConfig.topicSnapshotId
    || `${questionnaireConfig.questionnaireId}:topics:${revision}:${(hash >>> 0).toString(36)}`;
  return {
    snapshotId,
    revision,
    questionnaireConfigRevision: questionnaireConfig.revision,
    ids: [...factorIds],
    topicIds: [...factorIds],
    count: factorIds.length,
  };
}

function modulesForStage(stage) {
  return questionModules.filter((module) => module.stage === stage);
}

function beforeTopicModules() {
  return modulesForStage('before_topics');
}

function afterTopicModules() {
  return modulesForStage('after_topics');
}

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

function blankModuleAnswers() {
  return Object.fromEntries(questionModules.map((module) => [module.id, blankModuleValue(module)]));
}

function moduleVersions() {
  return Object.fromEntries(questionModules.map((module) => [module.id, module.version]));
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
    qualitativeIndex: 0,
    afterTopicsIndex: 0,
    showValidation: false,
    questionValidationId: '',
    questionValidationError: '',
    completedAt: '',
    submissionId: '',
    clientSubmissionId: '',
    moduleAnswers: blankModuleAnswers(),
    moduleAnswerVersions: moduleVersions(),
    questionnaireConfigRevision: questionnaireConfig.revision,
    topicSnapshot: topicSnapshot(),
    qualitativeSectionComplete: false,
    resultCard: null,
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
    // Read the revision-scoped draft first, then the pre-topic-config key so
    // revision-0 drafts remain resumable after the endpoint starts publishing
    // a topic snapshot.
    const serialized = localStorage.getItem(storageKeyForRevision())
      || localStorage.getItem(STORAGE_KEY_BASE);
    const saved = JSON.parse(serialized);
    if (!saved || typeof saved !== 'object') return blankState();
    const savedRevision = saved.questionnaireConfigRevision;
    const savedTopicIds = saved.topicSnapshot?.ids || saved.topicSnapshot?.topicIds || saved.topicIds;
    const revisionMatches = Number.isSafeInteger(savedRevision)
      ? savedRevision === questionnaireConfig.revision
      : questionnaireConfig.revision === 0;
    const topicIdsMatch = savedTopicIds === undefined
      || (Array.isArray(savedTopicIds)
        && savedTopicIds.length === factorIds.length
        && savedTopicIds.every((id, index) => id === factorIds[index]));
    if (!revisionMatches || !topicIdsMatch) return blankState();

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

    const savedResultCard = saved.resultCard && typeof saved.resultCard === 'object'
      ? saved.resultCard
      : null;
    const next = blankState(locale);
    next.locale = locale;
    next.participant = {
      ...next.participant,
      ...(saved.participant && typeof saved.participant === 'object' ? saved.participant : {}),
    };
    next.answers = answers;
    next.factorSelections = factorSelections;
    next.noInfluenceFactors = noInfluenceFactors;
    next.reviewedFactors = reviewedFactors;
    next.currentIndex = Math.min(Math.max(Number(saved.currentIndex) || 0, 0), factors.length - 1);
    next.qualitativeIndex = Math.min(
      Math.max(Number(saved.qualitativeIndex) || 0, 0),
      Math.max(0, beforeTopicModules().length - 1),
    );
    next.afterTopicsIndex = Math.min(
      Math.max(Number(saved.afterTopicsIndex) || 0, 0),
      Math.max(0, afterTopicModules().length - 1),
    );
    next.moduleAnswers = Object.fromEntries(questionModules.map((module) => {
      const versionMatches = saved.moduleAnswerVersions?.[module.id] === module.version;
      const legacyValue = questionnaireConfig.revision === 0 && module.version === 1
        ? saved.qualitativeAnswers?.[module.id]
        : undefined;
      const storedValue = versionMatches ? saved.moduleAnswers?.[module.id] : legacyValue;
      return [module.id, normalizeModuleValue(module, storedValue)];
    }));
    next.moduleAnswerVersions = moduleVersions();
    next.questionnaireConfigRevision = questionnaireConfig.revision;
    next.topicSnapshot = topicSnapshot();
    next.qualitativeSectionComplete = saved.qualitativeSectionComplete === true
      && beforeTopicModules().every((module) => !moduleAnswerError(module, next.moduleAnswers[module.id]));
    next.completedAt = submissionId ? String(saved.completedAt || '') : '';
    next.submissionId = submissionId;
    next.clientSubmissionId = submissionId ? '' : String(saved.clientSubmissionId || '');
    next.resultCard = savedResultCard;
    return next;
  } catch {
    storageAvailable = false;
    return blankState();
  }
}

let state = blankState();
let guideIndex = 0;
let guideReturnScreen = state.screen;
let guideIsOpen = false;
let guideSessionSteps = guideStepsForScreen(state.screen, { submitted: Boolean(state.submissionId) });
let persistTimer = null;
let lastPersistedSnapshot = '';
let sourceTopicPagination = null;
const topicDescriptionCache = new Map();

function t(key, values = {}) {
  const template = copy[state.locale][key] || copy.en[key] || key;
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

function localeText(value) {
  if (typeof value === 'string') return value;
  return value?.[state.locale] || value?.en || '';
}

function moduleCopy(module) {
  return module.translations?.[state.locale] || module.translations?.en || {
    prompt: module.id,
    helpText: '',
    placeholder: '',
  };
}

function optionLabel(option) {
  return option.translations?.[state.locale]?.label || option.translations?.en?.label || option.id;
}

function activeModuleById(id) {
  return questionModules.find((module) => module.id === id);
}

function moduleGlobalPosition(module) {
  return Math.max(0, questionModules.findIndex(({ id }) => id === module.id)) + 1;
}

function stableOptionHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function displayedModuleOptions(module) {
  if (!module.constraints.randomizeOptions) return module.options;
  const seed = `${questionnaireConfig.revision}:${module.id}:${state.participant.code.trim()}`;
  return module.options
    .map((option, index) => ({ option, index, score: stableOptionHash(`${seed}:${option.id}`) }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ option }) => option);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function reviewedCount() {
  return state.reviewedFactors.length;
}

function allTopicsReviewed() {
  return reviewedCount() === factors.length;
}

function firstInvalidBeforeTopicModule() {
  return firstInvalidModule(beforeTopicModules());
}

function firstInvalidModule(modules = questionModules) {
  return modules.find((module) => moduleAnswerError(module, state.moduleAnswers[module.id])) || null;
}

function beforeTopicModulesAreValid() {
  return !firstInvalidBeforeTopicModule();
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
    label: activeFactorLabel(factor, state.locale),
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

function persistedSnapshot() {
  // Once a response is submitted, retain only the receipt and server result.
  // Draft participant text and narrative answers should not remain in storage.
  if (state.submissionId) {
    return JSON.stringify({
      locale: state.locale,
      submissionId: state.submissionId,
      completedAt: state.completedAt,
      resultCard: state.resultCard,
    });
  }
  const snapshot = {
    ...state,
    screen: undefined,
    submitState: 'idle',
  };
  delete snapshot.resultCard;
  return JSON.stringify(snapshot);
}

function writePersistedSnapshot() {
  if (!storageAvailable) return false;
  const serialized = persistedSnapshot();
  if (serialized === lastPersistedSnapshot) return true;
  try {
    storageAvailable = tryWriteStorage(window.localStorage, storageKeyForRevision(), serialized);
    if (storageAvailable) lastPersistedSnapshot = serialized;
  } catch {
    storageAvailable = false;
  }
  return storageAvailable;
}

function persist({ immediate = false } = {}) {
  if (!storageAvailable) return false;
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (immediate) return writePersistedSnapshot();
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    writePersistedSnapshot();
  }, 250);
  return true;
}

function persistSoon() {
  return persist({ immediate: false });
}

function flushPersist() {
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  writePersistedSnapshot();
}

function pageTop() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function focusPageHeading() {
  document.querySelector('[data-page-title]')?.focus({ preventScroll: true });
}

// The topic screen has a fixed geometry so the THEN row and action bar do not
// move when an admin adds a longer trilingual topic.  The explanation first
// tries to fit as one complete DOM node. If that rendered measurement still
// overflows, the fixed slot switches to lossless sequential pages instead of
// clipping the explanation or adding a scrollbar.
function fitTopicSourceSlot() {
  const body = document.querySelector('[data-source-topic-body]');
  const title = body?.querySelector('[data-source-topic-title]');
  const descriptionRegion = body?.querySelector('[data-source-topic-description]');
  const description = descriptionRegion?.querySelector('p');
  if (!body || !title || !description) return;

  const fitNode = (node, { minSize, columns = false, maxColumns = 4 } = {}) => {
    const computed = window.getComputedStyle(node);
    const minimum = minSize || 10;
    let size = Math.max(minimum, Number.parseFloat(computed.fontSize) || minimum);
    node.style.fontSize = `${size}px`;
    if (columns) node.style.columnCount = '2';
    for (let columnCount = columns ? 2 : 1; columnCount <= (columns ? maxColumns : 1); columnCount += 1) {
      if (columns) node.style.columnCount = String(columnCount);
      for (let attempt = 0; attempt < 28; attempt += 1) {
        if (topicNodeFits(node)) return true;
        if (size <= minimum) break;
        size = Math.max(minimum, size - 0.5);
        node.style.fontSize = `${size}px`;
      }
    }
    return topicNodeFits(node);
  };

  fitNode(title, { minSize: 10 });

  const fullText = description.textContent || '';
  const topicId = body.dataset.sourceTopicId || '';
  const key = `${state.locale}:${topicId}`;
  const previousKey = sourceTopicPagination?.key || '';
  let cached = topicDescriptionCache.get(key);
  const layoutSignature = `${descriptionRegion.clientWidth}:${descriptionRegion.clientHeight}:${window.innerWidth}:${window.innerHeight}`;
  if (!cached || cached.fullText !== fullText || cached.layoutSignature !== layoutSignature) {
    description.style.fontSize = '';
    description.style.columnCount = '';
    cached = {
      key,
      topicId,
      locale: state.locale,
      fullText,
      descriptionPages: null,
      currentPage: 0,
      descriptionFontSize: '',
      descriptionColumnCount: '',
      layoutSignature,
    };
    topicDescriptionCache.set(key, cached);
  } else if (previousKey && previousKey !== key) {
    // A new topic or locale always opens at its first explanation page.  The
    // cache remains keyed by both values so descriptions can never cross-feed.
    cached.currentPage = 0;
  }

  const pagination = descriptionRegion.querySelector('[data-topic-description-pagination]');
  const pageLabel = pagination?.querySelector('[data-topic-description-page]');
  cached.description = description;
  cached.pagination = pagination;
  cached.pageLabel = pageLabel;

  if (Array.isArray(cached.descriptionPages)) {
    description.style.fontSize = cached.descriptionFontSize || '';
    description.style.columnCount = cached.descriptionColumnCount
      || (cached.descriptionPages.length > 1 ? '1' : '');
    paginationVisible(pagination, cached.descriptionPages.length > 1);
    sourceTopicPagination = cached;
    showTopicDescriptionPage(cached.currentPage);
    return;
  }

  description.textContent = fullText;
  const isCompactViewport = window.matchMedia('(max-width: 767px)').matches;
  const fitted = fitNode(description, {
    minSize: 14,
    columns: !isCompactViewport,
    maxColumns: 2,
  });

  if (fitted || !pagination || !pageLabel) {
    // A single complete node is the preferred rendering.  The control stays
    // in the DOM for a stable slot but is hidden until pagination is needed.
    cached.descriptionPages = [fullText];
    cached.currentPage = 0;
    cached.descriptionFontSize = description.style.fontSize || '';
    cached.descriptionColumnCount = description.style.columnCount || '';
    sourceTopicPagination = cached;
    // Keep the successful multi-column measurement in place. Clearing it here
    // would make a second render overflow again even though the first fit was
    // valid.
    description.style.columnCount = cached.descriptionColumnCount;
    paginationVisible(pagination, false);
    showTopicDescriptionPage(0);
    return;
  }

  // Pagination pages use one column so the measured node has a single,
  // deterministic vertical budget.  The binary splitter retains every
  // Unicode code point and every explicit newline in source order.
  description.style.columnCount = '1';
  // Reserve the button row before measuring candidates; otherwise a page
  // could fit while the controls are hidden and become clipped when shown.
  const pages = splitTopicTextByFit(fullText, (candidate) => {
    description.textContent = candidate;
    return topicNodeFits(description);
  });
  const losslessPages = joinTopicTextPages(pages) === fullText ? pages : [fullText];
  cached.descriptionPages = losslessPages;
  cached.currentPage = 0;
  cached.descriptionFontSize = description.style.fontSize || '';
  cached.descriptionColumnCount = '1';
  sourceTopicPagination = cached;
  paginationVisible(pagination, losslessPages.length > 1);
  showTopicDescriptionPage(0);
}

function paginationVisible(pagination, visible) {
  if (!pagination) return;
  pagination.classList.toggle('is-visible', visible);
  pagination.setAttribute('aria-hidden', String(!visible));
  pagination.querySelectorAll('button').forEach((button) => {
    button.tabIndex = visible ? 0 : -1;
  });
}

function showTopicDescriptionPage(index) {
  const model = sourceTopicPagination;
  if (!model?.descriptionPages?.length || !model.description) return;
  const pageIndex = Math.min(Math.max(Number(index) || 0, 0), model.descriptionPages.length - 1);
  model.currentPage = pageIndex;
  // Keep the older aliases available to any in-page diagnostics while the
  // canonical state uses the explicit descriptionPages/currentPage names.
  model.pages = model.descriptionPages;
  model.index = pageIndex;
  model.description.textContent = model.descriptionPages[pageIndex];
  if (model.pageLabel) {
    model.pageLabel.textContent = t('topicPagePosition', {
      i: pageIndex + 1,
      total: model.descriptionPages.length,
    });
  }
  const previous = model.pagination?.querySelector('[data-action="previous-topic-page"]');
  const next = model.pagination?.querySelector('[data-action="next-topic-page"]');
  if (previous) previous.disabled = pageIndex === 0;
  if (next) next.disabled = pageIndex === model.descriptionPages.length - 1;
}

function goTo(screen, { scroll = true } = {}) {
  state.screen = screen;
  render();
  if (scroll) pageTop();
  focusPageHeading();
}

function navigateToStage(targetStage) {
  const surveyComplete = allTopicsReviewed();
  const qualitativeComplete = beforeTopicModulesAreValid();
  if (!canNavigateToStage(state.screen, targetStage, {
    allowComplete: !state.submissionId,
    surveyComplete,
    qualitativeComplete,
  })) {
    if (state.screen === 'qualitative' && targetStage === 'complete' && surveyComplete) {
      const invalid = firstInvalidBeforeTopicModule();
      if (invalid) showModuleValidation(invalid, moduleAnswerError(invalid, state.moduleAnswers[invalid.id]));
    }
    return;
  }

  if (targetStage === 'profile') {
    state.showValidation = false;
    goTo('profile');
    return;
  }

  if (targetStage === 'qualitative') {
    if (!beforeTopicModules().length) {
      goTo('profile');
      return;
    }
    state.qualitativeSectionComplete = false;
    goTo('qualitative');
    return;
  }

  if (targetStage === 'survey') {
    state.currentIndex = surveyComplete
      ? Math.min(state.currentIndex, factors.length - 1)
      : firstUnreviewedIndex();
    goTo('survey');
    return;
  }

  if (targetStage === 'complete') {
    // Re-check the written answers at the forward boundary so a sidebar click
    // cannot turn an incomplete Step 02 into a submittable Step 04.
    if (!beforeTopicModulesAreValid()) {
      const invalid = firstInvalidBeforeTopicModule();
      if (invalid) showModuleValidation(invalid, moduleAnswerError(invalid, state.moduleAnswers[invalid.id]));
      return;
    }
    state.qualitativeSectionComplete = true;
    goTo('complete');
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
  guideSessionSteps = guideStepsForScreen(state.screen, { submitted: Boolean(state.submissionId) });
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
    qualitative: 1,
    survey: 2,
    complete: 3,
  }[state.screen] ?? 0;
  const steps = [t('stepProfile'), t('stepQualitative'), t('stepSurvey'), t('stepResult')];
  const stageIds = ['profile', 'qualitative', 'survey', 'complete'];
  const stepNumbers = ['01', '02', '03', '04'];
  const stageItems = steps.map((label, index) => {
    const stage = stageIds[index];
    const isActive = index === activeIndex;
    const isDone = index < activeIndex;
    const canGoBack = !state.submissionId
      && canNavigateToStage(state.screen, stage, {
        allowComplete: true,
        surveyComplete: allTopicsReviewed(),
        qualitativeComplete: beforeTopicModulesAreValid(),
      });
    const stepContent = `
      <span>${stepNumbers[index]}</span>
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
    <nav class="topic-index" aria-label="${escapeAttribute(t('topicDirectoryLabel', { total: factors.length }))}">
      <div class="topic-index-heading">
        <span class="topic-index-step">03</span>
        <span class="topic-index-title">${escapeHtml(t('topicDirectoryLabel', { total: factors.length }))}</span>
        <strong aria-live="polite">${escapeHtml(t('topicPosition', { i: state.currentIndex + 1, total: factors.length }))}</strong>
      </div>
      <p class="topic-index-hint">${escapeHtml(t('topicDirectoryHint'))}</p>
      <div class="topic-index-grid">
        ${factors.map((factor, index) => {
          const number = String(index + 1).padStart(2, '0');
          const isActive = index === state.currentIndex;
          const isDone = state.reviewedFactors.includes(factor.id);
          const available = topicIsAvailable(index, state.currentIndex, state.reviewedFactors, factor.id);
          const label = activeFactorLabel(factor, state.locale);
          return `
            <button
              class="topic-index-item ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}"
              type="button"
              data-action="topic-index"
              data-topic-index="${index}"
              aria-label="${escapeAttribute(t('topicDirectoryItem', { n: number, topic: label }))}"
              title="${escapeAttribute(label)}"
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
  const knownCategories = [
    ['environment', 'categoryEnvironment'],
    ['social', 'categorySocial'],
    ['governance', 'categoryGovernance'],
  ];
  const extraCategories = [...new Set(factors.map((factor) => factor.category).filter(Boolean))]
    .filter((category) => !knownCategories.some(([known]) => known === category))
    .map((category) => [category, '']);
  const categoryValues = factors.some((factor) => !factor.category)
    ? [...knownCategories, ...extraCategories, ['__uncategorized__', 'categoryOther']]
    : [...knownCategories, ...extraCategories];
  const factorCards = categoryValues.map(([category, labelKey]) => {
    const categoryFactors = category === '__uncategorized__'
      ? factors.filter((factor) => !factor.category)
      : factors.filter((factor) => factor.category === category);
    if (!categoryFactors.length) return '';
    const cards = categoryFactors.map((factor) => `
      <details class="factor-preview">
        <summary><span>${escapeHtml(factor.id)}</span><b>${escapeHtml(activeFactorLabel(factor, state.locale))}</b><i aria-hidden="true">+</i></summary>
        <p>${escapeHtml(activeFactorDescription(factor, state.locale))}</p>
      </details>
    `).join('');
    return `
      <section class="topic-category" data-category="${escapeAttribute(category)}">
        <h3 class="topic-category-title">${escapeHtml(labelKey ? t(labelKey) : category)}</h3>
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
            <span class="study-summary">${escapeHtml(t('minutesUnit', {
              topicCount: factors.length,
              pairCount: pairs.length,
            }))}</span>
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
  const descriptionId = `topic-description-${source.id}-${target.id}`;
  return `
    <label class="target-option ${selected ? 'is-selected' : ''}" aria-expanded="false">
      <input type="checkbox" name="direct-target" value="${target.id}" data-source-id="${source.id}" aria-describedby="${escapeAttribute(descriptionId)}" ${selected ? 'checked' : ''} />
      <span class="target-code">${target.id}</span>
      <span class="target-copy">
        <strong>${escapeHtml(target.label)}</strong>
      </span>
      <span class="target-definition" id="${escapeAttribute(descriptionId)}" role="tooltip" aria-hidden="true" hidden>${escapeHtml(target.description)}</span>
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

function topicGridStyle() {
  const count = Math.max(1, factors.length);
  // The final `none` choice occupies a real grid cell alongside all active
  // topics, so include it when reserving rows. This avoids implicit rows for
  // the small (2/3-topic) configurations as well as the 40-topic cap.
  const cellCount = count + 1;
  const desktopColumns = count >= 20 ? 10 : Math.max(2, count);
  const mobileColumns = Math.min(5, Math.max(2, count));
  return [
    `--topic-choice-columns:${desktopColumns}`,
    `--topic-choice-rows:${Math.ceil(cellCount / desktopColumns)}`,
    `--topic-choice-columns-mobile:${mobileColumns}`,
    `--topic-choice-rows-mobile:${Math.ceil(cellCount / mobileColumns)}`,
  ].join(';');
}

function renderSurvey() {
  const source = factorFor(factors[state.currentIndex].id);
  const targets = factors
    .filter((factor) => factor.id !== source.id)
    .map((factor) => factorFor(factor.id));
  const noneSelected = hasExplicitNone(source.id);
  const hasChoice = selectedTargets(source.id).length > 0 || noneSelected;
  const isLast = state.currentIndex === factors.length - 1;
  const legacyQ7Finish = afterTopicModules().length === 1 && afterTopicModules()[0].id === 'q7';
  const finishLabel = legacyQ7Finish
    ? t('confirmAndSubmit')
    : (afterTopicModules().length ? t('continueAfterTopics') : t('submitResponse'));
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
              <div class="source-topic-body" data-source-topic-body data-source-topic-id="${escapeAttribute(source.id)}">
                <span class="source-code">${source.id}</span>
                <h2 id="source-topic-name" data-source-topic-title>${escapeHtml(source.label)}</h2>
                <div class="source-topic-description" data-source-topic-description>
                  <p>${escapeHtml(source.description)}</p>
                  <div class="source-topic-pagination" data-topic-description-pagination aria-hidden="true">
                    <button class="icon-button" type="button" data-action="previous-topic-page" aria-label="${escapeAttribute(t('topicPagePrevious'))}" title="${escapeAttribute(t('topicPagePrevious'))}" disabled>←</button>
                    <span data-topic-description-page aria-live="polite">${escapeHtml(t('topicPagePosition', { i: 1, total: 1 }))}</span>
                    <button class="icon-button" type="button" data-action="next-topic-page" aria-label="${escapeAttribute(t('topicPageNext'))}" title="${escapeAttribute(t('topicPageNext'))}" disabled>→</button>
                  </div>
                </div>
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
            <div class="target-list" style="${topicGridStyle()}">
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
        <button class="text-button topic-notes-toggle" type="button" data-action="toggle-topic-notes" aria-controls="topic-notes" aria-expanded="false">
          <span aria-hidden="true">i</span>${escapeHtml(t('topicNotesButton'))}
        </button>
        <button class="primary-button" type="button" data-action="confirm-topic" ${hasChoice ? '' : 'disabled'}>
          ${escapeHtml(isLast ? finishLabel : t('confirmAndNext'))}<span aria-hidden="true">→</span>
        </button>
      </div>
      <section class="topic-notes" id="topic-notes" aria-label="${escapeAttribute(t('candidateNotes'))}" hidden tabindex="-1">
        <h2>${escapeHtml(t('candidateNotes'))}</h2>
        <ul>${topicNotes}</ul>
      </section>
    </div>
  `, 'survey-shell');
}

function answerErrorText(module, errorCode) {
  if (!errorCode) return '';
  if (errorCode === 'too-short') {
    return t('questionMinLength', { min: module.constraints.minLength });
  }
  if (errorCode === 'too-few') {
    return t('questionMinSelections', {
      min: Math.max(module.required ? 1 : 0, module.constraints.minSelections),
    });
  }
  if (errorCode === 'too-many') {
    return t('questionMaxSelections', { max: module.constraints.maxSelections });
  }
  return t('requiredMessage');
}

function renderModuleField(module, number) {
  const localized = moduleCopy(module);
  const value = normalizeModuleValue(module, state.moduleAnswers[module.id]);
  const countId = `qualitative-count-${module.id}`;
  const helpId = `question-help-${module.id}`;
  const errorId = `question-error-${module.id}`;
  const promptId = `question-prompt-${module.id}`;
  const hasHelp = Boolean(localized.helpText);
  const errorCode = state.questionValidationId === module.id ? state.questionValidationError : '';
  const describedBy = [localized.helpText ? helpId : '', module.type === 'subjective_text' ? countId : '', errorCode ? errorId : '']
    .filter(Boolean).join(' ');
  const prompt = `
    <span>${escapeHtml(localized.prompt)}${module.required ? '<em aria-hidden="true">*</em>' : ''}</span>
    ${module.required ? `<span class="visually-hidden">${escapeHtml(t('questionRequired'))}</span>` : ''}
  `;
  let control;
  if (module.type === 'subjective_text') {
    const placeholder = localized.placeholder
      ? ` placeholder="${escapeHtml(localized.placeholder)}"`
      : '';
    control = `
      <textarea
        id="qualitative-${module.id}"
        name="module-text-answer"
        data-module-id="${escapeHtml(module.id)}"
        maxlength="${module.constraints.maxLength}"
        rows="${module.constraints.multiline ? 8 : 2}"
        aria-required="${module.required}"
        aria-labelledby="${escapeAttribute(promptId)}"
        aria-invalid="${Boolean(errorCode)}"
        ${describedBy ? `aria-describedby="${describedBy}"` : ''}${placeholder}
      >${escapeHtml(value)}</textarea>
      <small id="${countId}" data-char-count="${escapeHtml(module.id)}">${escapeHtml(t('questionCharCount', {
        n: value.length,
        max: module.constraints.maxLength,
      }))}</small>
    `;
  } else {
    const isMultiple = module.type === 'multiple_choice';
    const selected = new Set(isMultiple ? value : [value]);
    control = `
      <fieldset class="module-choice-group" aria-labelledby="${escapeAttribute(promptId)}" ${describedBy ? `aria-describedby="${describedBy}"` : ''}>
        <legend class="visually-hidden">${escapeHtml(localized.prompt)}</legend>
        <div class="module-choice-grid">
          ${displayedModuleOptions(module).map((option) => `
            <label class="module-option-card ${selected.has(option.id) ? 'is-selected' : ''}">
              <input
                type="${isMultiple ? 'checkbox' : 'radio'}"
                name="module-answer-${escapeHtml(module.id)}"
                data-module-id="${escapeHtml(module.id)}"
                value="${escapeHtml(option.id)}"
                ${selected.has(option.id) ? 'checked' : ''}
                aria-invalid="${Boolean(errorCode)}"
              />
              <span>${escapeHtml(optionLabel(option))}</span>
            </label>
          `).join('')}
        </div>
      </fieldset>
    `;
  }
  return `
    <div class="field-group note-field qualitative-field question-module-field" data-module-type="${module.type}" data-module-id="${escapeAttribute(module.id)}" data-has-help="${hasHelp}">
      <div class="written-question-row">
        ${module.type === 'subjective_text' ? `<label class="qualitative-question-label" id="${escapeAttribute(promptId)}" for="qualitative-${module.id}">` : `<div class="qualitative-question-label" id="${escapeAttribute(promptId)}">`}
          <i>${String(number).padStart(2, '0')}</i>${prompt}
        ${module.type === 'subjective_text' ? '</label>' : '</div>'}
        ${module.type === 'subjective_text' ? `
          <button class="qualitative-na-button" type="button" data-action="qualitative-na" data-module-id="${escapeHtml(module.id)}">
            ${escapeHtml(t('qualitativeNa'))}
          </button>
        ` : ''}
      </div>
      ${localized.helpText ? `<p class="module-help" id="${helpId}">${escapeHtml(localized.helpText)}</p>` : ''}
      ${control}
      ${errorCode ? `<p class="form-error module-error" id="${errorId}" role="alert">${escapeHtml(answerErrorText(module, errorCode))}</p>` : ''}
    </div>
  `;
}

function renderWrittenQuestionScreen({ final = false } = {}) {
  const modules = final ? afterTopicModules() : beforeTopicModules();
  const firstPosition = modules.length ? moduleGlobalPosition(modules[0]) : questionModules.length;
  const lastPosition = modules.length ? moduleGlobalPosition(modules.at(-1)) : questionModules.length;
  const position = firstPosition === lastPosition ? firstPosition : `${firstPosition}–${lastPosition}`;
  const total = final ? questionModules.length : modules.length;
  const formIdAttribute = final ? 'id="final-submit-form"' : 'id="qualitative-form"';
  const pageClass = final ? 'complete-page qualitative-page final-question-page' : 'qualitative-page';
  const shellClass = final ? 'form-shell qualitative-shell complete-shell' : 'form-shell qualitative-shell';
  const eyebrow = final ? t('completeEyebrow') : t('qualitativeEyebrow');
  const title = final ? t('completeTitle') : t('qualitativeTitle');
  const previousAction = final ? 'after-question-previous' : 'qualitative-previous';
  const previousLabel = final ? t('backToSurvey') : t('back');
  const primaryLabel = final
    ? (state.submitState === 'submitting' ? t('submitting') : t('submitResponse'))
    : t('qualitativeFinish');
  const intro = t('qualitativeIntro');
  const error = final && state.submitState === 'error'
    ? `<div class="submit-error" role="alert"><span>${escapeHtml(t('submitError'))}</span><button type="button" data-action="submit-response">${escapeHtml(t('retrySubmit'))}</button></div>`
    : '';

  return renderShell(`
    <div class="form-page ${pageClass}">
      <header class="page-heading ${final ? 'complete-heading' : ''}">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1 data-page-title tabindex="-1">${escapeHtml(title)}</h1>
        ${intro ? `<p>${escapeHtml(intro)}</p>` : ''}
      </header>

      <p class="qualitative-privacy">${escapeHtml(t('qualitativePrivacy'))}</p>

      <form class="qualitative-form written-question-form ${final ? 'final-submit-form' : ''}" ${formIdAttribute} novalidate>
        ${modules.length ? `<div class="qualitative-progress" aria-live="polite">${escapeHtml(t('qualitativePosition', { i: position, total }))}</div>` : ''}
        <div class="qualitative-fields" data-module-collection="${final ? 'after_topics' : 'before_topics'}" data-module-count="${modules.length}" aria-label="${escapeAttribute(t('qualitativePosition', { i: position, total }))}">
          ${modules.length
            ? modules.map((candidate) => renderModuleField(candidate, moduleGlobalPosition(candidate))).join('')
            : `<p>${escapeHtml(t('noAfterQuestions'))}</p>`}
        </div>
        <div class="form-actions">
          <button class="text-button" type="button" data-action="${previousAction}"><span aria-hidden="true">←</span>${escapeHtml(previousLabel)}</button>
          <button class="primary-button" type="submit" ${final && state.submitState === 'submitting' ? 'disabled' : ''}>${escapeHtml(primaryLabel)}<span aria-hidden="true">→</span></button>
        </div>
        ${error}
      </form>
    </div>
  `, shellClass);
}

function renderQualitative() {
  return renderWrittenQuestionScreen();
}

function renderComplete() {
  const submitted = Boolean(state.submissionId);
  if (!submitted) return renderWrittenQuestionScreen({ final: true });

  return renderShell(`
    <div class="complete-page">
      <header class="page-heading complete-heading">
        <p class="eyebrow">${escapeHtml(t('completeEyebrow'))}</p>
        <h1 data-page-title tabindex="-1">${escapeHtml(t('completeSavedTitle'))}</h1>
        <p>${escapeHtml(t('completeSavedText'))}</p>
      </header>
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
    qualitative: renderQualitative,
    survey: renderSurvey,
    complete: renderComplete,
  }[state.screen]();
  detachTopicDefinitionHints = state.screen === 'survey'
    ? attachTopicDefinitionHints(document.querySelector('.target-list'))
    : () => {};
  renderGuide();
  if (state.screen === 'survey') requestAnimationFrame(fitTopicSourceSlot);
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
  state.resultCard = null;
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
  if (allTopicsReviewed()) {
    state.afterTopicsIndex = Math.min(state.afterTopicsIndex, Math.max(0, afterTopicModules().length - 1));
    persist({ immediate: true });
    goTo('complete');
    return;
  }

  state.currentIndex += 1;
  persist({ immediate: true });
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
  const compactPairRows = questionnaireConfig.revision !== 0
    || Array.isArray(questionnaireConfig.topics);
  const submission = buildSubmission({
    studyId: studyConfig.id,
    locale: state.locale,
    participant,
    factors: localisedActiveFactors(state.locale),
    answers: state.answers,
    // Revision 0 retains the historical labelled pair rows. Once a public
    // topic snapshot is loaded, the server can canonicalize labels from that
    // immutable snapshot; omitting repeated names keeps the 40-topic body
    // below the submission limit.
    includeResponseLabels: !compactPairRows,
    submittedAt: new Date().toISOString(),
  });
  const loadedTopicSnapshot = topicSnapshot();
  const responses = compactPairRows
    ? submission.responses.map((response) => ({
      pairId: response.pairId,
      leftId: response.leftId,
      rightId: response.rightId,
      relation: response.relation,
      leftToRight: response.leftToRight,
      rightToLeft: response.rightToLeft,
      ...(response.note ? { note: response.note } : {}),
    }))
    : submission.responses;

  return {
    ...submission,
    // The loaded revision and topic snapshot are the source of truth for
    // labels/descriptions.  Sending only ordered stable ids keeps a 40-topic
    // submission bounded and lets the server canonicalize historical text.
    factors: factorIds.map((id) => ({ id })),
    responses,
    clientSubmissionId: state.clientSubmissionId,
    status: 'complete',
    collectionMethod: 'source-topic-multi-select-plus-qualitative-v2',
    qualitativeSectionComplete: true,
    qualitativeAnswers: legacyQualitativeAnswers(questionModules, state.moduleAnswers),
    questionnaireConfigRevision: questionnaireConfig.revision,
    topicSnapshot: loadedTopicSnapshot,
    topicSnapshotId: loadedTopicSnapshot.snapshotId,
    topicRevision: loadedTopicSnapshot.revision,
    topicIds: [...loadedTopicSnapshot.ids],
    moduleAnswers: questionModules.map((module) => (
      serializeModuleAnswer(module, state.moduleAnswers[module.id])
    )),
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

function showModuleValidation(module, errorCode) {
  state.questionValidationId = module?.id || '';
  state.questionValidationError = errorCode || '';
  if (!module || !errorCode) return true;
  const stageModules = modulesForStage(module.stage);
  const index = stageModules.findIndex(({ id }) => id === module.id);
  if (module.stage === 'before_topics') {
    state.qualitativeIndex = Math.max(0, index);
    state.qualitativeSectionComplete = false;
    goTo('qualitative');
  } else {
    state.afterTopicsIndex = Math.max(0, index);
    goTo('complete');
  }
  requestAnimationFrame(() => {
    const field = document.querySelector(`.question-module-field[data-module-id="${module.id}"]`);
    field?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
    (field?.querySelector('[aria-invalid="true"]') || field?.querySelector('textarea, input, select'))
      ?.focus?.({ preventScroll: true });
  });
  return false;
}

function validateModule(module) {
  if (!module) return true;
  return showModuleValidation(module, moduleAnswerError(module, state.moduleAnswers[module.id]));
}

function validateModules(modules) {
  const invalid = firstInvalidModule(modules);
  return invalid
    ? showModuleValidation(invalid, moduleAnswerError(invalid, state.moduleAnswers[invalid.id]))
    : true;
}

function validateAllModules() {
  return validateModules(questionModules);
}

function isResultCard(value, submissionId = '') {
  return value && typeof value === 'object'
    && value.version === 'm1-direct-structure-card-v1'
    && (!submissionId || value.submissionId === submissionId)
    && typeof value.frozenAt === 'string'
    && value.topicCount === factors.length
    && Number.isInteger(value.directLinkCount)
    && Array.isArray(value.leadingTopics)
    && Array.isArray(value.receivingTopics);
}

async function submitResponse() {
  if (!allTopicsReviewed() || !state.qualitativeSectionComplete || state.submitState === 'submitting') return;
  if (!validateAllModules()) return;
  let clientSubmissionId = state.clientSubmissionId;
  state.submitState = 'submitting';
  render();

  try {
    if (!clientSubmissionId) {
      clientSubmissionId = createClientSubmissionId();
      state.clientSubmissionId = clientSubmissionId;
      persist({ immediate: true });
    }
    const response = await fetch(resolveSubmissionEndpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildCurrentSubmission()),
    });
    if (!response.ok) throw new Error('submit failed');
    const receipt = await response.json();
    if (!receipt.submissionId || !isResultCard(receipt.resultCard, receipt.submissionId)) {
      throw new Error('missing result card');
    }
    if (state.clientSubmissionId !== clientSubmissionId) return;

    state.submissionId = receipt.submissionId;
    state.completedAt = receipt.receivedAt || new Date().toISOString();
    state.resultCard = receipt.resultCard;
    state.submitState = 'success';
    persist({ immediate: true });
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
window.addEventListener('resize', () => {
  positionGuide();
  if (state.screen === 'survey') requestAnimationFrame(fitTopicSourceSlot);
});
window.addEventListener('scroll', positionGuide, { passive: true });
window.addEventListener('pagehide', flushPersist);
window.addEventListener('beforeunload', flushPersist);

app.addEventListener('submit', (event) => {
  if (event.target.id === 'qualitative-form') {
    event.preventDefault();
    const modules = beforeTopicModules();
    if (!validateModules(modules)) return;
    state.questionValidationId = '';
    state.questionValidationError = '';
    state.qualitativeSectionComplete = true;
    state.currentIndex = firstUnreviewedIndex();
    persist({ immediate: true });
    goTo('survey');
    return;
  }
  if (event.target.id === 'final-submit-form') {
    event.preventDefault();
    const modules = afterTopicModules();
    if (!validateModules(modules)) return;
    state.questionValidationId = '';
    state.questionValidationError = '';
    void submitResponse();
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
  state.qualitativeIndex = Math.min(state.qualitativeIndex, Math.max(0, beforeTopicModules().length - 1));
  persist({ immediate: true });
  if (beforeTopicModules().length) {
    goTo('qualitative');
  } else {
    state.qualitativeSectionComplete = true;
    state.currentIndex = firstUnreviewedIndex();
    goTo('survey');
  }
});

app.addEventListener('input', (event) => {
  if (event.target.name === 'code') {
    state.participant.code = event.target.value;
    updateProfileValidation();
    persistSoon();
    return;
  }
  if (event.target.name === 'module-text-answer') {
    const module = activeModuleById(event.target.dataset.moduleId);
    if (!module || module.type !== 'subjective_text') return;
    state.moduleAnswers[module.id] = normalizeModuleValue(module, event.target.value);
    state.questionValidationId = '';
    state.questionValidationError = '';
    document.querySelector(`[data-char-count="${module.id}"]`)?.replaceChildren(
      document.createTextNode(t('questionCharCount', {
        n: state.moduleAnswers[module.id].length,
        max: module.constraints.maxLength,
      })),
    );
    persistSoon();
  }
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.name === 'role') {
    state.participant.role = target.value;
    updateProfileValidation();
    persistSoon();
    return;
  }
  if (target.name === 'experience') {
    state.participant.experience = target.value;
    persistSoon();
    return;
  }
  const moduleId = target.dataset.moduleId;
  const module = activeModuleById(moduleId);
  if (module && target.name === `module-answer-${moduleId}`) {
    if (module.type === 'multiple_choice') {
      const selected = new Set(state.moduleAnswers[module.id]);
      if (target.checked) selected.add(target.value);
      else selected.delete(target.value);
      state.moduleAnswers[module.id] = normalizeModuleValue(module, [...selected]);
    } else {
      state.moduleAnswers[module.id] = normalizeModuleValue(module, target.value);
    }
    state.questionValidationId = '';
    state.questionValidationError = '';
    persistSoon();
    render();
    document.querySelector(`[data-module-id="${module.id}"][value="${target.value}"]`)?.focus({ preventScroll: true });
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
  persistSoon();
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
        goTo('complete');
      } else if (!profileIsReady()) {
        goTo('profile');
      } else if (!state.qualitativeSectionComplete) {
        if (beforeTopicModules().length) goTo('qualitative');
        else {
          state.qualitativeSectionComplete = true;
          state.currentIndex = firstUnreviewedIndex();
          goTo('survey');
        }
      } else if (!allTopicsReviewed()) {
        state.currentIndex = firstUnreviewedIndex();
        goTo('survey');
      } else {
        goTo('complete');
      }
      break;
    case 'back-welcome':
      goTo('welcome');
      break;
    case 'previous-topic':
      if (state.currentIndex > 0) state.currentIndex -= 1;
      persist({ immediate: true });
      render();
      pageTop();
      focusPageHeading();
      break;
    case 'confirm-topic':
      confirmCurrentTopic();
      break;
    case 'toggle-topic-notes':
      toggleTopicNotes(button);
      break;
    case 'previous-topic-page':
      showTopicDescriptionPage((sourceTopicPagination?.currentPage || 0) - 1);
      break;
    case 'next-topic-page':
      showTopicDescriptionPage((sourceTopicPagination?.currentPage || 0) + 1);
      break;
    case 'qualitative-previous':
      state.questionValidationId = '';
      state.questionValidationError = '';
      goTo('profile');
      break;
    case 'qualitative-na': {
      const module = activeModuleById(button.dataset.moduleId);
      if (!module || module.type !== 'subjective_text') break;
      state.moduleAnswers[module.id] = normalizeModuleValue(module, 'NA');
      state.questionValidationId = '';
      state.questionValidationError = '';
      const textarea = document.querySelector(`#qualitative-${module.id}`);
      if (textarea) {
        textarea.value = state.moduleAnswers[module.id];
        textarea.focus({ preventScroll: true });
      }
      document.querySelector(`[data-char-count="${module.id}"]`)?.replaceChildren(
        document.createTextNode(t('questionCharCount', {
          n: state.moduleAnswers[module.id].length,
          max: module.constraints.maxLength,
        })),
      );
      persistSoon();
      break;
    }
    case 'after-question-previous':
      state.afterTopicsIndex = 0;
      state.questionValidationId = '';
      state.questionValidationError = '';
      state.currentIndex = Math.min(state.currentIndex, factors.length - 1);
      goTo('survey');
      break;
    case 'back-to-survey':
      state.qualitativeSectionComplete = true;
      state.currentIndex = Math.min(state.currentIndex, factors.length - 1);
      persist({ immediate: true });
      goTo('survey');
      break;
    case 'back-qualitative':
      goTo('qualitative');
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
          if (storageAvailable) {
            window.localStorage.removeItem(storageKeyForRevision());
            // This is the legacy key used before topic revisions were scoped.
            window.localStorage.removeItem(STORAGE_KEY_BASE);
          }
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

async function initializeApp() {
  const locale = preferredLocale();
  app.innerHTML = `<p class="questionnaire-loading" role="status">${escapeHtml(copy[locale]?.loadingQuestions || copy.en.loadingQuestions)}</p>`;
  questionnaireConfig = await loadPublicQuestionnaireConfig();
  applyTopicConfig(questionnaireConfig);
  questionModules = [...questionnaireConfig.modules];
  state = loadState();
  state.questionnaireConfigRevision = questionnaireConfig.revision;
  state.moduleAnswerVersions = moduleVersions();
  if (!beforeTopicModules().length) state.qualitativeSectionComplete = true;
  guideReturnScreen = state.screen;
  guideSessionSteps = guideStepsForScreen(state.screen, { submitted: Boolean(state.submissionId) });
  render();
}

await initializeApp();
