/* oxlint-disable one-var -- a throwaway spike */
// Sample tool registry and the starter rule set the design proposes.
import type { Policy, Rule, ToolDecl } from './engine.ts';

export const TOOLS: ToolDecl[] = [
  { name: 'search.web', effects: ['fetch'] },
  { name: 'web.fetch', effects: ['fetch'] },
  { name: 'mail.search', effects: ['read'] },
  { name: 'mail.read', effects: ['read'] },
  { name: 'mail.label', effects: ['write'] },
  { name: 'mail.archive', effects: ['write'] },
  { name: 'mail.trash', effects: ['write'] },
  { name: 'mail.purge', effects: ['delete'] },
  { name: 'mail.draft', effects: ['write'] },
  { name: 'mail.send', effects: ['send'], destinationArgs: ['to', 'cc'] },
  { name: 'mail.reply', effects: ['send'], destinationArgs: ['to'] },
  { name: 'calendar.list', effects: ['read'] },
  { name: 'calendar.create', effects: ['write'] },
  { name: 'calendar.invite', effects: ['send'], destinationArgs: ['attendees'] },
  { name: 'booking.reserve', effects: ['send'], destinationArgs: ['venue'] },
  { name: 'shop.buy', effects: ['spend'], destinationArgs: ['merchant'], amountArg: 'amount' },
  { name: 'notes.write', effects: ['note'] },
  { name: 'memory.propose', effects: ['note'] },
  { name: 'notify.owner', effects: ['note'] },
  { name: 'task.start', effects: ['note'] },
  { name: 'job.create', effects: ['schedule'] },
  { name: 'code.run', effects: ['run_code'] },
  { name: 'files.delete', effects: ['delete'] },
  { name: 'home.lights', effects: ['device'] },
  { name: 'rules.add', effects: ['policy_widen'] },
  { name: 'rules.remove', effects: ['policy_narrow'] },
  { name: 'budget.raise', effects: ['budget_raise'] },
];

export const STARTER_RULES: Rule[] = [
  { id: 'allow-reads', outcome: 'allow', effects: ['read', 'fetch'] },
  { id: 'allow-notes', outcome: 'allow', effects: ['note'] },
  { id: 'allow-service-writes', outcome: 'allow', effects: ['write'] },
  { id: 'allow-sends-within-limits', outcome: 'allow', effects: ['send'] },
  { id: 'allow-sandboxed-code', outcome: 'allow', effects: ['run_code'] },
  { id: 'allow-narrowing', outcome: 'allow', effects: ['policy_narrow', 'budget_lower'] },
  {
    id: 'allow-quiet-jobs',
    outcome: 'allow',
    tools: ['job.create'],
    effects: ['schedule', 'read', 'fetch', 'note', 'write'],
  },
  { id: 'ask-permanent-deletes', outcome: 'ask', effects: ['delete'] },
  { id: 'ask-jobs-that-act', outcome: 'ask', tools: ['job.create'], effects: ['send', 'delete'] },
  { id: 'ask-exports', outcome: 'ask', effects: ['export'] },
];

// the cautious variant asks before every write to an owner's service and every
// send, even within the destination limits
const CAUTIOUS_DROP = new Set(['allow-service-writes', 'allow-sends-within-limits']);

export function makePolicy(extra: Rule[] = []): Policy {
  const cautious = process.env.STARTER === 'cautious',
    starter = STARTER_RULES.filter((rule) => !cautious || !CAUTIOUS_DROP.has(rule.id));
  return {
    tools: TOOLS,
    rules: [...starter, ...extra],
    budgets: [{ id: 'shopping-month', limit: 100, period: 'month' }],
    knownContacts: ['partner@example.com'],
  };
}
