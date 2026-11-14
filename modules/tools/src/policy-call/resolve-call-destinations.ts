import type { JSONObject, JSONValue } from '@heynixie/log';
import type { CallDestination } from '@heynixie/policy';
import type { DestinationResolution, RegisteredTool, ToolRun } from '../types';

// The host resolves each destination before the decision point sees the call. A tool's own
// resolver wins. Otherwise each argument the declaration names holds one destination or a list,
// and the model's text is never a reply target.
export function resolveCallDestinations(
  registered: RegisteredTool,
  input: JSONObject,
  run: ToolRun,
): DestinationResolution | Promise<DestinationResolution> {
  const definition = registered.definition;

  if (definition.resolveDestinations !== undefined) {
    return definition.resolveDestinations(input, { run });
  }

  const found: CallDestination[] = [];

  for (const argument of definition.declaration.destinations) {
    const values = collectArgumentValues(input[argument]);

    if (values === null) {
      return {
        status: 'error',
        message: `the argument ${argument} must be text, or a list of text, to name a destination`,
      };
    }

    found.push(...values.map((value) => ({ value: value.normalize('NFC'), replyTarget: false })));
  }

  return { status: 'ok', destinations: found };
}

function collectArgumentValues(value: JSONValue | undefined): readonly string[] | null {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value) && value.every((item): item is string => typeof item === 'string')) {
    return value;
  }

  return null;
}
