import { readFile } from 'node:fs/promises';
import type { SandboxImage } from '@heynixie/sandbox';
import { z } from 'zod';

const refSchema = z
  .string()
  .regex(/^[^\s@]+@sha256:[\da-f]{64}$/u, 'an image reference pinned by digest');

// The sandbox manifest the release workflow writes into the nixie image: each slice 1 sandbox kind
// mapped to its image by digest. No commit holds it, so the nixie image and its sandbox images come
// from one commit.
const manifestSchema = z.strictObject({ conversation: refSchema, fetch: refSchema });

export type SandboxImages = Readonly<Record<keyof z.infer<typeof manifestSchema>, SandboxImage>>;

// Loads the sandbox manifest and names each image by its kind and the head of its digest, so a
// release's images sit beside the previous release's in impd, and a changed digest changes the
// name a spec gives, which replaces the sandbox.
export async function loadSandboxManifest(path: string): Promise<SandboxImages> {
  const text = await readFile(path, 'utf8');

  const result = manifestSchema.safeParse(JSON.parse(text));

  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

    throw new Error(`nixie refuses the sandbox manifest in ${path}:\n${issues.join('\n')}`);
  }

  return {
    conversation: buildImage('conversation', result.data.conversation),
    fetch: buildImage('fetch', result.data.fetch),
  };
}

function buildImage(kind: string, ref: string): SandboxImage {
  const digest = ref.slice(ref.indexOf('@sha256:') + '@sha256:'.length);

  return { name: `nixie-${kind}-${digest.slice(0, 12)}`, ref };
}
