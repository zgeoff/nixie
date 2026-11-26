import type { Log } from '@heynixie/log';
import type { DeviceFetching } from '../tool/device-tool-options';
import { downloadPackage } from './download-package';
import { getPackageDir } from './get-package-dir';
import { readDevicePackages } from './read-device-packages';
import type { DevicePackage } from './types';
import { writePackageFiles } from './write-package-files';

export interface PackageRestoreOptions {
  readonly log: Pick<Log, 'writer'>;
  readonly fetching: DeviceFetching;
  readonly onFailure: (error: unknown) => void;
}

// Downloads again each approved package whose files are gone, as a restore from a backup leaves
// them, and checks each against the hash that was approved. A package that fails the check stays
// without files, and its pages find it missing until the next start tries again.
export async function restoreDevicePackages(options: PackageRestoreOptions): Promise<void> {
  for (const found of await readDevicePackages(options.log.writer.db)) {
    const directory = getPackageDir(options.log.writer.dataDir, found.name, found.version);

    const hasFiles = await probeFilesInPlace(directory, found);

    if (!hasFiles) {
      await restorePackage(options, directory, found);
    }
  }
}

function probeFilesInPlace(directory: string, found: DevicePackage): Promise<boolean> {
  const [first] = found.files;

  if (first === undefined) {
    return Promise.resolve(true);
  }

  return Bun.file(`${directory}/${first}`).exists();
}

async function restorePackage(
  options: PackageRestoreOptions,
  directory: string,
  found: DevicePackage,
): Promise<void> {
  try {
    const download = await downloadPackage(options.fetching, {
      name: found.name,
      version: found.version,
      integrity: found.integrity,
    });

    if (download.status === 'ok') {
      await writePackageFiles(directory, download.files);
    } else {
      options.onFailure(new Error(`${found.name}@${found.version}: ${download.reason}`));
    }
  } catch (error) {
    options.onFailure(error);
  }
}
