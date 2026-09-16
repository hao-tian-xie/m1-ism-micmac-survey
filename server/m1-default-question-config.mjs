import { copy } from '../translations.mjs';
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

export const M1_DEFAULT_QUESTIONNAIRE_CONFIG = validateQuestionnaireConfig({
  schemaVersion: 1,
  questionnaireId: 'M1-ESG-ISM-MICMAC',
  modules,
});
