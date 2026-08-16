import { defineConfig } from 'vite';
import { m1SubmissionsPlugin } from './server/m1-submission-store.mjs';

export default defineConfig({
  plugins: [m1SubmissionsPlugin()],
});
