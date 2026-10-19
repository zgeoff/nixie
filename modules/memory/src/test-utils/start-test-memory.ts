import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log, Writer } from '@heynixie/log';
import type { GateContext } from '../gate-types';
import type { StartedMemoryStore } from '../start-memory-store';
import type { CleanupSessions, MemoryContext, SemanticSearch } from '../types';
import { startTestStore } from './start-test-store';

export interface TestMemory {
  readonly dataDir: string;
  readonly deploymentKey: CryptoKey;
  readonly writer: Writer;
  readonly log: Log;
  readonly store: StartedMemoryStore;
  readonly defer: (cleanup: () => Promise<void>) => void;
}

export interface TestMemoryOptions {
  // the session cleanup each forget runs, which no-ops by default
  readonly cleanupSessions?: CleanupSessions;

  // the definitions snapshot each record names, which reads a fixed hash by default
  readonly definitions?: MemoryContext['definitions'];

  // the gate's checker, clock, allow rule lookup and limits; with none, the checker answers that
  // it failed, the clock is the wall clock, no allow rule exists and the default limits hold
  readonly gate?: Partial<GateContext>;

  // the encoder the vector index runs; with none, search reads keywords only
  readonly semanticSearch?: SemanticSearch;

  // how long the key store waits for another connection's lock, 5 s by default
  readonly keyStoreBusyTimeoutMs?: number;
}

// Starts a writer on a fresh data directory with the log's and the memory projections, and a store
// over it with a new deployment key. It writes no record. When the test finishes it stops the
// store and the writer, then removes the directory.
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
