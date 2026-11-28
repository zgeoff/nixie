import type { Log } from '@heynixie/log';
import { logProjections, makeErasureRunner, startWriter } from '@heynixie/log';
import { buildTestErasureEffects } from '@heynixie/log/test-utils';
import { buildProposalsProjection } from '@heynixie/proposals';
import { waitAtFaultPoint } from '@heynixie/tasks';
import { buildExpiryErasable } from '../expiry/build-expiry-erasable';
import { expiryErasableDescriptor } from '../expiry/expiry-erasable-descriptor';
import { defaultGateLimits } from '../gate/default-gate-limits';
import { defaultIndexSettings } from '../index-block/default-index-settings';
import { startMemoryStore } from '../memory/start-memory-store';
import { memoryProjections } from '../moment/projection/memory-projections';
import { defaultOwnerPronouns } from '../owner/default-owner-pronouns';
import { mapMemoryProposalRecord } from '../proposal/map-memory-proposal-record';
import type { MomentTarget } from '../utils/moment-context';
import type { TestMemory, TestMemoryOptions } from './start-test-memory';

type StoreWiring = Pick<TestMemory, 'dataDir' | 'deploymentKey' | 'defer'>;

export async function startTestStore(
  wiring: StoreWiring,
  options: TestMemoryOptions,
): Promise<
  Pick<
    TestMemory,
    'writer' | 'log' | 'store' | 'runner' | 'expiry' | 'destroyMoment' | 'effectCalls'
  >
> {
  const writer = await startWriter({
    dataDir: wiring.dataDir,
    keyStoreBusyTimeoutMs: options.keyStoreBusyTimeoutMs,
    ...(options.logClock === undefined ? {} : { clock: options.logClock }),
  });

  wiring.defer(() => writer.stop());

  const log: Log = {
    writer:
      options.dbPlugin === undefined
        ? writer
        : { ...writer, db: writer.db.withPlugin(options.dbPlugin) },
    deploymentKey: wiring.deploymentKey,
    projections: [
      ...logProjections,
      ...memoryProjections,
      buildProposalsProjection([mapMemoryProposalRecord]),
    ],
  };

  const definitions = options.definitions ?? (() => ({ snapshotHash: 'sha256:test' }));
  const fake = buildTestErasureEffects();

  const runner = makeErasureRunner({
    log,
    definitions,
    effects: {
      ...fake.effects,
      cleanupSessions: (cause) => options.cleanupSessions?.(cause) ?? Promise.resolve(),
      reachFaultPoint: (point, erasureID) =>
        waitAtFaultPoint(point, { kind: 'erasure', id: erasureID }),
    },
  });

  const expiry = runner.register({ ...expiryErasableDescriptor, ...buildExpiryErasable({ log }) });

  const store = await startMemoryStore({
    log,
    definitions,
    erasure: runner,
    ...(options.semanticSearch === undefined ? {} : { semanticSearch: options.semanticSearch }),
    ...(options.turn === undefined ? {} : { turn: options.turn }),
    ...(options.index === undefined
      ? {}
      : { index: { ...defaultIndexSettings, ...options.index } }),
    gate: {
      check:
        options.gate?.check ??
        (() =>
          Promise.resolve({
            verdict: 'unsure',
            reason: 'no checker is wired',
            model: 'no-checker',
            failure: 'error',
          })),
      clock: options.gate?.clock ?? { now: () => Date.now() },
      defaultZone: options.gate?.defaultZone ?? 'UTC',
      limits: options.gate?.limits ?? defaultGateLimits,
      ownerName: options.gate?.ownerName ?? null,
      ownerPronouns: options.gate?.ownerPronouns ?? defaultOwnerPronouns,
      getPromptsInForce:
        options.gate?.getPromptsInForce ?? (() => ({ snapshotHash: 'sha256:test', prompts: {} })),
    },
  });

  wiring.defer(() => store.stop());

  await runner.finishOpen();

  const destroyMoment = async (target: MomentTarget) => {
    const begun = await store.moments.beginDestroy(target);

    if (begun.status === 'begun') {
      await store.moments.finishDestroy(begun.momentID);
    }

    return begun;
  };

  return { writer, log, store, runner, expiry, destroyMoment, effectCalls: fake.calls };
}
