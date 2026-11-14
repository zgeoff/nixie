import { logProjections, startWriter } from '@heynixie/log';
import type { SessionDeliveries } from '@heynixie/sessions';
import { readSessionDeliveries } from '@heynixie/sessions';

export async function readTestSessionDeliveries(
  dataDir: string,
  deploymentKey: string,
  taskID: string,
): Promise<SessionDeliveries> {
  const key = await crypto.subtle.importKey(
    'raw',
    Buffer.from(deploymentKey, 'base64'),
    'AES-KW',
    false,
    ['wrapKey', 'unwrapKey'],
  );

  const writer = await startWriter({ dataDir });

  try {
    return await readSessionDeliveries(
      { log: { writer, deploymentKey: key, projections: logProjections } },
      taskID,
    );
  } finally {
    await writer.stop();
  }
}
