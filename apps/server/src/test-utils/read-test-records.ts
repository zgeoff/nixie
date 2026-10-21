import type { LogRecord } from '@heynixie/log';
import { readRecords, startWriter } from '@heynixie/log';

export async function readTestRecords(
  dataDir: string,
  deploymentKey: string,
): Promise<LogRecord[]> {
  const key = await crypto.subtle.importKey(
    'raw',
    Buffer.from(deploymentKey, 'base64'),
    'AES-KW',
    false,
    ['wrapKey', 'unwrapKey'],
  );

  const writer = await startWriter({ dataDir });

  try {
    const entries = await readRecords({ writer, deploymentKey: key }, { afterSequence: 0 });

    return entries.map((entry) => entry.record);
  } finally {
    await writer.stop();
  }
}
