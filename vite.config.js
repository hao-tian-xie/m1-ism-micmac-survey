import { defineConfig } from 'vite';
import { m1AdminPlugin } from './server/m1-admin-http.mjs';
import { M1_DEFAULT_QUESTIONNAIRE_CONFIG } from './server/m1-default-question-config.mjs';
import { m1SubmissionsPlugin } from './server/m1-submission-store.mjs';
import { createFileQuestionConfigStore } from './server/question-config-store.mjs';

const questionStore = createFileQuestionConfigStore({ defaultConfig: M1_DEFAULT_QUESTIONNAIRE_CONFIG });

export default defineConfig({
  plugins: [m1AdminPlugin({ questionStore }), m1SubmissionsPlugin({ questionStore })],
});
