import type { Sandbox, SandboxAdapter } from '@heynixie/sandbox';
import { buildSandboxSpec, sandboxSizes } from '@heynixie/sandbox';
import { computerOwner } from '../computer/computer-owner';
import { writeDiskFiles } from './make-folder-exec';

export interface DesktopDiskDeps {
  readonly adapter: SandboxAdapter;

  // the folder that holds each sandbox's disk, as `makeFolderExec` takes it
  readonly root: string;
}

export interface DesktopDiskSeed {
  readonly image: string;

  // the files of the disk by guest path
  readonly files: Readonly<Record<string, string>>;
}

// Creates the computer's desktop sandbox on an image and puts files on its disk.
export async function seedDesktopDisk(
  deps: DesktopDiskDeps,
  seed: DesktopDiskSeed,
): Promise<Sandbox> {
  const sandbox = await deps.adapter.create(
    buildSandboxSpec({
      kind: 'computer',
      image: seed.image,
      owner: computerOwner,
      limits: sandboxSizes.computer,
    }),
  );

  await writeDiskFiles(deps.root, sandbox.id, seed.files);

  return sandbox;
}
