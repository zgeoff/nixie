import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import invariant from 'tiny-invariant';
import { buildContractEnv } from '../test-utils/build-contract-env';
import { collectToolCalls } from '../test-utils/collect-tool-calls';
import { runContractQuery } from '../test-utils/run-contract-query';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

// The CLI writes type files into each mod it loads, so the probe loads a copy and never the
// committed mods.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-mods-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const options: Options = {
    cwd: directory,
    model: 'claude-haiku-5-5',
    settingSources: [],
    tools: ['Bash'],
    allowedTools: ['Bash'],
    permissionMode: 'default',
    permissionPrompts: 'none',
    maxTurns: 10,
    env: buildContractEnv(process.env, directory),
  };

  return { directory, options };
}

test.skipIf(!isContractRun)(
  'it lets a policy mod deny, rewrite and answer a tool call, and deny one that a rule allowed',
  async () => {
    const ctx = await setupTest();

    const mods = join(ctx.directory, 'mods');

    await cp(join(import.meta.dir, 'mods'), mods, { recursive: true });

    const run = await runContractQuery({
      prompt:
        'Run each of these shell commands with the Bash tool, one tool call per command, one after ' +
        'another, never in parallel. Do not retry or change any command.\n' +
        '1. echo plain MARK_NONE\n2. echo blocked MARK_DENY\n3. echo original MARK_REWRITE\n' +
        '4. echo original MARK_ANSWER\n5. echo original MARK_ANSWER_TEXT\n6. echo checked MARK_CHECK\n' +
        'Then reply DONE.',
      options: {
        ...ctx.options,
        plugins: [{ type: 'local', path: join(mods, 'nixie-policy') }],
      },
    });

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
  300_000,
);

test.skipIf(!isContractRun)(
  'it leaves the mod command out of the session start when the mod throws as it loads',
  async () => {
    const ctx = await setupTest();

    const mods = join(ctx.directory, 'mods');

    await cp(join(import.meta.dir, 'mods'), mods, { recursive: true });

    const run = await runContractQuery({
      prompt:
        'Run this shell command with the Bash tool, and do not retry or change it: ' +
        '`echo first MARK_DENY`. Then reply DONE.',
      options: {
        ...ctx.options,
        plugins: [{ type: 'local', path: join(mods, 'nixie-throw-load') }],
      },
    });

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
  300_000,
);

test.skipIf(!isContractRun)(
  'it denies a tool call when a hook throws and its registration has a catch handler',
  async () => {
    const ctx = await setupTest();

    const mods = join(ctx.directory, 'mods');

    await cp(join(import.meta.dir, 'mods'), mods, { recursive: true });

    const run = await runContractQuery({
      prompt:
        'Run this shell command with the Bash tool, and do not retry or change it: ' +
        '`echo first MARK_NONE`. Then reply DONE.',
      options: {
        ...ctx.options,
        plugins: [{ type: 'local', path: join(mods, 'nixie-throw-hook-catch') }],
      },
    });

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
  300_000,
);

test.skipIf(!isContractRun)(
  'it drops the mod command from the session when a hook wedges the hooks worker',
  async () => {
    const ctx = await setupTest();

    const mods = join(ctx.directory, 'mods');

    await cp(join(import.meta.dir, 'mods'), mods, { recursive: true });

    const run = await runContractQuery({
      prompt:
        'Run these two shell commands with the Bash tool, one tool call each, one after the other, ' +
        'and do not retry or change them: `echo first MARK_BLOCK`, then `echo second MARK_DENY`. ' +
        'Then reply DONE.',
      options: {
        ...ctx.options,
        plugins: [{ type: 'local', path: join(mods, 'nixie-busy-loop') }],
      },
    });

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
  300_000,
);
