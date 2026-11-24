import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from '@heynixie/clock';
import type { ErasureRunnerControl, ErasureSessionCause, Log, Writer } from '@heynixie/log';
import type { KyselyPlugin } from 'kysely';
import type { GateContext } from '../gate/gate-context';
import type { MemoryIndexConfig } from '../index-block/default-index-settings';
import type { StartedMemoryStore } from '../memory/start-memory-store';
import type { TurnMemorySettings } from '../turn/types';
import type { MemoryContext, SemanticSearch } from '../types';
import type { MomentDestroy, MomentTarget } from '../utils/moment-context';
import { startTestStore } from './start-test-store';

export interface TestMemory {
  readonly dataDir: string;
  readonly deploymentKey: CryptoKey;
  readonly writer: Writer;
  readonly log: Log;
  readonly store: StartedMemoryStore;
  readonly runner: ErasureRunnerControl;

  // a destroy that runs to its end, as a route's does
  readonly destroyMoment: (target: MomentTarget) => Promise<MomentDestroy>;
  readonly defer: (cleanup: () => Promise<void>) => void;
}

export interface TestMemoryOptions {
  readonly cleanupSessions?: (cause: ErasureSessionCause) => Promise<void>;

  readonly definitions?: MemoryContext['definitions'];

  readonly gate?: Partial<GateContext>;

  readonly logClock?: Clock;

  readonly semanticSearch?: SemanticSearch;

  readonly index?: Partial<MemoryIndexConfig>;

  readonly turn?: TurnMemorySettings;

  readonly keyStoreBusyTimeoutMs?: number;

  // a plugin on the log's database, which the store reads and writes through
  readonly dbPlugin?: KyselyPlugin;
}

export async function startTestMemory(options: TestMemoryOptions = {}): Promise<TestMemory> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-memory-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const wiring = {
    dataDir,
    deploymentKey,
    defer: (cleanup: () => Promise<void>) => {
      stack.defer(cleanup);
    },
  };

  const started = await startTestStore(wiring, options);

  return { ...wiring, ...started };
}
