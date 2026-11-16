import type { LiveRecord } from '../conversation/use-live-records';

type Notice = NonNullable<LiveRecord['definitionNotice']>;

const verbs = {
  add: 'Scheduled',
  change: 'Changed',
  remove: 'Removed',
  undo: 'Undone',
} as const;

// The sentence of a change: what changed, then the trigger in words and the next fire while the
// change is the one in force
export function formatDefinitionNotice(notice: Notice): string {
  const verb = verbs[notice.operation];
  const marker = formatMarker(notice);

  if (notice.isUnreadable) {
    return `${verb}: [content unavailable]${marker}.`;
  }

  const name = notice.name ?? '';

  if (notice.operation === 'undo' && !notice.hasVersion) {
    return `${verb}: ${name}, removed${marker}.`;
  }

  if (notice.operation === 'remove' || notice.rendered === null) {
    return `${verb}: ${name}${marker}.`;
  }

  const trigger = notice.operation === 'undo' ? `now ${notice.rendered}` : notice.rendered;

  return `${verb}: ${name}, ${trigger}${marker}.`;
}

// A change that is no longer in force shows why, in place of its next fire
function formatMarker(notice: Notice): string {
  if (notice.state === 'superseded' || notice.state === 'retired') {
    return ` (${notice.state})`;
  }

  return notice.next === null ? '' : ` (next: ${notice.next})`;
}
