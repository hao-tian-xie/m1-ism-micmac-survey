import { toPublicQuestionnaireConfig } from './question-config-model.mjs';

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasExactlyKeys(value, keys) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function answerValueIsValid(module, value) {
  const optionIds = module.options.map((option) => option.id);
  const allowedOptions = new Set(optionIds);
  if (module.type === 'subjective_text') {
    if (typeof value !== 'string' || value.length > module.constraints.maxLength) return false;
    const length = value.trim().length;
    if (module.required && length === 0) return false;
    return length === 0 || length >= module.constraints.minLength;
  }
  if (module.type === 'single_choice') {
    if (typeof value !== 'string') return false;
    if (!value) return !module.required;
    return allowedOptions.has(value);
  }
  if (module.type === 'multiple_choice') {
    if (!Array.isArray(value) || new Set(value).size !== value.length) return false;
    if (!value.every((id) => typeof id === 'string' && allowedOptions.has(id))) return false;
    const ordered = optionIds.filter((id) => value.includes(id));
    if (ordered.some((id, index) => id !== value[index])) return false;
    const minimum = Math.max(module.required ? 1 : 0, module.constraints.minSelections);
    return value.length >= minimum && value.length <= module.constraints.maxSelections;
  }
  return module.type === 'judgement_boolean' && typeof value === 'boolean';
}

export function versionedModuleAnswersMode(submission) {
  const hasRevision = Object.prototype.hasOwnProperty.call(submission, 'questionnaireConfigRevision');
  const hasAnswers = Object.prototype.hasOwnProperty.call(submission, 'moduleAnswers');
  if (!hasRevision && !hasAnswers) return 'legacy';
  return hasRevision && hasAnswers ? 'versioned' : 'invalid';
}

export async function validateVersionedModuleAnswers(submission, questionStore) {
  const mode = versionedModuleAnswersMode(submission);
  if (mode === 'legacy') return true;
  if (mode === 'invalid'
    || !Number.isSafeInteger(submission.questionnaireConfigRevision)
    || submission.questionnaireConfigRevision < 0
    || !Array.isArray(submission.moduleAnswers)
    || !questionStore || typeof questionStore.readRevision !== 'function') return false;

  let snapshot;
  try {
    snapshot = await questionStore.readRevision(submission.questionnaireConfigRevision);
  } catch {
    return false;
  }
  if (!snapshot || snapshot.revision !== submission.questionnaireConfigRevision) return false;
  const modules = toPublicQuestionnaireConfig(snapshot).modules;
  if (submission.moduleAnswers.length !== modules.length) return false;
  return modules.every((module, index) => {
    const answer = submission.moduleAnswers[index];
    return hasExactlyKeys(answer, ['moduleId', 'moduleVersion', 'type', 'value'])
      && answer.moduleId === module.id
      && answer.moduleVersion === module.version
      && answer.type === module.type
      && answerValueIsValid(module, answer.value);
  });
}
