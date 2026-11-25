import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { devicePackageAddedCodec } from '../record/device-package-added-codec';
import type { DeviceToolOptions } from '../tool/device-tool-options';
import type { DeviceTables } from '../types';
import { getPackageDir } from './get-package-dir';
import type { UnpackedFile } from './write-package-files';
import { writePackageFiles } from './write-package-files';

interface PackageWrite {
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
  readonly publisher: string;
  readonly files: readonly UnpackedFile[];
  readonly thread: string;
}

// Stores an approved package: its files in the data folder, then in one transaction the record
// and the row that make it usable. A package that a crash left with files and no row is replaced
// by the next install.
export async function writeDevicePackage(
  options: Pick<DeviceToolOptions, 'log' | 'definitions'>,
  write: PackageWrite,
): Promise<void> {
  await writePackageFiles(
    getPackageDir(options.log.writer.dataDir, write.name, write.version),
    write.files,
  );

  const size = write.files.reduce((total, file) => total + file.bytes.byteLength, 0);

  await withWriteTransaction(options.log.writer, async (tx) => {
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
  });
}
