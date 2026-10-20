import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildContentHash,
  checkSkillFiles,
  createPathSource,
  runSeed,
  runSkillExports,
  runWrittenSkillSeed,
  writeWrittenSkill,
} from '@heynixie/definitions';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { createRouterClient } from '@orpc/server';
import invariant from 'tiny-invariant';
import { createHostWrittenSkillProcedures } from './create-host-written-skill-procedures';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-host-written-skills-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(root);

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [] };
  const policy = { rules: [], tools: [] };
  const clock = buildTestClock(Date.UTC(2026, 2, 3, 10, 0));

  const runWrittenSeed = async () => {
    await runWrittenSkillSeed({ log, policy });
  };

  const procedures = createHostWrittenSkillProcedures({
    log,
    clock,
    definitions: () => ({ snapshotHash: 'snapshot-a' }),
    seedWrittenSkills: runWrittenSeed,
  });

  const client = createRouterClient(procedures);

  return { log, root, policy, source: createPathSource({ directory: root }), client };
}

test('#list shows a written skill whose definitions changed after the approval as a conflict', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const first = await runSeed({ log: ctx.log, source: ctx.source, policy: ctx.policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.log.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: Date.UTC(2026, 2, 3, 9, 0),
    }),
  );

  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), `${text}By hour.\n`);
  await runSeed({ log: ctx.log, source: ctx.source, policy: ctx.policy });

  const base = first.inForce?.skills[0];

  const edited = new Map([['SKILL.md', new TextEncoder().encode(`${text}By hour.\n`)]]);

  invariant(base);

  const listed = await ctx.client.list();

  expect(listed).toStrictEqual([
    {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      name: 'tide-tables',
      skillHash: skill.skillHash,
      base: { skillHash: base.skillHash, origin: 'definitions' },
      definitions: { skillHash: buildContentHash(edited), origin: 'definitions' },
      isConflict: true,
      pullRequestURL: null,
      approvedAt: new Date(Date.UTC(2026, 2, 3, 9, 0)),
    },
  ]);
});

test('#list shows the pull request that carries a written skill to the definitions repo', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await runSeed({ log: ctx.log, source: ctx.source, policy: ctx.policy });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.log.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: Date.UTC(2026, 2, 3, 9, 0),
    }),
  );

  await runSkillExports({
    log: ctx.log,
    repo: {
      readFile: () => Promise.resolve(null),
      writePullRequest: () =>
        Promise.resolve({ number: 3, url: 'https://github.test/harbour/definitions/pull/3' }),
      closePullRequest: () => Promise.resolve(),
    },
    onError: () => {},
  });

  const listed = await ctx.client.list();

  expect(listed).toMatchObject([
    {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      pullRequestURL: 'https://github.test/harbour/definitions/pull/3',
    },
  ]);
});

test('#resolve keeps the definitions version and lists the written skill no more', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await runSeed({ log: ctx.log, source: ctx.source, policy: ctx.policy });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.log.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  const resolved = await ctx.client.resolve({
    approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
    keep: 'definitions',
  });

  const listed = await ctx.client.list();

  expect(resolved).toStrictEqual({
    approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
    keep: 'definitions',
  });

  expect(listed).toStrictEqual([]);
});

test('#resolve refuses a written skill that left force with its code', async () => {
  const ctx = await setupTest();

  const refusal = await ctx.client
    .resolve({ approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', keep: 'nixie' })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refusal).toMatchObject({ code: 'WRONG_STATE', status: 409 });
});
