import type { NoteRefusal } from '../note/note-refusal';
import { buildRefusal } from '../note/note-refusal';
import type { LinkType, TargetKind } from '../types';

const allowedKinds: Readonly<Record<LinkType, readonly TargetKind[]>> = {
  supersedes: ['note', 'memory'],
  disputes: ['note', 'memory'],
  'part-of': ['note'],
  cites: ['note', 'memory', 'moment', 'event'],
  related: ['note', 'memory', 'moment', 'event'],
};

export interface LinkFacts {
  readonly from: string;
  readonly kind: TargetKind;
  readonly type: LinkType;
  readonly reason: string | undefined;

  // the target is the source note itself
  readonly isSelf: boolean;
}

export function isLinkAllowed(type: LinkType, kind: TargetKind): boolean {
  return allowedKinds[type].includes(kind);
}

// The refusals of notebook.link that need no lookup, in the design's order: SELF_LINK, BAD_LINK,
// REASON_REQUIRED.
export function pickLinkRefusal(facts: LinkFacts): NoteRefusal | null {
  if (facts.isSelf) {
    return buildRefusal('SELF_LINK', `note ${facts.from} cannot link to itself`);
  }

  if (!isLinkAllowed(facts.type, facts.kind)) {
    return buildRefusal(
      'BAD_LINK',
      `a ${facts.type} link cannot point at a ${facts.kind}; it takes ${allowedKinds[facts.type].join(' or ')}`,
    );
  }

  if (facts.type === 'related' && facts.reason === undefined) {
    return buildRefusal('REASON_REQUIRED', 'a related link needs a reason');
  }

  return null;
}
