import type { ConsolidationConfig, MemoryConsolidator, StartedMemoryStore } from '@heynixie/memory';
import {
  buildConsolidatorTools,
  createConsolidationStaging,
  memoryConsolidatorTaskID,
  startMemoryConsolidator,
} from '@heynixie/memory';
import type { SystemTaskOptions } from './make-system-task-runner';
import { makeSystemTaskRunner } from './make-system-task-runner';
import type { ToolSessionOptions } from './start-tool-session';
import { startToolSession } from './start-tool-session';

export interface MemoryConsolidatorRunnerOptions extends SystemTaskOptions, ToolSessionOptions {
  readonly store: StartedMemoryStore;
  readonly config: ConsolidationConfig;

  // the persona in force, read at each run
  readonly getPersona: () => string;

  // your name, which the consolidator's rules call you by, or null to call you "the owner"
  readonly ownerName: string | null;
  readonly onError: (error: unknown) => void;
}

// Starts the memory consolidator on the memory-consolidator role's profile, as a system task with
// its own session. Its tool endpoint serves only recall and consolidate.
export const startMemoryConsolidatorRunner = makeSystemTaskRunner<
  MemoryConsolidatorRunnerOptions,
  MemoryConsolidator
>({
  role: 'memory-consolidator',
  entry: 'main',
  start: async (options, session) => {
    const staging = createConsolidationStaging();
    const tools = buildConsolidatorTools(options.store, staging, options.config.topItems);

    const runner = await startToolSession(options, session, {
      taskID: memoryConsolidatorTaskID,
      tools,
    });

    return startMemoryConsolidator({
      context: options.context,
      store: options.store,
      staging,
      model: {
        model: runner.model.model,
        profile: runner.model.profile,
        runSession: runner.runSession,
      },
      config: options.config,
      getPersona: options.getPersona,
      ownerName: options.ownerName,
      onError: options.onError,
    });
  },
});
