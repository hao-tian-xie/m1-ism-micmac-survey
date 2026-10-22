// Participant-facing adaptation of ESGr2_M1_ESRS_ISM_CEO_Interview_Slides_Guide.md.
// The example is a reading aid. Its state never enters questionnaire answers.
export const orientationCopy = {
  'zh-CN': {
    eyebrow: '访谈介绍', readingTime: '背景与示例 · 约 90–120 秒',
    title: '理解物流运营中 ESG 管理活动的联系',
    subtitle: '先从您的实际经验开始，再了解研究背景与关系判断方式。',
    browse: '按顺序浏览，也可以点击各部分回看。', sectionsLabel: '研究介绍的三个部分',
    sections: [
      { title: '先聊经验', subtitle: '从熟悉的工作开始' },
      { title: '认识 ESRS', subtitle: '议题如何进入日常运营' },
      { title: '理解联系', subtitle: '用一个物流示例看方向' },
    ],
    openingLabel: '在看议题与示例之前，先想一想',
    opening: '过去一两年，物流客户对哪些 ESG 相关工作提出过要求，或者哪些管理工作让您感到特别困难？',
    openingHelp: '可以先回想或与访谈员聊一聊，再查看后两部分。这里不用输入答案。',
    context: '请以中小物流企业的一般管理情境为主，也欢迎结合您的实际工作经验举例。',
    purposeLabel: '这次希望了解什么',
    purpose: '哪些实际管理工作能够支持其他工作，哪些活动没有明显联系，以及背后的原因。没有预设答案。',
    esrsTitle: 'ESG 议题如何进入物流企业的日常运营',
    esrsLead: '我们以《欧洲可持续发展报告标准》（ESRS）作为识别可持续发展议题的共同起点。',
    categories: [
      { code: 'E', name: '环境', items: ['排放与能源', '资源使用'] },
      { code: 'S', name: '人员／社会', items: ['员工健康与安全', '供应链工人'] },
      { code: 'G', name: '商业行为／治理', items: ['供应商关系', '商业道德'] },
    ],
    principle: '议题提供共同语言；在实际运营中，回应这些议题可能需要相互支持的人员、数据、流程和合作伙伴。',
    esrsNote: 'ESRS 在这里用作议题参考，具体联系需要根据实际经验判断。',
    demoTitle: '做好哪项工作，会让其他工作更容易？',
    demoLead: '以下为物流场景的可能联系，仅用于说明讨论方式，尚不是研究结论。',
    demo: {
      activities: ['承运商运输记录', '运输排放核算', '回应客户数据要求'],
      pairLabel: '选择一组示例活动', pairTemplate: '{from} 与 {to}',
      question: '改善 {from}，是否有助于 {to}？反过来也成立吗？',
      practice: '方向演示 · 不计入问卷答案',
      choiceLabel: '选择一种方向，查看它的含义',
      forward: '仅 {from} 帮助 {to}', reverse: '仅 {to} 帮助 {from}', both: '两个方向都支持',
      none: '没有促进关系', unknown: '暂时无法判断',
      idle: '尚未选择演示方向。请根据经验判断；“没有促进关系”也是有用的意见。',
      feedback: {
        forward: '演示：{from} → {to}。需要说明改善 {from} 如何帮助 {to}；反向联系应单独确认。',
        reverse: '演示：{to} → {from}。需要说明改善 {to} 如何帮助 {from}；反向联系应单独确认。',
        both: '演示：{from} ↔ {to}。两个方向都需要分别确认，并用实际例子说明理由。',
        none: '演示：没有实际促进关系。两项活动都重要，或先后发生，本身不代表存在促进关系。',
        unknown: '演示：经验或信息不足，暂时无法判断。这不能记作“没有促进关系”。',
      },
      rulesLabel: '访谈时如何确认一条联系？',
      rules: [
        '先判断 A 是否帮助 B，再单独考虑 B 是否也能帮助 A。',
        '如果存在帮助，请说明它通过数据、人员技能、管理控制、协作或其他方式如何发生。',
        '两项活动都重要，或先后发生，不等于存在有方向的促进关系。',
        '不熟悉时可向访谈员说明暂时无法判断；尚未讨论的配对也不能当成没有关系。',
      ],
      researcher: '您提供关系判断和简短例子；研究团队随后使用 ISM 整理获得支持的联系与层级。您无需做计算或排列层级。',
    },
    footer: '正式作答时，请以每题的主题和说明为准。',
    previous: '上一部分', next: '下一部分', position: '第 {i} 部分，共 {total} 部分',
    continue: '了解了，进入问卷', return: '返回问卷', reopen: '研究介绍',
  },
  'zh-HK': {
    eyebrow: '訪談介紹', readingTime: '背景與示例 · 約 90–120 秒',
    title: '理解物流營運中 ESG 管理活動的聯繫',
    subtitle: '先從您的實際經驗開始，再了解研究背景與關係判斷方式。',
    browse: '按順序瀏覽，也可以點擊各部分回看。', sectionsLabel: '研究介紹的三個部分',
    sections: [
      { title: '先談經驗', subtitle: '從熟悉的工作開始' },
      { title: '認識 ESRS', subtitle: '議題如何進入日常營運' },
      { title: '理解聯繫', subtitle: '用一個物流示例看方向' },
    ],
    openingLabel: '在看議題與示例之前，先想一想',
    opening: '過去一兩年，物流客戶對哪些 ESG 相關工作提出過要求，或者哪些管理工作讓您感到特別困難？',
    openingHelp: '可以先回想或與訪談員談一談，再查看後兩部分。這裡不用輸入答案。',
    context: '請以中小物流企業的一般管理情境為主，也歡迎結合您的實際工作經驗舉例。',
    purposeLabel: '這次希望了解甚麼',
    purpose: '哪些實際管理工作能夠支持其他工作，哪些活動沒有明顯聯繫，以及背後的原因。沒有預設答案。',
    esrsTitle: 'ESG 議題如何進入物流企業的日常營運',
    esrsLead: '我們以《歐洲可持續發展報告準則》（ESRS）作為識別可持續發展議題的共同起點。',
    categories: [
      { code: 'E', name: '環境', items: ['排放與能源', '資源使用'] },
      { code: 'S', name: '人員／社會', items: ['員工健康與安全', '供應鏈工人'] },
      { code: 'G', name: '商業行為／治理', items: ['供應商關係', '商業道德'] },
    ],
    principle: '議題提供共同語言；在實際營運中，回應這些議題可能需要互相支持的人員、數據、流程和合作夥伴。',
    esrsNote: 'ESRS 在這裡用作議題參考，具體聯繫需要根據實際經驗判斷。',
    demoTitle: '做好哪項工作，會讓其他工作更容易？',
    demoLead: '以下為物流情境的可能聯繫，僅用於說明討論方式，尚不是研究結論。',
    demo: {
      activities: ['承運商運輸記錄', '運輸排放核算', '回應客戶數據要求'],
      pairLabel: '選擇一組示例活動', pairTemplate: '{from} 與 {to}',
      question: '改善 {from}，是否有助於 {to}？反過來也成立嗎？',
      practice: '方向演示 · 不計入問卷答案',
      choiceLabel: '選擇一種方向，查看它的含義',
      forward: '僅 {from} 幫助 {to}', reverse: '僅 {to} 幫助 {from}', both: '兩個方向都支持',
      none: '沒有促進關係', unknown: '暫時無法判斷',
      idle: '尚未選擇演示方向。請根據經驗判斷；「沒有促進關係」也是有用的意見。',
      feedback: {
        forward: '演示：{from} → {to}。需要說明改善 {from} 如何幫助 {to}；反向聯繫應單獨確認。',
        reverse: '演示：{to} → {from}。需要說明改善 {to} 如何幫助 {from}；反向聯繫應單獨確認。',
        both: '演示：{from} ↔ {to}。兩個方向都需要分別確認，並用實際例子說明理由。',
        none: '演示：沒有實際促進關係。兩項活動都重要，或先後發生，本身不代表存在促進關係。',
        unknown: '演示：經驗或資訊不足，暫時無法判斷。這不能記作「沒有促進關係」。',
      },
      rulesLabel: '訪談時如何確認一條聯繫？',
      rules: [
        '先判斷 A 是否幫助 B，再單獨考慮 B 是否也能幫助 A。',
        '如果存在幫助，請說明它透過數據、人員技能、管理控制、協作或其他方式如何發生。',
        '兩項活動都重要，或先後發生，不等於存在有方向的促進關係。',
        '不熟悉時可向訪談員說明暫時無法判斷；尚未討論的配對也不能當成沒有關係。',
      ],
      researcher: '您提供關係判斷和簡短例子；研究團隊隨後使用 ISM 整理獲得支持的聯繫與層級。您無需做計算或排列層級。',
    },
    footer: '正式作答時，請以每題的主題和說明為準。',
    previous: '上一部分', next: '下一部分', position: '第 {i} 部分，共 {total} 部分',
    continue: '了解了，進入問卷', return: '返回問卷', reopen: '研究介紹',
  },
  en: {
    eyebrow: 'Interview introduction', readingTime: 'Background & example · about 90–120 seconds',
    title: 'Understanding ESG Activities in Day-to-Day Logistics',
    subtitle: 'Start with your experience, then explore the study background and how to judge connections.',
    browse: 'Read in order, or select a section to revisit it.', sectionsLabel: 'Three parts of the study introduction',
    sections: [
      { title: 'Your experience', subtitle: 'Start with familiar work' },
      { title: 'Meet ESRS', subtitle: 'Topics in everyday operations' },
      { title: 'Explore links', subtitle: 'Try a logistics example' },
    ],
    openingLabel: 'Before seeing topics or examples, consider',
    opening: 'Over the past year or two, what ESG-related work have logistics customers asked for, or which management activities have you found particularly difficult?',
    openingHelp: 'Take a moment to reflect or discuss this with the interviewer before moving on. No answer needs to be entered here.',
    context: 'Please consider the general management context of small and medium logistics companies. Examples from your own work are welcome.',
    purposeLabel: 'What we hope to understand',
    purpose: 'Which practical management activities support others, where there is little or no connection, and why. There are no predefined answers.',
    esrsTitle: 'ESG topics meet day-to-day logistics operations',
    esrsLead: 'We use the European Sustainability Reporting Standards (ESRS) as a common starting point for sustainability topics.',
    categories: [
      { code: 'E', name: 'Environment', items: ['Emissions & energy', 'Resource use'] },
      { code: 'S', name: 'People', items: ['Employee health & safety', 'Workers across the supply chain'] },
      { code: 'G', name: 'Business conduct', items: ['Supplier relationships', 'Ethical business practices'] },
    ],
    principle: 'The topics provide a shared language. In practice, addressing them may involve connected activities, people, data and partners.',
    esrsNote: 'ESRS provides a reference for topics here. Actual connections need to be judged from experience.',
    demoTitle: 'Which activities make other activities easier?',
    demoLead: 'A simple logistics example — links shown below are possibilities to discuss, not research findings.',
    demo: {
      activities: ['Carrier shipment records', 'Transport emissions calculation', "Responding to customers' data requests"],
      pairLabel: 'Choose a pair of example activities', pairTemplate: '{from} and {to}',
      question: 'Would improving {from} help {to}? Could the reverse also be true?',
      practice: 'Direction demo · not part of your survey answers',
      choiceLabel: 'Select a direction to see what it means',
      forward: 'Only {from} helps {to}', reverse: 'Only {to} helps {from}', both: 'Support in both directions',
      none: 'No supporting link', unknown: 'Unable to judge yet',
      idle: 'No demo direction selected. Use your experience; “no link” is a useful answer too.',
      feedback: {
        forward: 'Demo: {from} → {to}. Explain how improving {from} could help {to}; confirm the reverse direction separately.',
        reverse: 'Demo: {to} → {from}. Explain how improving {to} could help {from}; confirm the reverse direction separately.',
        both: 'Demo: {from} ↔ {to}. Confirm each direction separately and give a practical example explaining why.',
        none: 'Demo: no practical support. Both activities being important, or one happening before the other, does not by itself establish a supporting link.',
        unknown: 'Demo: experience or information is insufficient to judge. This must not be recorded as “no link”.',
      },
      rulesLabel: 'How do we confirm a connection in the interview?',
      rules: [
        'First consider whether A helps B, then judge separately whether B could also help A.',
        'If there is support, explain how it works through information, staff skills, management controls, coordination, or something else.',
        'Both activities being important, or happening in sequence, does not establish a directional supporting link.',
        'Tell the interviewer if a link is outside your experience. A pair that has not been discussed must not be treated as having no link.',
      ],
      researcher: 'You provide judgments and brief examples. The research team then uses ISM to organize supported connections and levels; you do not need to calculate or rank the levels.',
    },
    footer: 'When answering the survey, use the topic and explanation shown in each question.',
    previous: 'Previous section', next: 'Next section', position: 'Section {i} of {total}',
    continue: 'Continue to the survey', return: 'Return to the survey', reopen: 'Study introduction',
  },
};

export const ORIENTATION_DEMO_VALUES = Object.freeze(['forward', 'reverse', 'both', 'none', 'unknown']);
const DEMO_IDS = ['A', 'B', 'C'];

export function orientationContent(locale) {
  return orientationCopy[locale] || orientationCopy.en;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function fill(template, values) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}

function demoPair(index) {
  return Number(index) === 1 ? 1 : 0;
}

function demoValue(values, pairIndex) {
  return ORIENTATION_DEMO_VALUES.includes(values?.[pairIndex]) ? values[pairIndex] : '';
}

export function orientationDemoFeedback({ locale, pairIndex = 0, values = [] }) {
  const demo = orientationContent(locale).demo;
  const pair = demoPair(pairIndex);
  const value = demoValue(values, pair);
  return value ? fill(demo.feedback[value], { from: DEMO_IDS[pair], to: DEMO_IDS[pair + 1] }) : demo.idle;
}

function demoConnector(value, active) {
  const noLink = value === 'none';
  const hasForward = ['forward', 'both', ''].includes(value);
  const hasReverse = ['reverse', 'both'].includes(value);
  return `<div class="orientation-demo-link ${active ? 'is-active' : ''}" data-demo-status="${value || 'unselected'}" aria-hidden="true">
    ${!noLink ? `<svg viewBox="0 0 80 48" fill="none" focusable="false">
      <path d="M8 30 H72" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" />
      ${hasForward ? '<path d="M65 25 L72 30 L65 35" stroke="currentColor" stroke-width="1.5" />' : ''}
      ${hasReverse ? '<path d="M15 25 L8 30 L15 35" stroke="currentColor" stroke-width="1.5" />' : ''}
    </svg>` : ''}
    <span>${noLink ? '×' : '?'}</span>
  </div>`;
}

export function renderOrientationDemo({ locale, pairIndex = 0, values = [] }) {
  const demo = orientationContent(locale).demo;
  const pair = demoPair(pairIndex);
  const selected = demoValue(values, pair);
  const ids = { from: DEMO_IDS[pair], to: DEMO_IDS[pair + 1] };
  const symbols = { forward: `${ids.from} → ${ids.to}`, reverse: `${ids.to} → ${ids.from}`, both: `${ids.from} ↔ ${ids.to}` };
  return `
    <div class="orientation-demo-graph" aria-label="${escapeHtml(demo.practice)}">
      ${demo.activities.map((activity, index) => `
        <article class="orientation-activity ${index === pair || index === pair + 1 ? 'is-active' : ''}">
          <span>${DEMO_IDS[index]}</span><h3>${escapeHtml(activity)}</h3>
        </article>
        ${index < 2 ? demoConnector(demoValue(values, index), index === pair) : ''}
      `).join('')}
    </div>
    <div class="orientation-demo-pairs" role="group" aria-label="${escapeHtml(demo.pairLabel)}">
      <span>${escapeHtml(demo.pairLabel)}</span>
      ${[0, 1].map((index) => `<button type="button" data-action="orientation-demo-pair" data-pair="${index}" aria-pressed="${index === pair}">${escapeHtml(fill(demo.pairTemplate, { from: DEMO_IDS[index], to: DEMO_IDS[index + 1] }))}</button>`).join('')}
    </div>
    <p class="orientation-demo-question">${escapeHtml(fill(demo.question, ids))}</p>
    <div class="orientation-demo-options" role="group" aria-label="${escapeHtml(demo.choiceLabel)}">
      ${ORIENTATION_DEMO_VALUES.map((value) => `<button type="button" data-action="orientation-demo-choice" data-value="${value}" aria-pressed="${selected === value}">
        ${symbols[value] ? `<b>${symbols[value]}</b><small>${escapeHtml(fill(demo[value], ids))}</small>` : `<b>${escapeHtml(demo[value])}</b>`}
      </button>`).join('')}
    </div>
  `;
}

function renderExperience(content) {
  return `
    <section class="orientation-question orientation-opening" aria-labelledby="orientation-opening-question">
      <p class="eyebrow">${escapeHtml(content.openingLabel)}</p>
      <h2 id="orientation-opening-question">${escapeHtml(content.opening)}</h2>
      <p>${escapeHtml(content.openingHelp)}</p>
    </section>
    <p class="orientation-context">${escapeHtml(content.context)}</p>
    <div class="orientation-purpose"><h3>${escapeHtml(content.purposeLabel)}</h3><p>${escapeHtml(content.purpose)}</p></div>
  `;
}

function renderEsrs(content) {
  return `
    <h2 class="orientation-panel-title">${escapeHtml(content.esrsTitle)}</h2>
    <p class="orientation-panel-lead">${escapeHtml(content.esrsLead)}</p>
    <div class="orientation-esg-cards">
      ${content.categories.map((category) => `<article>
        <span>${category.code}</span><h3>${escapeHtml(category.name)}</h3>
        <ul>${category.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </article>`).join('')}
    </div>
    <p class="orientation-principle">${escapeHtml(content.principle)}</p>
    <p class="orientation-note">${escapeHtml(content.esrsNote)}</p>
  `;
}

function renderLinks(content, { locale, demoPairIndex, demoValues }) {
  return `
    <h2 class="orientation-panel-title">${escapeHtml(content.demoTitle)}</h2>
    <p class="orientation-panel-lead">${escapeHtml(content.demoLead)}</p>
    <section class="orientation-demo" aria-label="${escapeHtml(content.demo.practice)}">
      <p class="eyebrow">${escapeHtml(content.demo.practice)}</p>
      <div data-orientation-demo-view>${renderOrientationDemo({ locale, pairIndex: demoPairIndex, values: demoValues })}</div>
      <p class="orientation-demo-feedback" data-orientation-demo-feedback role="status" aria-live="polite" aria-atomic="true">${escapeHtml(orientationDemoFeedback({ locale, pairIndex: demoPairIndex, values: demoValues }))}</p>
    </section>
    <details class="orientation-prompt">
      <summary>${escapeHtml(content.demo.rulesLabel)}<span aria-hidden="true">+</span></summary>
      <div><ol>${content.demo.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ol></div>
    </details>
    <p class="orientation-researcher">${escapeHtml(content.demo.researcher)}</p>
  `;
}

export function renderInterviewOrientation({ locale, index = 0, returning = false, demoPairIndex = 0, demoValues = [] }) {
  const content = orientationContent(locale);
  const activeIndex = Math.min(Math.max(Number.isInteger(index) ? index : 0, 0), content.sections.length - 1);
  const position = fill(content.position, { i: activeIndex + 1, total: content.sections.length });
  const panels = [renderExperience(content), renderEsrs(content), renderLinks(content, { locale, demoPairIndex, demoValues })];
  return `
    <main class="welcome-page orientation-page">
      <header class="orientation-heading welcome-copy">
        <div class="orientation-meta"><p class="eyebrow">${escapeHtml(content.eyebrow)}</p><span>${escapeHtml(content.readingTime)}</span></div>
        <h1 data-page-title tabindex="-1">${escapeHtml(content.title)}</h1>
        <p class="orientation-lead">${escapeHtml(content.subtitle)}</p>
      </header>
      <section class="orientation-explorer" aria-label="${escapeHtml(content.sectionsLabel)}">
        <p class="orientation-browse">${escapeHtml(content.browse)}</p>
        <div class="orientation-tabs" role="tablist" aria-label="${escapeHtml(content.sectionsLabel)}">
          ${content.sections.map((section, sectionIndex) => `
            <button class="orientation-tab" id="orientation-tab-${sectionIndex}" type="button" role="tab"
              aria-selected="${sectionIndex === activeIndex}" aria-controls="orientation-panel-${sectionIndex}"
              tabindex="${sectionIndex === activeIndex ? 0 : -1}" data-action="orientation-section" data-section="${sectionIndex}">
              <span class="orientation-number" aria-hidden="true">0${sectionIndex + 1}</span>
              <span><b>${escapeHtml(section.title)}</b><small>${escapeHtml(section.subtitle)}</small></span>
            </button>
          `).join('')}
        </div>
        ${panels.map((panel, sectionIndex) => `
          <section class="orientation-panel" id="orientation-panel-${sectionIndex}" role="tabpanel"
            aria-labelledby="orientation-tab-${sectionIndex}" tabindex="0" ${sectionIndex !== activeIndex ? 'hidden' : ''}>${panel}</section>
        `).join('')}
        <div class="orientation-pagination">
          <span role="status" aria-live="polite" aria-atomic="true" data-orientation-position>${escapeHtml(position)}</span>
          <div>
            <button class="text-button" type="button" data-action="orientation-previous" ${activeIndex === 0 ? 'disabled' : ''}><span aria-hidden="true">←</span> ${escapeHtml(content.previous)}</button>
            <button class="text-button" type="button" data-action="orientation-next" ${activeIndex === content.sections.length - 1 ? 'disabled' : ''}>${escapeHtml(content.next)} <span aria-hidden="true">→</span></button>
          </div>
        </div>
      </section>
      <footer class="orientation-footer">
        <p>${escapeHtml(content.footer)}</p>
        <button class="primary-button" type="button" data-action="orientation-continue">${escapeHtml(returning ? content.return : content.continue)}<span aria-hidden="true">→</span></button>
      </footer>
    </main>
  `;
}
