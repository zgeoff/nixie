import type { Log, Writer } from '@heynixie/log';
import { logProjections, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import type { TestClock } from '@heynixie/testing';
import { createPlanLoginsHolder } from '../login/create-plan-logins-holder';
import { spendProjections } from '../projection/spend-projections';
import type { SpendContext, SpendTurnLimits } from '../types';
import { buildStubSpendGateway } from './build-stub-spend-gateway';

export interface TestSpend {
  readonly writer: Writer;
  readonly log: Log;
  readonly clock: TestClock;
  readonly gateway: ReturnType<typeof buildStubSpendGateway>;
  readonly context: SpendContext;

  // writes the record of one model call that ended, at the clock's time
  readonly writeTurn: (kind?: 'model.turn_ended' | 'worker.turn_ended') => Promise<void>;
}

const testLimits: SpendTurnLimits = { dayTurns: 1000, dayTurnCap: 2000, monthTurns: 20_000 };

// A log that folds the spend records, a stub gateway and the context on top. The clock starts at
// 09:00 UTC, and the zone is UTC.
export async function startTestSpend(limits: Partial<SpendTurnLimits> = {}): Promise<TestSpend> {
  const started = await startTestLog();

  const gateway = buildStubSpendGateway();
  const log: Log = { ...started.log, projections: [...logProjections, ...spendProjections] };
  const definitions = { snapshotHash: 'sha256:aa11' };

  return {
    writer: started.writer,
    log,
    clock: started.clock,
    gateway,
    context: {
      gateway,
      log,
      clock: started.clock,
      zone: 'UTC',
      limits: { ...testLimits, ...limits },
      definitions: () => definitions,
      planLogins: createPlanLoginsHolder(),
    },
    writeTurn: async (kind = 'model.turn_ended') => {
      await withWriteTransaction(started.writer, (tx) =>
        writeRecordsInTransaction(tx, log, [{ kind, definitions, thread: 'task-a', payload: {} }]),
      );
    },
  };
}
