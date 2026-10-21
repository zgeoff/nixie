import { actionsProjection } from '@heynixie/actions';
import { apiProjections } from '@heynixie/api';
import type { Log, Writer } from '@heynixie/log';
import { logProjections } from '@heynixie/log';
import { memoryProjections } from '@heynixie/memory';
import { sandboxesProjection } from '@heynixie/sandbox';
import { tasksProjections } from '@heynixie/tasks';

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
      ...memoryProjections,
    ],
  };
}
