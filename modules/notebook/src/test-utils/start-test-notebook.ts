import { onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Log } from '@heynixie/log';
import { logProjections, readRecords, startWriter } from '@heynixie/log';
import type { CleanupCause, CleanupSessions } from '@heynixie/memory';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  memoryProjections,
  startMemoryStore,
} from '@heynixie/memory';
import {
  buildStubEncoder,
  createMemoryItem,
  writeOwnerMessages,
} from '@heynixie/memory/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildItemLinkCounts } from '../count/build-item-link-counts';
import { buildNotebookMemory } from '../memory/build-notebook-memory';
import { notebookProjections } from '../projection/notebook-projections';
import { startNotebook } from '../start-notebook';
import type { NotebookStore } from '../start-notebook';
import type { NotebookSettings } from '../types';
import { defaultNotebookSettings } from '../types';
import { buildNotebookToolCaller } from './build-notebook-tool-caller';

export interface TestNotebookOptions {
  readonly settings?: Partial<NotebookSettings>;

  // the topics of the stub encoder; without any, no meaning search runs
  readonly topics?: readonly (readonly string[])[];

  // runs after the cleanup is recorded, so a test can fail a forget's session cleanup
  readonly cleanupSessions?: CleanupSessions;

  // the wait before a tool forget's cleanup runs again; a test sets it short
  readonly cleanupRetryMs?: number;

  // the step a thread runs; without it, no step runs, so a tool's forget cleans at once
  readonly readStartedStep?: (thread: string) => Promise<string | null>;
}

// Starts a log with the notebook over it, and a memory store beside it, so a test calls a tool and
// reads what the log and the stores hold after it.
export async function startTestNotebook(options: TestNotebookOptions = {}) {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const clock = createFakeClock({ startMs: Date.parse('2026-11-21T08:00:00.000Z') });

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-notebook-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir, clock });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log: Log = {
    writer,
    deploymentKey,
    projections: [...logProjections, ...memoryProjections, ...notebookProjections],
  };

  const cleanups: CleanupCause[] = [];

  const semanticSearch =
    options.topics === undefined
      ? undefined
      : { encoder: buildStubEncoder(options.topics), onError: () => {} };

  const memory = await startMemoryStore({
    log,
    definitions,
    cleanupSessions: () => Promise.resolve(),
    linkCounts: buildItemLinkCounts(log),
    ...(semanticSearch === undefined ? {} : { semanticSearch }),
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock,
      defaultZone: 'UTC',
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  stack.defer(() => memory.stop());

  const start = () =>
    startNotebook({
      log,
      definitions,
      clock,
      settings: { ...defaultNotebookSettings, ...options.settings },
      cleanupRetryMs: options.cleanupRetryMs ?? 1,
      readStartedStep: options.readStartedStep ?? (() => Promise.resolve(null)),
      memory: buildNotebookMemory(() => memory),
      cleanupSessions: (cause) => {
        cleanups.push(cause);

        return options.cleanupSessions?.(cause) ?? Promise.resolve();
      },
      ...(semanticSearch === undefined ? {} : { semanticSearch }),
    });

  const notebook = await start();

  stack.defer(() => notebook.stop());

  const readLog = async (kinds: readonly string[]) => {
    const entries = await readRecords(log, { afterSequence: 0, limit: 1000 });

    return entries.filter((entry) => kinds.includes(entry.record.kind));
  };

  return {
    log,
    clock,
    memory,
    notebook,
    cleanups,
    call: buildNotebookToolCaller(() => notebook),
    start: async (): Promise<NotebookStore> => {
      const restarted = await start();

      stack.defer(() => restarted.stop());

      return restarted;
    },
    seed: {
      item: async (text: string, gist = 'a test fact') => {
        const ref = await createMemoryItem(memory, {
          text,
          labels: { gist, topic: 'test', triggers: [] },
        });

        const shortIDs = await memory.readShortIDs([ref.itemID]);

        return {
          itemID: ref.itemID,
          shortID: shortIDs.get(ref.itemID) ?? '',
          version: ref.version,
        };
      },
      ownerMessages: (texts: readonly string[]) => writeOwnerMessages(log, texts),
      moment: async (title: string) => {
        const [first = 0, last = 0] = await writeOwnerMessages(log, ['one', 'two']);

        const kept = await memory.moments.keep({
          caller: { kind: 'owner' },
          thread: 'conversation',
          firstSequence: first,
          lastSequence: last,
          title,
        });

        return kept.status === 'written' ? kept : null;
      },
    },
    readRecords: readLog,
  };
}

function definitions() {
  return { snapshotHash: 'sha256:test' };
}
