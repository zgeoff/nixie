import type { SandboxImageKey } from '@heynixie/sandbox';
import invariant from 'tiny-invariant';

export function getHarnessImage(
  images: Readonly<Partial<Record<SandboxImageKey, string>>>,
  imageKey: SandboxImageKey,
): string {
  const image = images[imageKey];

  invariant(image !== undefined, `the sandbox manifest holds no ${imageKey} image`);

  return image;
}
