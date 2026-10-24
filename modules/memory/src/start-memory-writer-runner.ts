import type { PromptOverrides } from '@heynixie/prompts';
import type { SystemTaskOptions, SystemTaskRunner, ToolSessionOptions } from '@heynixie/sessions';
import { makeSystemTaskRunner, startToolSession } from '@heynixie/sessions';
import type { TaskMessaging } from '@heynixie/tasks';
import { buildTaskMessageTool, buildTasksListTool } from '@heynixie/tasks';
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

  readonly getPersona: () => string;
  readonly getPrompts: () => PromptOverrides;

  readonly ownerName: string | null;

  readonly assistantName: string | null;

  readonly defaultZone: string;
  readonly messaging: TaskMessaging;
  readonly onError: (error: unknown) => void;
}

export type MemoryWriterRunner = SystemTaskRunner<MemoryWriter>;

export const startMemoryWriterRunner = makeSystemTaskRunner<
  MemoryWriterRunnerOptions,
  MemoryWriter
>({
  role: 'memory-writer',
  entry: 'main',
  start: async (options, session) => {
    const staging = createWriterStaging();

    const tools = [
      ...buildWriterTools(options.store, staging, options.config.topItems),
      buildTasksListTool(options.context, options.messaging),
      buildTaskMessageTool(options.context, options.messaging),
    ];

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
      getPrompts: options.getPrompts,
      ownerName: options.ownerName,
      assistantName: options.assistantName,
      defaultZone: options.defaultZone,
      messaging: options.messaging,
      onError: options.onError,
    });

    session.defer(() => writer.stop());

    return writer;
  },
});
