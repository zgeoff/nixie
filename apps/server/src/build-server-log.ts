import { actionsProjection } from '@heynixie/actions';
import { apiProjections } from '@heynixie/api';
import type { Log, Writer } from '@heynixie/log';
import { logProjections } from '@heynixie/log';
import { sandboxesProjection } from '@heynixie/sandbox';
import { tasksProjections } from '@heynixie/tasks';

// The log every module appends to, with each module's projections in the order they fold: a later
// projection may read what an earlier one wrote in the same transaction.
export function buildServerLog(writer: Writer, deploymentKey: CryptoKey): Log {
  return {
    writer,
    deploymentKey,
    projections: [
      ...logProjections,
      ...tasksProjections,
      actionsProjection,
      sandboxesProjection,
      ...apiProjections,
    ],
  };
}
