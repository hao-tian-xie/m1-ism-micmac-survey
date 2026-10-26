import { managementActivity } from './management-activities.mjs?v=vt3-type-20261026';
import { sourceJudgmentError, targetGroups, topicGroup } from './expert-protocol.mjs?v=vt3-type-20261026';
import { expertErrorKey } from './vt3-copy.mjs?v=vt3-type-20261026';
import { guidedCounts } from './guided-elicitation.mjs?v=vt3-type-20261026';

const h = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const local = (value, locale) => typeof value === 'string' ? value : value?.[locale] || value?.en || '';
const groupKey = { environment: 'groupEnvironment', social: 'groupSocial', governance: 'groupGovernance' };

export function renderExpertSurvey({ factors, sourceId, row, locale, t, position, total, error = '' }) {
  const source = factors.find((factor) => factor.id === sourceId);
  if (!source) return '';
  const activity = managementActivity(source, locale);
  const original = (factor) => `<details class="vt3-original"><summary>${h(t('originalTopic'))}</summary><p><b>${h(local(factor.name, locale))}</b></p><p>${h(local(factor.description, locale))}</p></details>`;
  const targets = factors.filter((factor) => factor.id !== sourceId);
  const groups = targetGroups(factors, sourceId);
  const selected = new Set(row.targetIds);
  const groupsHtml = groups.map((group) => {
    const members = targets.filter((factor) => topicGroup(factor) === group);
    const selectedCount = members.filter((factor) => selected.has(factor.id)).length;
    return `<section class="vt3-target-group" id="targets-${h(group)}" data-target-group="${h(group)}" aria-labelledby="group-title-${h(group)}">
      <div class="vt3-group-heading"><h2 id="group-title-${h(group)}">${h(t(groupKey[group] || 'groupOther'))}</h2><span data-group-count="${h(group)}">${h(t('groupCount', { total: members.length, selected: selectedCount }))}</span></div>
      <div class="vt3-target-grid">${members.map((factor) => {
        const item = managementActivity(factor, locale);
        return `<article class="vt3-target ${selected.has(factor.id) ? 'is-selected' : ''}" data-target-card="${h(factor.id)}">
          <label><input type="checkbox" name="expert-target" data-source-id="${h(sourceId)}" value="${h(factor.id)}" ${selected.has(factor.id) ? 'checked' : ''} ${row.status === 'unable' ? 'disabled' : ''} />
          <span><small>${h(factor.id)}</small><strong>${h(item.title)}</strong></span></label>
          <p>${h(item.meaning)}</p>
          <details class="vt3-target-detail"><summary>${h(local(factor.name, locale))}</summary><p>${h(local(factor.description, locale))}</p>${item.example ? `<p>${h(item.example)}</p>` : ''}</details>
        </article>`;
      }).join('')}</div>
      <label class="vt3-group-review">${h(t('reviewGroup'))}<select name="group-review" data-group="${h(group)}" data-source-id="${h(sourceId)}" ${row.status === 'unable' ? 'disabled' : ''}>
        <option value="">${h(t('reviewPlaceholder'))}</option>
        ${[['reviewed', 'reviewReviewedChoice'], ['unable', 'reviewUnableChoice'], ['unreviewed', 'reviewUnreviewedChoice']].map(([value, key]) => `<option value="${value}" ${row.groupReviews[group] === value ? 'selected' : ''}>${h(t(key))}</option>`).join('')}
      </select></label>
      <p class="vt3-review-state-detail">${h(row.groupReviews[group] ? t({ reviewed: 'reviewReviewed', unable: 'reviewUnable', unreviewed: 'reviewUnreviewed' }[row.groupReviews[group]] || 'reviewPlaceholder') : t('reviewRule'))}</p>
      <p class="vt3-group-reminder" data-group-reminder="${h(group)}" ${selectedCount && !row.groupReviews[group] ? '' : 'hidden'}>${h(t('selectGroupReview'))}</p>
    </section>`;
  }).join('');
  return `<div class="vt3-page vt3-survey">
    <header class="vt3-page-heading"><p class="eyebrow">${h(t('versionLabel'))} <span class="vt3-position">${h(t('taskProgress', { i: position, total }))}</span></p></header>
    <section class="vt3-source" aria-labelledby="source-topic-name"><p class="vt3-kicker">${h(t('sourceStep'))} · ${h(sourceId)}</p>
      <h1 id="source-topic-name" data-page-title tabindex="-1">${h(activity.title)}</h1>
      <p class="vt3-meaning-label">${h(t('sourceMeaning'))}</p><p class="vt3-source-meaning">${h(activity.meaning)}</p>
      ${activity.example ? `<p class="vt3-source-example">${h(activity.example)}</p>` : ''}${original(source)}
      <div class="vt3-unfamiliar-action"><button class="text-button" type="button" data-action="source-unable">${h(t('skipUnfamiliar'))} →</button><small>${h(t('skipUnfamiliarHelp'))}</small></div>
    </section>
    <p class="vt3-scope">${h(t('interviewScope'))}</p>
    <section class="vt3-targets"><p class="vt3-kicker">${h(t('targetStep'))}</p><h2 class="vt3-question">${h(t('relationPrompt', { source: activity.title }))}</h2><p>${h(t('relationRule'))}</p>
      <nav class="vt3-group-jumps" aria-label="${h(t('targetStep'))}">${groups.map((group) => `<a href="#targets-${h(group)}">${h(t(groupKey[group] || 'groupOther'))}</a>`).join('')}</nav>
      <p class="vt3-review-rule" id="vt3-review-rule">${h(t('reviewRule'))}</p>${groupsHtml}
    </section>
    <section class="vt3-explanation" data-explanation-section ${selected.size ? '' : 'hidden'}>
      <p class="vt3-kicker">${h(t('explanationStep'))}</p><p>${h(t('explanationHelp'))}</p>
      <label>${h(t('explanationTarget'))}<select name="explanation-target" data-source-id="${h(sourceId)}"><option value="">${h(t('explanationPlaceholder'))}</option>${targets.filter((factor) => selected.has(factor.id)).map((factor) => `<option value="${h(factor.id)}" ${row.explanation?.targetId === factor.id ? 'selected' : ''}>${h(factor.id)} · ${h(managementActivity(factor, locale).title)}</option>`).join('')}</select></label>
      <div data-explanation-fields ${row.explanation ? '' : 'hidden'}><label>${h(t('mechanismLabel'))}<textarea name="relationship-explanation" data-source-id="${h(sourceId)}" maxlength="800" rows="3" placeholder="${h(t('mechanismPlaceholder'))}">${h(row.explanation?.note || '')}</textarea></label>
      <label>${h(t('reverseLabel', { source: activity.title, target: managementActivity(factors.find((factor) => factor.id === row.explanation?.targetId), locale).title || t('explanationTarget') }))}<select name="reverse-judgment" data-source-id="${h(sourceId)}">${[['not_asked', 'reverseNotAsked'], ['support', 'reverseSupport'], ['no_support', 'reverseNoSupport'], ['unable', 'reverseUnable']].map(([value, key]) => `<option value="${value}" ${(row.explanation?.reverse || 'not_asked') === value ? 'selected' : ''}>${h(t(key))}</option>`).join('')}</select></label></div>
    </section>
    <fieldset class="vt3-source-state"><legend>${h(t('stateStep'))}</legend>${[['selected', 'stateSelected'], ['none', 'stateNone'], ['unable', 'stateUnable']].map(([value, key]) => `<label><input type="radio" name="source-status" data-source-id="${h(sourceId)}" value="${value}" ${row.status === value ? 'checked' : ''} /><span>${h(t(key))}</span></label>`).join('')}<p>${h(t('stateUnableHelp'))}</p></fieldset>
    <details class="vt3-host-guide"><summary>${h(t('hostGuide'))}</summary><ul>${['hostStart', 'hostCross', 'hostMechanism', 'hostUncertain'].map((key) => `<li>${h(t(key))}</li>`).join('')}</ul></details>
    <p class="vt3-task-error" id="task-validation" ${error ? 'role="alert"' : 'role="status"'}>${h(error ? t(expertErrorKey(error)) : t(sourceJudgmentError(row, factors) ? 'taskPending' : 'taskReady'))}</p>
    <div class="vt3-task-actions"><button class="text-button" type="button" data-action="previous-topic" ${position === 1 ? 'disabled' : ''}>← ${h(t('previousTopic'))}</button><button class="primary-button" type="button" data-action="confirm-topic">${h(t(position === total ? 'reviewTitle' : 'confirmAndNext'))} →</button></div>
  </div>`;
}

export function renderExpertReview({ factors, assignment, rows, reviewedIds, coverage, locale, t, moduleFields, errorHtml = '', submitting = false, valid = false }) {
  const byId = new Map(rows.map((row) => [row.sourceId, row]));
  return `<div class="vt3-page vt3-review">
    <header class="vt3-page-heading"><p class="eyebrow">${h(t('versionLabel'))}</p><h1 data-page-title tabindex="-1">${h(t('reviewTitle'))}</h1><p>${h(t('reviewLead'))}</p></header>
    <section class="vt3-review-summary"><h2>${h(t('reviewCounts', { done: reviewedIds.length, total: assignment.sourceIds.length, links: coverage?.support || 0 }))}</h2>
      ${coverage ? `<p>${h(t('coverageSummary', coverage))}</p>` : ''}</section>
    <ol class="vt3-review-tasks">${assignment.sourceIds.map((id, index) => {
      const factor = factors.find((item) => item.id === id);
      const row = byId.get(id);
      const groups = Object.values(row?.groupReviews || {});
      return `<li><button type="button" data-action="review-topic" data-topic-index="${index}"><span>${String(index + 1).padStart(2, '0')} · ${h(id)}</span><b>${h(managementActivity(factor, locale).title)}</b><small>${h(row ? t({ selected: 'stateSelected', none: 'stateNone', unable: 'stateUnable', partial: 'taskPartial' }[row.status] || 'taskPending') : t('taskPending'))}</small><small>${h(row?.targetReviews ? t('pageSummary', guidedCounts(row)) : t('reviewedGroupsSummary', { reviewed: groups.filter((v) => v === 'reviewed').length, unable: groups.filter((v) => v === 'unable').length, unreviewed: groups.filter((v) => v === 'unreviewed').length }))}</small></button></li>`;
    }).join('')}</ol>
    <form id="final-submit-form" class="vt3-final-form" novalidate>${moduleFields}
      ${!valid ? `<p role="alert">${h(t('incompleteTasks'))}</p>` : ''}${errorHtml}
      <div class="form-actions"><button type="button" class="text-button" data-action="back-qualitative">← ${h(t('stepQualitative'))}</button><button class="primary-button" type="submit" ${submitting || !valid ? 'disabled' : ''}>${h(t(submitting ? 'submitting' : 'submitResponse'))} →</button></div>
    </form>
  </div>`;
}
