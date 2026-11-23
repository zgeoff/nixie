import type { WriteCaller } from './gate-context';

export function hasSelfNoteGrant(caller: WriteCaller): boolean {
  return caller.origin === 'task' && caller.hasSelfNoteGrant;
}
