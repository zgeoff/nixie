import type { LinkTarget, TargetKind } from '../types';

export function buildLinkTarget(kind: TargetKind, id: string): LinkTarget {
  if (kind === 'note') {
    return { note: id };
  }

  if (kind === 'memory') {
    return { memory: id };
  }

  return kind === 'moment' ? { moment: id } : { event: id };
}
