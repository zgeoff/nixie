import type { DeviceFetching } from '../tool/device-tool-options';
import { buildMetadataURL } from './build-metadata-url';
import { parsePackageMetadata } from './parse-package-metadata';
import { scanRegistryHop } from './scan-registry-hop';
import type { PackageMetadata } from './types';

export type PackageMetadataRead =
  | { readonly status: 'found'; readonly metadata: PackageMetadata }
  | { readonly status: 'unknown' }
  | { readonly status: 'failed'; readonly reason: string };

// Reads the registry's document for one version through the fetch sandbox. A redirect to another
// host fails the read, so the document always comes from the registry itself.
export async function readPackageMetadata(
  fetching: DeviceFetching,
  name: string,
  version: string,
): Promise<PackageMetadataRead> {
  const url = buildMetadataURL(fetching.registry, name, version);

  const host = new URL(url).host;

  const reply = await fetching.readBody(url, {
    scanHop: (hop) => Promise.resolve(scanRegistryHop(hop.url, host)),
  });

  if (reply.kind === 'refused' || reply.kind === 'failed') {
    return { status: 'failed', reason: reply.reason };
  }

  if (reply.kind !== 'body') {
    return { status: 'failed', reason: 'the fetcher answered with a reply no read asks for' };
  }

  if (reply.status === 404) {
    return { status: 'unknown' };
  }

  const metadata =
    reply.status === 200 && !reply.isTruncated
      ? parsePackageMetadata(reply.text, name, version)
      : null;

  if (metadata === null) {
    return {
      status: 'failed',
      reason: `the registry answered ${String(reply.status)} with no usable document`,
    };
  }

  return { status: 'found', metadata };
}
