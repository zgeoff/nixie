import { join } from 'node:path';
import {
  buildSandboxAdapter,
  deploymentConfigSchema,
  startConversation,
} from '../../apps/server/src/index';
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
    config: deploymentConfigSchema.parse({
      models: {
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
      },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: buildSandboxAdapter({
      recorder: buildSandboxRecorder({ log: context.log, definitions: context.definitions }),
      toolTarget: tools.endpoint.getToolTarget,
      env: {},
      testRootDir: join(context.log.writer.dataDir, 'sandboxes'),
    }),
    tools: tools.endpoint,
    toolNames: tools.toolNames,
    systemPrompt: 'You are nixie.',
  });
}
