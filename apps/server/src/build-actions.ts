import type { ActionConnector } from '@heynixie/actions';
import type { Logger } from '@heynixie/ops';
import type { TasksContext } from '@heynixie/tasks';
import type { ActionQueueBridge } from './build-action-queue';
import { buildActionQueue } from './build-action-queue';
import type { LogConnector } from './build-log-connector';
import { buildLogConnector } from './build-log-connector';

// The action queue every tool endpoint shares, the log-only connector that the queue check calls,
// and each queued tool's connector by tool name, which the action runners run.
export interface Actions extends ActionQueueBridge {
  readonly logConnector: LogConnector;
  readonly connectors: ReadonlyMap<string, ActionConnector>;
}

// Builds the action queue and its one connector, the log-only connector.
export function buildActions(context: TasksContext, log: Logger): Actions {
  const logConnector = buildLogConnector(log);

  return {
    ...buildActionQueue(context),
    logConnector,
    connectors: new Map([[logConnector.tool.name, logConnector.connector]]),
  };
}
