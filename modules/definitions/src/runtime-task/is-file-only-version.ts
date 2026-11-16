import type { JSONObject, JSONValue } from '@heynixie/log';
import { definitionOnlySchema, maxCallsSchema } from '../task/definition-only-schema';
import { toCanonicalJSON } from '../utils/to-canonical-json';

const fileOnlyFiles = new Set(['instructions.md']);

const defaults: Readonly<Record<string, JSONValue>> = {
  ...definitionOnlySchema
    .pick({ context: true, wakeable: true, step: true, destinations: true })
    .parse({}),
  maxCalls: maxCallsSchema.parse(undefined),
};

// The keys that the task schema does not default yet: a version that sets one, or sets `log` to
// anything but its own grant, holds a file-only key.
const unsetKeys = ['reportShape'];

interface FileOnlyCandidate {
  readonly form: JSONObject;
  readonly files: Readonly<Record<string, string>>;
}

// True when a version holds a key that task.define cannot set at a value other than its default, or
// holds a file that task.define cannot write: instructions.md or a step file.
export function isFileOnlyVersion(version: FileOnlyCandidate): boolean {
  const hasFile = Object.keys(version.files).some((path) => {
    const name = path.slice(path.lastIndexOf('/') + 1);

    return fileOnlyFiles.has(name) || name.endsWith('.ts');
  });

  const hasKey =
    Object.entries(defaults).some(
      ([key, value]) =>
        key in version.form &&
        toCanonicalJSON(version.form[key] ?? null) !== toCanonicalJSON(value),
    ) ||
    unsetKeys.some((key) => version.form[key] !== undefined && version.form[key] !== null) ||
    (version.form['log'] !== undefined && version.form['log'] !== 'own');

  return hasFile || hasKey;
}
