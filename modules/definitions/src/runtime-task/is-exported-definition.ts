import type { StoredTaskDefinition } from './stored-task-definition';

// An undefine has no version and always exports. A one-shot fires once and retires, so the
// user's definitions never keep it.
export function isExportedDefinition(version: StoredTaskDefinition | null): boolean {
  if (version === null) {
    return true;
  }

  const trigger = version.form['trigger'];

  return !(typeof trigger === 'object' && trigger !== null && 'at' in trigger);
}
