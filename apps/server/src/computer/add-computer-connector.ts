import type { Admission } from '@heynixie/actions';
import type { ComputerTools } from '@heynixie/connectors';
import { computerToolNames, legacyComputerToolNames } from '@heynixie/connectors';
import type { ActionsWithForget } from '../forget/add-log-forget';

const noAdmission: Admission = { run: (work) => work(), release: () => {} };

// The queued computer tools need the browser and the shell, which the other actions' tests have no
// use for, so the part adds their connector after the queue is built. An action queued under an old
// tool name still waits in the queue, so the connector answers to those names too.
export function addComputerConnector(
  actions: ActionsWithForget,
  computer: ComputerTools,
): ActionsWithForget {
  const queued = computerToolNames.filter((name) =>
    computer.tools.some((tool) => tool.name === name && tool.execution === 'queued'),
  );

  return {
    ...actions,
    readHeldToolPrefixes: () => (computer.takeover.isHeld() ? ['computer.'] : []),
    admitTool: (tool) => (tool.startsWith('computer.') ? computer.takeover.admit() : noAdmission),
    connectors: new Map([
      ...actions.connectors,
      ...[...queued, ...legacyComputerToolNames].map((name) => [name, computer.connector] as const),
    ]),
  };
}
