import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { devicePackageAddedCodec } from '../record/device-package-added-codec';
import type { DeviceToolOptions } from '../tool/device-tool-options';
import type { DeviceTables } from '../types';
import { getPackageDir } from './get-package-dir';
import { movePackageStaging } from './move-package-staging';
import { removePackageStaging } from './remove-package-staging';
import type { UnpackedFile } from './types';
import { writePackageStaging } from './write-package-staging';

interface PackageWrite {
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
  readonly publisher: string;
  readonly files: readonly UnpackedFile[];
  readonly thread: string;
}

export type PackageWriteOutcome = 'written' | 'known';

// Stores an approved package: the files wait in a staging folder while one transaction writes the
// record and the row, and only the call whose row went in moves them into place, so the files
// served always match the hash that the row pins.
export async function writeDevicePackage(
  options: Pick<DeviceToolOptions, 'log' | 'definitions'>,
  write: PackageWrite,
): Promise<PackageWriteOutcome> {
  const directory = getPackageDir(options.log.writer.dataDir, write.name, write.version);

  const staging = await writePackageStaging(directory, write.files);

  const size = write.files.reduce((total, file) => total + file.bytes.byteLength, 0);

  try {
    const outcome = await withWriteTransaction(options.log.writer, async (tx) => {
      const known = await tx
        .$extendTables<DeviceTables>()
        .selectFrom('device_packages')
        .select('package_id')
        .where('package_id', '=', `${write.name}@${write.version}`)
        .executeTakeFirst();

      if (known !== undefined) {
        return 'known' as const;
      }

      const [record] = await writeRecordsInTransaction(tx, options.log, [
        {
          kind: devicePackageAddedCodec.kind,
          definitions: options.definitions(),
          thread: write.thread,
          payload: devicePackageAddedCodec.encode({
            name: write.name,
            version: write.version,
            integrity: write.integrity,
            size,
            publisher: write.publisher,
          }),
        },
      ]);

      invariant(record, 'the log wrote no device.package_added record');

      await tx
        .$extendTables<DeviceTables>()
        .insertInto('device_packages')
        .values({
          package_id: `${write.name}@${write.version}`,
          name: write.name,
          version: write.version,
          integrity: write.integrity,
          unpacked_bytes: size,
          publisher: write.publisher,
          files: JSON.stringify(write.files.map((file) => file.path)),
          added_sequence: record.sequence,
        })
        .execute();

      return 'written' as const;
    });

    if (outcome === 'written') {
      await movePackageStaging(staging, directory);
    }

    return outcome;
  } finally {
    await removePackageStaging(staging);
  }
}
