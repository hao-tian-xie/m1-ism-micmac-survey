import test from 'node:test';
import assert from 'node:assert/strict';

import { createPairs } from '../survey-core.mjs';
import { localisedFactors, studyConfig } from '../survey-config.mjs';

const expectedTopics = [
  ['F1', 'environment', '气候适应', 'Climate adaptation'],
  ['F2', 'environment', '气候减缓', 'Climate mitigation'],
  ['F3', 'environment', '能源管理', 'Energy management'],
  ['F4', 'environment', '空气污染', 'Air pollution'],
  ['F5', 'environment', '水体污染', 'Water pollution'],
  ['F6', 'environment', '土壤污染', 'Soil pollution'],
  ['F8+F9', 'environment', '关注物质', 'Substances of concern'],
  ['F10', 'environment', '微塑料管控', 'Microplastic management'],
  ['F11', 'environment', '水资源管理', 'Water resource management'],
  ['F13', 'environment', '生物多样性压力', 'Biodiversity pressures'],
  ['F14', 'environment', '物种状况', 'Species status'],
  ['F15', 'environment', '生态系统状况', 'Ecosystem extent and condition'],
  ['F16', 'environment', '生态服务关系', 'Ecosystem service impacts and dependencies'],
  ['F17', 'environment', '资源投入', 'Resource inflows'],
  ['F18', 'environment', '产品服务循环', 'Product and service circularity'],
  ['F19', 'environment', '废弃物管理', 'Waste management'],
  ['F20', 'social', '本企工作条件', 'Own-workforce working conditions'],
  ['F21', 'social', '本企平等待遇', 'Own-workforce equal treatment'],
  ['F22', 'social', '本企其他劳权', 'Other own-workforce labour rights'],
  ['F23', 'social', '价值链工作条件', 'Value-chain working conditions'],
  ['F24', 'social', '价值链平等待遇', 'Value-chain equal treatment'],
  ['F25', 'social', '价值链其他劳权', 'Other value-chain labour rights'],
  ['F26', 'social', '社区生活权益', 'Community socioeconomic and cultural rights'],
  ['F27', 'social', '社区公民权益', 'Community civil and political rights'],
  ['F28', 'social', '原住民权利', 'Indigenous peoples’ rights'],
  ['F29', 'social', '用户信息权益', 'User information rights'],
  ['F30', 'social', '用户人身安全', 'User personal safety'],
  ['F31', 'social', '用户社会包容', 'User social inclusion'],
  ['F32', 'governance', '企业文化', 'Corporate culture'],
  ['F33', 'governance', '举报人保护', 'Whistleblower protection'],
  ['F35', 'governance', '政治参与', 'Political engagement'],
  ['F36', 'governance', '供应商关系', 'Supplier relations'],
  ['F37+F38', 'governance', '腐败贿赂防治', 'Anti-corruption and anti-bribery'],
];

test('study config exposes the 33 grouped ESG topics in the requested order', () => {
  assert.equal(studyConfig.version, 'esg-topic-set-v3-33');
  assert.equal(studyConfig.factors.length, expectedTopics.length);
  assert.deepEqual(
    studyConfig.factors.map((factor) => [factor.id, factor.category, factor.name['zh-CN'], factor.name.en]),
    expectedTopics,
  );
  assert.deepEqual(studyConfig.factors.map((factor) => factor.id), [
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F8+F9', 'F10', 'F11', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19',
    'F20', 'F21', 'F22', 'F23', 'F24', 'F25', 'F26', 'F27', 'F28', 'F29', 'F30', 'F31',
    'F32', 'F33', 'F35', 'F36', 'F37+F38',
  ]);
  assert.equal(new Set(studyConfig.factors.map((factor) => factor.id)).size, 33);
  assert.equal(createPairs(studyConfig.factors).length, 528);
});

test('grouped topics retain the original ESRS factor numbers', () => {
  const byId = Object.fromEntries(studyConfig.factors.map((factor) => [factor.id, factor]));
  assert.deepEqual(byId['F8+F9'].sourceIds, ['F8', 'F9']);
  assert.deepEqual(byId['F37+F38'].sourceIds, ['F37', 'F38']);
  assert.equal(byId['F8+F9'].esrs.sourceKeys.length, 2);
  assert.equal(byId['F37+F38'].esrs.sourceKeys.length, 2);
  assert.equal(byId['F8+F9'].esrs.standard, 'E2');
  assert.equal(byId['F37+F38'].esrs.standard, 'G1');
  assert.equal(byId.F1.sourceIds[0], 'F1');
  assert.equal(byId.F1.esrs.sourceKeys.length, 1);
  assert.equal(byId.F1.name['zh-HK'], '氣候適應');
});

test('all localised factor labels are visible names without ESRS prefixes', () => {
  for (const locale of ['zh-CN', 'zh-HK', 'en']) {
    const factors = localisedFactors(locale);
    assert.equal(factors.length, 33);
    for (const factor of factors) {
      assert.ok(factor.label.trim());
      assert.doesNotMatch(factor.label, /^ESRS\s+[ESG][1-5]?\s*·/);
      assert.ok(factor.description.trim());
    }
  }
});
