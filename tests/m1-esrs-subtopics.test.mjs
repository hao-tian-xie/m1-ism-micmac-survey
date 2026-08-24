import test from 'node:test';
import assert from 'node:assert/strict';

import { localisedFactors, studyConfig } from '../survey-config.mjs';

const expectedSubtopics = [
  'E1:climate-change-adaptation',
  'E1:climate-change-mitigation',
  'E1:energy',
  'E2:pollution-of-air',
  'E2:pollution-of-water',
  'E2:pollution-of-soil',
  'E2:pollution-of-living-organisms-and-food-resources',
  'E2:substances-of-concern',
  'E2:substances-of-very-high-concern',
  'E2:microplastics',
  'E3:water',
  'E3:marine-resources',
  'E4:direct-impact-drivers-of-biodiversity-loss',
  'E4:impacts-on-the-state-of-species',
  'E4:impacts-on-the-extent-and-condition-of-ecosystems',
  'E4:impacts-and-dependencies-on-ecosystem-services',
  'E5:resources-inflows-including-resource-use',
  'E5:resource-outflows-related-to-products-and-services',
  'E5:waste',
  'S1:working-conditions',
  'S1:equal-treatment-and-opportunities-for-all',
  'S1:other-work-related-rights',
  'S2:working-conditions',
  'S2:equal-treatment-and-opportunities-for-all',
  'S2:other-work-related-rights',
  'S3:communities-economic-social-and-cultural-rights',
  'S3:communities-civil-and-political-rights',
  'S3:rights-of-indigenous-peoples',
  'S4:information-related-impacts-for-consumers-and-end-users',
  'S4:personal-safety-of-consumers-and-end-users',
  'S4:social-inclusion-of-consumers-and-end-users',
  'G1:corporate-culture',
  'G1:protection-of-whistleblowers',
  'G1:animal-welfare',
  'G1:political-engagement',
  'G1:management-of-relationships-with-suppliers-including-payment-practices',
  'G1:corruption-and-bribery-prevention-and-detection',
  'G1:corruption-and-bribery-incidents',
];

test('study config uses the 38 ESRS Set 1 sustainability matters selected for the survey', () => {
  assert.equal(studyConfig.version, 'esrs-set1-subtopics-v1-38');
  assert.equal(studyConfig.factors.length, expectedSubtopics.length);
  assert.deepEqual(studyConfig.factors.map((factor) => factor.esrs.key), expectedSubtopics);
  assert.equal(new Set(studyConfig.factors.map((factor) => factor.id)).size, 38);

  for (const factor of studyConfig.factors) {
    for (const locale of ['zh-CN', 'zh-HK', 'en']) {
      assert.equal(typeof factor.name[locale], 'string');
      assert.ok(factor.name[locale].trim());
      assert.equal(typeof factor.description[locale], 'string');
      assert.ok(factor.description[locale].trim());
    }
    assert.match(factor.esrs.standard, /^(E[1-5]|S[1-4]|G1)$/);
    assert.ok(factor.esrs.topic.en.trim());
    assert.ok(factor.esrs.subtopic.en.trim());
  }

  for (const locale of ['zh-CN', 'zh-HK', 'en']) {
    for (const factor of localisedFactors(locale)) {
      assert.doesNotMatch(factor.label, /^ESRS\s+[ESG][1-5]?\s*·/);
    }
  }
});
