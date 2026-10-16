import { join } from 'node:path';
import { buildSandboxAdapter, startConversation } from '../../apps/server/src/index';
import { modelsConfigSchema } from '../../modules/models/src/index';
import { makeLogger } from '../../modules/ops/src/index';
import { buildSandboxRecorder } from '../../modules/sandbox/src/index';
import type { TasksContext } from '../../modules/tasks/src/index';
import type { TestTools } from './start-test-tools';

// Starts the conversation on a profile that points at the scripted model, in the process sandbox
// double, which runs the conversation guest as a local process with the real SDK.
export function startTestConversation(
  context: TasksContext,
  tools: TestTools,
  modelURL: string,
): ReturnType<typeof startConversation> {
  return startConversation({
    context,
    models: modelsConfigSchema.parse({
      profiles: {
        'chat-test': {
          base_url: modelURL,
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
      },
      roles: { conversation: 'chat-test' },
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
    tools: tools.endpoint,
    toolNames: tools.toolNames,
    image: 'nixie-conversation-test',
    getDefinitions: () => ({
      persona: 'You are nixie.',
      personaHash: 'sha256:persona-test',
      policyHash: 'sha256:policy-test',
    }),

    // the crash tests hold no memory, so each turn reads an empty core and recalls nothing
    memory: () => ({
      readPinnedCore: () => Promise.resolve([]),
      recall: () => Promise.resolve({ items: [], next: null }),
      recallMessages: () => Promise.resolve({ messages: [] }),
      readShortIDs: () => Promise.resolve(new Map()),
    }),
    log: makeLogger((line) => {
      process.stderr.write(line);
    }),
  });
}
