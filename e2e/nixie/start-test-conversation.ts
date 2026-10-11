import { join } from 'node:path';
import { buildSandboxAdapter, startConversation } from '../../apps/server/src/index';
import { modelsConfigSchema } from '../../modules/models/src/index';
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

      // a test build runs the process double, which never reaches impd
      imp: { url: 'http://127.0.0.1:1', publicEgress: null, token: '' },
      testRootDir: join(context.log.writer.dataDir, 'sandboxes'),
    }),
    tools: tools.endpoint,
    toolNames: tools.toolNames,
    image: 'nixie-conversation-test',
    getSystemPrompt: () => 'You are nixie.',
  });
}
