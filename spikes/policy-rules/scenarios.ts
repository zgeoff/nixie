/* oxlint-disable no-nested-ternary, max-lines, max-lines-per-function, max-statements, one-var, sort-vars, no-loop-func, prefer-spread -- a throwaway spike keeps each question in one readable pass */
// Question 4: how many prompts do scripted scenarios raise against the starter
// rule set with auto-mode off, and from which causes? Each scenario is a fixed
// sequence of tool calls; no model runs.
import type { Call, Cause, Ledger, Policy, Rule } from './engine.ts';
import { findTool, getDecision, getDestinations, isNamedVerbatim } from './engine.ts';
import { makePolicy } from './starter.ts';

interface Step {
  call: Omit<Call, 'time'>;
  note?: string;
  expectPrompt?: Cause;
  expectDeny?: boolean;
  answer?: 'once' | 'always';
  fromSearch?: boolean;
  addRule?: Rule;
  at?: number;
}

interface Scenario {
  name: string;
  steps: Step[];
}

const HOUR = 3600,
  BOOK = { sam: 'sam@example.com' };

function buildTalk(typed: string): {
  context: 'conversation';
  owner: { typed: string; requested: boolean };
  contactsBook: Record<string, string>;
} {
  return { context: 'conversation', owner: { typed, requested: true }, contactsBook: BOOK };
}

const TRIAGE_TOOLS = [
  'mail.search',
  'mail.read',
  'mail.label',
  'mail.archive',
  'mail.trash',
  'mail.draft',
  'mail.reply',
  'mail.send',
  'notify.owner',
];

function buildTriageCall(tool: string, args: Record<string, unknown> = {}): Omit<Call, 'time'> {
  return {
    tool,
    args,
    context: 'job',
    job: 'inbox-triage',
    toolList: TRIAGE_TOOLS,
    replyTarget: 'sender@example.org',
  };
}

const SCENARIOS: Scenario[] = [
  {
    name: 'find something on the web',
    steps: [
      {
        call: {
          tool: 'search.web',
          args: { q: 'botanic garden opening hours' },
          ...buildTalk('when does the botanic garden open on sunday?'),
        },
      },
      {
        call: {
          tool: 'web.fetch',
          args: { url: 'https://garden.example/visit' },
          ...buildTalk('when does the botanic garden open on sunday?'),
        },
      },
      {
        call: {
          tool: 'notes.write',
          args: {},
          ...buildTalk('when does the botanic garden open on sunday?'),
        },
      },
    ],
  },
  {
    name: 'find it and send it to an address the owner typed',
    steps: [
      {
        call: {
          tool: 'search.web',
          args: {},
          ...buildTalk('find friday trains to leeds and send them to sam@example.com'),
        },
      },
      {
        call: {
          tool: 'mail.send',
          args: { to: ['sam@example.com'] },
          ...buildTalk('find friday trains to leeds and send them to sam@example.com'),
        },
      },
    ],
  },
  {
    name: 'find it and send it to a saved contact by name',
    steps: [
      {
        call: {
          tool: 'mail.send',
          args: { to: ['sam@example.com'] },
          ...buildTalk('send those train times to Sam'),
        },
      },
    ],
  },
  {
    name: 'triage an inbox as a job run, with one injected email',
    steps: [
      { call: buildTriageCall('mail.search') },
      { call: buildTriageCall('mail.read') },
      { call: buildTriageCall('mail.label', { label: 'receipts' }) },
      { call: buildTriageCall('mail.archive') },
      { call: buildTriageCall('mail.trash') },
      { call: buildTriageCall('mail.draft') },
      { call: buildTriageCall('mail.reply', { to: ['sender@example.org'] }) },
      {
        call: buildTriageCall('mail.send', { to: ['partner@example.com'] }),
        note: 'known contact',
      },
      {
        call: buildTriageCall('mail.send', { to: ['attacker@evil.example'] }),
        note: 'injected forward',
        expectPrompt: 'outside_steering',
        answer: undefined,
      },
      {
        call: buildTriageCall('calendar.invite', { attendees: ['x@example.net'] }),
        expectDeny: true,
        note: 'tool not on the job list',
      },
      { call: buildTriageCall('notify.owner', { to: 'owner' }) },
    ],
  },
  {
    name: 'book a table',
    steps: [
      {
        call: {
          tool: 'search.web',
          args: {},
          ...buildTalk('book a table for 2 at the copper pot on friday at 7'),
        },
      },
      {
        call: {
          tool: 'booking.reserve',
          args: { venue: 'venue:copper-pot-riverside' },
          ...buildTalk('book a table for 2 at the copper pot on friday at 7'),
        },
        fromSearch: true,
        expectPrompt: 'outside_steering',
        answer: 'once',
      },
    ],
  },
  {
    name: 'buy within a lifting rule',
    steps: [
      {
        call: {
          tool: 'shop.buy',
          args: { merchant: 'shop.example', amount: 12 },
          ...buildTalk('buy the usb-c cable from shop.example'),
        },
      },
      {
        call: {
          tool: 'shop.buy',
          args: { merchant: 'shop.example', amount: 30 },
          ...buildTalk('and the $30 charger from shop.example'),
        },
        expectPrompt: 'always_ask',
        answer: 'once',
      },
      {
        call: {
          tool: 'shop.buy',
          args: { merchant: 'shop.example', amount: 18 },
          ...buildTalk('buy the cable for the office too from shop.example'),
        },
      },
      {
        call: {
          tool: 'shop.buy',
          args: { merchant: 'shop.example', amount: 19 },
          ...buildTalk('and another 4 of them from shop.example'),
        },
      },
      {
        call: {
          tool: 'shop.buy',
          args: { merchant: 'shop.example', amount: 19 },
          ...buildTalk('one more from shop.example'),
        },
      },
      {
        call: {
          tool: 'shop.buy',
          args: { merchant: 'shop.example', amount: 19 },
          ...buildTalk('one more from shop.example'),
        },
        expectPrompt: 'always_ask',
        note: 'month budget spent',
      },
    ],
  },
  {
    name: 'a tool no rule covers, then "always allow"',
    steps: [
      {
        call: { tool: 'home.lights', args: { room: 'study', on: true }, context: 'task' },
        expectPrompt: 'no_rule',
        answer: 'once',
      },
      {
        call: { tool: 'home.lights', args: { room: 'study', on: true }, context: 'task' },
        expectPrompt: 'no_rule',
        answer: 'once',
      },
      {
        call: { tool: 'home.lights', args: { room: 'study', on: true }, context: 'task' },
        expectPrompt: 'no_rule',
        answer: 'always',
      },
      {
        call: {
          tool: 'home.lights',
          args: { room: 'study', on: true },
          context: 'job',
          job: 'evening',
        },
      },
    ],
  },
  {
    name: 'a tool no rule covers, then the proposed rule',
    steps: [
      {
        call: { tool: 'home.lights', args: { room: 'hall', on: false }, context: 'task' },
        expectPrompt: 'no_rule',
        answer: 'once',
      },
      {
        call: { tool: 'home.lights', args: { room: 'hall', on: false }, context: 'task' },
        expectPrompt: 'no_rule',
        answer: 'once',
      },
      {
        call: { tool: 'home.lights', args: { room: 'hall', on: false }, context: 'task' },
        expectPrompt: 'no_rule',
        answer: 'once',
      },
      {
        call: { tool: 'rules.add', args: {}, context: 'task' },
        note: 'owner accepts the proposed rule from the digest',
        expectPrompt: 'always_ask',
        answer: 'once',
        addRule: {
          id: 'proposed-hall-lights',
          outcome: 'allow',
          tools: ['home.lights'],
          checks: [{ arg: 'room', op: 'eq', value: 'hall' }],
        },
      },
      { call: { tool: 'home.lights', args: { room: 'hall', on: false }, context: 'task' } },
    ],
  },
  {
    name: 'a direct request with no rule',
    steps: [
      {
        call: {
          tool: 'home.lights',
          args: { room: 'hall', on: true },
          ...buildTalk('turn the hall lights on'),
        },
      },
    ],
  },
  {
    name: 'morning report job',
    steps: ['calendar.list', 'mail.search', 'web.fetch']
      .map((tool) => ({ call: { tool, args: {}, context: 'job' as const, job: 'morning-report' } }))
      .concat([
        {
          call: {
            tool: 'notify.owner',
            args: { to: 'owner' },
            context: 'job',
            job: 'morning-report',
          },
        },
      ]),
  },
  {
    name: 'grant for a day',
    steps: [
      {
        call: {
          tool: 'rules.add',
          args: {},
          ...buildTalk('you have full authority over my calendar invites today'),
        },
        expectPrompt: 'always_ask',
        answer: 'once',
        addRule: {
          id: 'grant-calendar-today',
          outcome: 'allow',
          tools: ['calendar.invite'],
          destinations: ['*'],
          expiresAt: 10 * HOUR,
        },
      },
      {
        call: {
          tool: 'calendar.invite',
          args: { attendees: ['new1@example.net'] },
          context: 'task',
        },
        at: 2 * HOUR,
      },
      {
        call: {
          tool: 'calendar.invite',
          args: { attendees: ['new2@example.net'] },
          context: 'task',
        },
        at: 3 * HOUR,
      },
      {
        call: {
          tool: 'calendar.invite',
          args: { attendees: ['new3@example.net'] },
          context: 'task',
        },
        at: 11 * HOUR,
        expectPrompt: 'outside_steering',
        note: 'grant expired',
      },
    ],
  },
  {
    name: 'create a job that replies to email',
    steps: [
      {
        call: {
          tool: 'job.create',
          args: { tools: ['mail.search', 'mail.reply'] },
          ...buildTalk('every weekday, reply to routine emails for me'),
        },
        expectPrompt: 'ask_rule',
        answer: 'once',
      },
      {
        call: {
          tool: 'job.create',
          args: { tools: ['calendar.list', 'notify.owner'] },
          ...buildTalk('every morning, tell me what is on today'),
        },
      },
    ],
  },
  {
    name: 'delete for good',
    steps: [
      {
        call: { tool: 'mail.purge', args: {}, ...buildTalk('empty the trash') },
        expectPrompt: 'ask_rule',
        answer: 'once',
      },
    ],
  },
];

function getGroupKey(policy: Policy, call: Call): string {
  return `${call.tool}|${getDestinations(policy, call).join(',')}|${JSON.stringify(call.args)}`;
}

function buildAlwaysRule(policy: Policy, call: Call, index: number): Rule {
  const destinations = getDestinations(policy, call),
    checks = Object.entries(call.args)
      .filter(
        ([key, value]) =>
          !(findTool(policy, call.tool)?.destinationArgs ?? []).includes(key) &&
          typeof value !== 'object',
      )
      .map(([key, value]) => ({
        arg: key,
        op: 'eq' as const,
        value: value as string | number | boolean,
      }));
  return {
    id: `always-${index}`,
    outcome: 'allow',
    tools: [call.tool],
    destinations: destinations.length > 0 ? destinations : undefined,
    checks: checks.length > 0 ? checks : undefined,
  };
}

function runScenarios(): void {
  const lift: Rule = {
      id: 'lift-small-shopping',
      outcome: 'allow',
      tools: ['shop.buy'],
      destinations: ['shop.example'],
      lift: { perAction: 20, budget: 'shopping-month' },
    },
    totals = new Map<string, number>();
  let defects = 0,
    fromSearch = 0,
    mismatches = 0;
  for (const scenario of SCENARIOS) {
    const policy = makePolicy([lift]),
      ledger: Ledger = { spent: new Map() },
      always = new Set<string>(),
      approvals = new Map<string, number>(),
      lines: string[] = [];
    let prompts = 0;
    scenario.steps.forEach((step, index) => {
      const call: Call = { ...step.call, time: step.at ?? 0 },
        decision = getDecision(policy, call, ledger);
      let cause = decision.cause,
        gap = '';
      if (decision.outcome === 'ask') {
        prompts += 1;
        const key = getGroupKey(policy, call),
          verbatim = getDestinations(policy, call).every((destination) =>
            isNamedVerbatim(call, destination),
          );
        if (cause !== 'always_ask' && cause !== 'ask_rule' && call.owner?.requested && verbatim) {
          cause = 'direct_request';
        } else if (cause !== 'always_ask' && always.has(key)) {
          cause = 'repeat';
        }
        if (cause === 'direct_request' || cause === 'repeat') {
          defects += 1;
        }
        if (step.fromSearch) {
          fromSearch += 1;
        }
        totals.set(cause ?? 'none', (totals.get(cause ?? 'none') ?? 0) + 1);
        if (step.answer === 'always') {
          always.add(key);
          policy.rules.push(buildAlwaysRule(policy, call, index));
        }
        if (step.answer && cause === 'no_rule') {
          const count = (approvals.get(key) ?? 0) + 1;
          approvals.set(key, count);
          if (count === 3 && step.answer === 'once') {
            gap = `      gap: approved 3 times, nixie proposes a rule for ${call.tool}`;
          }
        }
      }
      if (step.addRule && (decision.outcome === 'allow' || step.answer)) {
        policy.rules.push(step.addRule);
      }
      const tool = findTool(policy, call.tool);
      if (tool?.amountArg && (decision.outcome === 'allow' || step.answer)) {
        ledger.spent.set(
          'shopping-month',
          (ledger.spent.get('shopping-month') ?? 0) + Number(call.args[tool.amountArg]),
        );
      }
      const expected = step.expectPrompt,
        wanted = expected ? 'ask' : step.expectDeny ? 'deny' : 'allow',
        ok = decision.outcome === wanted && (wanted !== 'ask' || cause === expected);
      if (!ok) {
        mismatches += 1;
      }
      const shown =
        decision.outcome === 'ask'
          ? `PROMPT ${cause}`
          : `${decision.outcome} (${decision.stage}${decision.rule ? ` ${decision.rule}` : ''})`;
      lines.push(
        `    ${ok ? ' ' : '!'} ${call.tool}: ${shown}${step.note ? ` - ${step.note}` : ''}`,
      );
      if (gap) {
        lines.push(gap);
      }
    });
    console.log(`${scenario.name}: ${prompts} prompt(s)`);
    for (const line of lines) {
      console.log(line);
    }
  }
  console.log('prompts by cause:');
  for (const [cause, count] of [...totals].toSorted()) {
    console.log(`  ${cause}: ${count}`);
  }
  console.log(`defects (causes 1 and 2): ${defects}`);
  console.log(`prompts where the destination came from search results: ${fromSearch}`);
  console.log(`steps that differed from the script's expectation: ${mismatches}`);

  // the expectations describe the starter set; the cautious run is a comparison
  if (mismatches > 0 && process.env.STARTER !== 'cautious') {
    process.exitCode = 1;
  }
}

runScenarios();
