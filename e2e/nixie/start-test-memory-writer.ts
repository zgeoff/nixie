import { join } from 'node:path';
import type { MemoryWriterRunner } from '../../apps/server/src/index';
import { buildSandboxAdapter, startMemoryWriterRunner } from '../../apps/server/src/index';
import type { StartedMemoryStore } from '../../modules/memory/src/index';
import { writerConfigSchema } from '../../modules/memory/src/index';
import { buildStubGate } from '../../modules/memory/src/test-utils/index';
import { modelsConfigSchema } from '../../modules/models/src/index';
import { buildSandboxRecorder } from '../../modules/sandbox/src/index';
import type { TasksContext } from '../../modules/tasks/src/index';
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
    sandboxes: buildSandboxAdapter({
      recorder: buildSandboxRecorder({ log: context.log, definitions: context.definitions }),
      toolTarget: tools.endpoint.getToolTarget,

      // the test sandbox, the process double, which never reaches impd
      sandbox: { adapter: 'test' },
      testRootDir: join(context.log.writer.dataDir, 'sandboxes'),
      hostEnv: {},
    }),
    socketDir: join(context.log.writer.dataDir, 'tools'),
    image: 'nixie-conversation-test',
    store: options.store,
    gate: buildStubGate(),
    config: writerConfigSchema.parse({}),
    getPersona: () => '',
    ownerName: null,
    onError: (error) => {
      throw error;
    },
  });
}
