import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
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
        message: 'Add the tide-tables skill that nixie wrote',
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

test('it exports a skill with the configured title and message', async () => {
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

  await runSkillExports({
    log: ctx.log,
    repo: ctx.repo,
    text: {
      title: 'skills: {operation} {skill}',
      message: '{agent} wrote it for {owner}, proposal {proposal}.',
      agentName: 'Wren',
      ownerName: 'Morgan',
    },
    onError: () => {},
  });

  expect(ctx.repo.readPullRequests()).toMatchObject([
    {
      change: {
        title: 'skills: add tide-tables',
        message: 'skills: add tide-tables\n\nWren wrote it for Morgan, proposal k3vq8m2xpa.',
        body: 'Wren wrote it for Morgan, proposal k3vq8m2xpa.',
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

test('it closes a pull request whose answer was lost once you retire its skill', async () => {
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

  ctx.repo.loseNextAnswer();

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

  expect(ctx.repo.readPullRequests()).toMatchObject([{ number: 1, state: 'closed' }]);
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
      at: 2,
    });
  });

  const revision = await ctx.repo.readBaseRevision();

  await ctx.repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      message: 'Add the tide-tables skill that nixie wrote',
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
      message: 'Add the tide-tables skill that nixie wrote',
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

test('it closes the pull request it wrote when a seed adopts the skill while the export runs', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text }]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  ctx.repo.delayNextAnswer(async () => {
    await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
    await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);
    await runSeed({ log: ctx.log, source: ctx.source, policy });
  });

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  const exports = await sql`select state, pull_request_number from skill_exports`.execute(
    ctx.writer.db,
  );

  const attempts = await sql`select approval_id from skill_export_attempts`.execute(ctx.writer.db);
  const written = await sql`select state from written_skills`.execute(ctx.writer.db);

  expect(result).toStrictEqual({
    exported: [],
    closed: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
  });

  expect(ctx.repo.readPullRequests()).toMatchObject([{ number: 1, state: 'closed' }]);
  expect(exports.rows).toStrictEqual([{ state: 'closed', pull_request_number: 1 }]);
  expect(attempts.rows).toStrictEqual([]);
  expect(written.rows).toStrictEqual([{ state: 'adopted' }]);
});

test('it closes the pull request of an adopted skill whose export stopped midway, found by its branch', async () => {
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
      at: 2,
    });

    await writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'adopted',
      at: 3,
    });
  });

  const revision = await ctx.repo.readBaseRevision();

  await ctx.repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      message: 'Add the tide-tables skill that nixie wrote',
      body: 'first\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
    },
    revision,
  );

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  const exports = await sql`select state, pull_request_number from skill_exports`.execute(
    ctx.writer.db,
  );

  const attempts = await sql`select approval_id from skill_export_attempts`.execute(ctx.writer.db);

  expect(result).toStrictEqual({
    exported: [],
    closed: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
  });

  expect(ctx.repo.readPullRequests()).toMatchObject([{ number: 1, state: 'closed' }]);
  expect(exports.rows).toStrictEqual([{ state: 'closed', pull_request_number: 1 }]);
  expect(attempts.rows).toStrictEqual([]);
});

test('it closes the export of every approval of a skill a seed adopted after its pull request merged, and leaves the merged pull request alone', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const first = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}Draft.\n` }]);
  const second = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text }]);

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

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'w7tn4c9rhz',
      skill: second,
      approvedAt: 2,
    }),
  );

  await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  await ctx.repo.mergePullRequest(1);

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  const written = await sql`select approval_id, state, definitions_hash, definitions_origin
    from written_skills order by approved_at`.execute(ctx.writer.db);

  const exports = await sql`select approval_id, state from skill_exports
    order by approval_id`.execute(ctx.writer.db);

  expect(result).toStrictEqual({
    exported: [],
    closed: ['9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74'],
  });

  expect(written.rows).toStrictEqual([
    {
      approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      state: 'superseded',
      definitions_hash: null,
      definitions_origin: null,
    },
    {
      approval_id: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      state: 'adopted',
      definitions_hash: second.skillHash,
      definitions_origin: 'definitions',
    },
  ]);

  expect(exports.rows).toStrictEqual([
    { approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', state: 'closed' },
    { approval_id: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74', state: 'closed' },
  ]);

  expect(ctx.repo.readPullRequests()).toMatchObject([{ number: 1, state: 'merged' }]);
});

test('it fills in an adopted skill that lacks its version and closes its opened export at the next seed and export run', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text }]);

  invariant('skillHash' in skill);

  // the state an adoption left before it recorded the version and closed the export
  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    });

    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'opened',
      baseHash: null,
      pullRequest: { number: 7, url: 'https://definitions.test/pull/7' },
      at: 2,
    });

    await writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'adopted',
      at: 3,
    });
  });

  await runSeed({ log: ctx.log, source: ctx.source, policy });
  await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  const written = await sql`select state, definitions_hash, definitions_origin
    from written_skills`.execute(ctx.writer.db);

  const exports = await sql`select state from skill_exports`.execute(ctx.writer.db);

  expect(written.rows).toStrictEqual([
    { state: 'adopted', definitions_hash: skill.skillHash, definitions_origin: 'definitions' },
  ]);

  expect(exports.rows).toStrictEqual([{ state: 'closed' }]);
});

test('it removes the stale export of a superseded approval once a seed adopts the approval after it', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const first = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}Draft.\n` }]);
  const second = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text }]);

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
      at: 2,
    });

    await writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'w7tn4c9rhz',
      skill: second,
      approvedAt: 3,
    });
  });

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);
  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });
  const attempts = await sql`select approval_id from skill_export_attempts`.execute(ctx.writer.db);
  const exports = await sql`select approval_id from skill_exports`.execute(ctx.writer.db);

  expect(result).toStrictEqual({
    exported: [],
    closed: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
  });

  expect(attempts.rows).toStrictEqual([]);
  expect(exports.rows).toStrictEqual([]);
});

test('it closes the open pull request an adopted export recorded, when its export stopped midway', async () => {
  const ctx = await setupTest();

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  const revision = await ctx.repo.readBaseRevision();

  const pullRequest = await ctx.repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      message: 'Add the tide-tables skill that nixie wrote',
      body: 'first\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
    },
    revision,
  );

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    });

    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'opened',
      baseHash: null,
      pullRequest,
      at: 2,
    });

    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'exporting',
      at: 3,
    });

    await writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'adopted',
      at: 4,
    });
  });

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  expect(result).toStrictEqual({
    exported: [],
    closed: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
  });

  expect(ctx.repo.readPullRequests()).toMatchObject([{ number: 1, state: 'closed' }]);
});

test('it never closes the pull request of a later approval in force over an adopted skill', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const adopted = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text }]);
  const later = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in adopted);
  invariant('skillHash' in later);

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill: adopted,
      approvedAt: 1,
    });

    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'exporting',
      at: 2,
    });

    await writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'adopted',
      at: 3,
    });

    await writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'w7tn4c9rhz',
      skill: later,
      approvedAt: 4,
    });
  });

  await runWrittenSkillSeed({ log: ctx.log, policy });

  const revision = await ctx.repo.readBaseRevision();

  const held = await ctx.repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      message: 'Add the tide-tables skill that nixie wrote',
      body: 'later\n',
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

  await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  const exports = await sql`select approval_id, state from skill_exports
    order by approval_id`.execute(ctx.writer.db);

  expect(ctx.repo.readPullRequests()).toMatchObject([{ number: 1, state: 'open' }]);

  expect(exports.rows).toStrictEqual([
    { approval_id: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74', state: 'opened' },
  ]);
});

test('it records a superseded export closed and leaves its pull request to the later approval, when the approval comes while it runs', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await runSeed({ log: ctx.log, source: ctx.source, policy: { rules: [], tools: [] } });

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

  ctx.repo.delayNextAnswer(() =>
    withWriteTransaction(ctx.writer, (tx) =>
      writeWrittenSkill(tx, {
        approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
        proposalID: 'w7tn4c9rhz',
        skill: second,
        approvedAt: 2,
      }),
    ),
  );

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });
  const exports = await sql`select approval_id, state from skill_exports`.execute(ctx.writer.db);
  const attempts = await sql`select approval_id from skill_export_attempts`.execute(ctx.writer.db);

  expect(result).toStrictEqual({
    exported: [],
    closed: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
  });

  expect(ctx.repo.readPullRequests()).toMatchObject([{ number: 1, state: 'open' }]);
  expect(exports.rows).toStrictEqual([]);
  expect(attempts.rows).toStrictEqual([]);
});

test('it never writes the pull request of a skill that left force after the run read it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await runSeed({ log: ctx.log, source: ctx.source, policy: { rules: [], tools: [] } });

  const knots = checkSkillFiles('anchor-knots', [
    { path: 'SKILL.md', text: '---\nname: anchor-knots\ndescription: Ties an anchor knot.\n---\n' },
  ]);

  const tides = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in knots);
  invariant('skillHash' in tides);

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill: knots,
      approvedAt: 1,
    });

    await writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'w7tn4c9rhz',
      skill: tides,
      approvedAt: 2,
    });
  });

  ctx.repo.delayNextAnswer(() =>
    withWriteTransaction(ctx.writer, (tx) =>
      writeWrittenSkillState(tx, {
        approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
        to: 'retired',
        at: 3,
      }),
    ),
  );

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });
  const attempts = await sql`select approval_id from skill_export_attempts`.execute(ctx.writer.db);

  expect(result).toStrictEqual({
    exported: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
    closed: ['9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74'],
  });

  expect(ctx.repo.readPullRequests().map((request) => request.change.branch)).toStrictEqual([
    'nixie/skill/anchor-knots',
  ]);

  expect(attempts.rows).toStrictEqual([]);
});

test('it closes the pull request it wrote when the skill is retired while the export runs', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await runSeed({ log: ctx.log, source: ctx.source, policy: { rules: [], tools: [] } });

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

  ctx.repo.delayNextAnswer(() =>
    withWriteTransaction(ctx.writer, (tx) =>
      writeWrittenSkillState(tx, {
        approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
        to: 'retired',
        at: 2,
      }),
    ),
  );

  const result = await runSkillExports({ log: ctx.log, repo: ctx.repo, onError: () => {} });

  const exports = await sql`select state, pull_request_number from skill_exports`.execute(
    ctx.writer.db,
  );

  const attempts = await sql`select approval_id from skill_export_attempts`.execute(ctx.writer.db);

  expect(result).toStrictEqual({
    exported: [],
    closed: ['5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31'],
  });

  expect(ctx.repo.readPullRequests()).toMatchObject([{ number: 1, state: 'closed' }]);
  expect(exports.rows).toStrictEqual([{ state: 'closed', pull_request_number: 1 }]);
  expect(attempts.rows).toStrictEqual([]);
});
