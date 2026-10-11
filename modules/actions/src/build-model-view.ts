import type { JSONObject, LogRecord } from '@heynixie/log';
import { isJSONObject } from './is-json-object';
import type { ActionRow, ModelView } from './types';

// Builds what the model sees of an action from nixie's own record: done with the connector's
// result, failed with the reason, pending as queued, or unknown as a question put to you.
export function buildModelView(
  action: Pick<ActionRow, 'action_id' | 'reason' | 'status'>,
  outcome: LogRecord | null,
): ModelView {
  const fields = outcome?.erasable.status === 'readable' ? outcome.erasable.fields : null;

  const actionID = action.action_id;

  if (action.status === 'done') {
    return { status: 'done', actionID, result: toResult(fields) };
  }
  if (action.status === 'failed') {
    return { status: 'failed', actionID, reason: toReason(fields) ?? action.reason ?? 'failed' };
  }
  if (action.status === 'pending') {
    return { status: 'pending', actionID, message: `queued as \`${actionID}\`` };
  }
  return { status: 'unknown', actionID, message: 'you were asked whether this happened' };
}

// a result whose key was shredded reads as null, never as an empty success
function toResult(fields: JSONObject | null): JSONObject | null {
  const result = fields?.['result'] ?? null;

  return isJSONObject(result) ? result : null;
}

function toReason(fields: JSONObject | null): string | null {
  const message = fields?.['message'];

  return typeof message === 'string' ? message : null;
}
