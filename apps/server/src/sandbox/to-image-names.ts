import type { SandboxImageKey } from '@heynixie/sandbox';
import { sandboxImageKeys } from '@heynixie/sandbox';
import type { SandboxImages } from './load-sandbox-manifest';

export function toImageNames(
  images: SandboxImages,
): Readonly<Partial<Record<SandboxImageKey, string>>> {
  const names: Partial<Record<SandboxImageKey, string>> = {};

  for (const key of sandboxImageKeys) {
    const image = images[key];

    if (image !== undefined) {
      names[key] = image.name;
    }
  }

  return names;
}
