import { collectTaskFolders } from './collect-task-folders';
import { parseTaskFolder } from './parse-task-folder';
import type { TaskDefinitions, TaskSeedContext } from './types';

// Reads the decoded texts and never the source, so a test checks a definition that lives in no repo.
export function parseTaskDefinitions(
  texts: ReadonlyMap<string, string>,
  context: TaskSeedContext,
): TaskDefinitions {
  const outcomes = collectTaskFolders(texts).map((folder) => parseTaskFolder(folder, context));

  const definitions = outcomes.flatMap((outcome) =>
    outcome.definition === null ? [] : [outcome.definition],
  );

  return {
    definitions,
    warnings: outcomes.flatMap((outcome) => outcome.warnings),
    faults: outcomes.flatMap((outcome) => outcome.faults),
    paths: new Set(definitions.flatMap((definition) => Object.keys(definition.files))),
  };
}
