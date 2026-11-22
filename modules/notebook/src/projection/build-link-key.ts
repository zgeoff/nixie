import type { LinkTarget, LinkType, TargetKind } from '../types';

export function toTargetKind(target: LinkTarget): TargetKind {
  if ('note' in target) {
    return 'note';
  }

  if ('memory' in target) {
    return 'memory';
  }

  return 'moment' in target ? 'moment' : 'event';
}

export function toTargetID(target: LinkTarget): string {
  if ('note' in target) {
    return target.note;
  }

  if ('memory' in target) {
    return target.memory;
  }

  return 'moment' in target ? target.moment : target.event;
}

// One link per source, target and type: the table's key.
export function buildLinkKey(from: string, target: LinkTarget, type: LinkType): string {
  return `${from}:${toTargetKind(target)}:${toTargetID(target)}:${type}`;
}
