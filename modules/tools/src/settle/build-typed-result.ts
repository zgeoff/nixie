import type { JSONObject } from '@heynixie/log';
import type { DirectResult, RegisteredTool } from '../types';
import { buildHiddenFields } from './build-hidden-fields';
import { buildMessage } from './build-message';
import type { Settled } from './types';

export function buildTypedResult(
  registered: RegisteredTool,
  typed: DirectResult,
  actionID: string | null,
): Settled {
  const result = typed.result;

  if (!registered.parseOutput(result).isValid) {
    const messageOptions = actionID === null ? {} : { actionID };

    return buildMessage(
      'error',
      `the tool ${registered.definition.name} returned a result outside its output schema`,
      messageOptions,
    );
  }

  return {
    outcome: 'result',
    actionID,
    sources: registered.definition.declaration.results,
    content: buildResultFields(typed, result),
    reply: { kind: 'typed', result, images: typed.images ?? [] },
    ...(typed.endsTurn === undefined ? {} : { endsTurn: true as const }),
    ...(typed.attachments === undefined ? {} : { attachments: typed.attachments }),
    ...(typed.writeBeside === undefined ? {} : { writeBeside: typed.writeBeside }),
  };
}

function buildResultFields(typed: DirectResult, result: JSONObject): JSONObject {
  return buildHiddenFields({ result: typed.record ?? result }, typed.hidden);
}
