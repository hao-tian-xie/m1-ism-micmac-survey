import { managementActivity, managementBoundary } from './management-activities.mjs?v=vt3-guided-20261025';
import { targetPages, guidedCounts } from './guided-elicitation.mjs?v=vt3-guided-20261025';
import { expertErrorKey } from './vt3-copy.mjs?v=vt3-guided-20261025';

const h = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const local = (value, locale) => typeof value === 'string' ? value : value?.[locale] || value?.en || '';
const groupKey = { environment: 'groupEnvironment', social: 'groupSocial', governance: 'groupGovernance' };
const stateKey = { support: 'targetSupport', no_support: 'targetNoSupport', unable: 'targetUnable', unreviewed: 'targetUnreviewed' };

function topicDetails(factor, locale, t) {
  const activity = managementActivity(factor, locale);
  return `<details class="vt3-target-detail"><summary>${h(t('detailsLabel'))}</summary>
    ${activity.example ? `<p>${h(activity.example)}</p>` : ''}
    ${managementBoundary(factor, locale) ? `<p>${h(managementBoundary(factor, locale))}</p>` : ''}
    <p><b>${h(local(factor.name, locale))}</b></p><p>${h(local(factor.description, locale))}</p></details>`;
}

export function renderGuidedPractice({ t, answers = {} }) {
  const questions = [
    { id: 'direction', prompt: 'practiceDirection', options: [['forward', 'practiceForward'], ['both', 'practiceBoth']], correct: 'forward', help: 'practiceDirectionHelp' },
    { id: 'missing', prompt: 'practiceMissing', options: [['unreviewed', 'practiceUnreviewed'], ['none', 'practiceNone']], correct: 'unreviewed', help: 'practiceMissingHelp' },
  ];
  const ready = questions.every((q) => answers[q.id] === q.correct);
  return `<div class="vt3-page vt3-practice"><header class="vt3-page-heading"><p class="eyebrow">${h(t('versionLabel'))}</p><h1 data-page-title tabindex="-1">${h(t('practiceTitle'))}</h1><p>${h(t('practiceLead'))}</p></header>
    ${questions.map((q, index) => `<section class="guided-practice-question"><h2>${index + 1}. ${h(t(q.prompt))}</h2><div class="guided-practice-options">${q.options.map(([value, key]) => `<button type="button" data-action="practice-answer" data-question="${q.id}" data-value="${value}" aria-pressed="${answers[q.id] === value}">${h(t(key))}</button>`).join('')}</div>${answers[q.id] ? `<p role="status">${answers[q.id] === q.correct ? h(t('practiceCorrect')) : ''} ${h(t(q.help))}</p>` : ''}</section>`).join('')}
    <div class="vt3-task-actions"><span></span><button type="button" class="primary-button" data-action="practice-continue" ${ready ? '' : 'disabled'}>${h(t('practiceContinue'))} →</button></div></div>`;
}

export function renderGuidedCheckpoint({ factors, rows, order, done, total, locale, t }) {
  return `<div class="vt3-page vt3-checkpoint"><header class="vt3-page-heading"><p class="eyebrow">${h(t('versionLabel'))}</p><h1 data-page-title tabindex="-1">${h(t('checkpointTitle'))}</h1><p>${h(t('checkpointLead', { done, total }))}</p></header>
    <ol class="vt3-review-tasks">${rows.map((row) => `<li><button type="button" data-action="review-topic" data-topic-index="${order.indexOf(row.sourceId)}"><span>${h(row.sourceId)}</span><b>${h(managementActivity(factors.find(({ id }) => id === row.sourceId), locale).title)}</b><small>${h(t('pageSummary', guidedCounts(row)))}</small></button></li>`).join('')}</ol>
    <p class="guided-draft-note">${h(t('draftSaved'))}</p><div class="vt3-task-actions"><span></span><button type="button" class="primary-button" data-action="checkpoint-continue">${h(t('checkpointContinue'))} →</button></div></div>`;
}

export function renderGuidedSurvey({ factors, sourceId, row, locale, t, position, total, batch = 1, flow = {}, error = '' }) {
  const byId = new Map(factors.map((factor) => [factor.id, factor]));
  const source = byId.get(sourceId);
  const activity = managementActivity(source, locale);
  const phase = row.recallStatus ? (flow.phase || 'targets') : 'recall';
  const pages = targetPages(factors, sourceId, batch);
  const pageIndex = Math.max(0, Math.min(Number(flow.page) || 0, pages.length - 1));
  const page = pages[pageIndex];
  const counts = guidedCounts(row);
  let body;
  if (phase === 'recall') {
    body = `<section class="guided-recall"><p class="vt3-kicker">${h(t('recallStep'))}</p><h2 class="vt3-question">${h(t('recallPrompt', { source: activity.title }))}</h2><p>${h(t('recallHelp'))}</p>
      <label for="free-recall" class="visually-hidden">${h(t('recallRecord'))}</label><textarea id="free-recall" name="free-recall" data-source-id="${h(sourceId)}" maxlength="1200" rows="5" placeholder="${h(t('recallPlaceholder'))}">${h(row.freeRecall)}</textarea>
      <div class="vt3-task-actions"><small>${h(t('recallSkipHelp'))}</small><button type="button" class="primary-button" data-action="recall-continue">${h(t('recallContinue'))} →</button></div></section>`;
  } else if (phase === 'targets') {
    const remaining = page.ids.filter((id) => row.targetReviews[id] === 'unreviewed').length;
    body = `<section class="vt3-targets"><p class="vt3-kicker">${h(t('targetStep'))}</p><h2 class="vt3-question">${h(t('relationPrompt', { source: activity.title }))}</h2><p>${h(t('relationRule'))}</p>
      <details class="guided-direct-help"><summary>${h(t('pathwayLabel'))}</summary><p>${h(t('directMeaning'))}</p></details>
      <nav class="guided-pages" aria-label="${h(t('targetStep'))}">${pages.map((item, i) => `<button type="button" data-action="target-page" data-page="${i}" aria-current="${i === pageIndex ? 'step' : 'false'}">${h(t(groupKey[item.group] || 'groupOther'))} <span>${i + 1}</span></button>`).join('')}</nav>
      <section class="vt3-target-group"><div class="vt3-group-heading"><h2>${h(t(groupKey[page.group] || 'groupOther'))}</h2><span>${h(t('pagePosition', { n: pageIndex + 1, total: pages.length, count: page.ids.length }))}</span></div>
      <div class="vt3-target-grid">${page.ids.map((id) => {
        const factor = byId.get(id); const item = managementActivity(factor, locale); const status = row.targetReviews[id];
        return `<article class="vt3-target guided-target ${status === 'support' ? 'is-selected' : ''}" data-target-card="${h(id)}"><small>${h(id)}</small><h3>${h(item.title)}</h3><p>${h(item.meaning)}</p>${topicDetails(factor, locale, t)}
          <fieldset class="guided-target-options"><legend class="visually-hidden">${h(id)} · ${h(item.title)}</legend>${Object.entries(stateKey).map(([value, key]) => `<label><input type="radio" name="guided-target-${h(sourceId)}-${h(id)}" data-guided-target="${h(id)}" data-source-id="${h(sourceId)}" value="${value}" ${status === value ? 'checked' : ''}><span>${h(t(key))}</span></label>`).join('')}</fieldset></article>`;
      }).join('')}</div></section>
      <div class="guided-bulk"><button type="button" class="secondary-button" data-action="page-review" data-value="no_support">${h(t('pageNone'))}</button><button type="button" class="text-button" data-action="page-review" data-value="unable">${h(t('pageUnable'))}</button></div>
      <details class="vt3-host-guide"><summary>${h(t('crossPrompt'))}</summary><p>${h(t('crossHelp'))}</p></details>
      ${remaining ? `<p class="vt3-review-state-detail" role="status">${h(t('pageDeferred', { count: remaining }))}</p>` : ''}
      <div class="vt3-task-actions"><button type="button" class="text-button" data-action="target-page" data-page="${pageIndex - 1}">← ${h(t(pageIndex ? 'pagePrevious' : 'recallEdit'))}</button>
      <button type="button" class="primary-button" data-action="${pageIndex === pages.length - 1 ? 'key-link-step' : 'target-page'}" data-page="${pageIndex + 1}">${h(t(pageIndex === pages.length - 1 ? 'keyLinkContinue' : 'pageNext'))} →</button></div></section>`;
  } else {
    const explanation = row.explanation;
    const candidates = factors.filter(({ id }) => row.targetIds.includes(id) || id === explanation?.targetId);
    body = `<section class="vt3-explanation"><p class="vt3-kicker">${h(t('explanationStep'))}</p><p>${h(t('keyLinkHelp'))}</p><p class="guided-answer-summary">${h(t('pageSummary', counts))}</p>
      <label>${h(t('explanationTarget'))}<select name="explanation-target" data-source-id="${h(sourceId)}"><option value="">${h(t('explanationPlaceholder'))}</option>${candidates.map((factor) => `<option value="${h(factor.id)}" ${explanation?.targetId === factor.id ? 'selected' : ''}>${h(factor.id)} · ${h(managementActivity(factor, locale).title)}</option>`).join('')}</select></label>
      ${explanation ? `<p class="guided-path">${h(sourceId)} → ${explanation.linkType === 'via' && explanation.viaId ? `${h(explanation.viaId)} → ` : ''}${h(explanation.targetId)}</p>
        <label>${h(t('pathwayLabel'))}<select name="link-type" data-source-id="${h(sourceId)}">${[['direct','pathwayDirect'],['via','pathwayVia'],['unclear','pathwayUnclear']].map(([value,key]) => `<option value="${value}" ${explanation.linkType === value ? 'selected' : ''}>${h(t(key))}</option>`).join('')}</select></label>
        ${explanation.linkType === 'via' ? `<label>${h(t('viaLabel'))}<select name="via-topic" data-source-id="${h(sourceId)}"><option value="">${h(t('viaPlaceholder'))}</option>${factors.filter(({ id }) => id !== sourceId && id !== explanation.targetId).map((factor) => `<option value="${h(factor.id)}" ${explanation.viaId === factor.id ? 'selected' : ''}>${h(factor.id)} · ${h(managementActivity(factor, locale).title)}</option>`).join('')}</select></label><p role="status">${h(t('viaSaved'))}</p>` : ''}
        ${explanation.linkType === 'unclear' ? `<p role="status">${h(t('unclearSaved'))}</p>` : ''}
        <label>${h(t('mechanismLabel'))}<textarea name="relationship-explanation" data-source-id="${h(sourceId)}" maxlength="800" rows="4" placeholder="${h(t('mechanismPlaceholder'))}">${h(explanation.note)}</textarea></label>
        <label>${h(t('reverseLabel'))}<select name="reverse-judgment" data-source-id="${h(sourceId)}">${[['not_asked','reverseNotAsked'],['support','reverseSupport'],['no_support','reverseNoSupport'],['unable','reverseUnable']].map(([value,key]) => `<option value="${value}" ${explanation.reverse === value ? 'selected' : ''}>${h(t(key))}</option>`).join('')}</select></label>` : ''}
      </section><p class="vt3-task-error" id="task-validation" ${error ? 'role="alert"' : 'role="status"'}>${error ? h(t(expertErrorKey(error))) : h(t('pageSummary', counts))}</p>
      <div class="vt3-task-actions"><button type="button" class="text-button" data-action="target-page" data-page="${pages.length - 1}">← ${h(t('targetStep'))}</button><button type="button" class="primary-button" data-action="confirm-topic">${h(t('confirmSource'))} →</button></div>`;
  }
  return `<div class="vt3-page vt3-survey guided-survey"><header class="vt3-page-heading"><p class="eyebrow">${h(t('versionLabel'))}<span class="vt3-position">${h(t('taskProgress', { i: position, total }))}</span></p></header>
    <section class="vt3-source"><p class="vt3-kicker">${h(t('sourceStep'))} · ${h(sourceId)}</p><h1 id="source-topic-name" data-page-title tabindex="-1">${h(activity.title)}</h1><p class="vt3-source-meaning">${h(activity.meaning)}</p>${topicDetails(source, locale, t)}
    <div class="vt3-unfamiliar-action"><button type="button" class="text-button" data-action="source-unable">${h(t('skipUnfamiliar'))} →</button><small>${h(t('skipUnfamiliarHelp'))}</small></div></section>
    <p class="vt3-scope">${h(t('interviewScope'))}</p>
    ${row.recallStatus && phase !== 'recall' ? `<details class="guided-initial-recall"><summary>${h(t('recallRecord'))}</summary><p>${h(row.freeRecall || t('recallEmpty'))}</p><button type="button" class="text-button" data-action="recall-back">${h(t('recallEdit'))}</button></details>` : ''}
    ${body}</div>`;
}
