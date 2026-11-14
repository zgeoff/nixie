import { readFile } from 'node:fs/promises';
import type { SandboxImage, SandboxImageKey } from '@heynixie/sandbox';
import { sandboxImageKeys } from '@heynixie/sandbox';
import { z } from 'zod';
import { buildImageShape } from './build-image-shape';

export const imageRefSchema = z
  .string()
  .regex(/^[^\s@]+@sha256:[\da-f]{64}$/u, 'an image reference pinned by digest');

const manifestSchema = buildImageShape(sandboxImageKeys, imageRefSchema, 'optional');

export type SandboxImages = Readonly<Partial<Record<SandboxImageKey, SandboxImage>>>;

export async function loadSandboxManifest(path: string): Promise<SandboxImages> {
  const text = await readFile(path, 'utf8');

  const result = manifestSchema.safeParse(JSON.parse(text));

  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

    throw new Error(`nixie refuses the sandbox manifest in ${path}:\n${issues.join('\n')}`);
  }

  const images: Partial<Record<SandboxImageKey, SandboxImage>> = {};

  for (const key of sandboxImageKeys) {
    const ref = result.data[key];

    if (ref !== undefined) {
      images[key] = buildImage(key, ref);
    }
  }

  return images;
}

function buildImage(key: SandboxImageKey, ref: string): SandboxImage {
  const digest = ref.slice(ref.indexOf('@sha256:') + '@sha256:'.length);

  return { name: `nixie-${key}-${digest.slice(0, 12)}`, ref };
}
