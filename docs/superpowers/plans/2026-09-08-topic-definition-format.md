# Topic Definition Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Format sub-subtopic definitions with a line break and bullet-style subtopic lines, and make the topic-notes dialog fill each column top-to-bottom before moving left-to-right.

**Architecture:** Keep the topic data as the source of truth in `survey-config.mjs`, changing only the derived description formatter. Preserve newline characters through the existing escaped text rendering with focused CSS, and use CSS Grid column auto-flow for the fixed 37-topic notes dialog while restoring row flow on mobile.

**Tech Stack:** Vanilla ES modules, Vite, Node.js built-in test runner, CSS Grid.

**Spec:** User request in the current conversation: ISM/MICMAC topic meanings with sub-subtopics must show the meaning first, then a new line with `子主题：· A;` and subsequent subtopics on new lines; the topic explanation dialog must be written column-by-column, top-to-bottom, then left-to-right; push and deploy without another confirmation.

## Global Constraints

- Preserve the existing 38-topic ESRS order, labels, and factor version.
- Keep all three supported locales (`zh-CN`, `zh-HK`, `en`) aligned.
- Do not change survey state, submission schema, or API behavior.
- Verify with the complete test suite and production build before pushing.
- Publish through the existing GitHub Pages/Render auto-deploy path after the validated commit is pushed.

### Task 1: Format topic definitions with readable subtopic lines

**Files:**
- Modify: `survey-config.mjs:713-721`
- Modify: `styles.css:689-694, 2525-2530, 2646-2664, 3154-3156`
- Modify: `app.mjs:9` and `index.html:13,58` (asset cache-busting only)
- Test: `tests/m1-esrs-subtopics.test.mjs`
- Test: `tests/m1-layout.test.mjs`

**Interfaces:**
- Consumes: `factor.description` and `factor.esrs.subSubtopics` from `studyConfig`.
- Produces: localized descriptions containing a preserved newline and one `· label;` line per subtopic.

- [x] **Step 1: Write the failing tests**

  Add assertions that a factor with sub-subtopics has the meaning, a newline, `子主题：·`/localized equivalent, and one semicolon-terminated bullet per line; a factor without sub-subtopics remains unchanged. Add a layout assertion that description selectors preserve newlines with `white-space: pre-line`.

- [x] **Step 2: Run the focused tests to verify they fail**

  Run: `npm test -- tests/m1-esrs-subtopics.test.mjs tests/m1-layout.test.mjs`
  Expected: the new exact-format and newline-preservation assertions fail against the current one-line formatter and normal whitespace.

- [x] **Step 3: Implement the minimal formatter and rendering CSS**

  Build the subtopic block as `${label}: · first;\\n· second;...`, prepend it to the meaning with `\\n`, use `子主题`/`子主題`/`Sub-topics`, and add `white-space: pre-line` to every visible description surface.

- [x] **Step 4: Run the focused tests to verify they pass**

  Run: `npm test -- tests/m1-esrs-subtopics.test.mjs tests/m1-layout.test.mjs`
  Expected: PASS.

### Task 2: Order the topic explanation dialog by columns

**Files:**
- Modify: `styles.css:3133-3140, 3164-3167, 3717-3719`
- Test: `tests/m1-layout.test.mjs`

**Interfaces:**
- Consumes: the existing 37-item `.topic-notes ul` dialog rendered by `app.mjs`.
- Produces: desktop/tablet notes ordered down each column before advancing left-to-right, with mobile returning to a single row-flow column.

- [x] **Step 1: Write the failing layout assertion**

  Assert the topic-notes grid declares a 13-row column flow for 37 candidates and explicitly resets to row flow when the mobile dialog becomes one column.

- [x] **Step 2: Run the focused layout test to verify it fails**

  Run: `npm test -- tests/m1-layout.test.mjs`
  Expected: the new column-flow assertions fail because the current grid uses default row flow.

- [x] **Step 3: Implement the minimal CSS ordering change**

  Add `grid-template-rows: repeat(13, minmax(0, auto))` and `grid-auto-flow: column` to the desktop notes list; reset `grid-template-rows` and `grid-auto-flow: row` in both mobile notes overrides.

- [x] **Step 4: Run all tests and the production build**

  Run: `npm test && npm run build`
  Expected: all tests pass and Vite exits successfully with the static site in `dist/`.

### Task 3: Push and publish the validated site

**Files:**
- Modify: none beyond the validated changes above.

**Interfaces:**
- Consumes: the validated `main` branch and existing GitHub Pages/Render deployment configuration.
- Produces: a pushed commit and the corresponding cloud deployment status/URL.

- [x] **Step 1: Review the final diff and status**

  Run: `git diff --check && git status --short` and confirm only the plan, formatter, tests, and layout changes are present.

- [x] **Step 2: Commit the validated source**

  Run: `git add docs/superpowers/plans/2026-09-08-topic-definition-format.md survey-config.mjs styles.css tests/m1-esrs-subtopics.test.mjs tests/m1-layout.test.mjs && git commit -m "Format topic definitions and notes dialog"`

- [ ] **Step 3: Push the commit to the configured remote**

  Run: `git push origin main`.

- [ ] **Step 4: Verify cloud publication**

  Confirm the push completes and the existing GitHub Pages/Render auto-deploy path reports the new `main` commit as the deployed revision; if the repository does not expose a live status check, verify the public survey URL serves the updated asset versions after the push.
