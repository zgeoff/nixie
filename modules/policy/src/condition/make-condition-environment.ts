import { Environment } from '@marcbachmann/cel-js';
import {
  maxConditionCallArguments,
  maxConditionDepth,
  maxConditionListElements,
  maxConditionNodes,
  timeParts,
  zonedFunctionNames,
} from './constants';
import { getZonedPart } from './get-zoned-part';

// The environment registers no async function. Every name a condition reads is declared here, and
// an undeclared one fails the type check.
export function makeConditionEnvironment(): Environment {
  const environment = new Environment({
    unlistedVariablesAreDyn: false,
    limits: {
      maxAstNodes: maxConditionNodes,
      maxDepth: maxConditionDepth,
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

  return environment;
}
