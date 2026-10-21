import { makeDecisionPoint } from '@heynixie/policy';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import type { ActionQueue, ToolDefinition } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import type { SystemTaskSession } from './make-system-task-runner';
import type { SessionRunner } from './start-session-runner';
import { startSessionRunner } from './start-session-runner';

export interface ToolSessionOptions {
  readonly context: TasksContext;
  readonly sandboxes: SandboxAdapter;
  readonly image: string;

  readonly socketDir: string;

  readonly queue: ActionQueue;
}

export interface ToolSessionRequest {
  readonly taskID: string;
  readonly tools: readonly ToolDefinition[];
}

export async function startToolSession(
  options: ToolSessionOptions,
  session: SystemTaskSession,
  request: ToolSessionRequest,
): Promise<SessionRunner> {
  const registry = buildToolRegistry(request.tools);

  const endpoint = await startToolEndpoint({
    socketDir: options.socketDir,
    registry,
    decide: makeDecisionPoint({
      findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
    }),
    log: options.context.log,
    definitions: options.context.definitions,
    queue: options.queue,
  });

  session.defer(() => endpoint.stop());

  const runner = await startSessionRunner({
    context: options.context,
    profile: session.profile,
    sandboxes: options.sandboxes,
    tools: endpoint,
    toolNames: request.tools.map((tool) => tool.name),
    taskID: request.taskID,
    image: options.image,
    limits: session.limits,
    command: session.command,
  });

  session.defer(() => runner.stop());

  return runner;
}
