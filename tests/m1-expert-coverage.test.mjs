import test from 'node:test';
import assert from 'node:assert/strict';
import { expertCoverage } from '../expert-coverage.mjs';
import { GUIDED_WORDING_VERSION } from '../guided-elicitation.mjs';

const record = (code, date, state) => ({ wordingVersion: GUIDED_WORDING_VERSION, participant: { code }, submittedAt: date, factors: [{ id: 'A' }, { id: 'B' }], judgmentStatusMatrix: [['self', state], ['unassigned', 'self']] });

test('coverage counts each expert once per direction and retains the latest covered judgment', () => {
  const report = expertCoverage([
    record('EX-01', '2026-10-23', 'support'),
    record('EX-02', '2026-10-24', 'support'),
    record('ex-01', '2026-10-25', 'no_support'),
    record('ex-01', '2026-10-26', 'unassigned'),
  ], 3);
  const forward = report.directions.find(row => row.sourceId === 'A');
  assert.equal(report.independentCodes, 2);
  assert.deepEqual({ support: forward.support, no_support: forward.no_support, judged: forward.judged, disagreement: forward.disagreement, additional: forward.additionalJudgments },
    { support: 1, no_support: 1, judged: 2, disagreement: true, additional: 1 });
  assert.equal(report.directions.find(row => row.sourceId === 'B').judged, 0);
});

test('unknown, deferred and unidentified records stay separate from valid judgment counts', () => {
  const report = expertCoverage([record('E1', '2026-10-25', 'unable'), record('E2', '2026-10-25', 'unreviewed'), record('', '2026-10-25', 'support')], 2);
  const row = report.directions.find(row => row.sourceId === 'A');
  assert.equal(row.judged, 0); assert.equal(row.unable, 1); assert.equal(row.unreviewed, 1);
  assert.equal(report.unidentifiedRecords, 1); assert.equal(row.additionalJudgments, 2);
  assert.throws(() => expertCoverage([], 0));
});

test('coverage reads collector envelopes and keeps conflicting directions in follow-up after the count target is met', () => {
  const report = expertCoverage([{ submission: record('E1', '2026-10-25', 'support') }, { submission: record('E2', '2026-10-25', 'no_support') }], 2);
  const forward = report.followUp.find(row => row.sourceId === 'A');
  assert.equal(forward.additionalJudgments, 0); assert.equal(forward.disagreement, true);
});

test('coverage separates collection versions and rejects combined topic revisions', () => {
  const old = { ...record('E1', '2026-10-23', 'support'), wordingVersion: 'vt3-20261023' };
  assert.equal(expertCoverage([old]).otherVersionRecords, 1);
  assert.equal(expertCoverage([old]).independentCodes, 0);
  assert.throws(() => expertCoverage([{ ...record('E1', '2026-10-25', 'support'), topicSnapshotId: 'one' }, { ...record('E2', '2026-10-25', 'support'), topicSnapshotId: 'two' }]), /one topic revision/);
});
