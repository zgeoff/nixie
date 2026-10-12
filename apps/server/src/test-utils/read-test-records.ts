import type { LogRecord } from '@heynixie/log';
import { readRecords, startWriter } from '@heynixie/log';

// Reads every record of a stopped nixie's data directory with its erasable fields, decrypted with
// the deployment key that the secrets file held as base64.
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

  // the key imports first, so a bad key leaves no writer open
  const writer = await startWriter({ dataDir });

  try {
    const entries = await readRecords({ writer, deploymentKey: key }, { afterSequence: 0 });

    return entries.map((entry) => entry.record);
  } finally {
    await writer.stop();
  }
}
