import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildContractEnv,
  collectToolCalls,
  runModPolicyProbe,
} from '@heynixie/conversation/sdk-contract';
import invariant from 'tiny-invariant';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-mods-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { target: { directory, env: buildContractEnv(process.env, directory) } };
}

test.skipIf(!isContractRun)(
  'it lets a policy mod deny, rewrite and answer a tool call, and deny one that a rule allowed',
  async () => {
    const ctx = await setupTest();
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
        result: {
          isError: true,
          text: expect.toInclude('nixie-policy denied this command.'),
        },
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
  },
  32_000,
);

test.skipIf(!isContractRun)(
  'it leaves the mod command out of the session start when the mod throws as it loads',
  async () => {
    const ctx = await setupTest();
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
  },
  9000,
);

test.skipIf(!isContractRun)(
  'it denies a tool call when a hook throws and its registration has a catch handler',
  async () => {
    const ctx = await setupTest();
    const run = await runModPolicyProbe(ctx.target, 'throw-hook-catch');

    expect(collectToolCalls(run.messages)).toStrictEqual([
      {
        name: 'Bash',
        input: expect.objectContaining({ command: 'echo first MARK_NONE' }),
        result: {
          isError: true,
          text: expect.toInclude(
            'nixie policy failed (throw: nixie-throw-hook-catch: hook failed)',
          ),
        },
      },
    ]);
  },
  16_000,
);

// The stub-model suite leaves this case out: the CLI waits out its own hooks-worker watchdog, about
// 9 s, before it drops the mod, past the Agent SDK lane's 5 s limit.
test.skipIf(!isContractRun)(
  'it drops the mod command from the session when a hook wedges the hooks worker',
  async () => {
    const ctx = await setupTest();
    const run = await runModPolicyProbe(ctx.target, 'busy-loop');

    const init = run.messages.find(
      (message) => message.type === 'system' && message.subtype === 'init',
    );

    const changed = run.messages.findLast(
      (message) => message.type === 'system' && message.subtype === 'commands_changed',
    );

    invariant(init?.type === 'system' && init.subtype === 'init');
    invariant(changed?.type === 'system' && changed.subtype === 'commands_changed');

    expect(init.slash_commands).toContain('nixie-alive');
    expect(changed.commands.map((command) => command.name)).not.toContain('nixie-alive');

    expect(collectToolCalls(run.messages)).toStrictEqual([
      {
        name: 'Bash',
        input: expect.objectContaining({ command: 'echo first MARK_BLOCK' }),
        result: { isError: false, text: 'first MARK_BLOCK' },
      },
      {
        name: 'Bash',
        input: expect.objectContaining({ command: 'echo second MARK_DENY' }),
        result: { isError: false, text: 'second MARK_DENY' },
      },
    ]);
  },
  30_000,
);
