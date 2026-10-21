import type { ActionQueueBridge } from '@heynixie/actions';
import { buildActionQueue } from '@heynixie/actions';
import type { ActionConnector } from '@heynixie/connectors';
import type { Logger } from '@heynixie/logger';
import type { TasksContext } from '@heynixie/tasks';
import type { LogConnector } from './build-log-connector';
import { buildLogConnector } from './build-log-connector';

export interface Actions extends ActionQueueBridge {
  readonly logConnector: LogConnector;
  readonly connectors: ReadonlyMap<string, ActionConnector>;
}

export function buildActions(context: TasksContext, log: Logger): Actions {
  const logConnector = buildLogConnector(log);

  return {
    ...buildActionQueue(context),
    logConnector,
    connectors: new Map([[logConnector.tool.name, logConnector.connector]]),
  };
}
