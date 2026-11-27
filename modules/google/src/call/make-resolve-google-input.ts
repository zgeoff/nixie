import type { JSONObject } from '@heynixie/log';
import type { InputResolution, ToolResolveContext } from '@heynixie/tools';
import { parseItemID } from '../gmail/parse-item-id';
import type { GmailAccess } from '../gmail/types';

// Names the connection of a Calendar or Drive call before anything else reads it, as the Gmail tools
// do: the prefix of each item ID in `itemKeys`, or the `connection` argument, or the only live Google
// connection. The input it returns always holds `connection`.
export function makeResolveGoogleInput(
  access: GmailAccess,
  itemKeys: readonly string[],
): (input: JSONObject, context: ToolResolveContext) => Promise<InputResolution> {
  return async (input) => {
    const prefixes = collectPrefixes(input, itemKeys);

    if (prefixes === 'bad_id') {
      return {
        status: 'error',
        message: 'BAD_ITEM_ID: an ID of a Google item starts with its connection and a dot',
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

    const live = await access.readLiveContexts(wanted);

    if (wanted !== undefined) {
      return live.length === 0
        ? {
            status: 'error',
            message: `UNKNOWN_CONNECTION: no live connection has the ID ${wanted}`,
          }
        : { status: 'ok', input: { ...input, connection: wanted } };
    }

    const [only] = live;

    if (only === undefined) {
      return { status: 'error', message: 'NO_CONNECTION: no Google account is connected' };
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

function collectPrefixes(input: JSONObject, itemKeys: readonly string[]): string[] | 'bad_id' {
  const texts = itemKeys
    .map((key) => input[key])
    .filter((value) => value !== undefined && value !== null);

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
