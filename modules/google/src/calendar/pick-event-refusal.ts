import type { CalendarEvent } from './types';

export interface EventRefusal {
  readonly code: 'not_organizer' | 'has_guests' | 'no_guests' | 'cancelled' | 'not_invited';
  readonly message: string;
}

interface EventChangeFacts {
  // whether the tool is a with-guests tool, which emails the guests
  readonly withGuests: boolean;

  // the guests a change adds and removes; both empty for a cancel
  readonly addGuests: readonly string[];
  readonly removeGuests: readonly string[];
}

// Why a change or a cancel of the event must not go ahead, or null. Only the organizer changes an
// event. A tool without guests refuses an event that has one, because a change there would need to
// tell them. A with-guests tool refuses an event that has no guest before the change and none after.
export function pickEventRefusal(
  event: CalendarEvent,
  facts: EventChangeFacts,
): EventRefusal | null {
  if (!event.isOrganizedByAccount) {
    return {
      code: 'not_organizer',
      message: 'NOT_ORGANIZER: the connected account does not organize this event',
    };
  }

  if (event.status === 'cancelled') {
    return { code: 'cancelled', message: 'CANCELLED: the event is already cancelled' };
  }

  const before = event.guests.map((guest) => guest.address);

  if (!facts.withGuests) {
    return before.length === 0
      ? null
      : {
          code: 'has_guests',
          message:
            'HAS_GUESTS: the event has guests, so use the with_guests tool, which tells them',
        };
  }

  const after = [...before, ...facts.addGuests].filter(
    (address) => !facts.removeGuests.includes(address),
  );

  return before.length === 0 && after.length === 0
    ? {
        code: 'no_guests',
        message: 'NO_GUESTS: the event has no guest, so use the tool without guests',
      }
    : null;
}
