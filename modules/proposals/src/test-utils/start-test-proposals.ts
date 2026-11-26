import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log } from '@heynixie/log';
import { logProjections, startWriter, writeRecordsInTransaction } from '@heynixie/log';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { DoneOutcome, ProposalKindHandler } from '../answer/proposal-kind-handler';
import type { ProposalCoreDeps } from '../answer/types';
import { buildDiscardedOutcome } from '../propose/build-discarded-outcome';
import { buildProposalsProjection } from '../rows/build-proposals-projection';
import type { ProposalRecordMapper } from '../rows/proposal-change';
import { buildMockSettlementDeps } from './build-mock-settlement-deps';

export interface TestProposalsOptions {
  readonly mappers?: readonly ProposalRecordMapper[];

  // the families that have a handler; the handler of each approves and discards with nothing to undo
  readonly families?: readonly ProposalKindHandler['family'][];

  // real handlers, which take the place of a stand-in of the same family
  readonly handlers?: readonly ProposalKindHandler[];
}

// A real log with the shared proposals row, and the core's deps with a handler that holds nothing
// for each family named.
export async function startTestProposals(options: TestProposalsOptions = {}) {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-proposals-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const projection = buildProposalsProjection(options.mappers ?? []);
  const log: Log = { writer, deploymentKey, projections: [...logProjections, projection] };
  const clock = createFakeClock({ startMs: Date.parse('2026-11-02T09:00:00Z') });

  const handlers = new Map<ProposalKindHandler['family'], ProposalKindHandler>([
    ...(options.families ?? (options.handlers === undefined ? ['skill'] : [])).map(
      (family) => [family, buildHandler(family)] as const,
    ),
    ...(options.handlers ?? []).map((handler) => [handler.family, handler] as const),
  ]);

  const deps: ProposalCoreDeps = {
    log,
    clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    handlers,
    projection,
    readDeferContext: () => Promise.resolve({ quietHours: null, zone: 'UTC' }),
    ...buildMockSettlementDeps(),
    writeThreadRecord: async (tx, input) => {
      await writeRecordsInTransaction(tx, log, [input]);
    },
  };

  return { log, clock, deps };
}

function buildHandler(family: ProposalKindHandler['family']): ProposalKindHandler {
  return {
    family,
    lapseIntervalMs: (config) => config.lapseDays[family] * 24 * 60 * 60 * 1000,
    ownsTransaction: false,
    readBodies: () => Promise.resolve(new Map()),
    readHashes: (_db, row) => Promise.resolve({ action: row.actionHash, rule: null }),
    approve: (_run, row): Promise<DoneOutcome> =>
      Promise.resolve({
        status: 'done',
        result: { proposalID: row.id, state: 'approved' },
        usedBy: 'made-1',
        detail: 'call skill_reload',
        otherStakes: [],
      }),
    discard: (_run, row, outcome) => Promise.resolve(buildDiscardedOutcome(row, outcome)),
  };
}
