import type { ToolOutcome } from '@heynixie/tools';
import { buildReminderTriggerID, readDefinitionNextFires } from '@heynixie/triggers';
import type { DefinitionNextFire } from '@heynixie/triggers';
import type { FoundReminder } from '../reminder/read-reminder-by-short-id';
import { readReminderByShortID } from '../reminder/read-reminder-by-short-id';
import type { RemindersContext } from '../types';
import { buildUnknownSentence } from './build-unknown-sentence';
import { pickInactiveSentence } from './pick-inactive-sentence';
import { refuseReminder } from './refuse-reminder';

export interface DeferralTarget {
  readonly found: FoundReminder;

  // the IANA zone the schedule reads in
  readonly zone: string;

  // the fire a snooze or a skip acts on, and the one after it
  readonly first: DefinitionNextFire;
  readonly following: DefinitionNextFire | null;
}

// The recurring reminder that a snooze or a skip names, with its next fires, or the refusal to hand
// back. A one-time reminder has one fire, so it takes an update or a cancel instead.
export async function readDeferralTarget(
  context: RemindersContext,
  shortID: string,
): Promise<DeferralTarget | ToolOutcome> {
  const found = await readReminderByShortID(context.log.writer.db, shortID);

  if (found === null) {
    return refuseReminder('UNKNOWN_REMINDER', buildUnknownSentence(shortID), 'reminder');
  }

  const inactive = pickInactiveSentence(found);

  if (inactive !== null) {
    return refuseReminder('NOT_ACTIVE', inactive, 'reminder');
  }

  if ('at' in found.trigger) {
    return refuseReminder(
      'NOT_RECURRING',
      'That is a one-time reminder. Use reminder.update to move it, or reminder.cancel to drop it.',
      'reminder',
    );
  }

  const upcoming = await readDefinitionNextFires(
    context.log.writer.db,
    context.readZone,
    buildReminderTriggerID(found.reminderID),
    2,
  );

  const [first, following] = upcoming?.fires ?? [];

  if (upcoming === null || first === undefined) {
    return refuseReminder('NO_NEXT_FIRE', 'That reminder has no next fire to change.', 'reminder');
  }

  return { found, zone: upcoming.zone, first, following: following ?? null };
}

export function isDeferralTarget(value: DeferralTarget | ToolOutcome): value is DeferralTarget {
  return 'found' in value;
}
