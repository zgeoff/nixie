/* oxlint-disable max-lines-per-function, max-statements, one-var, sort-vars, no-map-spread -- a throwaway spike keeps each question in one readable pass */
// Question 2: is the snapshot hash stable across reordered but equivalent
// definitions, and does every real change move it?
import type { Definitions, Rule } from './engine.ts';
import { buildSnapshotHash } from './engine.ts';
import { makePolicy } from './starter.ts';

const JOB = '# Morning report\n\nSummarise today’s calendar and unread mail.\n',
  PERSONA = '# Persona\n\nWarm, brief, and direct.\n\nNever uses emoji.\n';

function buildDefs(): Definitions {
  return {
    persona: PERSONA,
    jobs: [
      {
        id: 'morning-report',
        schedule: '0 7 * * 1-5',
        instructions: JOB,
        tools: ['calendar.list', 'mail.search', 'notify.owner'],
      },
      {
        id: 'inbox-triage',
        schedule: '*/30 * * * *',
        instructions: '# Triage\n\nLabel and archive.\n',
        tools: ['mail.search', 'mail.label', 'mail.archive'],
      },
    ],
    policy: makePolicy(),
  };
}

function toReversedKeys<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).toReversed()) as T;
}

function buildScrambled(defs: Definitions, seed: number): Definitions {
  const rules = defs.policy.rules.map((rule) => {
      const flipped: Rule = toReversedKeys({ ...rule });
      if (flipped.effects) {
        flipped.effects = flipped.effects.toReversed();
      }
      if (flipped.tools) {
        flipped.tools = [...flipped.tools, ...flipped.tools].toReversed();
      }
      return flipped;
    }),
    order =
      seed % 2 === 0
        ? rules.toReversed()
        : [...rules.slice(seed % rules.length), ...rules.slice(0, seed % rules.length)];
  return {
    persona: seed % 3 === 0 ? `﻿${defs.persona.replaceAll('\n', '\r\n')}\n\n` : defs.persona,
    jobs: defs.jobs
      .toReversed()
      .map((job) => ({ ...toReversedKeys(job), tools: job.tools.toReversed() })),
    policy: toReversedKeys({
      ...defs.policy,
      rules: order,
      tools: defs.policy.tools.toReversed(),
      knownContacts: defs.policy.knownContacts.toReversed(),
    }),
  };
}

function runHash(): void {
  const defs = buildDefs(),
    base = buildSnapshotHash(defs);
  let drift = 0;
  for (let seed = 0; seed < 1000; seed += 1) {
    if (buildSnapshotHash(buildScrambled(defs, seed)) !== base) {
      drift += 1;
    }
  }
  console.log(`base hash: ${base.slice(0, 16)}`);
  console.log(`equivalent reorderings that changed the hash: ${drift} of 1000`);

  const changes: [string, Definitions][] = [
    ['persona word', { ...defs, persona: PERSONA.replace('brief', 'terse') }],
    ['persona hard line break', { ...defs, persona: PERSONA.replace('direct.', 'direct.  ') }],
    [
      'job schedule',
      {
        ...defs,
        jobs: defs.jobs.map((job, index) =>
          index === 0 ? { ...job, schedule: '0 8 * * 1-5' } : job,
        ),
      },
    ],
    [
      'rule outcome',
      {
        ...defs,
        policy: {
          ...defs.policy,
          rules: defs.policy.rules.map((rule) =>
            rule.id === 'allow-notes' ? { ...rule, outcome: 'ask' as const } : rule,
          ),
        },
      },
    ],
    [
      'rule expiry added',
      {
        ...defs,
        policy: {
          ...defs.policy,
          rules: defs.policy.rules.map((rule) =>
            rule.id === 'allow-notes' ? { ...rule, expiresAt: 1 } : rule,
          ),
        },
      },
    ],
    [
      'known contact added',
      {
        ...defs,
        policy: {
          ...defs.policy,
          knownContacts: [...defs.policy.knownContacts, 'sam@example.com'],
        },
      },
    ],
    [
      'effect declaration',
      {
        ...defs,
        policy: {
          ...defs.policy,
          tools: defs.policy.tools.map((tool) =>
            tool.name === 'mail.trash' ? { ...tool, effects: ['delete' as const] } : tool,
          ),
        },
      },
    ],
    [
      'budget limit',
      {
        ...defs,
        policy: {
          ...defs.policy,
          budgets: [{ id: 'shopping-month', limit: 150, period: 'month' as const }],
        },
      },
    ],
  ];
  for (const [label, changed] of changes) {
    const moved = buildSnapshotHash(changed) !== base;
    console.log(`  ${label}: ${moved ? 'hash changed' : 'HASH UNCHANGED'}`);
  }
}

runHash();
