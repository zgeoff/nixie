import type { JSONObject } from '@heynixie/log';
import type { DirectResult } from '@heynixie/tools';

// A refusal that changed nothing: the code, and a sentence that says what to change. A provider's
// own text sits in the message, so every field of a refusal counts as outside content.
export function refuseImage(
  code: string,
  message: string,
  fields: { readonly refused?: JSONObject; readonly rest?: JSONObject } = {},
): DirectResult {
  return {
    result: { refused: { code, message, ...fields.refused }, ...fields.rest },
    refusalCode: code,
  };
}
