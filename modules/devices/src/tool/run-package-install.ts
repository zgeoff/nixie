import type { ToolOutcome } from '@heynixie/tools';
import { downloadPackage } from '../package/download-package';
import { readPackageCard } from '../package/package-card';
import { writeDevicePackage } from '../package/write-device-package';
import type { DeviceToolOptions } from './device-tool-options';
import { readAddPackageCall } from './read-add-package-call';
import { refuseDevice } from './refuse-device';

// the most file paths that a result lists
export const listedFilesLimit = 200;

// the call record that asked for a package, and the thread it sits on
export interface PackageCallSource {
  readonly callSequence: number;
  readonly thread: string;
}

// Installs the package of an approved call: it downloads only the hash that the call's card showed
// the owner, and stores the files once they match it.
export async function runPackageInstall(
  options: DeviceToolOptions,
  input: unknown,
  source: PackageCallSource,
): Promise<ToolOutcome> {
  const found = await readAddPackageCall(options, input);

  if (found.status === 'invalid') {
    return { status: 'error', message: found.message };
  }

  if (found.status === 'refused') {
    return { status: 'ok', ...found.result };
  }

  const approved = await readPackageCard(options.log, source.callSequence);

  if (approved === null) {
    return { status: 'error', message: 'the call holds no card of the approved package' };
  }

  if (approved.integrity !== found.metadata.integrity) {
    return { status: 'ok', ...refuseDevice('INTEGRITY_CHANGED') };
  }

  const download = await downloadPackage(found.fetching, {
    name: approved.name,
    version: approved.version,
    integrity: approved.integrity,
  });

  if (download.status === 'failed') {
    return { status: 'ok', ...refuseDevice('REGISTRY_UNAVAILABLE', download.reason) };
  }

  if (download.status === 'refused') {
    return { status: 'ok', ...refuseDevice('BAD_PACKAGE', download.reason) };
  }

  const outcome = await writeDevicePackage(options, {
    name: approved.name,
    version: approved.version,
    integrity: approved.integrity,
    publisher: approved.publisher,
    files: download.files,
    thread: source.thread,
  });

  if (outcome === 'known') {
    return { status: 'ok', ...refuseDevice('PACKAGE_KNOWN') };
  }

  const paths = download.files.map((file) => file.path).toSorted();

  return {
    status: 'ok',
    result: {
      package: `${approved.name}@${approved.version}`,
      files: paths.slice(0, listedFilesLimit),
      fileCount: paths.length,
    },
  };
}
