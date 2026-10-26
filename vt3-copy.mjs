import { guidedCopy } from './guided-copy.mjs?v=vt3-type-20261026';
export const vt3Copy = {
  'zh-CN': {
    heroTitle: "哪些 ESG 管理工作能直接帮助其他工作？",

    beginTopics: '继续：交流业务经验',
    stepSurvey: '关系判断',
    stepQualitative: '业务经验',
    stepResult: '检查与补充',
    qualitativeTitle: '先谈谈您的业务经验',
    qualitativeIntro: '研究者可在访谈时记录。请根据实际经验作答；不适用、没有可靠记录或暂时无法判断时，可填写 NA。',
    qualitativeQ1: '过去两三年，哪些外部 ESG 要求或经营环境变化改变了您所在企业的日常决策？请举几个明显的例子。',
    qualitativeQ2: '面对这些变化，企业如何判断哪些 ESG 议题纳入核心战略或日常管理，哪些暂时搁置？',
    qualitativeQ3: '围绕已确定的议题，企业实施了哪些策略、制度或业务实践？请结合实际推进情况说明。',
    qualitativeQ4: '请分享一次 ESG 取舍经历：为什么优先推进、调整节奏、暂缓或放弃某项举措？哪些经营考量和 ESG 因素对决定起了关键作用？',
    qualitativeQ5: '要让一项 ESG 举措长期平稳运行，企业内部和供应链上下游各需提供哪些支持？执行中哪些环节容易出现断层或卡点，例如责任划分、信息流转或资源交接？',
    qualitativeQ6: '企业依据什么评估这些举措的成效，并决定继续推进、调整方向或停止？',
    qualitativeQ7: '刚才的题库是否遗漏了其他议题？这些议题涉及什么背景或业务情境？',
    optionalContext: '其他业务经验（选填，可在访谈中补充）',
    contextContinue: '开始关系判断',
    assignmentLabel: '题组编号（由研究者分配）',
    assignmentPlaceholder: '请选择研究者分配的题组',
    assignmentOption: '题组 {n} · {count}项来源任务',
    assignmentHelp: "请使用研究者分配的题组。本组包含跨领域任务；不熟悉的工作可记录为无法判断。不同专家会分别评价部分相同的来源工作。",
    assignmentPreview: "查看本次来源任务",
    assignmentLocked: "本组已开始作答。更换题组需先清除这份未提交的草稿。",
    resetDraft: '清除本次草稿并重新分组',
    resetDraftConfirm: '再次点击，清除本次未提交草稿',
    profileError: '请填写受访者编号、角色及研究者分配的题组。',
    sourceStep: "01 · 先看这项工作",

    sourceMeaning: "这项工作包含什么",
    originalTopic: 'ESRS 来源议题与原始解释',
    interviewScope: "请按行业经验，考虑一家具有相关业务的中小物流企业。相关经验也可来自您了解的其他企业。",


    groupEnvironment: 'E · 环境', groupSocial: 'S · 社会', groupGovernance: 'G · 治理', groupOther: '其他议题',
    groupCount: '{total}项 · 已选{selected}项',
    reviewGroup: '该分组的检查状态',
    reviewPlaceholder: '请选择检查状态',
    reviewReviewed: '已检查；未勾选项记为无明确促进关系',
    reviewUnable: '已勾选能确认的目标；其余目标不熟悉，无法判断',
    reviewUnreviewed: '尚未检查完；其余未勾选目标保留为未判断',
    reviewRule: '已勾选的目标记录为有促进关系。只有确认已检查全部目标后，该组未勾选项才记为无明确促进关系；其余无法判断或尚未检查的目标仍保留为未判断。',
    selectGroupReview: '请确认该组其余目标是已检查、无法判断，还是尚未检查完。',
    stateStep: '04 · 确认本题回答状态',


    stateUnable: '我不熟悉来源工作，整题无法判断',
    stateUnableHelp: '选择“整题无法判断”会清除本题所选目标，并将三个分组记录为无法判断。',

    explanationHelp: '可选一条重要、不清楚或跨领域的关系，说明帮助如何产生。其余关系直接记录，不必逐条解释。',
    explanationTarget: '要说明的目标工作',
    explanationPlaceholder: '选择一项已勾选的目标',
    mechanismLabel: "来源工作怎样帮助目标工作？可举一个业务例子。",
    mechanismPlaceholder: "说明资料、人员、程序或协作怎样产生帮助，最多800字。请隐去企业、客户和个人识别信息。",

    reverseNotAsked: '尚未追问',   reverseUnable: '无法判断',
    taskProgress: '来源任务 {i} / {total}',
    taskDirectory: '本次来源任务',
    taskDirectoryHelp: "点击任务可返回修改。每项任务都提供其他全部目标工作。",
    taskPending: '请选择回答状态，并为各分组选择检查状态。',
    taskReady: '本题可确认；未判断项会按检查状态保留。',
    errorSource: '请先选择本题回答状态。',
    errorGroup: '请为每个分组选择检查状态。',
    errorSelectedGroup: '所选目标所在的分组须确认已检查。也可取消选择，并将该分组保留为未判断。',
    errorTarget: '请至少勾选一项目标；没有明确促进关系时，请选择相应回答状态。',
    errorNone: '请至少确认一个分组已检查，且清除所选目标；整题不熟悉时请选择无法判断。',
    errorReverse: "这个反向回答与另一项来源任务中的判断冲突。请核对两个回答；还没确认反方向时，选择“尚未追问”。",
    errorExplanation: "请选择本题已选的目标，并将说明控制在800字以内。",
    hostGuide: '访谈者提示',
    hostStart: '如果这项管理工作得到改善，还有哪些工作会更容易完成？',
    hostCross: '除了刚才这一类，其他两个领域有没有可能受到帮助？',
    hostMechanism: '这项帮助具体怎样产生？能举一个运营中的例子吗？',
    hostUncertain: '可以选择无法判断，我们先讨论您熟悉的部分。',
    reviewTitle: "检查记录，补充遗漏",
    reviewLead: "下方列出本次来源任务。可打开任一任务核对或修改，再补充遗漏的议题。点击提交后，关系判断、检查状态、业务经验和关系说明会一起保存。",

    coverageSummary: "已判断{judged}个方向 · 无法判断{unable}个 · 尚未检查{unreviewed}个 · 未分配且未追问{unassigned}个",
    incompleteTasks: "部分任务尚未确认或有回答需要核对。请返回对应任务处理，再提交。",
    reviewedGroupsSummary: '{reviewed}组已全部检查 · {unable}组其余项目无法判断 · {unreviewed}组未检查完',
    completeSavedText: "关系判断、检查状态和补充内容已保存。下方是本次答卷编号。",
    versionLabel: '问卷版本 vt3',



    resumeNotice: 'vt3 草稿单独保存；v3 草稿不会转换为新版回答。',
    discardSelections: '切换后已清除本题的目标选择和关系说明。',
    studyScope: '中小物流企业的 ESG 管理活动及其促进关系',
    firstSourceLabel: '先从哪项熟悉的工作开始？（选填）',
    firstSourceDefault: '按分配顺序开始',
    firstSourceHelp: "这只调整本组的作答顺序，所有已分配的来源任务都会保留。",
    skipUnfamiliar: "这项工作不熟悉，整题无法判断",
    skipUnfamiliarHelp: "选择后会确认并继续，同时清除本题的目标选择和关系说明。",
    reviewReviewedChoice: '已检查全部目标', reviewUnableChoice: '其余目标无法判断', reviewUnreviewedChoice: '尚未检查完',
  },
  'zh-HK': {
    heroTitle: "哪些 ESG 管理工作能直接幫助其他工作？",

    beginTopics: '繼續：交流業務經驗', stepSurvey: '關係判斷', stepQualitative: '業務經驗', stepResult: '檢查與補充',
    qualitativeTitle: '先談談您的業務經驗',
    qualitativeIntro: '研究者可在訪談時記錄。請根據實際經驗作答；不適用、沒有可靠記錄或暫時無法判斷時，可填寫 NA。',
    qualitativeQ1: '過去兩三年，哪些外部 ESG 要求或經營環境變化改變了您所在企業的日常決策？請舉幾個明顯的例子。',
    qualitativeQ2: '面對這些變化，企業如何判斷哪些 ESG 議題納入核心策略或日常管理，哪些暫時擱置？',
    qualitativeQ3: '圍繞已確定的議題，企業實施了哪些策略、制度或業務實踐？請結合實際推進情況說明。',
    qualitativeQ4: '請分享一次 ESG 取捨經歷：為甚麼優先推進、調整節奏、暫緩或放棄某項舉措？哪些經營考量和 ESG 因素對決定起了關鍵作用？',
    qualitativeQ5: '要讓一項 ESG 舉措長期平穩運行，企業內部和供應鏈上下游各需提供哪些支援？執行中哪些環節容易出現斷層或卡點，例如責任劃分、資訊流轉或資源交接？',
    qualitativeQ6: '企業依據甚麼評估這些舉措的成效，並決定繼續推進、調整方向或停止？',
    qualitativeQ7: '剛才的題庫是否遺漏了其他議題？這些議題涉及甚麼背景或業務情境？',
    optionalContext: '其他業務經驗（選填，可在訪談中補充）', contextContinue: '開始關係判斷',
    assignmentLabel: '題組編號（由研究者分配）', assignmentPlaceholder: '請選擇研究者分配的題組', assignmentOption: '題組 {n} · {count}項來源任務',
    assignmentHelp: "請使用研究者分配的題組。本組包含跨領域任務；不熟悉的工作可記錄為無法判斷。不同專家會分別評價部分相同的來源工作。",
    assignmentPreview: "查看本次來源任務", assignmentLocked: "本組已開始作答。更換題組需先清除這份未提交的草稿。",
    resetDraft: '清除本次草稿並重新分組', resetDraftConfirm: '再次點擊，清除本次未提交草稿', profileError: '請填寫受訪者編號、角色及研究者分配的題組。',
    sourceStep: "01 · 先看這項工作",  sourceMeaning: "這項工作包括甚麼", originalTopic: 'ESRS 來源議題與原始解釋',
    interviewScope: "請按行業經驗，考慮一家具相關業務的中小物流企業。相關經驗也可來自您了解的其他企業。",


    groupEnvironment: 'E · 環境', groupSocial: 'S · 社會', groupGovernance: 'G · 治理', groupOther: '其他議題', groupCount: '{total}項 · 已選{selected}項',
    reviewGroup: '該分組的檢查狀態', reviewPlaceholder: '請選擇檢查狀態', reviewReviewed: '已檢查；未勾選項記為無明確促進關係', reviewUnable: '已勾選能確認的目標；其餘目標不熟悉，無法判斷', reviewUnreviewed: '尚未檢查完；其餘未勾選目標保留為未判斷',
    reviewRule: '已勾選的目標記錄為有促進關係。只有確認已檢查全部目標後，該組未勾選項才記為無明確促進關係；其餘無法判斷或尚未檢查的目標仍保留為未判斷。',
    selectGroupReview: '請確認該組其餘目標是已檢查、無法判斷，還是尚未檢查完。',
    stateStep: '04 · 確認本題回答狀態',   stateUnable: '我不熟悉來源工作，整題無法判斷',
    stateUnableHelp: '選擇「整題無法判斷」會清除本題所選目標，並將三個分組記錄為無法判斷。',
     explanationHelp: '可選一條重要、不清楚或跨領域的關係，說明幫助如何產生。其餘關係直接記錄，不必逐條解釋。',
    explanationTarget: '要說明的目標工作', explanationPlaceholder: '選擇一項已勾選的目標', mechanismLabel: "來源工作怎樣幫助目標工作？可舉一個業務例子。",
    mechanismPlaceholder: "說明資料、人員、程序或協作怎樣產生幫助，最多800字。請隱去企業、客戶和個人識別資訊。",
     reverseNotAsked: '尚未追問',   reverseUnable: '無法判斷',
    taskProgress: '來源任務 {i} / {total}', taskDirectory: '本次來源任務', taskDirectoryHelp: "點擊任務可返回修改。每項任務都提供其他全部目標工作。",
    taskPending: '請選擇回答狀態，並為各分組選擇檢查狀態。', taskReady: '本題可確認；未判斷項會按檢查狀態保留。',
    errorSource: '請先選擇本題回答狀態。', errorGroup: '請為每個分組選擇檢查狀態。', errorSelectedGroup: '所選目標所在的分組須確認已檢查。也可取消選擇，並將該分組保留為未判斷。',
    errorTarget: '請至少勾選一項目標；沒有明確促進關係時，請選擇相應回答狀態。', errorNone: '請至少確認一個分組已檢查，且清除所選目標；整題不熟悉時請選擇無法判斷。',
    errorReverse: "這個反向回答與另一項來源任務中的判斷衝突。請核對兩個回答；還沒確認反方向時，選擇「尚未追問」。", errorExplanation: "請選擇本題已選的目標，並將說明控制在800字以內。",
    hostGuide: '訪談者提示', hostStart: '如果這項管理工作得到改善，還有哪些工作會更容易完成？', hostCross: '除了剛才這一類，其他兩個領域有沒有可能受到幫助？', hostMechanism: '這項幫助具體怎樣產生？能舉一個營運中的例子嗎？', hostUncertain: '可以選擇無法判斷，我們先討論您熟悉的部分。',
    reviewTitle: "檢查記錄，補充遺漏", reviewLead: "下方列出本次來源任務。可開啟任何任務核對或修改，再補充遺漏的議題。點擊提交後，關係判斷、檢查狀態、業務經驗和關係說明會一起儲存。",
     coverageSummary: "已判斷{judged}個方向 · 無法判斷{unable}個 · 尚未檢查{unreviewed}個 · 未分配且未追問{unassigned}個",
    incompleteTasks: "部分任務尚未確認或有回答需要核對。請返回對應任務處理，再提交。",
    reviewedGroupsSummary: '{reviewed}組已全部檢查 · {unable}組其餘項目無法判斷 · {unreviewed}組未檢查完', completeSavedText: "關係判斷、檢查狀態和補充內容已儲存。下方是本次答卷編號。", versionLabel: '問卷版本 vt3',


     resumeNotice: 'vt3 草稿獨立保存；v3 草稿不會轉換為新版回答。', discardSelections: '切換後已清除本題的目標選擇和關係說明。',
    studyScope: '中小物流企業的 ESG 管理活動及其促進關係', firstSourceLabel: '先從哪項熟悉的工作開始？（選填）', firstSourceDefault: '按分配順序開始', firstSourceHelp: "這只調整本組的作答順序，所有已分配的來源任務都會保留。", skipUnfamiliar: "這項工作不熟悉，整題無法判斷", skipUnfamiliarHelp: "選擇後會確認並繼續，同時清除本題的目標選擇和關係說明。", reviewReviewedChoice: '已檢查全部目標', reviewUnableChoice: '其餘目標無法判斷', reviewUnreviewedChoice: '尚未檢查完',
  },
  en: {
    heroTitle: "Which ESG activities directly support other work?",

    beginTopics: 'Continue to business experience', stepSurvey: 'Relationship judgments', stepQualitative: 'Business experience', stepResult: 'Review and add context',
    qualitativeTitle: 'Start with your business experience', qualitativeIntro: 'The researcher may record answers during the interview. Answer from practical experience. Enter NA if a question is not applicable, has no reliable record, or cannot be judged yet.',
    qualitativeQ1: 'In the past two or three years, which external ESG requirements or changes in the operating environment changed everyday decisions in your organisation? Give a few clear examples.',
    qualitativeQ2: 'How does the business decide which ESG topics to include in its core strategy or daily management, and which to set aside for now?',
    qualitativeQ3: 'For the topics it has selected, which strategies, policies or business practices has the business implemented? Describe their actual progress.',
    qualitativeQ4: 'Describe an ESG trade-off: why did the business prioritise an initiative, change its pace, postpone it or abandon it? Which business considerations and ESG factors shaped the decision?',
    qualitativeQ5: 'What support must the business and its upstream and downstream partners each provide for an ESG initiative to run steadily over time? Where do responsibilities, information, resources or other handovers break down in practice?',
    qualitativeQ6: 'How does the business assess the results of these initiatives and decide whether to continue, change direction or stop?',
    qualitativeQ7: 'Are any topics missing from the catalogue? What background or business situations do they involve?',
    optionalContext: 'Other business experience (optional; may be added during the interview)', contextContinue: 'Start relationship judgments',
    assignmentLabel: 'Task group assigned by the researcher', assignmentPlaceholder: 'Select your assigned task group', assignmentOption: 'Group {n} · {count} source tasks',
    assignmentHelp: "Use the group assigned by the researcher. Each group includes work across domains; record unfamiliar activities as unable to judge. Some source tasks overlap across experts.",
    assignmentPreview: "View your assigned source tasks", assignmentLocked: "You have started this group. Clear this unsubmitted draft before changing groups.", resetDraft: 'Clear this draft and choose another group', resetDraftConfirm: 'Click again to clear this unsubmitted draft', profileError: 'Enter a respondent code, role and researcher-assigned task group.',
    sourceStep: "01 · Understand this activity",  sourceMeaning: "What this activity involves", originalTopic: 'ESRS source topic and original explanation',
    interviewScope: "Draw on your industry experience to consider a small or medium-sized logistics business with the relevant operations. You may use experience of other businesses you know.",


    groupEnvironment: 'E · Environment', groupSocial: 'S · Social', groupGovernance: 'G · Governance', groupOther: 'Other topics', groupCount: '{total} activities · {selected} selected',
    reviewGroup: 'Review status for this group', reviewPlaceholder: 'Choose a review status', reviewReviewed: 'Reviewed; unchecked targets mean no clear support', reviewUnable: 'Confirmed targets are selected; remaining targets are unfamiliar and cannot be judged', reviewUnreviewed: 'Review incomplete; leave remaining unchecked targets unjudged',
    reviewRule: 'Selected targets record support. Unchecked targets mean no clear support only after you confirm that all targets in the group were reviewed. Remaining targets that you cannot judge or have not reviewed stay unjudged.', selectGroupReview: 'Confirm whether the remaining targets were reviewed, cannot be judged, or still need review.',
    stateStep: '04 · Confirm this answer’s status',   stateUnable: 'I am unfamiliar with the source; unable to judge this task', stateUnableHelp: 'Choosing “unable to judge this task” clears its selected targets and records all three groups as unable to judge.',
     explanationHelp: 'Choose an important, unclear or cross-domain relationship and explain how the support occurs. Other relationships can be recorded without a separate explanation.',
    explanationTarget: 'Target activity to explain', explanationPlaceholder: 'Choose a selected target', mechanismLabel: "How does the source help the target? You may give an operating example.", mechanismPlaceholder: "Describe how information, people, procedures or coordination provide support. Up to 800 characters. Omit identifying company, customer and personal details.",
     reverseNotAsked: 'Not asked',   reverseUnable: 'Unable to judge',
    taskProgress: 'Source task {i} / {total}', taskDirectory: 'Your source tasks', taskDirectoryHelp: "Open a task to edit it. Each task includes all other activities as possible targets.", taskPending: 'Choose an answer status and a review status for each group.', taskReady: 'Ready to confirm. Unjudged targets will retain their review status.',
    errorSource: 'Choose an answer status first.', errorGroup: 'Choose a review status for every group.', errorSelectedGroup: 'Confirm that groups containing selected targets were reviewed. You can also deselect targets and leave that group unjudged.', errorTarget: 'Select at least one target, or choose the no-clear-support answer.', errorNone: 'Confirm at least one reviewed group and clear selected targets. If the whole task is unfamiliar, choose unable to judge.', errorReverse: "This reverse judgment conflicts with another source-task answer. Check both answers. If the reverse is still unconfirmed, choose “Not asked”.", errorExplanation: "Choose a selected target from this task and keep the explanation within 800 characters.",
    hostGuide: 'Interviewer prompts', hostStart: 'If this management activity improves, what other work becomes easier?', hostCross: 'Could activities in the other two domains also benefit?', hostMechanism: 'How does that support occur? Can you give an operating example?', hostUncertain: 'You can choose unable to judge. Let us discuss the areas you know.',
    reviewTitle: "Review your answers and add missing topics", reviewLead: "Your source tasks are listed below. Open any task to check or edit it, then add missing topics. Submitting saves your judgments, review states, business experience and explanations together.",  coverageSummary: "{judged} directions judged · {unable} unable to judge · {unreviewed} not reviewed · {unassigned} unassigned and not asked", incompleteTasks: "Some tasks are unconfirmed or have answers that need checking. Open those tasks before submitting.", reviewedGroupsSummary: 'Groups: {reviewed} fully reviewed, {unable} with remaining targets unknown, {unreviewed} with review incomplete',
    completeSavedText: "Your judgments, review states and additional answers are saved. Your response ID is shown below.", versionLabel: 'Questionnaire version vt3',
       resumeNotice: 'vt3 drafts are stored separately. v3 drafts are not converted into new answers.', discardSelections: 'The change cleared this task’s target selections and explanation.',
    studyScope: 'ESG management activities and their supporting relationships in small and medium-sized logistics businesses', firstSourceLabel: 'Start with a familiar activity (optional)', firstSourceDefault: 'Use the assigned order', firstSourceHelp: "This changes the order of your tasks. All assigned source activities remain.", skipUnfamiliar: "Source unfamiliar: unable to judge this task", skipUnfamiliarHelp: "This confirms the task and continues, clearing its target selections and link explanation.", reviewReviewedChoice: 'All targets reviewed', reviewUnableChoice: 'Remaining targets: unable to judge', reviewUnreviewedChoice: 'Review incomplete',
  },
};

export function expertErrorKey(code) {
  return ({
    'source-status': 'errorSource', 'group-review': 'errorGroup',
    'selected-group': 'errorSelectedGroup', targets: 'errorTarget',
    'select-target': 'errorTarget', 'none-scope': 'errorNone',
    'unable-scope': 'errorSource', explanation: 'errorExplanation',
    'reverse-conflict': 'errorReverse', recall: 'recallError', 'target-reviews': 'targetReviewError', pathway: 'pathwayError',
  })[code] || 'taskPending';
}

const guideWording = {
  'zh-CN': {
    guideBatchTitle: '确认分配题组', guideStartTitle: '继续交流业务经验',
    guideIfTitle: "先理解当前工作",
    guideThenTitle: "逐项判断目标工作",
    guideNotesTitle: '结合实际工作理解', guideNotesText: '管理含义与示例用于解释来源议题。',
    guideHoverTitle: "按需展开卡片说明",
    guideNextTitle: "说明关键关系，再确认本题",
    guideQualitativeTitle: '记录业务经验', guideQualitativeText: "先回答开场问题。其他选填问题可展开作答，也可由研究者在访谈中记录；提交前可以返回补充。",
    guideFinalQuestionTitle: '检查与补充遗漏',
    guideFinalSubmitText: "核对后点击“提交全部答案”。若未收到提交确认，可从这份草稿重试。",
  },
  'zh-HK': {
    guideBatchTitle: '確認分配題組', guideStartTitle: '繼續交流業務經驗',
    guideIfTitle: "先理解當前工作",
    guideThenTitle: "逐項判斷目標工作",
    guideNotesTitle: '結合實際工作理解', guideNotesText: '管理含義與示例用於解釋來源議題。',
    guideHoverTitle: "按需展開卡片說明",
    guideNextTitle: "說明關鍵關係，再確認本題",
    guideQualitativeTitle: '記錄業務經驗', guideQualitativeText: "先回答開場問題。其他選填問題可展開作答，也可由研究者在訪談中記錄；提交前可以返回補充。",
    guideFinalQuestionTitle: '檢查與補充遺漏',
    guideFinalSubmitText: "核對後點擊「提交全部答案」。若未收到提交確認，可從這份草稿重試。",
  },
  en: {
    guideBatchTitle: 'Confirm your assigned group', guideStartTitle: 'Continue to business experience',
    guideIfTitle: "Understand the current activity",
    guideThenTitle: "Judge each target activity",
    guideNotesTitle: 'Relate the topic to practical work', guideNotesText: 'The management meaning and example explain the source topic.',
    guideHoverTitle: "Expand a card for details",
    guideNextTitle: "Explain a key link and confirm the task",
    guideQualitativeTitle: 'Record business experience', guideQualitativeText: "Start with the opening question. Expand the other optional questions to answer them, or have the researcher record them during the interview. You can return before submitting.",
    guideFinalQuestionTitle: 'Review and add missing topics',
    guideFinalSubmitText: "After checking, select “Submit all answers”. If no confirmation arrives, retry from this draft.",
  },
};
for (const locale of Object.keys(guideWording)) Object.assign(vt3Copy[locale], guideWording[locale]);
for (const locale of Object.keys(guidedCopy)) Object.assign(vt3Copy[locale], guidedCopy[locale]);

const interviewWording = {
  "brand": ["物流业研究", "物流業研究", "Logistics study"],
  "categoryEnvironment": ["环境议题", "環境議題", "Environment topics"],
  "categorySocial": ["社会议题", "社會議題", "Social topics"],
  "categoryGovernance": ["治理议题", "治理議題", "Governance topics"],
  "categoryOther": ["其他议题", "其他議題", "Other topics"],
  "welcomeTaskFlowTitle": [
    "每项来源任务分三步",
    "每項來源任務分三步",
    "Three steps for each source activity"
  ],
  "welcomeRecallTitle": [
    "先回想",
    "先回想",
    "Recall"
  ],
  "welcomeRecallText": [
    "记录您先想到的工作或业务例子。",
    "記錄您先想到的工作或業務例子。",
    "Record the activities or examples that first come to mind."
  ],
  "welcomeReviewTitle": [
    "再逐项判断",
    "再逐項判斷",
    "Review"
  ],
  "welcomeReviewText": [
    "分组查看全部目标，记录帮助与检查状态。",
    "分組查看全部目標，記錄幫助與檢查狀態。",
    "Review all targets in small groups and record each response."
  ],
  "welcomeConfirmTitle": [
    "最后确认",
    "最後確認",
    "Confirm"
  ],
  "welcomeConfirmText": [
    "可说明一条关键关系的路径与反方向，再确认本题。",
    "可說明一條關鍵關係的路徑與反方向，再確認本題。",
    "Optionally explain one key link and its reverse direction, then confirm the task."
  ],
  "logisticsExampleLabel": [
    "物流中的例子",
    "物流中的例子",
    "Logistics example"
  ],
  "topicBoundaryLabel": [
    "判断范围与相邻议题",
    "判斷範圍與相鄰議題",
    "Scope and related topics"
  ],
  "esrsDefinitionLabel": [
    "ESRS 议题与原始解释",
    "ESRS 議題與原始解釋",
    "ESRS topic and original explanation"
  ],
  "choiceHelpTitle": [
    "四种回答分别记录什么？",
    "四種回答分別記錄甚麼？",
    "What does each response record?"
  ],
  "choiceSupportMeaning": [
    "已判断来源工作会直接帮助这项目标。",
    "已判斷來源工作會直接幫助這項目標。",
    "You judge that the source directly helps this target."
  ],
  "choiceNoSupportMeaning": [
    "已查看这项目标，未发现明确的直接帮助。",
    "已查看這項目標，未發現明確的直接幫助。",
    "You reviewed this target and found no clear direct support."
  ],
  "choiceUnableMeaning": [
    "经验或信息不足，当前无法判断。",
    "經驗或資訊不足，當前無法判斷。",
    "You lack the experience or information to judge it now."
  ],
  "choiceUnreviewedMeaning": [
    "这项目标尚未检查，保留为未判断。",
    "這項目標尚未檢查，保留為未判斷。",
    "You have not reviewed this target; it remains unjudged."
  ],
  "directHelpTitle": [
    "这里的“直接帮助”指什么？",
    "這裡的「直接幫助」指甚麼？",
    "What counts as direct support?"
  ],
  "bulkTitle": [
    "统一记录本页剩余项",
    "統一記錄本頁剩餘項",
    "Record the remaining items on this page"
  ],
  "bulkHelp": [
    "仅更新本页标为“稍后检查”的项目，保留已有的其他判断。",
    "僅更新本頁標為「稍後檢查」的項目，保留已有的其他判斷。",
    "Updates only items marked “Review later” on this page. Other judgments stay as recorded."
  ],
  "keyLinkTitle": [
    "选一条关系，说明帮助怎样产生",
    "選一條關係，說明幫助怎樣產生",
    "Choose a link and explain how it works"
  ],
  "profileTitle": [
    "确认专家信息与题组",
    "確認專家資料與題組",
    "Confirm your details and task group"
  ],
  "factorList": [
    "查看全部议题及说明",
    "查看全部議題及說明",
    "Browse all topics and definitions"
  ],
  "qualitativePrivacy": [
    "请隐去企业名称、个人姓名、客户识别信息和未公开的商业机密。\n未提交的答案草稿保存在当前浏览器。",
    "請隱去企業名稱、個人姓名、客戶識別資訊和未公開的商業機密。\n未提交的答案草稿儲存在目前瀏覽器。",
    "Omit company names, personal names, customer identifiers and confidential business information.\nUnsubmitted answers are saved as a draft in this browser."
  ],
  "guideOrientationText": [
    "先回想实际经验，再了解 ESRS，最后操作物流示例，查看不同方向的含义。这里的演示与正式答案分开。也可用方向键切换介绍部分。",
    "先回想實際經驗，再了解 ESRS，最後操作物流示例，查看不同方向的含義。這裡的演示與正式答案分開。也可用方向鍵切換介紹部分。",
    "Start with your experience, learn about ESRS, then try the logistics example to explore direction. The demo is separate from your survey answers. Use the arrow keys to change sections."
  ],
  "guideOrientationContinueText": [
    "点击这里进入问卷。填写时，可点击“研究介绍”回看背景与示例。",
    "點擊這裡進入問卷。填寫時，可點擊「研究介紹」回看背景與示例。",
    "Continue to the questionnaire. During the interview, use “Study introduction” to revisit the background and example."
  ],
  "guideRoleText": [
    "选择最符合您主要工作的领域。",
    "選擇最符合您主要工作的領域。",
    "Choose the area that best matches your main work."
  ],
  "guideFinish": [
    "关闭指南，继续填写",
    "關閉指南，繼續填寫",
    "Close guide and continue"
  ],
  "submitError": [
    "暂未收到提交确认。请从当前草稿重试。",
    "暫未收到提交確認。請從目前草稿重試。",
    "No submission confirmation received. Retry from this draft."
  ],
  "retrySubmit": [
    "从当前草稿重试",
    "從目前草稿重試",
    "Retry from this draft"
  ],
  "completeSavedTitle": [
    "问卷已提交",
    "問卷已提交",
    "Questionnaire submitted"
  ],
  "confirmNewResponse": [
    "确认开始另一份答卷",
    "確認開始另一份答卷",
    "Confirm a new response"
  ],
  "qualitativeBack": [
    "返回关系判断",
    "返回關係判斷",
    "Back to relationship judgments"
  ],
  "backToSurvey": [
    "返回关系判断",
    "返回關係判斷",
    "Back to relationship judgments"
  ],
  "keyLinkEmpty": [
    "本题尚未选出有直接帮助的目标。可返回修改判断，或直接确认本题。",
    "本題尚未選出有直接幫助的目標。可返回修改判斷，或直接確認本題。",
    "No target is currently selected for direct support. Return to edit your judgments, or confirm this task."
  ],
  "keyLinkEmptyTitle": [
    "确认本题的判断记录",
    "確認本題的判斷記錄",
    "Confirm this task’s judgments"
  ],
  "topicPosition": [
    "来源任务 {i} / {total}",
    "來源任務 {i} / {total}",
    "Source task {i} / {total}"
  ],
  "documentTitle": [
    "物流业 ESG 管理活动关系问卷",
    "物流業 ESG 管理活動關係問卷",
    "ESG activity relationships in logistics"
  ],
  "homeLabel": [
    "返回 ESG 问卷首页",
    "返回 ESG 問卷首頁",
    "Return to the ESG questionnaire home"
  ]
};
for (const [index, locale] of ['zh-CN', 'zh-HK', 'en'].entries()) {
  for (const [key, values] of Object.entries(interviewWording)) vt3Copy[locale][key] = values[index];
}
