import { parsePackageSpec } from '@heynixie/contract';
import type { Log } from '@heynixie/log';
import type { RenderFile } from '@heynixie/wire';
import { getPackageDir } from '../package/get-package-dir';
import { pickMediaType } from '../package/pick-media-type';
import { readDevicePackage } from '../package/read-device-packages';
import type { DevicePackage } from '../package/types';

// The render files of each approved package that the pages of a layout name, by the spec. A package
// that nobody approved has none.
export async function readPreviewPackages(
  log: Pick<Log, 'writer'>,
  specs: readonly string[],
): Promise<ReadonlyMap<string, readonly RenderFile[]>> {
  const packages = new Map<string, readonly RenderFile[]>();

  for (const spec of new Set(specs)) {
    const parsed = parsePackageSpec(spec);

    const found =
      parsed === null ? null : await readDevicePackage(log.writer.db, parsed.name, parsed.version);

    if (found !== null) {
      const files = await readPackageRenderFiles(log, found);

      packages.set(spec, files);
    }
  }

  return packages;
}

// the longest path that a render file holds
const renderPathLimit = 256;

// A file whose path would pass the render's limit is left out.
async function readPackageRenderFiles(
  log: Pick<Log, 'writer'>,
  found: DevicePackage,
): Promise<readonly RenderFile[]> {
  const directory = getPackageDir(log.writer.dataDir, found.name, found.version);
  const files: RenderFile[] = [];

  for (const path of found.files) {
    const renderPath = `packages/${found.name}@${found.version}/${path}`;
    const file = Bun.file(`${directory}/${path}`);

    const isExisting = await file.exists();

    if (isExisting && renderPath.length <= renderPathLimit) {
      const bytes = await file.bytes();

      files.push({
        path: renderPath,
        mediaType: pickMediaType(path).split(';')[0] ?? 'application/octet-stream',
        base64: Buffer.from(bytes).toString('base64'),
      });
    }
  }

  return files;
}
