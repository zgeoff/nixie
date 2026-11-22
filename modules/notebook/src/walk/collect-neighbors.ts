import type { LinkRow, LinkType, TargetKind } from '../types';

export interface WalkNode {
  readonly kind: TargetKind;
  readonly id: string;
}

export interface Neighbor {
  readonly link: LinkRow;
  readonly node: WalkNode;
}

// The nodes one hop from a node, over links both ways: a note's own links, and the links from other
// notes to any node. Every row passed is the link of an active note.
export function collectNeighbors(
  links: readonly LinkRow[],
  from: WalkNode,
  types: readonly LinkType[] | undefined,
): readonly Neighbor[] {
  const followed = links.filter((link) => types === undefined || types.includes(link.type));

  const outgoing =
    from.kind === 'note'
      ? followed
          .filter((link) => link.from_note_id === from.id)
          .map((link): Neighbor => ({ link, node: { kind: link.target_kind, id: link.target_id } }))
      : [];

  const incoming = followed
    .filter((link) => link.target_kind === from.kind && link.target_id === from.id)
    .map((link): Neighbor => ({ link, node: { kind: 'note', id: link.from_note_id } }));

  return [...outgoing, ...incoming];
}
