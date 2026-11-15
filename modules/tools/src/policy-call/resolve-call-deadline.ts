import type { JSONObject } from '@heynixie/log';
import type { RegisteredTool, ToolRun } from '../types';

type DeadlineAnswer =
  | { readonly status: 'ok'; readonly deadlineAt: number | null }
  | { readonly status: 'error'; readonly message: string };

// The host sets a call's deadline from the tool's own resolver before the decision point runs. A tool
// without one has none, and the model's text never sets it.
export function resolveCallDeadline(
  registered: RegisteredTool,
  input: JSONObject,
  run: ToolRun,
): DeadlineAnswer | Promise<DeadlineAnswer> {
  const resolve = registered.definition.resolveDeadline;

  if (resolve === undefined) {
    return { status: 'ok', deadlineAt: null };
  }

  return resolve(input, { run });
}
