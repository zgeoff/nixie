import type { Clock } from '@heynixie/clock';
import { startWriter } from '@heynixie/log';
import type { Writer } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { buildServerLog } from '../build-server-log';

interface DataLogOptions {
  readonly dataDir: string;

  readonly deploymentKey: string;
  readonly clock: Clock;
}

export interface DataLog {
  readonly writer: Writer;
  readonly context: TasksContext;
}

export async function startDataLog(options: DataLogOptions): Promise<DataLog> {
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
      log: buildServerLog(writer, deploymentKey),
      clock: options.clock,
      definitions: () => ({ snapshotHash: 'sha256:test' }),
    },
  };
}
