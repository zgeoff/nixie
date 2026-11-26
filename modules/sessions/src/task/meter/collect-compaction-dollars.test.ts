import { expect, test } from 'bun:test';
import type { RecordInput } from '@heynixie/log';
import { collectCompactionDollars } from './collect-compaction-dollars';

test('it sums the dollars of the session summaries in a result', () => {
  const records: RecordInput[] = [
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { dollars: 0.25 },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { dollars: 9 },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { dollars: 0.5 },
    },
  ];

  expect(collectCompactionDollars(records)).toBe(0.75);
});

test('it counts a summary that holds no dollars as nothing', () => {
  const records: RecordInput[] = [
    { kind: 'model.session_summarized', definitions: { snapshotHash: 'sha256:test' }, payload: {} },
  ];

  expect(collectCompactionDollars(records)).toBe(0);
});
