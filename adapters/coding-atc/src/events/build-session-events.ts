import type { NoteLabel, SessionEvent } from '@heynixie/coding';
import type { z } from 'zod';
import type { atcSchemas } from '../atc-schemas';

type TrailEvent = z.infer<typeof atcSchemas.trailEvent>;

// The session events that one page of atc's trail holds. Every other kind of event is dropped.
export function buildSessionEvents(trail: readonly TrailEvent[]): SessionEvent[] {
  return trail.flatMap((event): SessionEvent[] => {
    const facts = {
      session: event.session,
      eventKey: toEventKey(event),
      at: new Date(event.at).toISOString(),
    };

    if (event.kind === 'message-answered' && event.message !== undefined) {
      return [{ ...facts, kind: 'answered', messageRef: event.message, answer: toText(event) }];
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
      return [{ ...facts, kind: 'note', label: event.label, text: toText(event) }];
    }

    return [];
  });
}

// The key stays the same whatever the gateway's merged cursor holds, because it names the daemon's
// own place in its trail.
function toEventKey(event: TrailEvent): string {
  return event.origin === undefined
    ? event.cursor
    : `${event.origin.daemon}.${event.origin.incarnation}|${event.origin.cursor}`;
}

// The whole text, or atc's preview with a closing line that says atc cut it.
function toText(event: TrailEvent): string {
  const isCut = event.complete === false || event.textError !== undefined;

  return isCut ? `${event.detail ?? ''}\n[atc cut this text]` : (event.text ?? event.detail ?? '');
}

const noteLabels = new Set<string>(['progress', 'blocked', 'decision']);

function isNoteLabel(label: string | undefined): label is NoteLabel {
  return label !== undefined && noteLabels.has(label);
}
