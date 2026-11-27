import type { NoteLabel, SessionEvent } from '@heynixie/coding';
import type { TrailEvent } from '../types';
import type { EventText } from './read-event-texts';

// The session events that atc's trail holds. Every other kind of event is dropped.
export function buildSessionEvents(
  trail: readonly TrailEvent[],
  texts: ReadonlyMap<string, EventText>,
): SessionEvent[] {
  return trail.flatMap((event): SessionEvent[] => {
    const facts = {
      session: event.session,
      eventKey: toEventKey(event),
      at: new Date(event.at).toISOString(),
    };

    if (event.kind === 'message-answered' && event.message !== undefined) {
      return [
        { ...facts, kind: 'answered', messageRef: event.message, answer: toText(event, texts) },
      ];
    }

    if (event.kind === 'message-unanswered' && event.message !== undefined) {
      return [
        {
          ...facts,
          kind: 'unanswered',
          messageRef: event.message,
          reason: event.detail ?? 'unanswered',
        },
      ];
    }

    if (event.kind === 'note' && isNoteLabel(event.label)) {
      return [{ ...facts, kind: 'note', label: event.label, text: toText(event, texts) }];
    }

    return [];
  });
}

// The key stays the same whatever the gateway's merged cursor holds, because it names the daemon's
// own place in its trail.
function toEventKey(event: TrailEvent): string {
  return `${event.origin.daemon}.${event.origin.incarnation}|${event.origin.cursor}`;
}

// The whole text, or atc's preview with a closing line that says atc cut it.
function toText(event: TrailEvent, texts: ReadonlyMap<string, EventText>): string {
  const read = texts.get(event.cursor);

  if (read !== undefined && 'text' in read && read.isComplete) {
    return read.text;
  }

  return `${event.detail ?? ''}\n[atc cut this text]`;
}

const noteLabels = new Set<string>(['progress', 'blocked', 'decision']);

function isNoteLabel(label: string | undefined): label is NoteLabel {
  return label !== undefined && noteLabels.has(label);
}
