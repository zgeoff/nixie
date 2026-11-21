import type { ComputerTools } from '@heynixie/connectors';
import { computerToolNames } from '@heynixie/connectors';
import type { ActionsWithForget } from '../forget/add-log-forget';

// The queued computer tools need the browser and the shell, which the other actions' tests have no
// use for, so the part adds their connector after the queue is built.
export function addComputerConnector(
  actions: ActionsWithForget,
  computer: ComputerTools,
): ActionsWithForget {
  const queued = computerToolNames.filter((name) =>
    computer.tools.some((tool) => tool.name === name && tool.execution === 'queued'),
  );

  return {
    ...actions,
    connectors: new Map([
      ...actions.connectors,
      ...queued.map((name) => [name, computer.connector] as const),
    ]),
  };
}
