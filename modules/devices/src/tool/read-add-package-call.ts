import { packageInputSchema } from '@heynixie/contract';
import { z } from 'zod';
import { maxPackageBytes } from '../package/download-package';
import { readDevicePackage } from '../package/read-device-packages';
import { readPackageMetadata } from '../package/read-package-metadata';
import type { PackageMetadata } from '../package/types';
import type { DeviceToolOptions } from './device-tool-options';
import { refuseDevice } from './refuse-device';

type AddPackageCall =
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'refused'; readonly result: ReturnType<typeof refuseDevice> }
  | {
      readonly status: 'ready';
      readonly fetching: NonNullable<DeviceToolOptions['fetching']>;
      readonly metadata: PackageMetadata;
    };

// What a package call needs as of now: the package the call names, and what the registry says of
// it. The registry is read each time, so a call that waited for approval meets the hash of the day.
export async function readAddPackageCall(
  options: DeviceToolOptions,
  input: unknown,
): Promise<AddPackageCall> {
  const parsed = packageInputSchema.safeParse(input);

  if (!parsed.success) {
    return { status: 'invalid', message: z.prettifyError(parsed.error) };
  }

  const fetching = options.fetching;

  if (fetching === undefined) {
    return { status: 'refused', result: refuseDevice('PACKAGES_UNAVAILABLE') };
  }

  const name = parsed.data.name;
  const version = parsed.data.version;

  if ((await readDevicePackage(options.log.writer.db, name, version)) !== null) {
    return { status: 'refused', result: refuseDevice('PACKAGE_KNOWN') };
  }

  const read = await readPackageMetadata(fetching, name, version);

  if (read.status === 'unknown') {
    return { status: 'refused', result: refuseDevice('UNKNOWN_PACKAGE') };
  }

  if (read.status === 'failed') {
    return { status: 'refused', result: refuseDevice('REGISTRY_UNAVAILABLE', read.reason) };
  }

  if ((read.metadata.unpackedBytes ?? 0) > maxPackageBytes) {
    return { status: 'refused', result: refuseDevice('TOO_BIG') };
  }

  return { status: 'ready', fetching, metadata: read.metadata };
}
