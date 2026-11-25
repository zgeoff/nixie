import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import { writeDevicePackage } from '../package/write-device-package';
import type { DeviceStreams } from '../stream/create-device-streams';
import { toTestIntegrity } from './build-test-fetching';

export interface DevicePackageSeedDeps {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: Clock;
  readonly streams: DeviceStreams;
}

// Stores an approved package as an install leaves it, with the text of each file by path.
export function seedDevicePackage(
  deps: DevicePackageSeedDeps,
  spec: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  const at = spec.lastIndexOf('@');

  return writeDevicePackage(deps, {
    name: spec.slice(0, at),
    version: spec.slice(at + 1),
    integrity: toTestIntegrity(files),
    publisher: 'a-publisher',
    files: Object.entries(files).map(([path, text]) => ({
      path,
      bytes: new TextEncoder().encode(text),
    })),
    thread: 'conversation',
  });
}
