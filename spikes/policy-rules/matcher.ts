/* oxlint-disable max-statements, one-var, sort-vars -- a throwaway spike keeps each question in one readable pass */
// Question 1: does every sample call get exactly one decision, the same one
// whatever the rule order, and which calls fall through to "no rule matched"?
import type { Call, ContextKind, Decision, Ledger, Rule } from './engine.ts';
import { getDecision, toCanonical } from './engine.ts';
import { TOOLS, makePolicy } from './starter.ts';

const CONTEXTS: ContextKind[] = ['conversation', 'task', 'job'],
  ARGS: Record<string, Record<string, unknown>[]> = {
    'mail.send': [
      { to: ['partner@example.com'] },
      { to: ['sam@example.com'] },
      { to: ['stranger@example.net'] },
      { to: ['sam@example.com', 'stranger@example.net'] },
    ],
    'mail.reply': [{ to: ['sender@example.org'] }, { to: ['stranger@example.net'] }],
    'calendar.invite': [{ attendees: ['partner@example.com'] }, { attendees: ['new@example.net'] }],
    'booking.reserve': [{ venue: 'venue:dishoom-kings-cross' }],
    'shop.buy': [
      { merchant: 'shop.example', amount: 12 },
      { merchant: 'shop.example', amount: 30 },
      { merchant: 'other.example', amount: 5 },
    ],
    'notify.owner': [{ to: 'owner' }],
    'job.create': [
      { tools: ['calendar.list', 'mail.search', 'notify.owner'] },
      { tools: ['mail.search', 'mail.label'] },
      { tools: ['mail.search', 'mail.reply'] },
    ],
  };

// conflicting extras: a lift, a deny that overlaps an allow, a narrow ask
const EXTRA: Rule[] = [
  {
    id: 'lift-small-shopping',
    outcome: 'allow',
    tools: ['shop.buy'],
    destinations: ['shop.example'],
    lift: { perAction: 20, budget: 'shopping-month' },
  },
  { id: 'deny-mail-to-net', outcome: 'deny', tools: ['mail.send'], destinations: ['*.net'] },
  { id: 'ask-invites-in-jobs', outcome: 'ask', tools: ['calendar.invite'], contexts: ['job'] },
  {
    id: 'allow-sam',
    outcome: 'allow',
    tools: ['mail.send'],
    destinations: ['sam@example.com'],
  },
];

function buildCalls(): Call[] {
  const calls: Call[] = [];
  for (const tool of TOOLS) {
    for (const context of CONTEXTS) {
      for (const args of ARGS[tool.name] ?? [{}]) {
        calls.push({
          tool: tool.name,
          args,
          context,
          replyTarget: 'sender@example.org',
          time: 0,
        });
      }
    }
  }
  return calls;
}

function sortBySeed<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed;
  for (let index = out.length - 1; index > 0; index -= 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    const pick = state % (index + 1),
      held = out[index] as T;
    out[index] = out[pick] as T;
    out[pick] = held;
  }
  return out;
}

function runMatcher(): void {
  const policy = makePolicy(EXTRA),
    ledger: Ledger = { spent: new Map() },
    calls = buildCalls(),
    valid = new Set(['allow', 'ask', 'deny']);
  let unstable = 0;
  const byStage = new Map<string, number>(),
    fallThrough: string[] = [];
  for (const call of calls) {
    const base: Decision = getDecision(policy, call, ledger);
    if (!valid.has(base.outcome)) {
      throw new Error(`no single decision for ${call.tool}`);
    }
    for (let seed = 1; seed <= 200; seed += 1) {
      const shuffled = { ...policy, rules: sortBySeed(policy.rules, seed) };
      if (toCanonical(getDecision(shuffled, call, ledger)) !== toCanonical(base)) {
        unstable += 1;
      }
    }
    const key = `${base.outcome}/${base.stage}`;
    byStage.set(key, (byStage.get(key) ?? 0) + 1);
    if (base.stage === 'no_match') {
      fallThrough.push(`${call.tool} in ${call.context}`);
    }
  }
  console.log(`calls: ${calls.length}, rule orders per call: 200`);
  console.log(`decisions that changed with rule order: ${unstable}`);
  console.log('decisions by outcome and stage:');
  for (const [key, count] of [...byStage].toSorted()) {
    console.log(`  ${key}: ${count}`);
  }
  console.log(`fell through to "no rule matched": ${fallThrough.length}`);
  for (const line of fallThrough) {
    console.log(`  ${line}`);
  }
  const conflict = getDecision(
    policy,
    { tool: 'mail.send', args: { to: ['stranger@example.net'] }, context: 'conversation', time: 0 },
    ledger,
  );
  console.log(`allow and deny both match mail.send to *.net: ${toCanonical(conflict)}`);
}

runMatcher();
