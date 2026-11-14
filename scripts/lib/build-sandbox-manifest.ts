import { sandboxImageKeys } from '../../modules/sandbox/src/sandbox-image-keys.ts';

// The sandbox manifest that the nixie image carries: each image key with its ref,
// <repository>@sha256:<digest>, in key order. A key with no ref and a ref with no key are faults of
// the workflow that gathered the refs.
export function buildSandboxManifest(refs: Readonly<Record<string, string>>): string {
  const keys: readonly string[] = sandboxImageKeys;

  for (const key of sandboxImageKeys) {
    if (refs[key] === undefined) {
      throw new Error(`no ref for the sandbox image key ${key}`);
    }
  }

  for (const key of Object.keys(refs)) {
    if (!keys.includes(key)) {
      throw new Error(`a ref for ${key}, which is not a sandbox image key`);
    }
  }

  return JSON.stringify(Object.fromEntries(sandboxImageKeys.map((key) => [key, refs[key]])));
}
