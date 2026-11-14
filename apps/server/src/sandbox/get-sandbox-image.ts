import type { SandboxImage, SandboxImageKey } from '@heynixie/sandbox';
import invariant from 'tiny-invariant';
import type { SandboxImages } from './load-sandbox-manifest';

export function getSandboxImage(images: SandboxImages, key: SandboxImageKey): SandboxImage {
  const image = images[key];

  invariant(image !== undefined, `the sandbox manifest holds no ${key} image`);

  return image;
}
