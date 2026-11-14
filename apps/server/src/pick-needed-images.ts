import type { SandboxImageKey } from '@heynixie/sandbox';
import type { ImageNeed } from './list-image-needs';
import type { SandboxImages } from './load-sandbox-manifest';

// Returns the images that the needs name, or throws one refusal that holds each missing image and
// what needs it.
export function pickNeededImages(
  images: SandboxImages,
  needs: readonly ImageNeed[],
): SandboxImages {
  const missing = needs.filter((need) => images[need.key] === undefined);

  if (missing.length > 0) {
    const held = Object.keys(images);
    const holds = held.length === 0 ? 'holds no image' : `holds ${held.join(', ')}`;
    const lines = missing.map((need) => `${need.neededBy} needs the ${need.key} image`);

    throw new Error(
      `nixie refuses to start: ${lines.join('; ')}, and the sandbox manifest ${holds}`,
    );
  }

  const picked: Partial<Record<SandboxImageKey, NonNullable<SandboxImages[SandboxImageKey]>>> = {};

  for (const need of needs) {
    const image = images[need.key];

    if (image !== undefined) {
      picked[need.key] = image;
    }
  }

  return picked;
}
