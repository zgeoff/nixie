import type { StoredDestinationPermission } from '@heynixie/log';
import { match } from 'ts-pattern';

// A list of addresses with the permission that the decision gave each, such as
// `sam@example.org (reply target)`, or `(no permission)` for an address no permission covered.
export function annotateRecipients(
  list: string | undefined,
  permissions: ReadonlyMap<string, StoredDestinationPermission | null>,
): string | undefined {
  if (list === undefined || list === '') {
    return list;
  }

  return list
    .split(', ')
    .map((address) => {
      const permission = permissions.get(address);

      if (permission === undefined) {
        return address;
      }

      return `${address} (${permission === null ? 'no permission' : renderPermission(permission)})`;
    })
    .join(', ');
}

const legacyWords = {
  owner: 'you',
  reply_target: 'reply target',
  known_contact: 'known contact',
  task: 'task',
  rule: 'allow rule',
} as const;

function renderPermission(permission: StoredDestinationPermission): string {
  if (typeof permission === 'string') {
    return legacyWords[permission];
  }

  return match(permission)
    .with({ by: 'place', trust: 'self' }, () => 'you')
    .with({ by: 'place' }, (place) => `trusted place (${place.trust})`)
    .with({ by: 'reading' }, () => 'read only')
    .with({ by: 'reply_target' }, () => legacyWords.reply_target)
    .with({ by: 'task' }, () => legacyWords.task)
    .with({ by: 'rule' }, () => legacyWords.rule)
    .exhaustive();
}
