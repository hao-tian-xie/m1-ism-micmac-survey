import {
  AdminApiClient,
  AdminApiError,
  AdminAuthError,
  extractListPayload,
  extractSession,
} from './admin-api.mjs';
import {
  adminCopy,
  adminLanguageNames,
  adminLocales,
  createAdminTranslator,
} from './admin-translations.mjs';

const app = document.querySelector('#admin-app');
const LOCALE_QUERY_KEY = 'lang';
const QUESTION_TYPES = ['subjective', 'single', 'multiple', 'judgement'];
const QUESTION_TYPE_COPY = {
  subjective: 'typeSubjective',
  single: 'typeSingle',
  multiple: 'typeMultiple',
  judgement: 'typeJudgement',
};
const BACKEND_TYPE_BY_UI = {
  subjective: 'subjective_text',
  single: 'single_choice',
  multiple: 'multiple_choice',
  judgement: 'judgement_boolean',
};
const UI_TYPE_BY_BACKEND = Object.fromEntries(Object.entries(BACKEND_TYPE_BY_UI).map(([ui, backend]) => [backend, ui]));
const JUDGEMENT_PRESET = [
  {
    code: 'true',
    label: { 'zh-CN': '是', 'zh-HK': '是', en: 'Yes' },
  },
  {
    code: 'false',
    label: { 'zh-CN': '否', 'zh-HK': '否', en: 'No' },
  },
];

function initialLocale() {
  const requested = new URLSearchParams(window.location.search).get(LOCALE_QUERY_KEY);
  if (adminLocales.includes(requested)) return requested;
  const browser = String(navigator.language || '').toLowerCase();
  if (browser.startsWith('zh-hk') || browser.startsWith('zh-tw') || browser.includes('hant')) return 'zh-HK';
  if (browser.startsWith('en')) return 'en';
  return 'zh-CN';
}

const state = {
  locale: initialLocale(),
  auth: 'checking',
  user: null,
  authMessage: '',
  view: 'overview',
  submissions: [],
  submissionTotal: 0,
  submissionsLoading: false,
  submissionsError: '',
  submissionsLastUpdated: '',
  submissionsStats: null,
  filters: { query: '', locale: '', date: '' },
  selectedSubmission: null,
  detailId: '',
  detailLoading: false,
  detailError: '',
  detailQuestions: [],
  detailQuestionRevision: null,
  detailQuestionsError: '',
  questions: [],
  questionsLoading: false,
  questionsError: '',
  editor: null,
  toast: null,
};

let pollTimer = null;
let filterTimer = null;
let toastTimer = null;
let eventsBound = false;

const api = new AdminApiClient({
  onAuthExpired: () => {
    if (state.auth === 'signedIn') {
      state.auth = 'signedOut';
      state.user = null;
      state.authMessage = createAdminTranslator(state.locale)('sessionExpired');
      render();
      stopPolling();
    }
  },
});

function t(key, values = {}) {
  return createAdminTranslator(state.locale)(key, values);
}

function localise(value, fallback = '') {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return fallback;
  return value[state.locale] || value.en || value['zh-CN'] || value['zh-HK'] || fallback;
}

function localisedRecord(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(adminLocales.map((locale) => [locale, String(value[locale] || '')]));
  }
  return Object.fromEntries(adminLocales.map((locale) => [locale, typeof value === 'string' ? value : '']));
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
  return escapeHtml(value).replaceAll('`', '&#096;');
}

function jsonPreview(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}

function formatDate(value, withTime = true) {
  if (!value) return t('unknown');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const locale = state.locale === 'en' ? 'en-GB' : state.locale;
  return new Intl.DateTimeFormat(locale, withTime
    ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateQuery(filters = state.filters) {
  if (!filters.date) return {};
  const now = new Date();
  const from = new Date(now);
  if (filters.date === 'today') from.setHours(0, 0, 0, 0);
  if (filters.date === 'week') from.setDate(from.getDate() - 7);
  if (filters.date === 'month') from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: now.toISOString() };
}

function submissionIdOf(record) {
  return String(record?.submissionId || record?.id || record?.responseId || record?.submission?.submissionId || '');
}

function normaliseSubmission(record) {
  const outer = record && typeof record === 'object' ? record : {};
  const inner = outer.submission && typeof outer.submission === 'object'
    ? outer.submission
    : outer.record && typeof outer.record === 'object' ? outer.record : outer;
  const id = submissionIdOf(outer) || submissionIdOf(inner);
  const receivedAt = outer.receivedAt || outer.submittedAt || outer.createdAt || inner.receivedAt || inner.submittedAt || inner.createdAt;
  return {
    ...inner,
    ...outer,
    submission: inner,
    submissionId: id,
    receivedAt,
    submittedAt: outer.submittedAt || inner.submittedAt || receivedAt,
    participant: outer.participant || inner.participant || {},
    locale: outer.locale || inner.locale || 'en',
    resultCard: outer.resultCard || inner.resultCard || outer.m1FrozenResult || inner.m1FrozenResult || null,
    qualitativeAnswers: outer.qualitativeAnswers || inner.qualitativeAnswers || {},
    raw: outer,
  };
}

function questionIdOf(question) {
  return String(question?.id || question?.questionId || question?.key || '');
}

function normaliseQuestion(question, index = 0) {
  const raw = question && typeof question === 'object' ? question : {};
  const translations = raw.translations && typeof raw.translations === 'object' ? raw.translations : null;
  const title = translations
    ? Object.fromEntries(adminLocales.map((locale) => [locale, translations[locale]?.prompt || '']))
    : raw.title || raw.prompt || raw.question || raw.label || '';
  const description = translations
    ? Object.fromEntries(adminLocales.map((locale) => [locale, translations[locale]?.helpText || '']))
    : raw.description || raw.helpText || raw.helper || '';
  const type = QUESTION_TYPES.includes(raw.type)
    ? raw.type
    : UI_TYPE_BY_BACKEND[raw.type] || UI_TYPE_BY_BACKEND[raw.kind] || 'subjective';
  const options = Array.isArray(raw.options) ? raw.options.map((option, optionIndex) => {
    const source = option && typeof option === 'object' ? option : { value: option };
    const optionTranslations = source.translations && typeof source.translations === 'object' ? source.translations : null;
    const value = optionTranslations
      ? Object.fromEntries(adminLocales.map((locale) => [locale, optionTranslations[locale]?.label || '']))
      : source.value ?? source.label ?? source.text ?? '';
    return {
      id: String(source.id || source.optionId || `${questionIdOf(raw) || 'option'}-${optionIndex + 1}`),
      code: String(source.code || ''),
      value: localisedRecord(value),
    };
  }) : [];
  return {
    ...raw,
    id: questionIdOf(raw) || `question-${index + 1}`,
    order: Number(raw.order ?? raw.sortOrder ?? raw.position ?? index + 1) || index + 1,
    version: Number.isSafeInteger(raw.version) ? raw.version : (Number.isSafeInteger(raw.moduleVersion) ? raw.moduleVersion : null),
    type,
    required: raw.required !== false,
    enabled: raw.enabled !== false && raw.active !== false,
    archived: raw.archived === true,
    stage: raw.stage === 'after_topics' ? 'after_topics' : 'before_topics',
    title: localisedRecord(title),
    description: localisedRecord(description),
    options,
  };
}

function blankQuestion() {
  return {
    id: '',
    type: 'subjective',
    stage: 'before_topics',
    required: true,
    enabled: true,
    title: Object.fromEntries(adminLocales.map((locale) => [locale, ''])),
    description: Object.fromEntries(adminLocales.map((locale) => [locale, ''])),
    options: [],
  };
}

function draftFromQuestion(question) {
  const normalized = normaliseQuestion(question);
  return {
    id: normalized.id,
    type: normalized.type,
    stage: normalized.stage,
    required: normalized.required,
    enabled: normalized.enabled,
    title: { ...normalized.title },
    description: { ...normalized.description },
    options: normalized.options.map((option) => ({
      id: option.id,
      code: option.code,
      value: { ...option.value },
    })),
  };
}

function questionTypeLabel(type) {
  return t(QUESTION_TYPE_COPY[type] || QUESTION_TYPE_COPY.subjective);
}

function questionTitle(question) {
  return localise(question?.title, question?.id || t('unknown')) || question?.id || t('unknown');
}

function detailQuestionFor(answer) {
  const id = String(answer?.moduleId || '');
  if (!id) return null;
  if (state.detailQuestionRevision !== null) {
    return state.detailQuestions.find((question) => question.id === id) || null;
  }
  // Legacy records without an immutable revision may use current copy only
  // when the stored module version matches it exactly. Otherwise show the id
  // instead of silently applying a potentially incorrect prompt or option.
  const current = state.questions.find((question) => question.id === id);
  return current && Number.isSafeInteger(answer?.moduleVersion)
    && current.version === answer.moduleVersion
    ? current
    : null;
}

function moduleTypeLabel(answer, question = null) {
  const uiType = UI_TYPE_BY_BACKEND[answer?.type] || question?.type || '';
  return uiType ? questionTypeLabel(uiType) : answer?.type || t('unknown');
}

function moduleOptionLabel(question, value) {
  const option = question?.options?.find((candidate) => candidate.id === String(value));
  return option ? localise(option.value, String(value)) : String(value);
}

function moduleAnswerValue(answer, question = null) {
  const value = answer?.value;
  if (value === null || value === undefined || value === '') return t('answerNotApplicable');
  if (typeof value === 'boolean') return value ? t('yes') : t('no');
  if (Array.isArray(value)) return value.length ? value.map((item) => moduleOptionLabel(question, item)).join('、') : t('answerNotApplicable');
  if (answer?.type === 'single_choice' || answer?.type === 'multiple_choice' || answer?.type === 'judgement_boolean') {
    return moduleOptionLabel(question, value);
  }
  return String(value);
}

function roleValue(participant) {
  return participant?.role || participant?.roleCode || participant?.role_code || t('unknown');
}

function participantCode(participant) {
  return participant?.code || participant?.codeMasked || participant?.expertId || t('unknown');
}

function experienceValue(participant) {
  return participant?.experience || participant?.experienceCode || participant?.experience_code || t('unknown');
}

function resultValue(resultCard, keys, fallback = 0) {
  for (const key of keys) {
    const value = resultCard?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function normalisePercentage(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric <= 1 ? numeric * 100 : numeric);
}

function userLabel() {
  if (!state.user) return t('unknown');
  return String(state.user.name || state.user.username || state.user.email || state.user.id || t('unknown'));
}

function languageButtons({ compact = false } = {}) {
  return `<div class="admin-language" aria-label="${escapeAttribute(t('language'))}">
    ${adminLocales.map((locale) => `
      <button type="button" data-action="locale" data-locale="${locale}" class="${state.locale === locale ? 'is-active' : ''}" aria-pressed="${state.locale === locale}">${adminLanguageNames[locale]}</button>
    `).join('')}
  </div>`;
}

function adminHomeHref() {
  const pathname = String(window.location.pathname || '');
  return pathname === '/admin' || pathname.startsWith('/admin/') ? '/admin/' : './admin.html';
}

function renderBrand() {
  return `<a class="admin-brand" href="${escapeAttribute(adminHomeHref())}" aria-label="${escapeAttribute(t('brand'))}">
    <span class="admin-brand-copy"><b>ESG</b><small>${escapeHtml(t('brand'))}</small></span>
  </a>`;
}

function renderLogin() {
  return `<div class="login-layout">
    <aside class="login-rail">${renderBrand()}<div class="admin-sidebar-footer"><div class="admin-footer-actions">${languageButtons()}</div></div></aside>
    <main class="login-main">
      <div class="login-stage">
        <section class="login-card" aria-labelledby="login-title">
          <p class="eyebrow">${escapeHtml(t('loginEyebrow'))}</p>
          <h1 id="login-title">${escapeHtml(t('loginTitle'))}</h1>
          <p class="login-lead">${escapeHtml(t('loginLead'))}</p>
          <form class="login-form" data-form="login" novalidate>
            <label class="field-group"><span>${escapeHtml(t('username'))}<em aria-hidden="true">*</em></span><input name="username" type="text" autocomplete="username" placeholder="${escapeAttribute(t('usernamePlaceholder'))}" required /></label>
            <label class="field-group"><span>${escapeHtml(t('password'))}<em aria-hidden="true">*</em></span><input name="password" type="password" autocomplete="current-password" placeholder="${escapeAttribute(t('passwordPlaceholder'))}" required /></label>
            ${state.authMessage ? `<p class="login-error" role="alert">${escapeHtml(state.authMessage)}</p>` : ''}
            <div class="login-actions"><span></span><button class="primary-button" type="submit" ${state.auth === 'signingIn' ? 'disabled' : ''}>${escapeHtml(state.auth === 'signingIn' ? t('signingIn') : t('signIn'))}<span class="button-arrow" aria-hidden="true">→</span></button></div>
          </form>
          <p class="login-note">${escapeHtml(t('overviewUpdated'))}</p>
        </section>
      </div>
    </main>
  </div>`;
}

function renderSidebar() {
  const nav = [
    { id: 'overview', label: t('navOverview'), number: '01', group: 'study' },
    { id: 'submissions', label: t('navSubmissions'), number: '02', group: 'study' },
    { id: 'questions', label: t('navQuestions'), number: '03', group: 'configure' },
  ];
  return `<aside class="admin-sidebar" aria-label="${escapeAttribute(t('adminLabel'))}">
    ${renderBrand()}
    <nav class="admin-nav">
      <section class="nav-group"><p class="nav-group-label">${escapeHtml(t('navGroupStudy'))}</p><ul class="nav-list">${nav.filter((item) => item.group === 'study').map(renderNavItem).join('')}</ul></section>
      <section class="nav-group"><p class="nav-group-label">${escapeHtml(t('navGroupConfigure'))}</p><ul class="nav-list">${nav.filter((item) => item.group === 'configure').map(renderNavItem).join('')}</ul></section>
    </nav>
    <div class="admin-sidebar-footer"><div class="admin-account"><small>${escapeHtml(t('signedInAs'))}</small><b>${escapeHtml(userLabel())}</b></div><div class="admin-footer-actions">${languageButtons()}<button class="sign-out" type="button" data-action="logout">${escapeHtml(t('signOut'))}</button></div></div>
  </aside>`;
}

function renderNavItem(item) {
  const active = state.view === item.id || (item.id === 'questions' && state.view === 'question-editor') || (item.id === 'submissions' && state.view === 'submission-detail');
  return `<li><button class="nav-link ${active ? 'is-active' : ''}" type="button" data-action="navigate" data-view="${item.id}" aria-current="${active ? 'page' : 'false'}"><span class="nav-index">${item.number}</span><b>${escapeHtml(item.label)}</b></button></li>`;
}

function renderShell(content) {
  return `<div class="admin-console">${renderSidebar()}<main class="admin-main"><div class="admin-stage">${content}</div></main></div>`;
}

function renderMetric(label, value, hint, index) {
  return `<article class="metric-card"><span class="metric-label">${escapeHtml(label)}</span><b class="metric-value" data-metric="${index}">${escapeHtml(value)}</b><small class="metric-hint">${escapeHtml(hint)}</small></article>`;
}

function submittedToday(records = state.submissions) {
  const start = todayStart().getTime();
  return records.filter((record) => {
    const value = Date.parse(record.submittedAt || record.receivedAt || '');
    return Number.isFinite(value) && value >= start;
  }).length;
}

function qualitativeRate(records = state.submissions) {
  if (!records.length) return null;
  const complete = records.filter((record) => {
    const answers = record.qualitativeAnswers;
    return answers && typeof answers === 'object' && Object.values(answers).some((answer) => String(answer || '').trim());
  }).length;
  return Math.round((complete / records.length) * 100);
}

function renderOverview() {
  const completed = state.submissionsStats?.completed ?? state.submissionTotal;
  const today = state.submissionsStats?.today ?? submittedToday();
  const statsRate = normalisePercentage(state.submissionsStats?.qualitativeRate ?? state.submissionsStats?.qualitativeCompletion);
  const rate = statsRate ?? qualitativeRate();
  const enabledModules = state.submissionsStats?.enabledModules ?? state.questions.filter((question) => question.enabled).length;
  const latest = state.submissionsLastUpdated ? formatDate(state.submissionsLastUpdated) : t('unknown');
  return `<section class="admin-page" aria-labelledby="admin-page-title">
    <header class="admin-page-heading"><div class="admin-page-heading-copy"><p class="eyebrow">${escapeHtml(t('overviewEyebrow'))}</p><h1 id="admin-page-title">${escapeHtml(t('overviewTitle'))}</h1><p>${escapeHtml(t('overviewLead'))}</p></div><div class="heading-actions"><div class="sync-note"><b>${escapeHtml(t('overviewUpdated'))}</b>${escapeHtml(latest)}</div><button class="secondary-button" type="button" data-action="refresh">${escapeHtml(t('refresh'))}<span aria-hidden="true">↻</span></button></div></header>
    <section class="metric-grid" aria-label="${escapeAttribute(t('overviewTitle'))}">
      ${renderMetric(t('metricCompleted'), completed === undefined || completed === null ? t('unknown') : String(completed), t('metricCompletedHint'), 'completed')}
      ${renderMetric(t('metricToday'), String(today ?? t('unknown')), t('metricTodayHint'), 'today')}
      ${renderMetric(t('metricQualitative'), rate === null ? t('unknown') : `${rate}%`, t('metricQualitativeHint'), 'qualitative')}
      ${renderMetric(t('metricModules'), String(enabledModules ?? t('unknown')), t('metricModulesHint'), 'modules')}
    </section>
    <section class="admin-panel"><div class="panel-heading"><div><h2>${escapeHtml(t('recentHeading'))}</h2><p>${escapeHtml(t('recentLead'))}</p></div><button class="text-button" type="button" data-action="navigate" data-view="submissions">${escapeHtml(t('viewAll'))}<span aria-hidden="true">→</span></button></div>${renderResponseList({ compact: true })}</section>
  </section>`;
}

function renderResponseList({ compact = false } = {}) {
  if (state.submissionsLoading && !state.submissions.length) return `<div class="loading-state" role="status">${escapeHtml(t('loading'))}</div>`;
  if (state.submissionsError && !state.submissions.length) return `<div class="error-state" role="alert"><span>${escapeHtml(state.submissionsError || t('loadError'))}</span><button class="text-button" type="button" data-action="refresh">${escapeHtml(t('retry'))}</button></div>`;
  const list = compact ? state.submissions.slice(0, 6) : state.submissions;
  if (!list.length) return `<p class="empty-state">${escapeHtml(t('emptySubmissions'))}</p>`;
  return `<div class="table-wrap"><table class="response-table"><thead><tr><th scope="col">${escapeHtml(t('submissionId'))}</th><th scope="col">${escapeHtml(t('participant'))}</th><th scope="col">${escapeHtml(t('submittedAt'))}</th><th scope="col">${escapeHtml(t('locale'))}</th><th scope="col"><span class="visually-hidden">${escapeHtml(t('detail'))}</span></th></tr></thead><tbody>${list.map(renderResponseRow).join('')}</tbody></table></div>`;
}

function renderResponseRow(record) {
  const id = submissionIdOf(record) || t('unknown');
  const participant = record.participant || {};
  return `<tr class="response-row" tabindex="0" role="button" data-action="submission-detail" data-id="${escapeAttribute(id)}"><td><span class="response-id">${escapeHtml(id)}</span></td><td><span class="response-meta"><b>${escapeHtml(participantCode(participant))}</b><small>${escapeHtml(roleValue(participant))}</small></span></td><td>${escapeHtml(formatDate(record.submittedAt || record.receivedAt))}</td><td><span class="locale-chip">${escapeHtml(adminLanguageNames[record.locale] || record.locale || t('unknown'))}</span></td><td class="table-detail">→</td></tr>`;
}

function renderSubmissions() {
  return `<section class="admin-page" aria-labelledby="admin-page-title">
    <header class="admin-page-heading"><div class="admin-page-heading-copy"><p class="eyebrow">${escapeHtml(t('submissionsEyebrow'))}</p><h1 id="admin-page-title">${escapeHtml(t('submissionsTitle'))}</h1><p>${escapeHtml(t('submissionsLead'))}</p></div><div class="heading-actions"><div class="sync-note"><b>${escapeHtml(t('submissionCount', { n: state.submissionTotal }))}</b>${escapeHtml(state.submissionsLastUpdated ? formatDate(state.submissionsLastUpdated) : t('unknown'))}</div><button class="secondary-button" type="button" data-action="refresh">${escapeHtml(t('refresh'))}<span aria-hidden="true">↻</span></button></div></header>
    <form class="toolbar" data-form="filters" role="search"><label class="toolbar-field toolbar-search"><span>${escapeHtml(t('search'))}</span><input data-filter="query" type="search" value="${escapeAttribute(state.filters.query)}" placeholder="${escapeAttribute(t('searchPlaceholder'))}" /></label><label class="toolbar-field"><span>${escapeHtml(t('filterLocale'))}</span><select data-filter="locale"><option value="">${escapeHtml(t('allLocales'))}</option>${adminLocales.map((locale) => `<option value="${locale}" ${state.filters.locale === locale ? 'selected' : ''}>${escapeHtml(adminLanguageNames[locale])}</option>`).join('')}</select></label><label class="toolbar-field"><span>${escapeHtml(t('filterDate'))}</span><select data-filter="date"><option value="">${escapeHtml(t('allDates'))}</option><option value="today" ${state.filters.date === 'today' ? 'selected' : ''}>${escapeHtml(t('dateToday'))}</option><option value="week" ${state.filters.date === 'week' ? 'selected' : ''}>${escapeHtml(t('dateWeek'))}</option><option value="month" ${state.filters.date === 'month' ? 'selected' : ''}>${escapeHtml(t('dateMonth'))}</option></select></label><div class="toolbar-action"><button class="primary-button" type="button" data-action="export">${escapeHtml(t('export'))}<span aria-hidden="true">↗</span></button></div></form>
    <section class="admin-panel"><div class="panel-heading"><div><h2>${escapeHtml(t('submissionsTitle'))}</h2><p>${escapeHtml(t('overviewUpdated'))}</p></div></div>${renderResponseList()}</section>
  </section>`;
}

function renderDetail() {
  const record = state.selectedSubmission;
  if (state.detailLoading) return `<section class="admin-page"><button class="back-link" type="button" data-action="back-submissions"><span aria-hidden="true">←</span>${escapeHtml(t('backToList'))}</button><div class="loading-state" role="status">${escapeHtml(t('loading'))}</div></section>`;
  if (state.detailError || !record) return `<section class="admin-page"><button class="back-link" type="button" data-action="back-submissions"><span aria-hidden="true">←</span>${escapeHtml(t('backToList'))}</button><div class="error-state" role="alert"><span>${escapeHtml(state.detailError || t('loadError'))}</span><button class="text-button" type="button" data-action="retry-detail">${escapeHtml(t('retry'))}</button></div></section>`;
  const participant = record.participant || {};
  const resultCard = record.resultCard || {};
  const topicCount = resultValue(resultCard, ['topicCount', 'topics', 'totalTopics'], record.confirmedTopics?.total ?? 0);
  const directLinks = resultValue(resultCard, ['directLinks', 'directLinkCount', 'directInfluenceCount', 'directPromotingLinks', 'links'], Array.isArray(record.responses) ? record.responses.filter((item) => item?.relation && item.relation !== 'O').length : 0);
  const revision = Number.isSafeInteger(record.questionnaireConfigRevision) ? record.questionnaireConfigRevision : null;
  return `<section class="admin-page" aria-labelledby="admin-page-title"><button class="back-link" type="button" data-action="back-submissions"><span aria-hidden="true">←</span>${escapeHtml(t('backToList'))}</button><header class="admin-page-heading"><div class="admin-page-heading-copy"><p class="eyebrow">${escapeHtml(t('submissionEyebrow'))}</p><h1 id="admin-page-title">${escapeHtml(submissionIdOf(record) || t('unknown'))}</h1><p>${escapeHtml(t('submissionLead'))}</p></div><div class="heading-actions"><span class="status-chip">${escapeHtml(t('statusComplete'))}</span></div></header><div class="detail-meta"><div class="detail-meta-item"><span>${escapeHtml(t('submittedAt'))}</span><b>${escapeHtml(formatDate(record.submittedAt || record.receivedAt))}</b></div><div class="detail-meta-item"><span>${escapeHtml(t('locale'))}</span><b>${escapeHtml(adminLanguageNames[record.locale] || record.locale || t('unknown'))}</b></div><div class="detail-meta-item"><span>${escapeHtml(t('participant'))}</span><b>${escapeHtml(participantCode(participant))}</b></div><div class="detail-meta-item"><span>${escapeHtml(t('role'))}</span><b>${escapeHtml(roleValue(participant))}</b></div><div class="detail-meta-item"><span>${escapeHtml(t('questionnaireRevision'))}</span><b>${escapeHtml(revision === null ? t('unknown') : String(revision))}</b></div></div><div class="detail-grid"><section class="admin-panel"><div class="panel-heading"><div><h2>${escapeHtml(t('participantHeading'))}</h2></div></div><dl class="profile-list"><div class="profile-row"><dt>${escapeHtml(t('participant'))}</dt><dd>${escapeHtml(participantCode(participant))}</dd></div><div class="profile-row"><dt>${escapeHtml(t('role'))}</dt><dd>${escapeHtml(roleValue(participant))}</dd></div><div class="profile-row"><dt>${escapeHtml(t('experience'))}</dt><dd>${escapeHtml(experienceValue(participant))}</dd></div><div class="profile-row"><dt>${escapeHtml(t('locale'))}</dt><dd>${escapeHtml(adminLanguageNames[record.locale] || record.locale || t('unknown'))}</dd></div></dl></section><section class="admin-panel"><div class="panel-heading"><div><h2>${escapeHtml(t('structureHeading'))}</h2></div></div><div class="result-summary"><article><span>${escapeHtml(t('structureTopics'))}</span><b>${escapeHtml(topicCount)}</b></article><article><span>${escapeHtml(t('structureLinks'))}</span><b>${escapeHtml(directLinks)}</b></article></div><p class="detail-note">${escapeHtml(t('structureFrozen'))}</p></section></div><section class="admin-panel"><div class="panel-heading"><div><h2>${escapeHtml(t('moduleAnswersHeading'))}</h2><p>${escapeHtml(revision === null ? t('moduleSnapshotNotRecorded') : (state.detailQuestionsError ? t('moduleSnapshotUnavailable', { n: revision }) : t('moduleAnswersLead')))}</p></div></div>${renderModuleAnswers(record)}</section><section class="admin-panel"><div class="panel-heading"><div><h2>${escapeHtml(t('answersHeading'))}</h2></div></div>${renderAnswers(record)}</section><details class="admin-panel raw-record"><summary class="panel-heading"><div><h2>${escapeHtml(t('rawData'))}</h2></div><span aria-hidden="true">＋</span></summary><pre>${escapeHtml(jsonPreview(record.raw || record))}</pre></details><div class="detail-actions"><button class="secondary-button" type="button" data-action="download-json">${escapeHtml(t('downloadJson'))}<span aria-hidden="true">↗</span></button><button class="text-button" type="button" data-action="print">${escapeHtml(t('print'))}</button></div></section>`;
}

function renderModuleAnswers(record) {
  const answers = Array.isArray(record.moduleAnswers) ? record.moduleAnswers : [];
  if (!answers.length) return `<p class="empty-state">${escapeHtml(t('noModuleAnswers'))}</p>`;
  return `<div class="answer-list module-answer-list">${answers.map((answer) => {
    const question = detailQuestionFor(answer);
    const id = String(answer.moduleId || t('unknown'));
    const title = question ? questionTitle(question) : id;
    const value = moduleAnswerValue(answer, question);
    const version = Number.isSafeInteger(answer.moduleVersion) ? `${t('moduleVersion')} ${answer.moduleVersion}` : '';
    return `<article class="answer-item module-answer-item"><h3><span>${escapeHtml(id.toUpperCase())}</span>${escapeHtml(title)}</h3><small class="answer-meta">${escapeHtml(moduleTypeLabel(answer, question))}${version ? ` · ${escapeHtml(version)}` : ''}</small><p class="${value === t('answerNotApplicable') ? 'answer-empty' : ''}">${escapeHtml(value)}</p></article>`;
  }).join('')}</div>`;
}

function renderAnswers(record) {
  const answers = record.qualitativeAnswers && typeof record.qualitativeAnswers === 'object' ? record.qualitativeAnswers : {};
  const canonicalIds = new Set((Array.isArray(record.moduleAnswers) ? record.moduleAnswers : []).map((answer) => String(answer?.moduleId || '')).filter(Boolean));
  const keys = Object.keys(answers).filter((id) => !canonicalIds.has(id)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  if (!keys.length) return `<p class="empty-state">${escapeHtml(canonicalIds.size ? t('legacyAnswersCovered') : t('noAnswers'))}</p>`;
  const revision = Number.isSafeInteger(record.questionnaireConfigRevision) ? record.questionnaireConfigRevision : null;
  const questionSource = revision === null ? state.questions : state.detailQuestions;
  return `<div class="answer-list">${keys.map((id) => {
    const question = questionSource.find((item) => item.id === id);
    const answer = String(answers[id] ?? '').trim();
    return `<article class="answer-item"><h3><span>${escapeHtml(id.toUpperCase())}</span>${escapeHtml(question ? questionTitle(question) : id.toUpperCase())}</h3><p class="${answer ? '' : 'answer-empty'}">${escapeHtml(answer || t('answerNotApplicable'))}</p></article>`;
  }).join('')}</div>`;
}

function renderQuestions() {
  const enabled = state.questions.filter((question) => question.enabled).length;
  return `<section class="admin-page" aria-labelledby="admin-page-title"><header class="admin-page-heading"><div class="admin-page-heading-copy"><p class="eyebrow">${escapeHtml(t('questionsEyebrow'))}</p><h1 id="admin-page-title">${escapeHtml(t('questionsTitle'))}</h1><p>${escapeHtml(t('questionsLead'))}</p></div><div class="question-tools"><span class="question-count">${escapeHtml(t('questionCount', { n: state.questions.length }))}</span><button class="primary-button" type="button" data-action="new-question">${escapeHtml(t('createQuestion'))}<span aria-hidden="true">＋</span></button></div></header><section class="admin-panel"><div class="panel-heading"><div><h2>${escapeHtml(t('questionsTitle'))}</h2><p>${escapeHtml(t('reorderInstructions'))}</p></div></div>${renderQuestionList(enabled)}</section></section>`;
}

function renderQuestionList(enabledCount) {
  if (state.questionsLoading && !state.questions.length) return `<div class="loading-state" role="status">${escapeHtml(t('loading'))}</div>`;
  if (state.questionsError && !state.questions.length) return `<div class="error-state" role="alert"><span>${escapeHtml(state.questionsError || t('questionLoadError'))}</span><button class="text-button" type="button" data-action="load-questions">${escapeHtml(t('retry'))}</button></div>`;
  if (!state.questions.length) return `<p class="empty-state">${escapeHtml(t('noQuestions'))}</p>`;
  return `<div class="question-list" aria-label="${escapeAttribute(t('questionsTitle'))}">${state.questions.map((question, index) => `<article class="question-row"><span class="question-order">${String(index + 1).padStart(2, '0')}</span><div class="question-copy"><h3>${escapeHtml(questionTitle(question))}</h3><p>${escapeHtml(localise(question.description, ''))}</p></div><div class="question-tags"><span class="question-tag">${escapeHtml(questionTypeLabel(question.type))}</span><span class="question-tag ${question.enabled ? 'is-active' : ''}">${escapeHtml(question.enabled ? t('activeLabel') : t('disabledLabel'))}</span><span class="question-tag">${escapeHtml(question.required ? t('required') : t('optional'))}</span></div><div class="question-actions"><button class="text-button" type="button" data-action="edit-question" data-id="${escapeAttribute(question.id)}">${escapeHtml(t('edit'))}</button><button class="text-button danger-button" type="button" data-action="delete-question" data-id="${escapeAttribute(question.id)}">${escapeHtml(t('delete'))}</button><span class="question-reorder"><button class="icon-button" type="button" data-action="move-question" data-id="${escapeAttribute(question.id)}" data-direction="up" aria-label="${escapeAttribute(t('moveUp'))}" ${index === 0 ? 'disabled' : ''}>↑</button><button class="icon-button" type="button" data-action="move-question" data-id="${escapeAttribute(question.id)}" data-direction="down" aria-label="${escapeAttribute(t('moveDown'))}" ${index === state.questions.length - 1 ? 'disabled' : ''}>↓</button></span></div></article>`).join('')}</div><p class="question-helper">${escapeHtml(t('questionCount', { n: enabledCount }))} · ${escapeHtml(t('activeLabel'))}</p>`;
}

function renderEditor() {
  const editor = state.editor;
  const draft = editor.draft;
  const locale = editor.locale;
  const requiresOptions = draft.type !== 'subjective';
  return `<section class="admin-page question-editor" aria-labelledby="admin-page-title">
    <button class="back-link" type="button" data-action="cancel-editor"><span aria-hidden="true">←</span>${escapeHtml(t('questionsTitle'))}</button>
    <header class="admin-page-heading"><div class="admin-page-heading-copy"><p class="eyebrow">${escapeHtml(t('editorEyebrow'))}</p><h1 id="admin-page-title">${escapeHtml(editor.mode === 'new' ? t('newQuestion') : t('editQuestion'))}</h1><p>${escapeHtml(t('editorLead'))}</p></div></header>
    <div class="editor-language-tabs" role="tablist" aria-label="${escapeAttribute(t('languageTab'))}">${adminLocales.map((item) => `<button type="button" role="tab" aria-selected="${locale === item}" class="${locale === item ? 'is-active' : ''}" data-action="editor-locale" data-locale="${item}">${adminLanguageNames[item]}</button>`).join('')}</div>
    <form class="editor-form" data-form="question-editor" novalidate>
      <div class="editor-grid">
        <label class="field-group"><span>${escapeHtml(t('moduleIdLabel'))}<em aria-hidden="true">*</em></span><input data-editor-field="id" type="text" value="${escapeAttribute(draft.id)}" placeholder="${escapeAttribute(t('moduleIdPlaceholder'))}" required ${editor.mode === 'edit' ? 'readonly' : ''} /></label>
        <label class="field-group"><span>${escapeHtml(t('typeLabel'))}</span><select data-editor-type>${QUESTION_TYPES.map((type) => `<option value="${type}" ${draft.type === type ? 'selected' : ''}>${escapeHtml(questionTypeLabel(type))}</option>`).join('')}</select></label>
        <label class="field-group"><span>${escapeHtml(t('stageLabel'))}</span><select data-editor-stage><option value="before_topics" ${draft.stage === 'before_topics' ? 'selected' : ''}>${escapeHtml(t('stageBefore'))}</option><option value="after_topics" ${draft.stage === 'after_topics' ? 'selected' : ''}>${escapeHtml(t('stageAfter'))}</option></select></label>
        <label class="field-group"><span>${escapeHtml(t('titleLabel'))}<em aria-hidden="true">*</em></span><input data-editor-field="title" type="text" value="${escapeAttribute(draft.title[locale])}" placeholder="${escapeAttribute(t('titlePlaceholder'))}" required /></label>
        <label class="field-group"><span>${escapeHtml(t('descriptionLabel'))}</span><textarea data-editor-field="description" placeholder="${escapeAttribute(t('descriptionPlaceholder'))}">${escapeHtml(draft.description[locale])}</textarea></label>
      </div>
      <div class="editor-toggles"><label class="check-label"><input data-editor-toggle="required" type="checkbox" ${draft.required ? 'checked' : ''} />${escapeHtml(t('requiredLabel'))}</label><label class="check-label"><input data-editor-toggle="enabled" type="checkbox" ${draft.enabled ? 'checked' : ''} />${escapeHtml(t('enabledLabel'))}</label></div>
      ${requiresOptions ? renderOptionsEditor() : ''}
      ${editor.error ? `<p class="inline-error" role="alert">${escapeHtml(editor.error)}</p>` : ''}
      <div class="editor-actions"><button class="text-button" type="button" data-action="cancel-editor">${escapeHtml(t('cancel'))}</button><div><button class="primary-button" type="submit" ${editor.saving ? 'disabled' : ''}>${escapeHtml(editor.saving ? t('saving') : t('save'))}<span aria-hidden="true">→</span></button></div></div>
    </form>
  </section>`;
}

function renderOptionsEditor() {
  const draft = state.editor.draft;
  const options = draft.options || [];
  const judgementLocked = draft.type === 'judgement';
  const optionActions = (option, index) => judgementLocked ? '' : `<button class="icon-button" type="button" data-action="move-option" data-index="${index}" data-direction="up" aria-label="${escapeAttribute(t('moveUp'))}" ${index === 0 ? 'disabled' : ''}>↑</button><button class="icon-button" type="button" data-action="move-option" data-index="${index}" data-direction="down" aria-label="${escapeAttribute(t('moveDown'))}" ${index === options.length - 1 ? 'disabled' : ''}>↓</button><button class="icon-button" type="button" data-action="remove-option" data-index="${index}" aria-label="${escapeAttribute(t('delete'))}">×</button>`;
  return `<section class="option-builder" aria-labelledby="options-heading"><div class="option-builder-heading"><div><h2 id="options-heading">${escapeHtml(t('optionsLabel'))}</h2><p>${escapeHtml(t('questionType'))}: ${escapeHtml(questionTypeLabel(draft.type))}</p></div>${judgementLocked ? '' : `<button class="secondary-button" type="button" data-action="add-option">${escapeHtml(t('addOption'))}<span aria-hidden="true">＋</span></button>`}</div><div class="options-list">${options.length ? options.map((option, index) => `<div class="option-row"><span class="option-index">${String(index + 1).padStart(2, '0')}</span><label><span class="visually-hidden">${escapeHtml(t('optionLabel', { n: index + 1 }))}</span><input data-option-field="value" data-option-index="${index}" type="text" value="${escapeAttribute(option.value[state.editor.locale] || '')}" placeholder="${escapeAttribute(t('optionValuePlaceholder'))}" /></label><div class="option-actions">${optionActions(option, index)}</div></div>`).join('') : `<p class="empty-state">${escapeHtml(t('noQuestions'))}</p>`}</div>${judgementLocked ? `<div class="preset-row"><button class="text-button" type="button" data-action="preset-judgement">${escapeHtml(t('presetJudgement'))}</button><small>${escapeHtml(t('presetApplied'))}</small></div>` : ''}</section>`;
}

function renderToast() {
  if (!state.toast) return '';
  return `<div class="toast ${state.toast.error ? 'is-error' : ''} is-visible" role="status">${escapeHtml(state.toast.message)}</div>`;
}

function render() {
  document.documentElement.lang = state.locale;
  document.body.dataset.screen = state.auth === 'signedIn' ? state.view : 'admin-login';
  if (state.auth === 'checking') {
    app.innerHTML = `<div class="login-layout"><aside class="login-rail">${renderBrand()}<div class="admin-sidebar-footer"><div class="admin-footer-actions">${languageButtons()}</div></div></aside><main class="login-main"><div class="login-stage"><div class="loading-state" role="status">${escapeHtml(t('loading'))}</div></div></main></div>`;
    return;
  }
  if (state.auth !== 'signedIn') {
    app.innerHTML = renderLogin();
    bindEvents();
    return;
  }
  const content = state.view === 'overview'
    ? renderOverview()
    : state.view === 'submissions'
      ? renderSubmissions()
      : state.view === 'submission-detail'
        ? renderDetail()
        : state.view === 'questions'
          ? renderQuestions()
          : renderEditor();
  app.innerHTML = `${renderShell(content)}${renderToast()}`;
  bindEvents();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  app.addEventListener('click', handleClick);
  app.addEventListener('submit', handleSubmit);
  app.addEventListener('input', handleInput);
  app.addEventListener('change', handleChange);
  app.addEventListener('keydown', handleKeydown);
}

function showToast(message, error = false) {
  state.toast = { message, error };
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.toast = null;
    if (state.auth === 'signedIn') render();
  }, 3600);
  render();
}

function setLocale(locale) {
  if (!adminLocales.includes(locale) || locale === state.locale) return;
  state.locale = locale;
  if (state.editor) state.editor.locale = locale;
  const url = new URL(window.location.href);
  url.searchParams.set(LOCALE_QUERY_KEY, locale);
  window.history.replaceState({}, '', url);
  render();
}

function startPolling() {
  stopPolling();
  pollTimer = window.setInterval(() => {
    if (state.auth !== 'signedIn' || !['overview', 'submissions'].includes(state.view)) return;
    void loadSubmissions({ silent: true });
  }, 30000);
}

function stopPolling() {
  if (pollTimer !== null) window.clearInterval(pollTimer);
  pollTimer = null;
}

async function bootstrap() {
  render();
  try {
    const payload = await api.session();
    state.auth = 'signedIn';
    state.user = extractSession(payload) || payload?.user || { name: 'admin' };
    state.authMessage = '';
    render();
    startPolling();
    await loadOverviewData();
  } catch (error) {
    if (error instanceof AdminAuthError) {
      state.authMessage = '';
    } else if (error instanceof AdminApiError) {
      state.authMessage = t('adminUnavailable');
    }
    state.auth = 'signedOut';
    state.user = null;
    stopPolling();
    render();
  }
}

async function loadOverviewData() {
  await Promise.all([loadSubmissions({ silent: true }), loadQuestions({ silent: true }), loadCounts()]);
  if (state.auth === 'signedIn') render();
}

async function loadCounts() {
  if (state.auth !== 'signedIn') return;
  try {
    const [all, today] = await Promise.all([
      api.submissionCounts(),
      api.submissionCounts(dateQuery({ date: 'today' })),
    ]);
    state.submissionsStats = {
      ...(state.submissionsStats || {}),
      completed: all?.total ?? state.submissionTotal,
      today: today?.total ?? state.submissionsStats?.today,
    };
  } catch (error) {
    if (error instanceof AdminAuthError) return;
    // Counts are supplementary; the main list can still render when an older
    // backend has not exposed this endpoint yet.
  }
}

function submissionQuery() {
  return { query: state.filters.query, locale: state.filters.locale, ...dateQuery() };
}

async function loadSubmissions({ silent = false } = {}) {
  if (state.auth !== 'signedIn') return;
  state.submissionsLoading = true;
  state.submissionsError = '';
  if (!silent) render();
  try {
    const payload = await api.submissions(submissionQuery());
    const parsed = extractListPayload(payload, ['items', 'submissions', 'responses', 'data', 'results']);
    state.submissions = parsed.items.map(normaliseSubmission);
    state.submissionTotal = parsed.total;
    state.submissionsStats = payload?.stats || payload?.summary || payload?.meta?.stats || state.submissionsStats;
    state.submissionsLastUpdated = new Date().toISOString();
  } catch (error) {
    if (error instanceof AdminAuthError) return;
    state.submissionsError = error.message || t('loadError');
  } finally {
    state.submissionsLoading = false;
    if (state.auth === 'signedIn' && (state.view === 'overview' || state.view === 'submissions')) render();
  }
}

async function loadQuestions({ silent = false } = {}) {
  if (state.auth !== 'signedIn') return;
  state.questionsLoading = true;
  state.questionsError = '';
  if (!silent) render();
  try {
    const payload = await api.questions();
    const parsed = extractListPayload(payload, ['items', 'questions', 'modules', 'data', 'results']);
    // The audit-complete snapshot deliberately includes soft-archived modules.
    // Keep those records out of the active editor and reorder payload: the
    // question store requires reorder ids to contain every active module once
    // and forbids archived ids.
    state.questions = parsed.items
      .map(normaliseQuestion)
      .filter((question) => !question.archived)
      .sort((left, right) => left.order - right.order);
  } catch (error) {
    if (error instanceof AdminAuthError) return;
    state.questionsError = error.message || t('questionLoadError');
  } finally {
    state.questionsLoading = false;
    if (state.auth === 'signedIn' && (state.view === 'questions' || state.view === 'overview')) render();
  }
}

async function loadDetailQuestionSnapshot(record) {
  state.detailQuestions = [];
  state.detailQuestionsError = '';
  const revision = Number(record?.questionnaireConfigRevision);
  if (!Number.isSafeInteger(revision) || revision < 0) return;
  state.detailQuestionRevision = revision;
  try {
    const payload = await api.questions({ revision });
    const parsed = extractListPayload(payload, ['items', 'questions', 'modules', 'data', 'results']);
    state.detailQuestions = parsed.items.map(normaliseQuestion);
  } catch (error) {
    if (error instanceof AdminAuthError) throw error;
    state.detailQuestionsError = error.message || t('loadError');
  }
}

async function openSubmission(id) {
  if (!id) return;
  state.view = 'submission-detail';
  state.detailId = id;
  state.selectedSubmission = null;
  state.detailLoading = true;
  state.detailError = '';
  state.detailQuestions = [];
  state.detailQuestionRevision = null;
  state.detailQuestionsError = '';
  render();
  try {
    const payload = await api.submission(id);
    const item = payload?.submission || payload?.item || payload?.data || payload;
    state.selectedSubmission = normaliseSubmission(item);
    await loadDetailQuestionSnapshot(state.selectedSubmission);
  } catch (error) {
    if (error instanceof AdminAuthError) return;
    state.detailError = error.message || t('loadError');
  } finally {
    state.detailLoading = false;
    if (state.auth === 'signedIn') render();
  }
}

function startEditor(question = null) {
  state.view = 'question-editor';
  state.editor = {
    mode: question ? 'edit' : 'new',
    locale: state.locale,
    draft: question ? draftFromQuestion(question) : blankQuestion(),
    saving: false,
    error: '',
  };
  render();
}

function setView(view) {
  if (!['overview', 'submissions', 'questions'].includes(view)) return;
  state.view = view;
  state.editor = null;
  render();
  if (view === 'overview' || view === 'submissions') void loadSubmissions();
  if (view === 'questions') void loadQuestions();
}

function fillJudgementPreset() {
  if (!state.editor) return;
  state.editor.draft.options = JUDGEMENT_PRESET.map((option) => ({
    id: option.code,
    code: option.code,
    value: { ...option.label },
  }));
  state.editor.error = '';
  render();
}

function validateDraft(draft) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(String(draft.id || '').trim())) return t('moduleIdLabel');
  if (adminLocales.some((locale) => !String(draft.title?.[locale] || '').trim())) return t('titleLabel');
  if (draft.type !== 'subjective') {
    if (!Array.isArray(draft.options) || draft.options.length < 2) return t('optionsLabel');
    if (draft.options.some((option) => adminLocales.some((locale) => !String(option.value?.[locale] || '').trim()))) return t('optionsLabel');
  }
  if (draft.type === 'judgement' && (draft.options.length !== 2 || draft.options[0]?.id !== 'true' || draft.options[1]?.id !== 'false')) return t('judgementValidation');
  return '';
}

function questionPayload(draft) {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    type: BACKEND_TYPE_BY_UI[draft.type] || draft.type,
    stage: draft.stage || 'before_topics',
    required: Boolean(draft.required),
    enabled: Boolean(draft.enabled),
    translations: Object.fromEntries(adminLocales.map((locale) => [locale, {
      prompt: String(draft.title[locale] || ''),
      helpText: String(draft.description[locale] || ''),
      placeholder: '',
    }])),
    options: draft.type === 'subjective' ? [] : draft.options.map((option, index) => ({
      id: option.id || `${draft.id || 'option'}-${index + 1}`,
      translations: Object.fromEntries(adminLocales.map((locale) => [locale, {
        label: String(option.value?.[locale] || ''),
      }])),
    })),
    constraints: draft.type === 'subjective'
      ? { minLength: 0, maxLength: 3_000, multiline: true }
      : draft.type === 'multiple'
        ? { minSelections: 0, maxSelections: Math.max(1, draft.options.length), randomizeOptions: false }
        : draft.type === 'single'
          ? { randomizeOptions: false }
          : {},
  };
}

async function saveQuestion() {
  if (!state.editor) return;
  const draft = state.editor.draft;
  const error = validateDraft(draft);
  if (error) {
    state.editor.error = error;
    render();
    return;
  }
  state.editor.saving = true;
  state.editor.error = '';
  render();
  try {
    const payload = questionPayload(draft);
    if (state.editor.mode === 'new') await api.createQuestion(payload);
    else await api.updateQuestion(draft.id, payload);
    state.editor = null;
    state.view = 'questions';
    await loadQuestions({ silent: true });
    showToast(t('saveSuccess'));
  } catch (error) {
    if (error instanceof AdminAuthError) return;
    state.editor.saving = false;
    state.editor.error = error.message || t('saveError');
    render();
  }
}

async function deleteQuestion(id) {
  const question = state.questions.find((item) => item.id === id);
  if (!question || !window.confirm(`${t('confirmDelete')}\n\n${t('deleteMessage')}`)) return;
  try {
    await api.deleteQuestion(id);
    state.questions = state.questions.filter((item) => item.id !== id);
    render();
    showToast(t('deleteSuccess'));
  } catch (error) {
    if (error instanceof AdminAuthError) return;
    showToast(error.message || t('saveError'), true);
  }
}

async function moveQuestion(id, direction) {
  const index = state.questions.findIndex((item) => item.id === id);
  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.questions.length) return;
  const next = [...state.questions];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  state.questions = next.map((question, itemIndex) => ({ ...question, order: itemIndex + 1 }));
  render();
  try {
    await api.reorderQuestions(state.questions.map((question) => question.id));
  } catch (error) {
    if (error instanceof AdminAuthError) return;
    await loadQuestions({ silent: true });
    showToast(error.message || t('reorderError'), true);
  }
}

function moveOption(index, direction) {
  if (!state.editor) return;
  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  const options = state.editor.draft.options;
  if (index < 0 || nextIndex < 0 || nextIndex >= options.length) return;
  [options[index], options[nextIndex]] = [options[nextIndex], options[index]];
  render();
}

function addOption() {
  if (!state.editor) return;
  state.editor.draft.options.push({ id: '', code: '', value: Object.fromEntries(adminLocales.map((locale) => [locale, ''])) });
  render();
  const last = app.querySelector('.options-list input:last-of-type');
  last?.focus();
}

async function exportResponses() {
  try {
    const response = await api.exportSubmissions(submissionQuery());
    const blob = await response.blob();
    const filename = response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i)?.[1]
      || ((response.headers.get('content-type') || '').includes('text/csv') ? 'm1-submissions.csv' : 'm1-submissions.ndjson');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    if (error instanceof AdminAuthError) return;
    showToast(error.message || t('loadError'), true);
  }
}

function downloadSelectedJson() {
  if (!state.selectedSubmission) return;
  const blob = new Blob([jsonPreview(state.selectedSubmission.raw || state.selectedSubmission)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${submissionIdOf(state.selectedSubmission) || 'submission'}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function handleSubmit(event) {
  const form = event.target.closest('form');
  if (!form) return;
  event.preventDefault();
  if (form.dataset.form === 'login') {
    const data = new FormData(form);
    const username = String(data.get('username') || '').trim();
    const password = String(data.get('password') || '');
    if (!username || !password) {
      state.authMessage = t('loginError');
      render();
      return;
    }
    state.auth = 'signingIn';
    state.authMessage = '';
    render();
    try {
      const payload = await api.login(username, password);
      state.auth = 'signedIn';
      state.user = extractSession(payload) || payload?.user || { username };
      state.authMessage = '';
      render();
      startPolling();
      await loadOverviewData();
    } catch (error) {
      if (error instanceof AdminAuthError || error.status === 401 || error.status === 403) state.authMessage = t('loginError');
      else state.authMessage = error.message || t('adminUnavailable');
      state.auth = 'signedOut';
      render();
    }
  }
  if (form.dataset.form === 'filters') {
    await loadSubmissions();
  }
  if (form.dataset.form === 'question-editor') await saveQuestion();
}

function handleInput(event) {
  const target = event.target;
  if (target.matches('[data-filter="query"]')) {
    state.filters.query = target.value;
    window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(() => void loadSubmissions(), 280);
    return;
  }
  if (target.matches('[data-editor-field="title"], [data-editor-field="description"]') && state.editor) {
    state.editor.draft[target.dataset.editorField][state.editor.locale] = target.value;
    return;
  }
  if (target.matches('[data-editor-field="id"]') && state.editor) {
    state.editor.draft.id = target.value.trim();
    return;
  }
  if (target.matches('[data-option-field="value"]') && state.editor) {
    const index = Number(target.dataset.optionIndex);
    if (state.editor.draft.options[index]) state.editor.draft.options[index].value[state.editor.locale] = target.value;
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.matches('[data-filter="locale"]')) {
    state.filters.locale = target.value;
    void loadSubmissions();
    return;
  }
  if (target.matches('[data-filter="date"]')) {
    state.filters.date = target.value;
    void loadSubmissions();
    return;
  }
  if (target.matches('[data-editor-type]') && state.editor) {
    state.editor.draft.type = QUESTION_TYPES.includes(target.value) ? target.value : 'subjective';
    if (state.editor.draft.type === 'judgement') fillJudgementPreset();
    else render();
    return;
  }
  if (target.matches('[data-editor-stage]') && state.editor) {
    state.editor.draft.stage = target.value === 'after_topics' ? 'after_topics' : 'before_topics';
    return;
  }
  if (target.matches('[data-editor-toggle]') && state.editor) {
    state.editor.draft[target.dataset.editorToggle] = target.checked;
  }
}

function handleKeydown(event) {
  const row = event.target.closest('[data-action="submission-detail"]');
  if (row && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    void openSubmission(row.dataset.id);
  }
}

async function handleClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'locale') {
    setLocale(target.dataset.locale);
    return;
  }
  if (action === 'navigate') {
    setView(target.dataset.view);
    return;
  }
  if (action === 'logout') {
    await api.logout().catch(() => undefined);
    state.auth = 'signedOut';
    state.user = null;
    state.authMessage = '';
    stopPolling();
    render();
    return;
  }
  if (action === 'refresh') {
    await loadSubmissions();
    return;
  }
  if (action === 'submission-detail') {
    await openSubmission(target.dataset.id);
    return;
  }
  if (action === 'back-submissions') {
    state.view = 'submissions';
    state.selectedSubmission = null;
    render();
    await loadSubmissions();
    return;
  }
  if (action === 'retry-detail') {
    await openSubmission(state.detailId);
    return;
  }
  if (action === 'export') {
    await exportResponses();
    return;
  }
  if (action === 'download-json') {
    downloadSelectedJson();
    return;
  }
  if (action === 'print') {
    window.print();
    return;
  }
  if (action === 'new-question') {
    startEditor();
    return;
  }
  if (action === 'edit-question') {
    startEditor(state.questions.find((question) => question.id === target.dataset.id));
    return;
  }
  if (action === 'cancel-editor') {
    state.editor = null;
    state.view = 'questions';
    render();
    return;
  }
  if (action === 'load-questions') {
    await loadQuestions();
    return;
  }
  if (action === 'delete-question') {
    await deleteQuestion(target.dataset.id);
    return;
  }
  if (action === 'move-question') {
    await moveQuestion(target.dataset.id, target.dataset.direction);
    return;
  }
  if (action === 'editor-locale') {
    if (state.editor && adminLocales.includes(target.dataset.locale)) {
      state.editor.locale = target.dataset.locale;
      render();
    }
    return;
  }
  if (action === 'add-option') {
    addOption();
    return;
  }
  if (action === 'preset-judgement') {
    fillJudgementPreset();
    return;
  }
  if (action === 'move-option') {
    moveOption(Number(target.dataset.index), target.dataset.direction);
    return;
  }
  if (action === 'remove-option') {
    if (state.editor) {
      state.editor.draft.options.splice(Number(target.dataset.index), 1);
      render();
    }
  }
}

bindEvents();
void bootstrap();
