import type { SandboxImageKey } from '@heynixie/sandbox';
import { sandboxImageKeys } from '@heynixie/sandbox';
import type { ImageNeed } from './list-image-needs';
import type { SandboxImages } from './load-sandbox-manifest';
import { pickNeededImages } from './pick-needed-images';

// The body of `nixie sandbox-manifest`: every image, or with needs, the needed ones.
export function printSandboxManifest(
  images: SandboxImages,
  needs: readonly ImageNeed[] | null,
): string {
  const shown = needs === null ? images : pickNeededImages(images, needs);
  const printed: Partial<Record<SandboxImageKey, { name: string; ref: string }>> = {};

  for (const key of sandboxImageKeys) {
    const image = shown[key];

    if (image !== undefined) {
      printed[key] = { name: image.name, ref: image.ref };
    }
  }

  return JSON.stringify(printed);
}
