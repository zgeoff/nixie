import { expect, test } from 'bun:test';
import { planParts } from './plan-parts';
import { serverPartDeclarations } from './server-part-declarations';

function setupTest() {
  return {
    findDeclaration: (name: string) =>
      serverPartDeclarations.find((candidate) => candidate.name === name),
  };
}

test.each([
  { part: 'turn_input_work', needed: 'erasure_catch_up', reason: 'the repair and intake wait' },
  { part: 'runners', needed: 'turn_input_work', reason: 'no step runs before the repair' },
  { part: 'erasure_watch', needed: 'erasure_catch_up', reason: 'a retry never races the catch-up' },
])('it makes $part need $needed, so $reason', (row) => {
  const ctx = setupTest();
  const declaration = ctx.findDeclaration(row.part);

  expect(declaration?.needs).toContain(row.needed);
});

test('it lets the mcp part read the tools part, which names the tools a proxied name must not take', () => {
  const ctx = setupTest();
  const declaration = ctx.findDeclaration('mcp');

  expect(declaration?.uses).toContain('tools');
});

test.each(['google_tools', 'connections', 'gmail_source'])(
  'it tags the %s part with the google feature',
  (part) => {
    const ctx = setupTest();

    expect(ctx.findDeclaration(part)?.feature).toBe('google');
  },
);

test('it leaves each google part out of the plan when the config has no google section', () => {
  const plan = planParts(['devices', 'mcp'], serverPartDeclarations);

  expect(
    [...plan.leftOut].filter((name) => /google|connections|gmail/u.test(name)).toSorted(),
  ).toStrictEqual(['connections', 'gmail_source', 'google_tools']);
});

test('it plans each google part when the config has a google section', () => {
  const plan = planParts(['devices', 'google', 'mcp'], serverPartDeclarations);

  expect(plan.parts.map((part) => part.name)).toIncludeAllMembers([
    'connections',
    'gmail_source',
    'google_tools',
    'held_credentials',
  ]);
});

test('it keeps the credential backend, which the mcp part reads, in a core part', () => {
  const ctx = setupTest();

  expect([
    ctx.findDeclaration('held_credentials')?.feature,
    ctx.findDeclaration('mcp')?.needs,
  ]).toStrictEqual([undefined, ['inputs', 'server_parts', 'held_credentials']]);
});

test.each(['web_fetch', 'actions', 'tool_endpoint'])(
  'it declares google_tools before %s, which reads it only when it has started',
  (part) => {
    const names = serverPartDeclarations.map((declaration) => declaration.name);

    expect(names.indexOf('google_tools')).toBeLessThan(names.indexOf(part));
  },
);
