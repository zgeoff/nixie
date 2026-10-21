import { join } from 'node:path';
import type { ActionQueueBridge } from '@heynixie/actions';
import { buildActionQueue } from '@heynixie/actions';
import type { ActionConnector } from '@heynixie/connectors';
import { makeDecisionPoint } from '@heynixie/policy';
import type { TasksContext } from '@heynixie/tasks';
import type { ToolEndpoint } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { buildTestConnector } from './build-test-connector';
import { buildTestSendTool } from './build-test-send-tool';

export interface TestTools {
  readonly endpoint: ToolEndpoint;
  readonly toolNames: readonly string[];
  readonly trackSteps: ActionQueueBridge['trackSteps'];

  readonly connectors: ReadonlyMap<string, ActionConnector>;
}

export async function startTestTools(
  context: TasksContext,
  providerURL: string,
): Promise<TestTools> {
  const testSend = buildTestSendTool();
  const registry = buildToolRegistry([testSend]);
  const bridge = buildActionQueue(context);

  const endpoint = await startToolEndpoint({
    socketDir: join(context.log.writer.dataDir, 'tools'),
    registry,
    decide: makeDecisionPoint({
      findDeclaration: (tool) => registry.findTool(tool)?.definition.declaration ?? null,
    }),
    log: context.log,
    definitions: context.definitions,
    queue: bridge.queue,
  });

  return {
    endpoint,
    toolNames: [testSend.name],
    trackSteps: bridge.trackSteps,
    connectors: new Map([[testSend.name, buildTestConnector(providerURL)]]),
  };
}
