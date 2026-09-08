import test from 'node:test';
import assert from 'node:assert/strict';

import { createPairs } from '../survey-core.mjs';
import { localisedFactors, studyConfig } from '../survey-config.mjs';

const expectedTopics = [
  ['F1', 'environment', '适应气候变化', 'Climate change adaptation'],
  ['F2', 'environment', '减缓气候变化', 'Climate change mitigation'],
  ['F3', 'environment', '能源', 'Energy'],
  ['F4', 'environment', '空气污染', 'Pollution of air'],
  ['F5', 'environment', '水污染', 'Pollution of water'],
  ['F6', 'environment', '土壤污染', 'Pollution of soil'],
  ['F7', 'environment', '生物和食物资源污染', 'Pollution of living organisms and food resources'],
  ['F8', 'environment', '关注物质', 'Substances of concern'],
  ['F9', 'environment', '高度关注物质', 'Substances of very high concern'],
  ['F10', 'environment', '微塑料', 'Microplastics'],
  ['F11', 'environment', '水', 'Water'],
  ['F12', 'environment', '海洋资源', 'Marine resources'],
  ['F13', 'environment', '生物多样性丧失的直接影响驱动因素', 'Direct impact drivers of biodiversity loss'],
  ['F14', 'environment', '对物种状态的影响', 'Impacts on the state of species'],
  ['F15', 'environment', '对生态系统范围和状况的影响', 'Impacts on the extent and condition of ecosystems'],
  ['F16', 'environment', '对生态系统服务的影响和依赖性', 'Impacts and dependencies on ecosystem services'],
  ['F17', 'environment', '资源流入（包括资源使用）', 'Resource inflows, including resource use'],
  ['F18', 'environment', '与产品和服务相关的资源流出', 'Resource outflows related to products and services'],
  ['F19', 'environment', '废弃物', 'Waste'],
  ['F20', 'social', '自有劳动力的工作条件', 'Working conditions (own workforce)'],
  ['F21', 'social', '自有劳动力的公平待遇与机会', 'Equal treatment and opportunities for all (own workforce)'],
  ['F22', 'social', '自有劳动力的其他工作相关权利', 'Other work-related rights (own workforce)'],
  ['F23', 'social', '价值链中工人的工作条件', 'Working conditions (value-chain workers)'],
  ['F24', 'social', '价值链中工人的公平待遇与机会', 'Equal treatment and opportunities for all (value-chain workers)'],
  ['F25', 'social', '价值链中工人的其他工作相关权利', 'Other work-related rights (value-chain workers)'],
  ['F26', 'social', '社区的经济、社会和文化权利', 'Communities’ economic, social and cultural rights'],
  ['F27', 'social', '社区的公民和政治权利', 'Communities’ civil and political rights'],
  ['F28', 'social', '土著人民权利', 'Rights of indigenous peoples'],
  ['F29', 'social', '消费者和最终用户的信息相关影响', 'Information-related impacts for consumers and/or end-users'],
  ['F30', 'social', '消费者和最终用户的人身安全', 'Personal safety of consumers and end-users'],
  ['F31', 'social', '消费者和最终用户的社会包容', 'Social inclusion of consumers and end-users'],
  ['F32', 'governance', '企业文化', 'Corporate culture'],
  ['F33', 'governance', '举报人保护', 'Protection of whistleblowers'],
  ['F34', 'governance', '动物福利', 'Animal welfare'],
  ['F35', 'governance', '政治参与和游说活动', 'Political engagement and lobbying activities'],
  ['F36', 'governance', '供应商关系管理（包括付款做法）', 'Management of relationships with suppliers including payment practices'],
  ['F37', 'governance', '腐败和贿赂：预防、发现（包括培训）', 'Corruption and bribery: prevention and detection including training'],
  ['F38', 'governance', '腐败和贿赂事件', 'Corruption and bribery incidents'],
];

test('study config exposes the 38 ESRS Set 1 subtopics in AR 16 order', () => {
  assert.equal(studyConfig.version, 'esrs-set1-subtopics-v2-38-verified');
  assert.equal(studyConfig.factors.length, expectedTopics.length);
  assert.deepEqual(
    studyConfig.factors.map((factor) => [factor.id, factor.category, factor.name['zh-CN'].replace(/^ESRS\s+[ESG][1-5]\s*·\s*/, ''), factor.name.en.replace(/^ESRS\s+[ESG][1-5]\s*·\s*/, '')]),
    expectedTopics,
  );
  assert.deepEqual(studyConfig.factors.map((factor) => factor.id), Array.from({ length: 38 }, (_, index) => `F${index + 1}`));
  assert.equal(new Set(studyConfig.factors.map((factor) => factor.id)).size, 38);
  assert.equal(createPairs(studyConfig.factors).length, 703);
});

test('subtopic metadata preserves the ESRS topic hierarchy and sub-subtopic meanings', () => {
  const byId = Object.fromEntries(studyConfig.factors.map((factor) => [factor.id, factor]));
  assert.equal(byId.F7.esrs.key, 'E2:pollution-of-living-organisms-and-food-resources');
  assert.equal(byId.F12.esrs.key, 'E3:marine-resources');
  assert.equal(byId.F34.esrs.key, 'G1:animal-welfare');
  assert.deepEqual(byId.F37.esrs.subSubtopic, {
    'zh-CN': '预防、发现（包括培训）',
    'zh-HK': '預防、發現（包括培訓）',
    en: 'Prevention and detection including training',
  });
  assert.deepEqual(byId.F38.esrs.subSubtopic, {
    'zh-CN': '事件',
    'zh-HK': '事件',
    en: 'Incidents',
  });
  assert.match(byId.F37.name.en, /Corruption and bribery: prevention and detection including training/);
  assert.match(byId.F38.name.en, /Corruption and bribery incidents/);
  assert.match(byId.F37.description.en, /corruption and bribery/i);
  assert.match(byId.F38.description.en, /corruption and bribery incidents/i);
});

test('candidate definitions append PDF sub-subtopics only where the ESRS table lists them', () => {
  const byId = Object.fromEntries(studyConfig.factors.map((factor) => [factor.id, factor]));
  assert.match(byId.F11.description.en, /Water consumption/);
  assert.match(byId.F11.description.en, /Water withdrawals/);
  assert.match(byId.F20.description.en, /Secure employment/);
  assert.match(byId.F20.description.en, /Health and safety/);
  assert.match(byId.F26.description.en, /Adequate housing/);
  assert.match(byId.F26.description.en, /Security-related impacts/);
  assert.match(byId.F29.description.en, /Access to \(quality\) information/);
  assert.doesNotMatch(byId.F1.description.en, /Sub-sub-topics:/);
});

test('all localised factor labels use the 38 ESRS names without prefixes', () => {
  for (const locale of ['zh-CN', 'zh-HK', 'en']) {
    const factors = localisedFactors(locale);
    assert.equal(factors.length, 38);
    assert.deepEqual(factors.map((factor) => factor.id), Array.from({ length: 38 }, (_, index) => `F${index + 1}`));
    for (const factor of factors) {
      assert.ok(factor.label.trim());
      assert.doesNotMatch(factor.label, /^ESRS\s+[ESG][1-5]?\s*·/);
      assert.ok(factor.description.trim());
      assert.ok(factor.category);
    }
  }
});
