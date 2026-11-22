import { proposalsProjection } from '@heynixie/api';
import type { Clock } from '@heynixie/clock';
import type { Log, Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { memoryProjections } from '@heynixie/memory';
import { notebookProjections } from '@heynixie/notebook';
import { knownContactsProjection } from '@heynixie/policy';
import { remindersProjections } from '@heynixie/reminders';
import { sandboxesProjection } from '@heynixie/sandbox';
import { tasksProjections } from '@heynixie/tasks';
import { triggersProjections } from '@heynixie/triggers';

export async function startTestLog(
  dataDir: string,
  clock?: Clock,
): Promise<Log & { readonly writer: Writer }> {
  const options = clock === undefined ? { dataDir } : { dataDir, clock };

  const writer = await startWriter(options);

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    writer,
    deploymentKey,
    projections: [
      ...logProjections,
      ...tasksProjections,
      ...triggersProjections,
      ...remindersProjections,
      sandboxesProjection,
      ...memoryProjections,
      ...notebookProjections,
      knownContactsProjection,
      proposalsProjection,
    ],
  };
}
