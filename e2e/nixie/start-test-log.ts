import { actionsProjection } from '@heynixie/actions';
import type { Clock } from '@heynixie/clock';
import { logProjections, startWriter } from '@heynixie/log';
import type { Writer } from '@heynixie/log';
import { memoryProjections } from '@heynixie/memory';
import { sandboxesProjection } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import { tasksProjections } from '@heynixie/tasks';

interface TestLogOptions {
  readonly dataDir: string;

  readonly deploymentKey: string;
  readonly clock: Clock;
}

export interface TestLog {
  readonly writer: Writer;
  readonly context: TasksContext;
}

export async function startTestLog(options: TestLogOptions): Promise<TestLog> {
  const writer = await startWriter({ dataDir: options.dataDir, clock: options.clock });

  const deploymentKey = await crypto.subtle.importKey(
    'raw',
    Buffer.from(options.deploymentKey, 'base64'),
    { name: 'AES-KW' },
    false,
    ['wrapKey', 'unwrapKey'],
  );

  return {
    writer,
    context: {
      log: {
        writer,
        deploymentKey,
        projections: [
          ...logProjections,
          ...tasksProjections,
          actionsProjection,
          sandboxesProjection,
          ...memoryProjections,
        ],
      },
      clock: options.clock,
      definitions: () => ({ snapshotHash: 'sha256:test' }),
    },
  };
}
