import type { LinkTarget, TargetKind } from '../types';

export interface ParsedTarget {
  readonly kind: TargetKind;
  readonly id: string;
}

const eventIDPattern = /^[0-9]{1,15}$/u;

// The kind a target declares and its ID, or null when the ID is in no valid format for that kind.
// A note, an item and a moment take a short ID or a UUID, and an event the decimal ID that
// log.read shows.
export function parseLinkTarget(target: LinkTarget): ParsedTarget | null {
  if ('event' in target) {
    return eventIDPattern.test(target.event) ? { kind: 'event', id: target.event } : null;
  }

  const parsed = pickIDTarget(target);

  return isShortOrUUID(parsed.id) ? parsed : null;
}

function pickIDTarget(target: Exclude<LinkTarget, { readonly event: string }>): ParsedTarget {
  if ('note' in target) {
    return { kind: 'note', id: target.note };
  }

  return 'memory' in target
    ? { kind: 'memory', id: target.memory }
    : { kind: 'moment', id: target.moment };
}

const shortIDPattern = /^[a-z0-9]{6,32}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function isShortOrUUID(id: string): boolean {
  return shortIDPattern.test(id) || uuidPattern.test(id);
}
