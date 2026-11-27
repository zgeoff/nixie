import type { HeldMatch } from './collect-ready-wakes';
import { pickMailboxSource } from './pick-mailbox-source';
import type { LiveWakeRule } from './read-live-wake-rules';

// The held matches whose rule reads the assistant's own mailbox, or a connection's mailbox or a
// text source's at a source that runs. A match whose rule is missing is kept, so the flush decides it as before.
export function collectLiveHeld(
  held: readonly HeldMatch[],
  rules: ReadonlyMap<string, LiveWakeRule>,
  liveSources: readonly string[],
): HeldMatch[] {
  return held.filter((match) => {
    const mailbox = rules.get(match.ruleID)?.rule.mailbox;

    return (
      mailbox === undefined ||
      mailbox.kind === 'mail' ||
      liveSources.includes(pickMailboxSource(mailbox))
    );
  });
}
