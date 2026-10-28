import { join } from 'node:path';

// Chrome binds its singleton socket at <TMPDIR>/org.chromium.Chromium.XXXXXX/SingletonSocket and
// stops at startup when that path passes the 107 bytes a Unix socket address holds.
const SOCKET_PATH_MAX_BYTES = 107;
const socketSuffix = '/org.chromium.Chromium.XXXXXX/SingletonSocket';

export function pickChromeTmpdir(tmpdir: string, runID: string): string {
  const preferred = join(tmpdir, 'nixie-browser-chrome', runID);

  return Buffer.byteLength(`${preferred}${socketSuffix}`) <= SOCKET_PATH_MAX_BYTES
    ? preferred
    : join('/tmp', 'nixie-browser-chrome', runID);
}
