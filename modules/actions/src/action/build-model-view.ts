import type { JSONObject, LogRecord } from '@heynixie/log';
import type { ActionRow, ModelView } from '../types';
import { isJSONObject } from './is-json-object';

export interface ModelViewOptions {
  // the owner's name from the config, or null when it is unset
  readonly ownerName: string | null;
}

export function buildModelView(
  action: Pick<ActionRow, 'action_id' | 'reason' | 'status' | 'outcome_sequence'> & {
    readonly isCancelled: boolean;
  },
  outcome: LogRecord | null,
  options?: ModelViewOptions,
): ModelView {
  const fields = outcome?.erasable.status === 'readable' ? outcome.erasable.fields : null;
  const actionID = action.action_id;

  if (action.isCancelled) {
    return { status: 'cancelled', actionID, message: 'the task was stopped before it ran' };
  }

  if (action.status === 'done') {
    return { status: 'done', actionID, result: toResult(fields) };
  }

  if (action.status === 'failed') {
    return { status: 'failed', actionID, reason: toReason(fields) ?? action.reason ?? 'failed' };
  }

  // an unknown outcome that no outcome record settled is still being reconciled, which the task
  // hears nothing about
  if (action.status === 'pending' || action.outcome_sequence === null) {
    return { status: 'pending', actionID, message: `queued as \`${actionID}\`` };
  }

  return {
    status: 'unknown',
    actionID,
    message: `${options?.ownerName ?? 'the owner'} was asked whether this happened`,
  };
}

function toResult(fields: JSONObject | null): JSONObject | null {
  const result = fields?.['result'] ?? null;

  return isJSONObject(result) ? result : null;
}

function toReason(fields: JSONObject | null): string | null {
  const message = fields?.['message'];

  return typeof message === 'string' ? message : null;
}
