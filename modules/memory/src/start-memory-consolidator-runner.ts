import type { SystemTaskOptions, ToolSessionOptions } from '@heynixie/sessions';
import { makeSystemTaskRunner, startToolSession } from '@heynixie/sessions';
import { buildConsolidatorTools } from './build-consolidator-tools';
import type { ConsolidationConfig } from './consolidation-config-schema';
import { createConsolidationStaging } from './create-consolidation-staging';
import { memoryConsolidatorTaskID } from './memory-consolidator-task-id';
import type { MemoryConsolidator } from './start-memory-consolidator';
import { startMemoryConsolidator } from './start-memory-consolidator';
import type { StartedMemoryStore } from './start-memory-store';

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
