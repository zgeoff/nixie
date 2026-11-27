import type { JSONObject } from '@heynixie/log';

export const maxBodyLength = 640;
const numberPattern = /^\+[1-9]\d{6,14}$/u;

// The sentence that refuses a send's arguments, or null when the send can go. The code leads the
// sentence, so the model reads which argument to change.
export function checkSendArguments(input: JSONObject): string | null {
  const to = input['to'];
  const body = input['body'];

  if (typeof to !== 'string' || !numberPattern.test(to)) {
    return 'BAD_NUMBER: to must be a number in E.164 form, such as +61400000000';
  }

  if (typeof body !== 'string' || body.length === 0) {
    return 'TOO_LONG: body must hold 1 to 640 characters';
  }

  return [...body].length > maxBodyLength
    ? `TOO_LONG: body holds more than ${String(maxBodyLength)} characters`
    : null;
}
