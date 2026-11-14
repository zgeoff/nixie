import type { ActionQueueBridge } from '@heynixie/actions';
import { buildActionQueue } from '@heynixie/actions';
import type { ActionConnector } from '@heynixie/connectors';
import type { Logger } from '@heynixie/logger';
import type { TasksContext } from '@heynixie/tasks';
import type { LogConnector } from '../utils/build-log-connector';
import { buildLogConnector } from '../utils/build-log-connector';
import { buildTestSendTool } from '../utils/build-test-send-tool';
import { buildTestConnector } from './build-test-connector';

export interface Actions extends ActionQueueBridge {
  readonly logConnector: LogConnector;
  readonly connectors: ReadonlyMap<string, ActionConnector>;
}

export interface ActionsOptions {
  readonly log: Logger;

  readonly testProviderURL: string | null;
}

export function buildActions(context: TasksContext, options: ActionsOptions): Actions {
  const logConnector = buildLogConnector(options.log);

  const connectors = new Map([[logConnector.tool.name, logConnector.connector]]);

  if (NIXIE_TEST_BUILD && options.testProviderURL !== null) {
    connectors.set(buildTestSendTool().name, buildTestConnector(options.testProviderURL));
  }

  return { ...buildActionQueue(context), logConnector, connectors };
}
