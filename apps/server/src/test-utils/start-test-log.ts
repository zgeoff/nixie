import type { Log, Writer } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { memoryProjections } from '@heynixie/memory';
import { sandboxesProjection } from '@heynixie/sandbox';
import { tasksProjections } from '@heynixie/tasks';

// Starts the log a test server runs on: a writer on the data directory, a fresh deployment key,
// and the log's, the tasks, the sandboxes and the memory projections. The caller stops the writer.
export async function startTestLog(dataDir: string): Promise<Log & { readonly writer: Writer }> {
  const writer = await startWriter({ dataDir });

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
      sandboxesProjection,
      ...memoryProjections,
    ],
  };
}
