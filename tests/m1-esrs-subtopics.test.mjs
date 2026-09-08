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
  ['F7', 'environment', '重点关注物质', 'Substances of concern'],
  ['F8', 'environment', '微塑料管控', 'Microplastic management'],
  ['F9', 'environment', '水资源管理', 'Water resource management'],
  ['F10', 'environment', '生物多样性压力', 'Biodiversity pressures'],
  ['F11', 'environment', '物种状况', 'Species status'],
  ['F12', 'environment', '生态系统状况', 'Ecosystem extent and condition'],
  ['F13', 'environment', '生态服务关系', 'Ecosystem service impacts and dependencies'],
  ['F14', 'environment', '资源投入', 'Resource inflows'],
  ['F15', 'environment', '产品服务循环', 'Product and service circularity'],
  ['F16', 'environment', '废弃物管理', 'Waste management'],
  ['F17', 'social', '本企业工作条件', 'Own-workforce working conditions'],
  ['F18', 'social', '本企业平等待遇', 'Own-workforce equal treatment'],
  ['F19', 'social', '本企业其他劳动权利', 'Other own-workforce labour rights'],
  ['F20', 'social', '供应商工作条件', 'Value-chain working conditions'],
  ['F21', 'social', '供应商平等待遇', 'Value-chain equal treatment'],
  ['F22', 'social', '供应商其他劳动权利', 'Other value-chain labour rights'],
  ['F23', 'social', '社区生活权益', 'Community socioeconomic and cultural rights'],
  ['F24', 'social', '社区公民权益', 'Community civil and political rights'],
  ['F25', 'social', '原住民权利', 'Indigenous peoples’ rights'],
  ['F26', 'social', '消费者信息权益', 'User information rights'],
  ['F27', 'social', '消费者人身安全', 'User personal safety'],
  ['F28', 'social', '消费者社会包容', 'User social inclusion'],
  ['F29', 'governance', '企业文化', 'Corporate culture'],
  ['F30', 'governance', '举报人保护', 'Whistleblower protection'],
  ['F31', 'governance', '政治参与', 'Political engagement'],
  ['F32', 'governance', '供应商关系', 'Supplier relations'],
  ['F33', 'governance', '腐败贿赂防治', 'Anti-corruption and anti-bribery'],
];

test('study config exposes the renumbered 33 grouped ESG topics in order', () => {
  assert.equal(studyConfig.version, 'esg-topic-set-v4-33');
  assert.equal(studyConfig.factors.length, expectedTopics.length);
  assert.deepEqual(
    studyConfig.factors.map((factor) => [factor.id, factor.category, factor.name['zh-CN'], factor.name.en]),
    expectedTopics,
  );
  assert.deepEqual(studyConfig.factors.map((factor) => factor.id), Array.from({ length: 33 }, (_, index) => `F${index + 1}`));
  assert.equal(new Set(studyConfig.factors.map((factor) => factor.id)).size, 33);
  assert.equal(createPairs(studyConfig.factors).length, 528);
});

test('renumbered grouped topics retain original ESRS factor numbers', () => {
  const byId = Object.fromEntries(studyConfig.factors.map((factor) => [factor.id, factor]));
  assert.deepEqual(byId.F7.sourceIds, ['F8', 'F9']);
  assert.deepEqual(byId.F33.sourceIds, ['F37', 'F38']);
  assert.equal(byId.F7.esrs.sourceKeys.length, 2);
  assert.equal(byId.F33.esrs.sourceKeys.length, 2);
  assert.deepEqual(byId.F8.sourceIds, ['F10']);
  assert.deepEqual(byId.F32.sourceIds, ['F36']);
  assert.equal(byId.F7.esrs.standard, 'E2');
  assert.equal(byId.F33.esrs.standard, 'G1');
  assert.equal(byId.F1.name['zh-HK'], '氣候適應');
});

test('all localised factor labels use the requested names without ESRS prefixes', () => {
  for (const locale of ['zh-CN', 'zh-HK', 'en']) {
    const factors = localisedFactors(locale);
    assert.equal(factors.length, 33);
    assert.deepEqual(factors.map((factor) => factor.id), Array.from({ length: 33 }, (_, index) => `F${index + 1}`));
    for (const factor of factors) {
      assert.ok(factor.label.trim());
      assert.doesNotMatch(factor.label, /^ESRS\s+[ESG][1-5]?\s*·/);
      assert.ok(factor.description.trim());
    }
  }
});
