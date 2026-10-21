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
  readonly cleanupSessions?: CleanupSessions;

  readonly definitions?: MemoryContext['definitions'];

  readonly gate?: Partial<GateContext>;

  readonly semanticSearch?: SemanticSearch;

  readonly keyStoreBusyTimeoutMs?: number;
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
