import type { ActionQueueBridge } from '@heynixie/actions';
import { buildActionQueue } from '@heynixie/actions';
import type { ActionConnector } from '@heynixie/connectors';
import type { Logger } from '@heynixie/logger';
import type { TasksContext } from '@heynixie/tasks';
import { buildTestSendTool, testSendKinds } from '../utils/build-test-send-tool';
import type { LogConnector } from './build-log-connector';
import { buildLogConnector } from './build-log-connector';
import { buildTestConnector } from './build-test-connector';

export interface Actions extends ActionQueueBridge {
  readonly logConnector: LogConnector;
  readonly connectors: ReadonlyMap<string, ActionConnector>;
}

export interface ActionsOptions {
  readonly log: Logger;

  // the owner's name from the config, which the model reads in the question about an unknown outcome
  readonly ownerName: string | null;

  readonly testProviderURL: string | null;
}

export function buildActions(context: TasksContext, options: ActionsOptions): Actions {
  const logConnector = buildLogConnector(options.log);

  const connectors = new Map([[logConnector.tool.name, logConnector.connector]]);

  if (NIXIE_TEST_BUILD && options.testProviderURL !== null) {
    for (const kind of testSendKinds) {
      connectors.set(
        buildTestSendTool(kind).name,
        buildTestConnector(options.testProviderURL, kind),
      );
    }
  }

  return {
    ...buildActionQueue(context, { ownerName: options.ownerName }),
    logConnector,
    connectors,
  };
}
