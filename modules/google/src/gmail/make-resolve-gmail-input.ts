import type { JSONObject } from '@heynixie/log';
import type { InputResolution, ToolResolveContext } from '@heynixie/tools';
import { forgottenOutcome } from '../call/build-google-failure';
import { pickPinnedContexts } from '../call/pick-pinned-contexts';
import { parseItemID } from './parse-item-id';
import type { GmailAccess } from './types';

// Names the connection of a call before anything else reads it. The connection is the prefix of
// each item ID the call passes, or the `connection` argument, or the only live Google connection.
// The input it returns always holds `connection`, so a queued action's arguments name it.
export function makeResolveGmailInput(
  access: GmailAccess,
): (input: JSONObject, context: ToolResolveContext) => Promise<InputResolution> {
  return async (input, context) => {
    const prefixes = collectPrefixes(input);

    if (prefixes === 'bad_id') {
      return {
        status: 'error',
        message: 'BAD_ITEM_ID: an ID of a Gmail item starts with its connection and a dot',
      };
    }

    const named = typeof input['connection'] === 'string' ? [input['connection']] : [];
    const connections = [...new Set([...prefixes, ...named])];

    if (connections.length > 1) {
      return {
        status: 'error',
        message:
          'mixed_connections: the call names items of more than one connection, and a call ' +
          'reaches one',
      };
    }

    const [wanted] = connections;

    if (wanted !== undefined && context.pinned !== undefined && !context.pinned.includes(wanted)) {
      return {
        status: 'error',
        message: `NOT_PINNED: this task may use only these connections: ${context.pinned.join(', ')}`,
      };
    }

    const reachable = await access.readLiveContexts(wanted);

    const live = pickPinnedContexts(reachable, context.pinned);

    if (wanted !== undefined) {
      return live.length === 0
        ? forgottenOutcome
        : { status: 'ok', input: { ...input, connection: wanted } };
    }

    const [only] = live;

    if (only === undefined) {
      return context.pinned === undefined
        ? { status: 'error', message: 'NO_CONNECTION: no Google account is connected' }
        : forgottenOutcome;
    }

    if (live.length > 1) {
      const list = live.map((entry) => `${entry.connection} (${entry.account})`).join(', ');

      return {
        status: 'error',
        message: `CONNECTION_REQUIRED: name one of these in the connection argument: ${list}`,
      };
    }

    return { status: 'ok', input: { ...input, connection: only.connection } };
  };
}

const itemKeys = ['message', 'draft', 'after'] as const;

function collectPrefixes(input: JSONObject): string[] | 'bad_id' {
  const threads: unknown = input['threads'];
  const threadTexts: readonly unknown[] = Array.isArray(threads) ? threads : [];

  const texts: readonly unknown[] = [
    ...itemKeys.map((key) => input[key]).filter((value) => value !== undefined && value !== null),
    ...threadTexts,
  ];

  const prefixes: string[] = [];

  for (const text of texts) {
    const parsed = typeof text === 'string' ? parseItemID(text) : null;

    if (parsed === null) {
      return 'bad_id';
    }

    prefixes.push(parsed.connection);
  }

  return [...new Set(prefixes)];
}
