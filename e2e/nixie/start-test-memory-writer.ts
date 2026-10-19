import { join } from 'node:path';
import { buildActionQueue } from '@heynixie/actions';
import type { StartedMemoryStore } from '@heynixie/memory';
import { writerConfigSchema } from '@heynixie/memory';
import { buildStubGate } from '@heynixie/memory/test-utils';
import { modelsConfigSchema } from '@heynixie/models';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import type { MemoryWriterRunner } from '@heynixie/server';
import { createSandboxAdapter, startMemoryWriterRunner } from '@heynixie/server';
import type { TasksContext } from '@heynixie/tasks';
import type { TestTools } from './start-test-tools';

export interface TestWriterOptions {
  readonly store: StartedMemoryStore;
  readonly modelURL: string;
}

// Starts the memory writer on a profile that points at its own scripted model, in the process
// sandbox double, with the stub content gate and the default batch settings, so a live message
// waits for the idle trigger on the harness's clock.
export function startTestMemoryWriter(
  context: TasksContext,
  tools: TestTools,
  options: TestWriterOptions,
): Promise<MemoryWriterRunner> {
  return startMemoryWriterRunner({
    context,
    models: modelsConfigSchema.parse({
      profiles: {
        'writer-test': {
          base_url: options.modelURL,
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
      },
      roles: { conversation: 'writer-test', 'memory-writer': 'writer-test' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: createSandboxAdapter({
      recorder: buildSandboxRecorder({ log: context.log, definitions: context.definitions }),
      toolTarget: tools.endpoint.getToolTarget,

      // the test sandbox, the process double, which never reaches impd
      sandbox: { adapter: 'test' },
      testRootDir: join(context.log.writer.dataDir, 'sandboxes'),
      hostEnv: {},
    }),
    queue: buildActionQueue(context).queue,
    socketDir: join(context.log.writer.dataDir, 'tools'),
    image: 'nixie-conversation-test',
    store: options.store,
    gate: buildStubGate(),
    config: writerConfigSchema.parse({}),
    getPersona: () => '',
    ownerName: null,
    assistantName: null,
    onError: (error) => {
      throw error;
    },
  });
}
