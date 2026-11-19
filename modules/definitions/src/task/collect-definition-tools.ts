import { startedTaskBaseTools, startedTaskDefaultTools } from '@heynixie/tasks';
import { toSDKToolName } from '@heynixie/tools';

// The tools of a definition's task, as a task.start sets them: the base tools of every task, then
// the tools the definition lists, or the default tools when it lists none. A listed SDK name of a
// base tool is dropped, because the base tool holds it already.
export function collectDefinitionTools(listed: readonly string[] | undefined): readonly string[] {
  if (listed === undefined) {
    return startedTaskDefaultTools;
  }

  const baseSDKNames = new Set(startedTaskBaseTools.map((tool) => toSDKToolName(tool)));

  return [
    ...new Set([...startedTaskBaseTools, ...listed.filter((tool) => !baseSDKNames.has(tool))]),
  ];
}
