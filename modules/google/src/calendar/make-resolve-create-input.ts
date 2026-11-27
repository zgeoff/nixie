import type { JSONObject } from '@heynixie/log';
import type { InputResolution, ToolResolveContext } from '@heynixie/tools';
import { makeResolveGoogleInput } from '../call/make-resolve-google-input';
import type { GoogleDeps } from '../types';
import { collectOtherAddresses } from './collect-other-addresses';

// Resolves the connection of calendar.create_event_with_guests, then rewrites `guests` as the
// queue and the policy both see them: lowercase, once each, without the connection's own account.
// Guests that name only that account refuse, because the event would have no guest.
export function makeResolveCreateInput(
  deps: GoogleDeps,
): (input: JSONObject, context: ToolResolveContext) => Promise<InputResolution> {
  const resolveConnection = makeResolveGoogleInput(deps.access, []);

  return async (input, context) => {
    const resolved = await resolveConnection(input, context);

    if (resolved.status === 'error') {
      return resolved;
    }

    const connection = resolved.input['connection'];
    const connectionName = typeof connection === 'string' ? connection : '';

    const [live] = await deps.access.readLiveContexts(connectionName);

    const guests = resolved.input['guests'];

    if (live === undefined || !Array.isArray(guests)) {
      return resolved;
    }

    const others = collectOtherAddresses(
      guests.filter((guest): guest is string => typeof guest === 'string'),
      live.account,
    );

    return others.length === 0
      ? {
          status: 'error',
          message:
            'NO_GUESTS: the guests name only the connected account, so use the tool without guests',
        }
      : { status: 'ok', input: { ...resolved.input, guests: others } };
  };
}
