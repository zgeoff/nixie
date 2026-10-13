import { expect, test } from 'bun:test';
import { makeToolAllowRule } from './make-tool-allow-rule';

test('it matches a call through the tool the rule names', async () => {
  const findAllowRule = makeToolAllowRule('memory.remember');

  const match = await findAllowRule({ tool: 'memory.remember', thread: 'conversation' });

  expect(match).toStrictEqual({ ruleID: 'rule-memory.remember', revision: 1 });
});

test('it finds no rule for a call through another tool', async () => {
  const findAllowRule = makeToolAllowRule('memory.remember');

  const match = await findAllowRule({ tool: 'memory.edit', thread: 'conversation' });

  expect(match).toBeNull();
});
