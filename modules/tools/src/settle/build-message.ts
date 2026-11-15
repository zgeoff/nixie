import type { ContentSource, JSONObject } from '@heynixie/log';
import { buildHiddenFields } from './build-hidden-fields';
import type { Settled, SettledOutcome } from './types';

interface MessageOptions {
  readonly source?: ContentSource;
  readonly isError?: boolean;
  readonly actionID?: string;
  readonly hidden?: JSONObject | undefined;
}

export function buildMessage(
  outcome: SettledOutcome,
  message: string,
  messageOptions: MessageOptions = {},
): Settled {
  return {
    outcome,
    actionID: messageOptions.actionID ?? null,
    sources: { message: messageOptions.source ?? 'owner_data' },
    content: buildHiddenFields({ message }, messageOptions.hidden),
    reply: { kind: 'text', text: message, isError: messageOptions.isError ?? true },
  };
}
