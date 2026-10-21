import { readFile } from 'node:fs/promises';
import type { SandboxImage } from '@heynixie/sandbox';
import { z } from 'zod';

const refSchema = z
  .string()
  .regex(/^[^\s@]+@sha256:[\da-f]{64}$/u, 'an image reference pinned by digest');

const manifestSchema = z.strictObject({ conversation: refSchema, fetch: refSchema });

export type SandboxImages = Readonly<Record<keyof z.infer<typeof manifestSchema>, SandboxImage>>;

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
