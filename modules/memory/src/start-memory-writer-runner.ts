import type { SystemTaskOptions, SystemTaskRunner, ToolSessionOptions } from '@heynixie/sessions';
import { makeSystemTaskRunner, startToolSession } from '@heynixie/sessions';
import { buildWriterTools } from './build-writer-tools';
import { createWriterStaging } from './create-writer-staging';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { StartedMemoryStore } from './start-memory-store';
import type { MemoryWriter } from './start-memory-writer';
import { startMemoryWriter } from './start-memory-writer';
import type { WriterConfig } from './writer-config-schema';
import type { WriterGate } from './writer-types';

export interface MemoryWriterRunnerOptions extends SystemTaskOptions, ToolSessionOptions {
  readonly store: StartedMemoryStore;
  readonly gate: WriterGate;
  readonly config: WriterConfig;

  // the persona in force, read at each batch
  readonly getPersona: () => string;

  // your configured name, which the writer's memories use, or null for "the owner"
  readonly ownerName: string | null;

  // the assistant's configured name, which labels its messages, or null for "the assistant"
  readonly assistantName: string | null;
  readonly onError: (error: unknown) => void;
}

export type MemoryWriterRunner = SystemTaskRunner<MemoryWriter>;

// Starts the memory writer on the memory-writer role's profile, as a system task with its own
// session. Its tool endpoint serves only the writer's 5 tools.
export const startMemoryWriterRunner = makeSystemTaskRunner<
  MemoryWriterRunnerOptions,
  MemoryWriter
>({
  role: 'memory-writer',
  entry: 'main',
  start: async (options, session) => {
    const staging = createWriterStaging();
    const tools = buildWriterTools(options.store, staging, options.config.topItems);

    const runner = await startToolSession(options, session, { taskID: memoryWriterTaskID, tools });

    const writer = await startMemoryWriter({
      context: options.context,
      store: options.store,
      publish: options.store.writeBatch,
      staging,
      model: {
        model: runner.model.model,
        profile: runner.model.profile,
        runSession: runner.runSession,
      },
      gate: options.gate,
      config: options.config,
      getPersona: options.getPersona,
      ownerName: options.ownerName,
      assistantName: options.assistantName,
      onError: options.onError,
    });

    session.defer(() => writer.stop());

    return writer;
  },
});
