import type { DestinationPermission } from '@heynixie/log';

const permissionWords: Readonly<Record<DestinationPermission, string>> = {
  owner: 'you',
  reply_target: 'reply target',
  known_contact: 'known contact',
  task: 'task',
  rule: 'allow rule',
};

// A list of addresses with the permission that the decision gave each, such as
// `sam@example.org (reply target)`, or `(no permission)` for an address no permission covered.
export function annotateRecipients(
  list: string | undefined,
  permissions: ReadonlyMap<string, DestinationPermission | null>,
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

      return `${address} (${permission === null ? 'no permission' : permissionWords[permission]})`;
    })
    .join(', ');
}
