import type { HeldMatch } from './collect-ready-wakes';
import type { LiveWakeRule } from './read-live-wake-rules';

// The held matches whose rule reads the assistant's own mailbox, a text source's, or a connection's
// mailbox at a source that runs. The list of text sources decides which text sources run. A match
// whose rule is missing is kept, so the flush decides it as before.
export function collectLiveHeld(
  held: readonly HeldMatch[],
  rules: ReadonlyMap<string, LiveWakeRule>,
  liveSources: readonly string[],
): HeldMatch[] {
  return held.filter((match) => {
    const mailbox = rules.get(match.ruleID)?.rule.mailbox;

    return mailbox?.kind !== 'connection' || liveSources.includes(mailbox.source);
  });
}
