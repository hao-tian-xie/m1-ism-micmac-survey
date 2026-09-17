import { copy } from '../translations.mjs';
import { studyConfig } from '../survey-config.mjs';
import { validateQuestionnaireConfig } from './question-config-model.mjs';

const modules = Array.from({ length: 7 }, (_, index) => {
  const number = index + 1;
  const id = `q${number}`;
  return {
    id,
    type: 'subjective_text',
    stage: number === 7 ? 'after_topics' : 'before_topics',
    required: false,
    enabled: true,
    translations: Object.fromEntries(Object.keys(copy).map((locale) => [locale, {
      prompt: copy[locale][`qualitativeQ${number}`],
      helpText: '',
      placeholder: '',
    }])),
    options: [],
    constraints: { minLength: 0, maxLength: 3_000, multiline: true },
  };
});

// Revision 0 is the compatibility snapshot for the released survey. Keep the
// source ESRS ids and metadata intact so a historical answer can always be
// reconstructed even after the admin edits the active topic catalogue.
export const M1_DEFAULT_TOPICS = studyConfig.factors.map((factor) => ({
  id: factor.id,
  version: 1,
  name: { ...factor.name },
  description: { ...factor.description },
  category: factor.category,
  sourceIds: [...(factor.sourceIds || [factor.id])],
  esrs: structuredClone(factor.esrs),
  enabled: true,
  archived: false,
}));

export const M1_DEFAULT_QUESTIONNAIRE_CONFIG = validateQuestionnaireConfig({
  schemaVersion: 1,
  questionnaireId: 'M1-ESG-ISM-MICMAC',
  modules,
  topics: M1_DEFAULT_TOPICS,
});
