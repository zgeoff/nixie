import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { createPathSource } from './create-path-source';
import { runSeed } from './run-seed';
import { runSkillExports } from './run-skill-exports';
import { runWrittenSkillSeed } from './run-written-skill-seed';
import { buildStubDefinitionsRepo } from './test-utils/build-stub-definitions-repo';
import { writeSkillExportState } from './write-skill-export-state';
import { writeWrittenSkill } from './write-written-skill';
import { writeWrittenSkillBase } from './write-written-skill-base';
import { writeWrittenSkillState } from './write-written-skill-state';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-exports-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({
    dataDir: directory,
    clock: { now: () => Date.parse('2026-10-16T09:00:00Z'), sleep: () => Promise.resolve() },
  });

  stack.defer(() => writer.stop());

  await mkdir(root);

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    root,
    writer,
    log: { writer, deploymentKey, projections: [] },
    source: createPathSource({ directory: root }),
    repo: buildStubDefinitionsRepo(root),
  };
}

test('it exports an approved skill as a pull request that carries its files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, policy });

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  expect(result).toStrictEqual({
    exported: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
    closed: [],
  });

  expect(ctx.repo.readPullRequests()).toStrictEqual([
    {
      number: 1,
      url: 'https://definitions.test/pull/1',
      state: 'open',
      revision: expect.toBeString(),
      change: {
        branch: 'nixie/skill/tide-tables',
        title: 'Add the tide-tables skill that nixie wrote',
        body: expect.toInclude('approval `5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31`'),
        files: new Map([
          [
            'skills/tide-tables/SKILL.md',
            '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n',
          ],
        ]),
      },
    },
  ]);
});

test('it removes a file the base branch gained after the seed, at the revision it builds on', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'ports.md'), '# Ports\n');

  const revision = await ctx.repo.readBaseRevision();

  await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  expect(ctx.repo.readPullRequests()).toMatchObject([
    {
      revision,
      change: {
        files: new Map([
          ['skills/tide-tables/SKILL.md', `${text}By port.\n`],
          ['skills/tide-tables/ports.md', null],
        ]),
      },
    },
  ]);
});

test('it marks an exported skill as yours at the seed after you merge its pull request', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, policy });
  await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  await ctx.repo.mergePullRequest(1);

  const result = await runSeed({ log: ctx.log, source: ctx.source, policy });

  expect(result).toMatchObject({
    status: 'seeded',
    inForce: {
      skills: [{ name: 'tide-tables', skillHash: skill.skillHash, origin: 'definitions' }],
    },
    record: {
      payload: {
        writtenSkills: [],
        adoptedSkills: [
          { name: 'tide-tables', approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31' },
        ],
      },
    },
  });
});

test('it exports each approval once', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, policy });
  await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  expect(result).toStrictEqual({ exported: [], closed: [] });
});

test("it exports again on the new base when you keep nixie's version over a definitions change", async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, policy });
  await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), `${text}By tide.\n`);
  await runSeed({ log: ctx.log, source: ctx.source, policy });

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillBase(tx, { approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', at: 2 }),
  );

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  expect(result).toStrictEqual({
    exported: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
    closed: [],
  });

  expect(ctx.repo.readPullRequests()).toHaveLength(1);
});

test("it closes the pull request when you keep your definitions' version", async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 2,
    }),
  );

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  expect(result).toStrictEqual({
    exported: [],
    closed: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
  });

  expect(ctx.repo.readPullRequests()[0]?.state).toBe('closed');
});

test("it closes a retired approval's pull request before a later approval of the skill takes its branch", async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const first = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  const second = checkSkillFiles('tide-tables', [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\nBy port.\n',
    },
  ]);

  invariant('skillHash' in first);
  invariant('skillHash' in second);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill: first,
      approvedAt: 1,
    }),
  );

  await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 2,
    });

    await writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'w7tn4c9rhz',
      skill: second,
      approvedAt: 3,
    });
  });

  await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  expect(
    ctx.repo.readPullRequests().map((request) => ({
      number: request.number,
      state: request.state,
      skillText: request.change.files.get('skills/tide-tables/SKILL.md'),
    })),
  ).toStrictEqual([
    {
      number: 1,
      state: 'closed',
      skillText: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n',
    },
    {
      number: 2,
      state: 'open',
      skillText: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\nBy port.\n',
    },
  ]);
});

test('it passes a failed export to onError, and the next run exports it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  const onError = mock<(error: unknown) => void>();

  const failed = await runSkillExports({
    log: ctx.log,
    repo: { ...ctx.repo, writePullRequest: () => Promise.reject(new Error('the repo is down')) },
    onError,
  });

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  expect(failed).toStrictEqual({ exported: [], closed: [] });
  expect(onError).toHaveBeenCalledExactlyOnceWith(new Error('the repo is down'));

  expect(result).toStrictEqual({
    exported: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
    closed: [],
  });
});

test('it closes the pull request of a retired export that stopped before it recorded it, found by its branch', async () => {
  const ctx = await setupTest();

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    });

    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'exporting',
      baseHash: null,
      at: 2,
    });
  });

  const revision = await ctx.repo.readBaseRevision();

  await ctx.repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      body: 'first\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
    },
    revision,
  );

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 3,
    }),
  );

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  expect(result).toStrictEqual({
    exported: [],
    closed: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
  });

  expect(ctx.repo.readPullRequests()[0]?.state).toBe('closed');
});

test("it never closes a pull request that another approval's export holds", async () => {
  const ctx = await setupTest();

  const first = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  const second = checkSkillFiles('tide-tables', [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\nBy port.\n',
    },
  ]);

  invariant('skillHash' in first);
  invariant('skillHash' in second);

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill: first,
      approvedAt: 1,
    });

    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'exporting',
      baseHash: null,
      at: 2,
    });

    await writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 3,
    });

    await writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'w7tn4c9rhz',
      skill: second,
      approvedAt: 4,
    });
  });

  const revision = await ctx.repo.readBaseRevision();

  const held = await ctx.repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      body: 'second\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides by port\n']]),
    },
    revision,
  );

  await withWriteTransaction(ctx.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      to: 'opened',
      baseHash: null,
      pullRequest: held,
      at: 5,
    }),
  );

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  expect(result).toStrictEqual({
    exported: [],
    closed: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
  });

  expect(ctx.repo.readPullRequests()).toMatchObject([{ number: 1, state: 'open' }]);
});

test("it holds a later approval's export while the retired approval's pull request stays open", async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const first = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  const second = checkSkillFiles('tide-tables', [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\nBy port.\n',
    },
  ]);

  invariant('skillHash' in first);
  invariant('skillHash' in second);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill: first,
      approvedAt: 1,
    }),
  );

  await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 2,
    });

    await writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'w7tn4c9rhz',
      skill: second,
      approvedAt: 3,
    });
  });

  const onError = mock<(error: unknown) => void>();

  const result = await runSkillExports({
    log: ctx.log,
    repo: { ...ctx.repo, closePullRequest: () => Promise.reject(new Error('the repo is down')) },
    onError,
  });

  expect(result).toStrictEqual({ exported: [], closed: [] });
  expect(onError).toHaveBeenCalledExactlyOnceWith(new Error('the repo is down'));
  expect(ctx.repo.readPullRequests()).toMatchObject([{ number: 1, state: 'open' }]);
});
