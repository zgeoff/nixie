import { spendStopTrippedCodec } from '../pause/spend-stop-tripped-codec';
import type { LogSeederDeps } from './log-seeder-deps';
import { seedRecord } from './seed-record';

// A standing spending stop with no nixie pause beside it: the row alone, as the projection folds it.
export function seedSpendStop(deps: LogSeederDeps) {
  return seedRecord(deps, {
    kind: spendStopTrippedCodec.kind,
    payload: spendStopTrippedCodec.encode({ reason: 'lost', at: 1000 }),
  });
}
