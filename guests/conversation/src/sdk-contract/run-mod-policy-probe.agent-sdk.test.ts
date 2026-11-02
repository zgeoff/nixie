import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { collectToolCalls } from './collect-tool-calls';
import { runModPolicyProbe } from './run-mod-policy-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-mods-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it lets a policy mod deny, rewrite and answer a tool call, and deny one that a rule allowed', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'Bash', input: { command: 'echo plain MARK_NONE' } } },
    { toolUse: { name: 'Bash', input: { command: 'echo blocked MARK_DENY' } } },
    { toolUse: { name: 'Bash', input: { command: 'echo original MARK_REWRITE' } } },
    { toolUse: { name: 'Bash', input: { command: 'echo original MARK_ANSWER' } } },
    { toolUse: { name: 'Bash', input: { command: 'echo original MARK_ANSWER_TEXT' } } },
    { toolUse: { name: 'Bash', input: { command: 'echo checked MARK_CHECK' } } },
    { text: 'DONE' },
  );

  const run = await runModPolicyProbe(ctx.target, 'policy');

  const init = run.messages.find(
    (message) => message.type === 'system' && message.subtype === 'init',
  );

  invariant(init?.type === 'system' && init.subtype === 'init');

  expect(init.slash_commands).toContain('nixie-alive');

  expect(collectToolCalls(run.messages)).toStrictEqual([
    {
      name: 'Bash',
      input: expect.objectContaining({ command: 'echo plain MARK_NONE' }),
      result: { isError: false, text: 'plain MARK_NONE' },
    },
    {
      name: 'Bash',
      input: expect.objectContaining({ command: 'echo blocked MARK_DENY' }),
      result: { isError: true, text: expect.toInclude('nixie-policy denied this command.') },
    },
    {
      name: 'Bash',
      input: expect.objectContaining({ command: 'echo original MARK_REWRITE' }),
      result: { isError: false, text: 'rewritten-by-nixie' },
    },
    {
      name: 'Bash',
      input: expect.objectContaining({ command: 'echo original MARK_ANSWER' }),
      result: { isError: false, text: 'answered-by-nixie' },
    },
    {
      name: 'Bash',
      input: expect.objectContaining({ command: 'echo original MARK_ANSWER_TEXT' }),
      result: { isError: true, text: expect.toInclude('does not match its output shape') },
    },
    {
      name: 'Bash',
      input: expect.objectContaining({ command: 'echo checked MARK_CHECK' }),
      result: {
        isError: true,
        text: expect.toInclude('nixie-policy tool.check denied this command.'),
      },
    },
  ]);

  expect(run.messages).toPartiallyContain({
    type: 'system',
    subtype: 'permission_denied',
    tool_name: 'Bash',
  });
});

test('it leaves the mod command out of the session start when the mod throws as it loads', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'Bash', input: { command: 'echo first MARK_DENY' } } },
    { text: 'DONE' },
  );

  const run = await runModPolicyProbe(ctx.target, 'throw-load');

  const init = run.messages.find(
    (message) => message.type === 'system' && message.subtype === 'init',
  );

  invariant(init?.type === 'system' && init.subtype === 'init');

  expect(init.plugins).toPartiallyContain({ name: 'nixie-throw-load' });
  expect(init.slash_commands).not.toContain('nixie-alive');

  expect(collectToolCalls(run.messages)).toStrictEqual([
    {
      name: 'Bash',
      input: expect.objectContaining({ command: 'echo first MARK_DENY' }),
      result: { isError: false, text: 'first MARK_DENY' },
    },
  ]);
});

test('it denies a tool call when a hook throws and its registration has a catch handler', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'Bash', input: { command: 'echo first MARK_NONE' } } },
    { text: 'DONE' },
  );

  const run = await runModPolicyProbe(ctx.target, 'throw-hook-catch');

  expect(collectToolCalls(run.messages)).toStrictEqual([
    {
      name: 'Bash',
      input: expect.objectContaining({ command: 'echo first MARK_NONE' }),
      result: {
        isError: true,
        text: expect.toInclude('nixie policy failed (throw: nixie-throw-hook-catch: hook failed)'),
      },
    },
  ]);
});
