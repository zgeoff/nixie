import { taskIDPattern } from '../task/task-id-pattern';
import type { DefinitionsChange } from '../types';
import type { StoredTaskDefinition } from './stored-task-definition';

export const taskExportBranch = 'nixie/tasks';

export interface TaskExportChange {
  readonly changeID: string;
  readonly definitionID: string;
  readonly operation: string;

  // the hashes the export ID covers
  readonly base: string | null;
  readonly definitions: string | null;

  // null for an undefine
  readonly version: StoredTaskDefinition | null;
}

export interface TaskExportInput {
  readonly changes: readonly TaskExportChange[];

  // for each definition ID, the paths of its repo folder, relative to the folder
  readonly folders: ReadonlyMap<string, readonly string[]>;
}

// Every write and delete stays inside tasks/<id>/ of its own definition, so an export never
// touches a file of another definition or of any other kind of definition.
export function buildTaskExportChange(input: TaskExportInput): DefinitionsChange {
  const files = new Map<string, string | null>();

  for (const change of input.changes) {
    const folder = `tasks/${change.definitionID}/`;

    if (!taskIDPattern.test(change.definitionID)) {
      throw new Error(`${change.definitionID} is not a definition ID, so it names no folder`);
    }

    const heldPaths = change.version === null ? [] : Object.keys(change.version.files);

    const held = new Set(heldPaths);

    for (const path of held) {
      if (!path.startsWith(folder)) {
        throw new Error(`the version of ${change.definitionID} holds ${path}, outside ${folder}`);
      }
    }

    for (const path of held) {
      files.set(path, change.version?.files[path] ?? null);
    }

    for (const relative of input.folders.get(change.definitionID) ?? []) {
      const path = `${folder}${relative}`;

      if (!held.has(path)) {
        files.set(path, null);
      }
    }
  }

  const title = 'Update the task definitions nixie changed';

  return {
    branch: taskExportBranch,
    title,
    message: title,
    body: renderBody(input.changes),
    files,
  };
}

function renderBody(changes: readonly TaskExportChange[]): string {
  const lines = changes.map((change) => {
    const formName = change.version?.form['name'];
    const name = typeof formName === 'string' ? ` (${formName})` : '';

    return `- \`${change.definitionID}\`: ${change.operation}${name}`;
  });

  return [
    'nixie changed these task definitions while it ran. Each change is already in force, and merging this pull request makes your definitions hold it.',
    '',
    ...lines,
  ].join('\n');
}
