/* oxlint-disable max-lines, max-lines-per-function, max-statements, max-params, no-nested-ternary, one-var, sort-vars, no-map-spread, no-loop-func, prefer-spread -- a throwaway spike keeps each question in one readable pass */
// Question 3: can code tell whether a rule edit widens access, with fixed
// checks only, and does it ever call a widening a narrowing?
import type { EditKind, Rule } from './engine.ts';
import { getEditKind } from './engine.ts';

interface Case {
  label: string;
  before?: Rule;
  after?: Rule;
  expected: EditKind;
}

const SAM: Rule = {
    id: 'r1',
    outcome: 'allow',
    tools: ['mail.send'],
    destinations: ['sam@example.com'],
  },
  LIFT: Rule = {
    id: 'r2',
    outcome: 'allow',
    tools: ['shop.buy'],
    destinations: ['shop.example'],
    lift: { perAction: 20, budget: 'shopping-month' },
  },
  DENY: Rule = { id: 'r3', outcome: 'deny', tools: ['mail.send'], destinations: ['*.net'] },
  CASES: Case[] = [
    { label: 'add an allow rule', after: SAM, expected: 'widens' },
    { label: 'add a deny rule', after: DENY, expected: 'narrows' },
    { label: 'add an ask rule', after: { ...SAM, outcome: 'ask' }, expected: 'narrows' },
    { label: 'remove an allow rule', before: SAM, expected: 'narrows' },
    { label: 'remove a deny rule', before: DENY, expected: 'widens' },
    { label: 'remove an ask rule', before: { ...SAM, outcome: 'ask' }, expected: 'widens' },
    {
      label: 'allow: destination to a pattern',
      before: SAM,
      after: { ...SAM, destinations: ['*@example.com'] },
      expected: 'widens',
    },
    {
      label: 'allow: pattern to one address',
      before: { ...SAM, destinations: ['*@example.com'] },
      after: SAM,
      expected: 'narrows',
    },
    {
      label: 'allow: add a context limit',
      before: SAM,
      after: { ...SAM, contexts: ['conversation'] },
      expected: 'narrows',
    },
    {
      label: 'allow: drop a context limit',
      before: { ...SAM, contexts: ['conversation'] },
      after: SAM,
      expected: 'widens',
    },
    {
      label: 'allow: add an expiry',
      before: SAM,
      after: { ...SAM, expiresAt: 100 },
      expected: 'narrows',
    },
    {
      label: 'allow: extend an expiry',
      before: { ...SAM, expiresAt: 100 },
      after: { ...SAM, expiresAt: 200 },
      expected: 'widens',
    },
    {
      label: 'allow: add an argument check',
      before: SAM,
      after: { ...SAM, checks: [{ arg: 'subject', op: 'matches', pattern: 'Re: *' }] },
      expected: 'narrows',
    },
    {
      label: 'allow: loosen an in-list',
      before: { ...SAM, checks: [{ arg: 'label', op: 'in', values: ['a'] }] },
      after: { ...SAM, checks: [{ arg: 'label', op: 'in', values: ['a', 'b'] }] },
      expected: 'widens',
    },
    {
      label: 'allow: tighten in-list to eq',
      before: { ...SAM, checks: [{ arg: 'label', op: 'in', values: ['a', 'b'] }] },
      after: { ...SAM, checks: [{ arg: 'label', op: 'eq', value: 'a' }] },
      expected: 'narrows',
    },
    {
      label: 'lift: lower the per-action cap',
      before: LIFT,
      after: { ...LIFT, lift: { perAction: 10, budget: 'shopping-month' } },
      expected: 'narrows',
    },
    {
      label: 'lift: raise the per-action cap',
      before: LIFT,
      after: { ...LIFT, lift: { perAction: 50, budget: 'shopping-month' } },
      expected: 'widens',
    },
    {
      label: 'lift: switch budget',
      before: LIFT,
      after: { ...LIFT, lift: { perAction: 20, budget: 'other' } },
      expected: 'widens',
    },
    {
      label: 'allow to ask, same match',
      before: SAM,
      after: { ...SAM, outcome: 'ask' },
      expected: 'narrows',
    },
    { label: 'ask to allow', before: { ...SAM, outcome: 'ask' }, after: SAM, expected: 'widens' },
    {
      label: 'deny: widen its pattern',
      before: DENY,
      after: { ...DENY, destinations: ['*'] },
      expected: 'narrows',
    },
    {
      label: 'deny: shrink its pattern',
      before: { ...DENY, destinations: ['*'] },
      after: DENY,
      expected: 'widens',
    },
    { label: 'deny to ask', before: DENY, after: { ...DENY, outcome: 'ask' }, expected: 'widens' },
    {
      label: 'allow: effects grow',
      before: { id: 'r4', outcome: 'allow', effects: ['read'] },
      after: { id: 'r4', outcome: 'allow', effects: ['read', 'send'] },
      expected: 'widens',
    },
    {
      label: 'allow: CEL condition',
      before: SAM,
      after: { ...SAM, cel: 'args.to.size() == 1' },
      expected: 'widens',
    },
    {
      label: 'allow: glob a*b inside a*',
      before: { ...SAM, destinations: ['a*'] },
      after: { ...SAM, destinations: ['a*b'] },
      expected: 'narrows',
    },
    {
      label: 'allow: glob *x* inside *',
      before: { ...SAM, destinations: ['*@example.*'] },
      after: { ...SAM, destinations: ['*@example.com'] },
      expected: 'narrows',
    },
  ];

function runWidening(): void {
  let wrongSafe = 0,
    wrongUnsafe = 0;
  for (const item of CASES) {
    const got = getEditKind(item.before, item.after),
      mark = got === item.expected ? 'ok' : got === 'widens' ? 'CONSERVATIVE' : 'UNSAFE';
    if (mark === 'CONSERVATIVE') {
      wrongSafe += 1;
    }
    if (mark === 'UNSAFE') {
      wrongUnsafe += 1;
    }
    console.log(`  ${mark.padEnd(12)} ${item.label}: ${got}`);
  }
  console.log(
    `cases: ${CASES.length}, narrowing called widening: ${wrongSafe}, widening called narrowing: ${wrongUnsafe}`,
  );
}

runWidening();
