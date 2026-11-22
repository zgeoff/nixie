import { join } from 'node:path';
import type { Sandbox } from '@heynixie/sandbox';
import type { ComputerKind } from './types';

// what each kind keeps on its disk, under the guest's home
const keptFolders: Readonly<Record<ComputerKind, string>> = {
  browser: 'profile',
  shell: 'files',
};

// Copies the profile or the files of one sandbox into another, after the old guest has stopped.
export async function copyComputerDisk(
  from: Sandbox,
  to: Sandbox,
  kind: ComputerKind,
): Promise<void> {
  const fromHome = await from.resolveHome({});
  const toHome = await to.resolveHome({});

  const source = join(fromHome.copyPath, keptFolders[kind]);

  const paths = await from.readFilePaths(source);

  if (paths.length === 0) {
    return;
  }

  const files = await from.copyOut(paths);

  await to.copyIn(
    files.map((file) => ({
      path: join(toHome.copyPath, keptFolders[kind], file.path.slice(source.length)),
      content: file.content,
    })),
  );
}
