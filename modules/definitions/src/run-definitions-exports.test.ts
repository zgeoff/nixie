import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildSkillChangeKind } from './build-skill-change-kind';
import { checkSkillFiles } from './check-skill-files';
import { createPathSource } from './create-path-source';
import { runDefinitionsExports } from './run-definitions-exports';
import { runSeed } from './run-seed';
import { runWrittenSkillSeed } from './run-written-skill-seed';
import { buildStubDefinitionsRepo } from './test-utils/build-stub-definitions-repo';
import type { DefinitionsChangeKind } from './types';
import { writeWrittenSkill } from './write-written-skill';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-definitions-exports-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({
    dataDir: directory,
    clock: { now: () => Date.parse('2026-10-20T08:00:00Z'), sleep: () => Promise.resolve() },
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

test('it exports a second change kind beside skills through the same pull request path', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('moon-phases', [
    { path: 'SKILL.md', text: '---\nname: moon-phases\ndescription: Names a moon phase.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '0c4e7a19-6b2d-4f80-9e35-a1d8c2f47b60',
      proposalID: 'r7tn2x9wqe',
      skill,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, policy });

  const writeState = mock<DefinitionsChangeKind['writeState']>(() => Promise.resolve());

  const stubKind: DefinitionsChangeKind = {
    readDue: () =>
      Promise.resolve([
        {
          approvalID: '9f3b6d21-4a7e-4c18-b2f5-6e0d8a3c1f94',
          branch: 'nixie/stub/greeting',
          baseHash: 'base-greeting',
          readChange: () =>
            Promise.resolve({
              branch: 'nixie/stub/greeting',
              title: 'Change the greeting',
              message: 'Change the greeting',
              body: 'The stub change kind wrote this change.\n',
              files: new Map([['stub/greeting.md', 'Good evening.\n']]),
            }),
        },
      ]),
    readClosing: () => Promise.resolve([]),
    probeInForce: () => Promise.resolve(true),
    probePullRequestHeld: () => Promise.resolve(false),
    writeState,
  };

  const result = await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [
      buildSkillChangeKind({ title: null, message: null, agentName: null, ownerName: null }),
      stubKind,
    ],
    onError: () => {},
  });

  expect(result).toStrictEqual({
    exported: ['0c4e7a19-6b2d-4f80-9e35-a1d8c2f47b60', '9f3b6d21-4a7e-4c18-b2f5-6e0d8a3c1f94'],
    closed: [],
  });

  expect(ctx.repo.readPullRequests()).toMatchObject([
    { number: 1, state: 'open', change: { branch: 'nixie/skill/moon-phases' } },
    {
      number: 2,
      state: 'open',
      change: {
        branch: 'nixie/stub/greeting',
        title: 'Change the greeting',
        body: 'The stub change kind wrote this change.\n',
        files: new Map([['stub/greeting.md', 'Good evening.\n']]),
      },
    },
  ]);

  expect(writeState.mock.calls.map(([, move]) => move)).toStrictEqual([
    {
      approvalID: '9f3b6d21-4a7e-4c18-b2f5-6e0d8a3c1f94',
      to: 'exporting',
      at: Date.parse('2026-10-20T08:00:00Z'),
    },
    {
      approvalID: '9f3b6d21-4a7e-4c18-b2f5-6e0d8a3c1f94',
      to: 'opened',
      baseHash: 'base-greeting',
      pullRequest: { number: 2, url: 'https://definitions.test/pull/2' },
      at: Date.parse('2026-10-20T08:00:00Z'),
    },
  ]);
});

test('it closes the recorded pull request of a change kind and records the close', async () => {
  const ctx = await setupTest();
  const revision = await ctx.repo.readBaseRevision();

  const opened = await ctx.repo.writePullRequest(
    {
      branch: 'nixie/stub/greeting',
      title: 'Change the greeting',
      message: 'Change the greeting',
      body: 'The stub change kind wrote this change.\n',
      files: new Map([['stub/greeting.md', 'Good evening.\n']]),
    },
    revision,
  );

  const writeState = mock<DefinitionsChangeKind['writeState']>(() => Promise.resolve());

  const result = await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [
      {
        readDue: () => Promise.resolve([]),
        readClosing: () =>
          Promise.resolve([
            {
              approvalID: '9f3b6d21-4a7e-4c18-b2f5-6e0d8a3c1f94',
              branch: 'nixie/stub/greeting',
              recordedPullRequest: opened.number,
              isBranchRead: false,
            },
          ]),
        probeInForce: () => Promise.resolve(false),
        probePullRequestHeld: () => Promise.resolve(false),
        writeState,
      },
    ],
    onError: () => {},
  });

  expect(result).toStrictEqual({
    exported: [],
    closed: ['9f3b6d21-4a7e-4c18-b2f5-6e0d8a3c1f94'],
  });

  expect(ctx.repo.readPullRequests()).toMatchObject([{ number: 1, state: 'closed' }]);

  expect(writeState.mock.calls.map(([, move]) => move)).toStrictEqual([
    {
      approvalID: '9f3b6d21-4a7e-4c18-b2f5-6e0d8a3c1f94',
      to: 'closed',
      pullRequest: null,
      at: Date.parse('2026-10-20T08:00:00Z'),
    },
  ]);
});

test('it passes a failed export to onError and goes on to the next change kind', async () => {
  const ctx = await setupTest();

  const onError = mock<(error: unknown) => void>();

  const result = await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [
      {
        readDue: () =>
          Promise.resolve([
            {
              approvalID: '3d8a1f60-7c2b-4e94-a5d7-b9e04f6c2a18',
              branch: 'nixie/stub/farewell',
              baseHash: null,
              readChange: () => Promise.reject(new Error('the farewell part is missing')),
            },
          ]),
        readClosing: () => Promise.resolve([]),
        probeInForce: () => Promise.resolve(true),
        probePullRequestHeld: () => Promise.resolve(false),
        writeState: () => Promise.resolve(),
      },
      {
        readDue: () =>
          Promise.resolve([
            {
              approvalID: '9f3b6d21-4a7e-4c18-b2f5-6e0d8a3c1f94',
              branch: 'nixie/stub/greeting',
              baseHash: null,
              readChange: () =>
                Promise.resolve({
                  branch: 'nixie/stub/greeting',
                  title: 'Change the greeting',
                  message: 'Change the greeting',
                  body: 'The stub change kind wrote this change.\n',
                  files: new Map([['stub/greeting.md', 'Good evening.\n']]),
                }),
            },
          ]),
        readClosing: () => Promise.resolve([]),
        probeInForce: () => Promise.resolve(true),
        probePullRequestHeld: () => Promise.resolve(false),
        writeState: () => Promise.resolve(),
      },
    ],
    onError,
  });

  expect(result).toStrictEqual({
    exported: ['9f3b6d21-4a7e-4c18-b2f5-6e0d8a3c1f94'],
    closed: [],
  });

  expect(onError.mock.calls).toStrictEqual([
    [expect.objectContaining({ message: 'the farewell part is missing' })],
  ]);
});
