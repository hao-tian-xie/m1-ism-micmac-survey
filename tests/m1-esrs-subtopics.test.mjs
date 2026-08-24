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

const expectedEnglishNames = [
  'Climate change adaptation',
  'Climate change mitigation',
  'Energy',
  'Pollution of air',
  'Pollution of water',
  'Pollution of soil',
  'Pollution of living organisms and food resources',
  'Substances of concern',
  'Substances of very high concern',
  'Microplastics',
  'Water',
  'Marine resources',
  'Direct impact drivers of biodiversity loss',
  'Impacts on the state of species',
  'Impacts on the extent and condition of ecosystems',
  'Impacts and dependencies on ecosystem services',
  'Resource inflows, including resource use',
  'Resource outflows related to products and services',
  'Waste',
  'Working conditions (own workforce)',
  'Equal treatment and opportunities for all (own workforce)',
  'Other work-related rights (own workforce)',
  'Working conditions (value-chain workers)',
  'Equal treatment and opportunities for all (value-chain workers)',
  'Other work-related rights (value-chain workers)',
  'Communities’ economic, social and cultural rights',
  'Communities’ civil and political rights',
  'Rights of indigenous peoples',
  'Information-related impacts for consumers and/or end-users',
  'Personal safety of consumers and end-users',
  'Social inclusion of consumers and end-users',
  'Corporate culture',
  'Protection of whistleblowers',
  'Animal welfare',
  'Political engagement and lobbying activities',
  'Management of relationships with suppliers including payment practices',
  'Corruption and bribery: prevention and detection including training',
  'Corruption and bribery incidents',
];

test('study config uses the 38 ESRS Set 1 sustainability matters selected for the survey', () => {
  assert.equal(studyConfig.version, 'esrs-set1-subtopics-v2-38-verified');
  assert.equal(studyConfig.factors.length, expectedSubtopics.length);
  assert.deepEqual(studyConfig.factors.map((factor) => factor.esrs.key), expectedSubtopics);
  assert.deepEqual(
    studyConfig.factors.map((factor) => factor.name.en.replace(/^ESRS\s+[ESG][1-5]\s*·\s*/, '')),
    expectedEnglishNames,
  );
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

test('topic labels and definitions follow the verified ESRS terminology', () => {
  const byId = Object.fromEntries(studyConfig.factors.map((factor) => [factor.id, factor]));

  assert.equal(byId.F1.name['zh-CN'], 'ESRS E1 · 适应气候变化');
  assert.equal(byId.F2.name['zh-CN'], 'ESRS E1 · 减缓气候变化');
  assert.equal(byId.F11.name['zh-CN'], 'ESRS E3 · 水');
  assert.equal(byId.F13.esrs.topic['zh-CN'], '生物多样性与生态系统');
  assert.equal(byId.F13.name['zh-CN'], 'ESRS E4 · 生物多样性丧失的直接影响驱动因素');
  assert.equal(byId.F14.name['zh-CN'], 'ESRS E4 · 对物种状态的影响');
  assert.equal(byId.F16.name['zh-CN'], 'ESRS E4 · 对生态系统服务的影响和依赖性');
  assert.equal(byId.F17.name['zh-CN'], 'ESRS E5 · 资源流入（包括资源使用）');
  assert.equal(byId.F18.name['zh-CN'], 'ESRS E5 · 与产品和服务相关的资源流出');
  assert.equal(byId.F17.esrs.topic['zh-CN'], '资源利用与循环经济');
  assert.equal(byId.F20.esrs.topic['zh-CN'], '自有劳动力');
  assert.equal(byId.F20.name['zh-CN'], 'ESRS S1 · 自有劳动力的工作条件');
  assert.equal(byId.F23.esrs.topic['zh-CN'], '价值链中的工人');
  assert.equal(byId.F23.name['zh-CN'], 'ESRS S2 · 价值链中工人的工作条件');
  assert.equal(byId.F28.name['zh-CN'], 'ESRS S3 · 土著人民权利');
  assert.equal(byId.F29.name['zh-CN'], 'ESRS S4 · 消费者和最终用户的信息相关影响');
  assert.equal(byId.F35.name['zh-CN'], 'ESRS G1 · 政治参与和游说活动');
  assert.equal(byId.F36.name['zh-CN'], 'ESRS G1 · 供应商关系管理（包括付款做法）');
  assert.match(byId.F2.description['zh-CN'], /碳汇/);
  assert.match(byId.F22.description['zh-CN'], /水和卫生/);
  assert.match(byId.F13.description['zh-CN'], /气候变化/);
  assert.match(byId.F37.name.en, /training/i);
});
