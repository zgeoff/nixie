import { scanSameHostHop } from '../fetch/scan-same-host-hop';
import type { DeviceFetching } from '../tool/device-tool-options';
import { buildTarballURL } from './build-tarball-url';
import type { UnpackedFile } from './types';

// the most bytes that a package holds once unpacked
export const maxPackageBytes = 5 * 1024 * 1024;

export interface PackageDownloadRequest {
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
}

export type PackageDownload =
  | { readonly status: 'ok'; readonly files: readonly UnpackedFile[] }
  | { readonly status: 'refused'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string };

// Has the fetch sandbox download the tarball and unpack it, once its hash matches the integrity
// that was approved. The sandbox refuses the whole package for a link, an unsafe path or a size
// past 5 MiB, and returns no file of it. A redirect that leaves the registry host or https fails the download.
export async function downloadPackage(
  fetching: DeviceFetching,
  request: PackageDownloadRequest,
): Promise<PackageDownload> {
  const url = buildTarballURL(fetching.registry, request.name, request.version);

  const host = new URL(url).host;

  const reply = await fetching.readPackage(
    url,
    { kind: 'package', integrity: request.integrity, unpackedBytes: maxPackageBytes },
    {
      scanHop: (hop) => Promise.resolve(scanSameHostHop({ url: hop.url, host }, fetching.scanURL)),
    },
  );

  if (reply.kind === 'refused') {
    return { status: 'refused', reason: reply.reason };
  }

  if (reply.kind === 'failed') {
    return { status: 'failed', reason: reply.reason };
  }

  return {
    status: 'ok',
    files: reply.files.map((file) => ({
      path: file.path,
      bytes: Buffer.from(file.base64, 'base64'),
    })),
  };
}
