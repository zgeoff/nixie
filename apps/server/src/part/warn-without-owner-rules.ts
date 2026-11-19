import { readRulesInForce } from '@heynixie/definitions';
import type { ServerParts } from '../types';

// With no rule of yours in force, every call that consent does not allow asks, so the start says so.
export async function warnWithoutOwnerRules(
  parts: Pick<ServerParts, 'context' | 'log'>,
): Promise<void> {
  const rules = await readRulesInForce(parts.context.log.writer.db);

  if (rules.length > 0) {
    return;
  }

  parts.log(
    'policy.no_rules_in_force',
    { action: 'Add rules to the definitions repository, so calls stop asking' },
    'warn',
  );
}
