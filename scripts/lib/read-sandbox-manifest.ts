import { readFileSync } from 'node:fs';

// The refs of a sandbox manifest, in the file's order.
export function parseSandboxManifest(text: string): Record<string, string> {
  const manifest: unknown = JSON.parse(text);

  if (typeof manifest !== 'object' || manifest === null) {
    throw new TypeError('the sandbox manifest is not an object');
  }

  const refs: Record<string, string> = {};

  for (const [key, ref] of Object.entries(manifest)) {
    if (typeof ref !== 'string') {
      throw new TypeError(`the sandbox manifest holds no ref for ${key}`);
    }

    refs[key] = ref;
  }

  return refs;
}

export function readSandboxManifest(path: string): Record<string, string> {
  return parseSandboxManifest(readFileSync(path, 'utf8'));
}
