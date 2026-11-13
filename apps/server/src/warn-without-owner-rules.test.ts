import { expect, mock, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { startTestServer } from './test-utils/start-test-server';
import { warnWithoutOwnerRules } from './warn-without-owner-rules';

async function setupTest() {
  const server = await startTestServer();

  const log = mock(() => {});
  const root = join(server.dataDir, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  return {
    log,
    seed: () =>
      runSeed({
        log: server.context.log,
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [], tools: [] }),
      }),
    writeRules: (text: string) => writeFile(join(root, 'rules', 'starter.yaml'), text),
    warn: () => warnWithoutOwnerRules({ context: server.context, log }),
  };
}

test('it warns and names the first seeds pending proposal when only its allows are held', async () => {
  const ctx = await setupTest();

  await ctx.writeRules('allow-reads:\n  outcome: allow\n  effects: [read]\n');
  await ctx.seed();
  await ctx.warn();

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith(
    'policy.no_rules_in_force',
    {
      proposalID: expect.stringMatching(/^[a-z0-9]{10}$/u),
      action: expect.stringContaining('nixie proposals approve '),
    },
    'warn',
  );
});

test('it warns with no proposal when the definitions hold no rule', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.warn();

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith(
    'policy.no_rules_in_force',
    { proposalID: null, action: expect.stringContaining('Add rules') },
    'warn',
  );
});

test('it logs nothing once a rule of the owner is in force', async () => {
  const ctx = await setupTest();

  await ctx.writeRules('ask-exports:\n  outcome: ask\n  effects: [export]\n');
  await ctx.seed();
  await ctx.warn();

  expect(ctx.log).not.toHaveBeenCalled();
});
