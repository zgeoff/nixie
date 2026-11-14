import { join } from 'node:path';

export function getSandboxRootDir(dataDir: string): string {
  return join(dataDir, 'sandboxes');
}
