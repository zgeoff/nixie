import { describeOutcomeReason, isOutcomeReason } from '@heynixie/actions';
import type { LogRecord } from '@heynixie/log';
import { mintBlockID, renderFenced } from '@heynixie/wire';

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

  const sentence = isOutcomeReason(reason)
    ? describeOutcomeReason(reason)
    : 'it did not run to completion';

  const call = typeof tool === 'string' ? `\`${tool}\` (\`${actionID}\`)` : `\`${actionID}\``;
  const line = `The call ${call} failed: ${sentence}.`;
  const message = pickMessage(record);

  if (message === null) {
    return line;
  }

  const detail = renderFenced({
    tag: 'failure-detail',
    attributes: { source: 'untrusted' },
    text: message,
    fence: mint(),
  });

  return [line, detail].join('\n');
}

function pickMessage(record: LogRecord): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const message = record.erasable.fields['message'];

  return typeof message === 'string' && message !== '' ? message : null;
}
