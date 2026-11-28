import type { JSONObject } from '@heynixie/log';
import type { ConnectionChoice } from '../call-record/tool-call-options';

// The input schema a pinned run lists for a tool that takes a `connection` argument. One reachable
// connection binds the call, so the argument goes. Two or more make it required, with one allowed
// value for each, described by its label and its account.
export function buildListedInput(
  input: JSONObject,
  reachable: readonly ConnectionChoice[],
): JSONObject {
  const { properties, required, ...rest } = input;

  if (
    reachable.length === 0 ||
    typeof properties !== 'object' ||
    properties === null ||
    Array.isArray(properties) ||
    !('connection' in properties)
  ) {
    return input;
  }

  const others = Object.fromEntries(
    Object.entries(properties).filter(([name]) => name !== 'connection'),
  );

  const kept = Array.isArray(required) ? required.filter((name) => name !== 'connection') : [];

  if (reachable.length === 1) {
    return { ...rest, properties: others, ...(Array.isArray(required) ? { required: kept } : {}) };
  }

  return {
    ...rest,
    properties: {
      ...others,
      connection: {
        oneOf: reachable.map((choice) => ({
          const: choice.connection,
          description: `${choice.label}: ${choice.account}`,
        })),
      },
    },
    required: [...kept, 'connection'],
  };
}
