import type { BodyFields, DestinationPermission } from '@heynixie/connections';
import { match } from 'ts-pattern';
import { annotateRecipients } from '../gmail/annotate-recipients';
import type { GmailCard } from '../gmail/gmail-card';
import { calendarToolNames } from './calendar-tool-names';
import { formatEventTime } from './format-event-time';

interface CardView {
  readonly zone: string;
  readonly permissions: ReadonlyMap<string, DestinationPermission | null>;
}

// The card of a Calendar call, from the facts that `prepare` read, or from a create's own input:
// its sentence, approve button and fields. Each guest stands beside the permission the decision
// gave it, and a change shows each changed field before and after.
export function buildCalendarFields(tool: string, card: GmailCard, view: CardView): BodyFields {
  const title = card['title'] ?? '';
  const start = formatEventTime(card['start'] ?? '', view.zone);
  const everyone = [card['guests'] ?? '', card['addGuests'] ?? ''].filter(Boolean).join(', ');

  const fields = Object.fromEntries(
    [
      ['title', title],
      ['start', start],
      ['end', formatEventTime(card['end'] ?? '', view.zone)],
      ['calendar', card['calendar']],
      ['location', card['location']],
      ['guests', annotateRecipients(everyone, view.permissions)],
      ['organizer', card['organizer']],
      ...collectChangeFields(card, view.zone),
    ].filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ''),
  );

  const sentence = buildSentence(tool, { card, title, start, everyone });

  return { status: 'fields', fields, sentence: sentence.text, approveLabel: sentence.button };
}

type FieldEntry = readonly [string, string | undefined];

function collectChangeFields(card: GmailCard, zone: string): readonly FieldEntry[] {
  const startAfter = card['startAfter'];
  const endAfter = card['endAfter'];
  const startText = formatEventTime(card['start'] ?? '', zone);
  const endText = formatEventTime(card['end'] ?? '', zone);
  const startNew = startAfter === undefined ? undefined : formatEventTime(startAfter, zone);
  const endNew = endAfter === undefined ? undefined : formatEventTime(endAfter, zone);

  return [
    ['titleChange', formatChange(card['title'], card['titleAfter'])],
    ['startChange', formatChange(startText, startNew)],
    ['endChange', formatChange(endText, endNew)],
    ['locationChange', formatChange(card['location'], card['locationAfter'])],
    ['descriptionChange', formatChange(card['description'], card['descriptionAfter'])],
    ['removedGuests', card['removeGuests']],
    ['response', card['response']],
  ];
}

function formatChange(before: string | undefined, after: string | undefined): string | undefined {
  return after === undefined ? undefined : `${before ?? ''} -> ${after}`;
}

interface SentenceFacts {
  readonly card: GmailCard;
  readonly title: string;
  readonly start: string;
  readonly everyone: string;
}

interface Sentence {
  readonly text: string;
  readonly button: string;
}

const responseWords: Readonly<Record<string, string>> = {
  accepted: 'accepted',
  declined: 'declined',
  tentative: 'tentatively accepted',
};

function buildSentence(tool: string, facts: SentenceFacts): Sentence {
  const title = facts.title;
  const start = facts.start;
  const everyone = facts.everyone;
  const organizer = facts.card['organizer'] ?? '';
  const response = facts.card['response'] ?? '';

  return match(tool)
    .with(calendarToolNames.createEventWithGuests, () => ({
      text: `Invite ${everyone} to "${title}" on ${start}`,
      button: 'Send invitations',
    }))
    .with(calendarToolNames.changeEventWithGuests, () => ({
      text: `Change "${title}" on ${start} and email ${everyone}`,
      button: 'Send changes',
    }))
    .with(calendarToolNames.cancelEventWithGuests, () => ({
      text: `Cancel "${title}" on ${start} and email ${everyone}`,
      button: 'Cancel and email',
    }))
    .with(calendarToolNames.respond, () => ({
      text: `Tell ${organizer} you ${responseWords[response] ?? response} "${title}" on ${start}`,
      button: 'Send response',
    }))
    .with(calendarToolNames.createEvent, () => ({
      text: `Add "${title}" on ${start} to ${facts.card['calendar'] ?? ''}`,
      button: 'Add event',
    }))
    .with(calendarToolNames.changeEvent, () => ({
      text: `Change "${title}" on ${start}`,
      button: 'Change event',
    }))
    .otherwise(() => ({ text: `Cancel "${title}" on ${start}`, button: 'Cancel event' }));
}
