import type { JSONObject } from '@heynixie/log';
import type { DirectResult, RegisteredTool, ResultSources } from '../types';
import { buildHiddenFields } from './build-hidden-fields';
import { buildMessage } from './build-message';
import type { Settled } from './types';

export function buildTypedResult(
  registered: RegisteredTool,
  typed: DirectResult,
  actionID: string | null,
): Settled {
  const result = typed.result;

  // a result that reports its service's own failure holds that service's text, whatever the schema
  const checked = typed.isError === true ? null : registered.parseOutput(result);

  if (checked !== null && !checked.isValid) {
    const messageOptions = actionID === null ? {} : { actionID };

    return buildMessage(
      'error',
      `the tool ${registered.definition.name} returned a result outside its output schema: ${checked.errors}`,
      messageOptions,
    );
  }

  return {
    outcome: 'result',
    actionID,
    sources: completeSources(registered.definition.declaration.results, result),
    content: buildResultFields(typed, result),
    reply: {
      kind: 'typed',
      result,
      images: typed.images ?? [],
      ...(typed.isError === undefined ? {} : { isError: true as const }),
    },
    ...(typed.endsTurn === undefined ? {} : { endsTurn: true as const }),
    ...(typed.refusalCode === undefined ? {} : { refusalCode: typed.refusalCode }),
    ...(typed.attachments === undefined ? {} : { attachments: typed.attachments }),
    ...(typed.writeBeside === undefined ? {} : { writeBeside: typed.writeBeside }),
  };
}

// A field of the result that the declaration names no source for came from outside the tool's own
// code, so it counts as untrusted.
function completeSources(declared: ResultSources, result: JSONObject): ResultSources {
  const undeclared = Object.keys(result).filter((field) => !(field in declared));

  return {
    ...declared,
    ...Object.fromEntries(undeclared.map((field) => [field, 'untrusted' as const])),
  };
}

function buildResultFields(typed: DirectResult, result: JSONObject): JSONObject {
  return buildHiddenFields({ result: typed.record ?? result }, typed.hidden);
}
