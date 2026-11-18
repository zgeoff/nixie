import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LoginFile } from './login-file-schema';

// A write goes through a second file and a rename, so a stop in the middle leaves the earlier file
// whole.
export async function writeLoginFile(path: string, login: LoginFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });

  const next = `${path}.next`;

  await writeFile(next, `${JSON.stringify(login, null, 2)}\n`, { mode: 0o600 });
  await rename(next, path);
}
