import { actionsProjection } from '../../modules/actions/src/index';
import { logProjections, startWriter } from '../../modules/log/src/index';
import type { Writer } from '../../modules/log/src/index';
import { memoryProjections } from '../../modules/memory/src/index';
import { sandboxesProjection } from '../../modules/sandbox/src/index';
import type { Clock, TasksContext } from '../../modules/tasks/src/index';
import { tasksProjections } from '../../modules/tasks/src/index';

interface TestLogOptions {
  readonly dataDir: string;

  // the raw AES-KW deployment key, base64, which every start on the data directory shares
  readonly deploymentKey: string;
  readonly clock: Clock;
}

export interface TestLog {
  readonly writer: Writer;
  readonly context: TasksContext;
}

// Takes the writer on the data directory and builds the context that the test build of nixie and
// the crash tests' oracle share: every slice 1 projection, memory's, the deployment key and the
// clock.
export async function startTestLog(options: TestLogOptions): Promise<TestLog> {
  const writer = await startWriter({ dataDir: options.dataDir });

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
