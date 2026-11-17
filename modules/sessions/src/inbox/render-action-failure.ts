import type { LogRecord } from '@heynixie/log';
import { mintBlockID } from '@heynixie/wire';

const reasonSentences: Readonly<Record<string, string>> = {
  refused: 'the call was refused',
  refusal_can_clear: 'the call was refused for now',
  retries_exhausted: 'it kept failing and ran out of retries',
  ambiguous: 'its outcome could not be confirmed',
  attempt_without_result: 'it started and never reported a result',
  unknown_tool: 'the tool is not one nixie knows',
  arguments_unreadable: 'its arguments could not be read',
  deadline_passed: 'it passed its deadline',
  rule_denied: 'a rule denied it',
  declined: 'the user declined it',
  lapsed: 'the approval lapsed before it was answered',
  destinations_changed: 'the places it would reach changed after the approval',
  dropped: 'the user dropped it',
};

// The provider's own words show only inside a fenced block, so what an outside service said cannot
// pass as nixie's message. Returns null for an outcome that did not fail.
export function renderActionFailure(
  record: LogRecord,
  mint: () => string = mintBlockID,
): string | null {
  const payload = record.payload;

  if (payload['status'] !== 'failed') {
    return null;
  }

  const rawActionID = payload['actionID'];
  const actionID = typeof rawActionID === 'string' ? rawActionID : 'unknown';
  const tool = payload['tool'];
  const reason = payload['reason'];

  const sentence =
    typeof reason === 'string'
      ? (reasonSentences[reason] ?? 'it did not run to completion')
      : 'it did not run to completion';

  const call = typeof tool === 'string' ? `\`${tool}\` (\`${actionID}\`)` : `\`${actionID}\``;
  const line = `The call ${call} failed: ${sentence}.`;
  const message = pickMessage(record);

  if (message === null) {
    return line;
  }

  const fence = mint();

  return [
    line,
    `<failure-detail source="untrusted" fence="${fence}">`,
    message,
    `</failure-detail fence="${fence}">`,
  ].join('\n');
}

function pickMessage(record: LogRecord): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const message = record.erasable.fields['message'];

  return typeof message === 'string' && message !== '' ? message : null;
}
