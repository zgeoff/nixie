import { expect, test } from 'bun:test';
import { codingConfigSchema } from './coding-config-schema';

function setupTest() {
  const atc = {
    url: 'https://atc.example.net/mcp',
    principal: 'service:nixie',
    token: 'deployment:atc_token' as const,
    targets: [
      { daemon: 'laptop', target: 'local' },
      { daemon: 'cloud', target: 'cloud' },
    ],
    defaultTarget: 'cloud/cloud',
  };

  return { atc };
}

test('it gives the default wake sets and no atc block to an empty section', () => {
  expect(codingConfigSchema.parse({})).toStrictEqual({
    wake: {
      started: ['waiting', 'idle', 'blocked', 'decision', 'ended', 'gone'],
      joined: ['waiting', 'ended', 'gone'],
    },
    toolWaitMs: 5000,
  });
});

test('it reads the atc block', () => {
  const ctx = setupTest();

  expect(codingConfigSchema.parse({ atc: ctx.atc }).atc).toStrictEqual(ctx.atc);
});

test.each([
  { label: 'a url that is not https', change: { url: 'http://atc.example.net/mcp' }, path: 'url' },
  {
    label: 'a token that names another entry',
    change: { token: 'deployment:other' },
    path: 'token',
  },
  {
    label: 'a default target outside the targets',
    change: { defaultTarget: 'cloud/other' },
    path: 'defaultTarget',
  },
])('it refuses $label', (row) => {
  const ctx = setupTest();
  const result = codingConfigSchema.safeParse({ atc: { ...ctx.atc, ...row.change } });

  expect(result.error?.issues.map((issue) => issue.path.join('.'))).toStrictEqual([
    `atc.${row.path}`,
  ]);
});
