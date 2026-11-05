import type { InboxMessage } from '@heynixie/wire';

interface MessageSource {
  readonly takeMessage?: () => InboxMessage | undefined;
}

export function takeGuestMessages(guest: MessageSource): readonly InboxMessage[] {
  const taken: InboxMessage[] = [];

  for (
    let message = guest.takeMessage?.();
    message !== undefined;
    message = guest.takeMessage?.()
  ) {
    taken.push(message);
  }

  return taken;
}
