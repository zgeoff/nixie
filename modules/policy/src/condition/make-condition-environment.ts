import { Environment } from '@marcbachmann/cel-js';
import {
  listReceiverFunctionName,
  maxConditionCallArguments,
  maxConditionDepth,
  maxConditionListElements,
  maxConditionNodes,
  timeParts,
  zonedFunctionNames,
} from './constants';
import { getZonedPart } from './get-zoned-part';

class ListReceiverError extends Error {
  override readonly name = 'ListReceiverError';

  readonly code = 'invalid_comprehension_range';
}

// The environment registers no async function. Every name a condition reads is declared here, and
// an undeclared one fails the type check. The room in nodes and depth is for the receiver wrappers.
export function makeConditionEnvironment(wrapperRoom = 0): Environment {
  const environment = new Environment({
    unlistedVariablesAreDyn: false,
    limits: {
      maxAstNodes: maxConditionNodes + wrapperRoom,
      maxDepth: maxConditionDepth + wrapperRoom,
      maxListElements: maxConditionListElements,
      maxCallArguments: maxConditionCallArguments,
    },
  })
    .registerVariable('tool', 'string')
    .registerVariable('effects', 'list<string>')
    .registerVariable('context', 'string')
    .registerVariable('definition', 'string')
    .registerVariable('args', 'map<string, dyn>')
    .registerVariable('destinations', 'list<string>')
    .registerVariable('sources', 'list<string>')
    .registerVariable('now', 'google.protobuf.Timestamp');

  // The built-in methods of a timestamp with a zone depend on the host's zone, so a condition
  // that names a zone runs these in their place, as rewriteTimeMethods arranges.
  for (const part of timeParts) {
    environment.registerFunction(
      `google.protobuf.Timestamp.${zonedFunctionNames[part]}(string): int`,
      (instant: Date, zone: string) => getZonedPart(instant, zone, part),
    );
  }

  environment.registerFunction(`${listReceiverFunctionName}(dyn): list<dyn>`, (value: unknown) => {
    if (!Array.isArray(value)) {
      throw new ListReceiverError();
    }

    const items: unknown[] = value;

    return items;
  });

  return environment;
}
