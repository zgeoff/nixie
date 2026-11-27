import { Environment } from '@marcbachmann/cel-js';
import {
  maxConditionCallArguments,
  maxConditionDepth,
  maxConditionListElements,
  maxConditionNodes,
} from './constants';

// The environment registers no function of its own and no async function. Every name a condition
// reads is declared here, and an undeclared one fails the type check.
export function makeConditionEnvironment(): Environment {
  return new Environment({
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
}
