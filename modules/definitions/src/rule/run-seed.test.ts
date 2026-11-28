import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Projection } from '@heynixie/log';
import { readRecords, startWriter, withWriteTransaction, writeRecords } from '@heynixie/log';
import { placesProjection, readPlaceRefs } from '@heynixie/policy';
import { buildProposalsProjection } from '@heynixie/proposals';
import { tasksProjections } from '@heynixie/tasks';
import { writeTestTriggerFire } from '@heynixie/tasks/test-utils';
import { triggersProjections } from '@heynixie/triggers';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { buildDefinitionsSnapshot } from '../definition/build-definitions-snapshot';
import { createPathSource } from '../definition/create-path-source';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import { readSnapshotToolEffects } from '../seed/read-snapshot-tool-effects';
import { checkSkillFiles } from '../skill/check-skill-files';
import { loadSnapshotSkills } from '../skill/load-snapshot-skills';
import { writeSkillExportState } from '../skill/write-skill-export-state';
import { readDefinitionVersion } from '../task/read-definition-version';
import { TaskSeedRefusedError } from '../task/task-seed-refused-error';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { buildTestToolDeclaration } from '../test-utils/build-test-tool-declaration';
import { createStubGitSyncWorktree } from '../test-utils/create-stub-git-sync-worktree';
import { seedLegacyRuleProposal } from '../test-utils/seed-legacy-rule-proposal';
import { useStubSection } from '../test-utils/use-stub-section';
import { buildContentHash } from '../utils/build-content-hash';
import { buildSHA256 } from '../utils/build-sha256';
import { DefinitionsParseError } from '../utils/definitions-parse-error';
import { toCanonicalJSON } from '../utils/to-canonical-json';
import { readWrittenSkills } from '../written/read-written-skills';
import { writeWrittenSkill } from '../written/write-written-skill';
import { writeWrittenSkillState } from '../written/write-written-skill-state';
import { mapRuleProposalRecord } from './map-rule-proposal-record';
import { readRuleProposals } from './read-rule-proposals';
import { readRulesInForce } from './read-rules-in-force';
import { ruleFiresProjection } from './rule-fires-projection';
import { runSeed } from './run-seed';

async function setupTest(config: { readonly projections?: readonly Projection[] } = {}) {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-seed-'));

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
    directory,
    root,
    writer,
    log: { writer, deploymentKey, projections: config.projections ?? [] },
    source: createPathSource({ directory: root }),
  };
}

test('it seeds the persona and records the source ID, the revision and the content hash', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [{ id: 'allow-reads' }], tools: [] };

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const manifest = new TextEncoder().encode('format: 2\n');
  const persona = new TextEncoder().encode('# Persona\n');

  const files = new Map([
    ['nixie.yaml', manifest],
    ['persona.md', persona],
  ]);

  const built = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    tasks: [],
    persona: '# Persona\n',
    prompts: {},
    policy,
  });

  expect(result).toMatchObject({
    status: 'seeded',
    record: {
      sequence: 1,
      kind: 'definitions_seeded',
      definitions: { snapshotHash: built.snapshotHash, personaVersion: built.personaVersion },
      payload: {
        sourceID: `path:${ctx.root}`,
        sourceKind: 'path',
        sourceRepository: null,
        revision: buildContentHash(files),
        contentHash: buildContentHash(files),
        formatVersion: 2,
        policyHash: built.policyHash,
        unapplied: [],
        skipped: [],
      },
    },
  });
});

test('it builds the policy from the prompt overrides it seeds, keeps them in force, and writes no override text to the event log', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'nixie.yaml'),
    'format: 3\nprompts:\n  retirement-checker:\n    safety: prompts/retire.md\n',
  );

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'prompts'));
  await writeFile(join(ctx.root, 'prompts', 'retire.md'), 'Give one plain reason.\n');

  const buildPolicy = mock(() => ({ rules: [], tools: [] }));

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy,
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  invariant(result.status === 'seeded');

  const prompts = {
    'retirement-checker': { parts: { safety: 'Give one plain reason.' }, template: null },
  };

  expect(buildPolicy).toHaveBeenCalledExactlyOnceWith(prompts);
  expect(inForce?.prompts).toStrictEqual(prompts);
  expect(JSON.stringify(result.record.payload)).not.toInclude('Give one plain reason');
});

test('it changes the snapshot hash when a prompt part file changes', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'nixie.yaml'),
    'format: 3\nprompts:\n  compaction:\n    instruction: prompts/writer.md\n',
  );

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'prompts'));
  await writeFile(join(ctx.root, 'prompts', 'writer.md'), 'Keep durable facts.\n');

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeFile(join(ctx.root, 'prompts', 'writer.md'), 'Keep durable facts only.\n');

  const second = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect(second.inForce?.snapshotHash).not.toBe(first.inForce?.snapshotHash);
});

test('it seeds a plain directory with its content hash as the revision and no repository', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const seeds = await sql`select source_id, source_kind, source_repository, revision, content_hash
    from definition_seeds`.execute(ctx.writer.db);

  const contentHash = buildContentHash(
    new Map([
      ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
      ['persona.md', new TextEncoder().encode('# Persona\n')],
    ]),
  );

  expect(seeds.rows).toStrictEqual([
    {
      source_id: `path:${ctx.root}`,
      source_kind: 'path',
      source_repository: null,
      revision: contentHash,
      content_hash: contentHash,
    },
  ]);
});

test('it seeds a git-sync worktree with its commit as the revision and names the repository', async () => {
  const ctx = await setupTest();

  const sync = join(ctx.directory, 'sync');

  const worktree = await createStubGitSyncWorktree(sync, {
    commit: '5be0c4f1a9d27e83b6c0f4a1d9e72b5c8a3f6d10',
    config: '[remote "origin"]\n\turl = https://git.example.test/harbor-lab/tern-definitions\n',
  });

  await writeFile(join(worktree, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(worktree, 'persona.md'), '# Persona\n');

  const source = createPathSource({ directory: join(sync, 'current') });

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const seeds = await sql`select source_id, source_kind, source_repository, revision, content_hash
    from definition_seeds`.execute(ctx.writer.db);

  const contentHash = buildContentHash(
    new Map([
      ['nixie.yaml', new TextEncoder().encode('format: 2\n')],
      ['persona.md', new TextEncoder().encode('# Persona\n')],
    ]),
  );

  expect(seeds.rows).toStrictEqual([
    {
      source_id: `path:${join(sync, 'current')}`,
      source_kind: 'path',
      source_repository: 'https://git.example.test/harbor-lab/tern-definitions',
      revision: '5be0c4f1a9d27e83b6c0f4a1d9e72b5c8a3f6d10',
      content_hash: contentHash,
    },
  ]);

  expect(result).toMatchObject({
    status: 'seeded',
    record: {
      payload: {
        sourceRepository: 'https://git.example.test/harbor-lab/tern-definitions',
        revision: '5be0c4f1a9d27e83b6c0f4a1d9e72b5c8a3f6d10',
        contentHash,
      },
    },
  });
});

test('it returns the definitions it put in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\r\n\r\nWarm, brief.');

  const policy = { rules: [], tools: [] };

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const snapshot = await ctx.source.snapshot();

  const built = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    tasks: [],
    persona: '# Persona\n\nWarm, brief.\n',
    prompts: {},
    policy,
  });

  expect(result.inForce).toStrictEqual({
    seededAt: new Date(ctx.writer.clock.now()),
    sourceID: `path:${ctx.root}`,
    sourceKind: 'path',
    sourceRepository: null,
    revision: snapshot.revision,
    contentHash: snapshot.contentHash,
    formatVersion: 2,
    snapshotHash: built.snapshotHash,
    personaVersion: built.personaVersion,
    persona: '# Persona\n\nWarm, brief.\n',
    prompts: {},
    policyHash: built.policyHash,
    recordSequence: 1,
    skills: [],
    conversationSkills: [],
    tasks: [],
    sections: {},
  });
});

test('it keeps the snapshot under its hash with the revision as its label', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [{ name: 'web_fetch', effects: ['fetch'] }] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const snapshot = await ctx.source.snapshot();

  const built = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    tasks: [],
    persona: '# Persona\n',
    prompts: {},
    policy,
  });

  const snapshots = await sql`select snapshot_hash, persona_version, policy_hash, form, label
    from definition_snapshots`.execute(ctx.writer.db);

  expect(snapshots.rows).toStrictEqual([
    {
      snapshot_hash: built.snapshotHash,
      persona_version: built.personaVersion,
      policy_hash: built.policyHash,
      form: built.form,
      label: snapshot.revision,
    },
  ]);
});

test('it lists each policy file it left unapplied and each path the filter skipped', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));
  await writeFile(join(ctx.root, 'rules', 'mail.yaml'), 'id: mail\noutcome: deny\n');
  await writeFile(join(ctx.root, 'rules', 'web.yaml'), 'id: web\noutcome: allow\n');
  await writeFile(join(ctx.root, 'README.txt'), 'not a definition\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect(result).toMatchObject({
    status: 'seeded',
    record: {
      payload: { unapplied: ['rules/mail.yaml', 'rules/web.yaml'], skipped: ['README.txt'] },
    },
  });
});

test('it keeps the last seed when a later snapshot fails to parse', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: [1\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const seeds = await sql`select seed, record_sequence from definition_seeds`.execute(
    ctx.writer.db,
  );

  expect(result).toMatchObject({
    status: 'refused',
    error: { name: 'DefinitionsParseError', problems: [{ path: 'nixie.yaml' }] },
    inForce: first.inForce,
  });

  expect(seeds.rows).toStrictEqual([{ seed: 1, record_sequence: 1 }]);
});

test('it writes no record for a snapshot it refuses', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  await writeFile(join(ctx.root, 'persona.md'), '');

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(records.map((read) => [read.record.sequence, read.record.kind])).toStrictEqual([
    [1, 'definitions_seeded'],
  ]);
});

test('it keeps the last seed when the source refuses the snapshot', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  await writeFile(join(ctx.directory, 'secret.md'), 'outside\n');
  await mkdir(join(ctx.root, 'rules'));
  await symlink(join(ctx.directory, 'secret.md'), join(ctx.root, 'rules', 'escape.md'));

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  expect(result).toMatchObject({
    status: 'refused',
    error: { name: 'SnapshotError', paths: ['rules/escape.md'] },
    inForce: first.inForce,
  });
});

test('it refuses a first snapshot that fails to parse and leaves no seed', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 8\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const seeds = await sql`select seed from definition_seeds`.execute(ctx.writer.db);

  expect(result).toMatchObject({
    status: 'refused',
    error: { name: 'DefinitionsParseError' },
    inForce: null,
  });

  expect(seeds.rows).toStrictEqual([]);
});

test('it seeds again when git-sync moves to a new commit over the same files', async () => {
  const ctx = await setupTest();

  const sync = join(ctx.directory, 'sync');

  const first = await createStubGitSyncWorktree(sync, {
    commit: '5be0c4f1a9d27e83b6c0f4a1d9e72b5c8a3f6d10',
    config: '[remote "origin"]\n\turl = https://git.example.test/harbor-lab/tern-definitions\n',
  });

  await writeFile(join(first, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(first, 'persona.md'), '# Persona\n');

  const source = createPathSource({ directory: join(sync, 'current') });
  const policy = { rules: [], tools: [] };

  await runSeed({ tasks: buildTestTaskSeed(), log: ctx.log, source, buildPolicy: () => policy });

  const second = await createStubGitSyncWorktree(sync, {
    commit: 'a3d91f6c0e2b84d7f5c1a9e3b6d0f2c8e4a7b519',
    config: '[remote "origin"]\n\turl = https://git.example.test/harbor-lab/tern-definitions\n',
  });

  await writeFile(join(second, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(second, 'persona.md'), '# Persona\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source,
    buildPolicy: () => policy,
  });

  expect(result.status).toBe('seeded');
  expect(result.inForce?.revision).toBe('a3d91f6c0e2b84d7f5c1a9e3b6d0f2c8e4a7b519');
});

test('it seeds again when the origin changes over the same commit and files', async () => {
  const ctx = await setupTest();

  const sync = join(ctx.directory, 'sync');

  const worktree = await createStubGitSyncWorktree(sync, {
    commit: '5be0c4f1a9d27e83b6c0f4a1d9e72b5c8a3f6d10',
    config: '[remote "origin"]\n\turl = https://git.example.test/harbor-lab/tern-definitions\n',
  });

  await writeFile(join(worktree, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(worktree, 'persona.md'), '# Persona\n');

  const source = createPathSource({ directory: join(sync, 'current') });
  const policy = { rules: [], tools: [] };

  await runSeed({ tasks: buildTestTaskSeed(), log: ctx.log, source, buildPolicy: () => policy });

  await writeFile(
    join(sync, '.git', 'config'),
    '[remote "origin"]\n\turl = https://git.example.test/gannet-co/tern-definitions\n',
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source,
    buildPolicy: () => policy,
  });

  expect(result.status).toBe('seeded');

  expect(result.inForce?.sourceRepository).toBe(
    'https://git.example.test/gannet-co/tern-definitions',
  );
});

test('it writes nothing when the newest seed already holds the same definitions', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(result.status).toBe('unchanged');
  expect(result.inForce).toStrictEqual(first.inForce);
  expect(records.map((read) => read.record.sequence)).toStrictEqual([1]);
});

test('it puts an edited persona in force under a new snapshot hash', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  await writeFile(join(ctx.root, 'persona.md'), '# Persona, edited\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const built = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    tasks: [],
    persona: '# Persona, edited\n',
    prompts: {},
    policy,
  });

  expect(result).toMatchObject({
    status: 'seeded',
    inForce: { snapshotHash: built.snapshotHash, recordSequence: 2 },
  });
});

test('it seeds again when a release changes a tool declaration over the same files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const before = { rules: [], tools: [{ name: 'web_fetch', effects: ['fetch'] }] };
  const after = { rules: [], tools: [{ name: 'web_fetch', effects: ['fetch', 'send'] }] };

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => before,
  });

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => after,
  });

  const built = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    tasks: [],
    persona: '# Persona\n',
    prompts: {},
    policy: after,
  });

  expect(result).toMatchObject({
    status: 'seeded',
    inForce: { contentHash: first.inForce?.contentHash, snapshotHash: built.snapshotHash },
  });
});

test('it rolls the whole seed back when its record fails to write', async () => {
  const failingFold: Projection = {
    table: 'threads',
    keyColumn: 'thread',
    fold: () => Promise.reject(new Error('the fold failed')),
  };

  const ctx = await setupTest({ projections: [failingFold] });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seed = runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await seed.catch(() => {});

  const rows = await sql`select
    (select count(*) from personas) as personas,
    (select count(*) from definition_snapshots) as snapshots,
    (select count(*) from definition_seeds) as seeds`.execute(ctx.writer.db);

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(seed).rejects.toThrowWithMessage(Error, 'the fold failed');
  expect(rows.rows).toStrictEqual([{ personas: 0, snapshots: 0, seeds: 0 }]);
  expect(records).toStrictEqual([]);
});

test('it seeds each skill under format 2 and names the added skills in its record', async () => {
  const ctx = await setupTest();

  const skill = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), skill);

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const skillHash = buildContentHash(new Map([['SKILL.md', new TextEncoder().encode(skill)]]));

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(result.inForce?.skills).toStrictEqual([
    { name: 'tide-tables', skillHash, origin: 'definitions' },
  ]);

  expect(
    records.map((read) => [
      read.record.payload['skills'],
      read.record.payload['skillChanges'],
      read.record.payload['unapplied'],
    ]),
  ).toStrictEqual([
    [
      [{ name: 'tide-tables', skillHash, origin: 'definitions' }],
      { added: ['tide-tables'], changed: [], removed: [] },
      [],
    ],
  ]);
});

test('it names the skills a later seed changes and removes in its record', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await mkdir(join(ctx.root, 'skills', 'bird-log'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'bird-log', 'SKILL.md'),
    '---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n# Birds\n',
  );

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides, by port\n',
  );

  await rm(join(ctx.root, 'skills', 'bird-log'), { recursive: true });

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(records.map((read) => read.record.payload['skillChanges'])).toStrictEqual([
    { added: ['bird-log', 'tide-tables'], changed: [], removed: [] },
    { added: [], changed: ['tide-tables'], removed: ['bird-log'] },
  ]);
});

test("it stores a skill's frontmatter fields with its version", async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\ncompatibility: Needs Python 3.\nmetadata:\n  team: harbour\n  version: "1.2"\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  invariant(seeded.inForce !== null);

  const skills = await loadSnapshotSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  expect(skills.map((skill) => skill.frontmatter)).toStrictEqual([
    {
      name: 'tide-tables',
      description: 'Reads a tide table.',
      license: null,
      compatibility: 'Needs Python 3.',
      allowedTools: null,
      metadata: { team: 'harbour', version: '1.2' },
    },
  ]);
});

test('it keeps the skill version of an earlier snapshot after a seed changes the skill', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const policy = { rules: [], tools: [] };

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides, by port\n',
  );

  const second = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  invariant(first.inForce !== null && second.inForce !== null);

  const firstSkills = await loadSnapshotSkills(ctx.writer.db, first.inForce.snapshotHash);
  const secondSkills = await loadSnapshotSkills(ctx.writer.db, second.inForce.snapshotHash);

  expect(firstSkills.map((skill) => skill.files.get('SKILL.md'))).toStrictEqual([
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  ]);

  expect(secondSkills.map((skill) => skill.files.get('SKILL.md'))).toStrictEqual([
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides, by port\n',
  ]);

  expect(secondSkills.map((skill) => skill.skillHash)).not.toStrictEqual(
    firstSkills.map((skill) => skill.skillHash),
  );
});

test('it shares an unchanged skill version between the snapshots of a persona change', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const policy = { rules: [], tools: [] };

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  await writeFile(join(ctx.root, 'persona.md'), '# Persona, edited\n');

  const second = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  invariant(first.inForce !== null && second.inForce !== null);

  const firstSkills = await loadSnapshotSkills(ctx.writer.db, first.inForce.snapshotHash);
  const secondSkills = await loadSnapshotSkills(ctx.writer.db, second.inForce.snapshotHash);

  expect(second.status).toBe('seeded');
  expect(second.inForce.snapshotHash).not.toBe(first.inForce.snapshotHash);

  expect(secondSkills.map((skill) => skill.files.get('SKILL.md'))).toStrictEqual([
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  ]);

  expect(secondSkills).toStrictEqual(firstSkills);
});

test('it refuses a skill file that opens with a byte order mark', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'ports.md'),
    new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('# Ports\n')]),
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect(result).toMatchObject({
    status: 'refused',
    error: {
      name: 'DefinitionsParseError',
      problems: [
        {
          path: 'skills/tide-tables/ports.md',
          reason: 'line 1 holds U+FEFF, a hidden or bidirectional control character',
        },
      ],
    },
    inForce: null,
  });
});

test('it refuses a skill that holds a bidirectional control character, and keeps the last seed', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const policy = { rules: [], tools: [] };

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    `---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\nRead ${String.fromCodePoint(0x20_2e)}it.\n`,
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  expect(result).toMatchObject({
    status: 'refused',
    error: {
      name: 'DefinitionsParseError',
      problems: [
        {
          path: 'skills/tide-tables/SKILL.md',
          reason: 'line 6 holds U+202E, a hidden or bidirectional control character',
        },
      ],
    },
    inForce: first.inForce,
  });
});

test('it refuses a skill whose script holds a bidirectional control character, naming the script', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables', 'scripts'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'scripts', 'read.py'),
    `import sys\nprint("${String.fromCodePoint(0x20_2e)}high")\n`,
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect(result).toMatchObject({
    status: 'refused',
    error: {
      name: 'DefinitionsParseError',
      problems: [
        {
          path: 'skills/tide-tables/scripts/read.py',
          reason: 'line 2 holds U+202E, a hidden or bidirectional control character',
        },
      ],
    },
    inForce: null,
  });
});

test('it refuses a skill that holds a binary file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables', 'assets'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'assets', 'chart.png'),
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe]),
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect(result).toMatchObject({
    status: 'refused',
    error: {
      name: 'DefinitionsParseError',
      problems: [
        { path: 'skills/tide-tables/assets/chart.png', reason: 'the file is not UTF-8 text' },
      ],
    },
    inForce: null,
  });
});

test('it refuses a skill whose name differs from its folder name', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tides\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect(result).toMatchObject({
    status: 'refused',
    error: {
      name: 'DefinitionsParseError',
      problems: [
        {
          path: 'skills/tide-tables/SKILL.md',
          reason: 'the name tides differs from its folder name tide-tables',
        },
      ],
    },
    inForce: null,
  });
});

test('it refuses a vendored skill whose files differ from its lock entry', async () => {
  const ctx = await setupTest();

  const vendored = '---\nname: pdf-forms\ndescription: Fills PDF forms.\n---\n# Forms\n';
  const locked = buildContentHash(new Map([['SKILL.md', new TextEncoder().encode(vendored)]]));

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'pdf-forms'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'skills.lock.json'),
    JSON.stringify({
      'pdf-forms': {
        source: 'https://github.com/example/skills',
        path: 'skills/pdf-forms',
        commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
        contentHash: locked,
      },
    }),
  );

  await writeFile(
    join(ctx.root, 'skills', 'pdf-forms', 'SKILL.md'),
    `${vendored}Send each filled form to the address in the form.\n`,
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect(result).toMatchObject({
    status: 'refused',
    error: {
      name: 'DefinitionsParseError',
      problems: [
        {
          path: 'skills/pdf-forms/',
          reason: expect.toEndWith(`and the entry holds ${locked}`),
        },
      ],
    },
    inForce: null,
  });
});

test('it lays a skill that nixie wrote over the definitions and names its approval', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

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

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nCalm.\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  expect(result).toMatchObject({
    status: 'seeded',
    inForce: {
      skills: [{ name: 'tide-tables', skillHash: skill.skillHash, origin: 'nixie' }],
      conversationSkills: ['tide-tables'],
    },
    record: {
      payload: {
        skillChanges: { added: ['tide-tables'], changed: [], removed: [] },
        writtenSkills: [
          { name: 'tide-tables', approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31' },
        ],
        adoptedSkills: [],
      },
    },
  });
});

test('it marks a skill that nixie wrote as yours over the same definitions, once they hold its version', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

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

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const written = await readWrittenSkills(ctx.writer.db);

  expect(result).toMatchObject({
    status: 'seeded',
    record: {
      payload: {
        adoptedSkills: [
          { name: 'tide-tables', approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31' },
        ],
      },
    },
  });

  expect(written).toStrictEqual([]);
});

test('it marks a skill that nixie wrote as yours once the definitions hold its version', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

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

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const states = await sql`select state from written_skills`.execute(ctx.writer.db);

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

  expect(states.rows).toStrictEqual([{ state: 'adopted' }]);
});

test('it keeps a skill that nixie wrote in force over a definitions change, beside the version beneath it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const skill = checkSkillFiles('tide-tables', [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides, by port\n',
    },
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

  const edited =
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides, by hour\n';

  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), edited);

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const written = await readWrittenSkills(ctx.writer.db);

  const editedFiles = new Map([['SKILL.md', new TextEncoder().encode(edited)]]);

  expect(result.inForce?.skills).toStrictEqual([
    { name: 'tide-tables', skillHash: skill.skillHash, origin: 'nixie' },
  ]);

  expect(written).toMatchObject([
    {
      name: 'tide-tables',
      definitions: { skillHash: buildContentHash(editedFiles), origin: 'definitions' },
    },
  ]);
});

test('it records the version an adopted skill became and leaves the exports of its approvals to the export sweep', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const first = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}Draft.\n` }]);
  const second = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text }]);

  invariant('skillHash' in first);
  invariant('skillHash' in second);

  const pullRequest = { number: 7, url: 'https://github.test/tides/definitions/pull/7' };

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill: first,
      approvedAt: 1,
    });

    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'opened',
      baseHash: null,
      pullRequest,
      at: 2,
    });

    await writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'w7tn4c9rhz',
      skill: second,
      approvedAt: 3,
    });

    await writeSkillExportState(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      to: 'opened',
      baseHash: null,
      pullRequest,
      at: 4,
    });
  });

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const written = await sql`select approval_id, state, definitions_hash, definitions_origin
    from written_skills order by approved_at`.execute(ctx.writer.db);

  const exports = await sql`select approval_id, state from skill_exports
    order by approval_id`.execute(ctx.writer.db);

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
    { approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', state: 'opened' },
    { approval_id: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74', state: 'opened' },
  ]);
});

test('it fills in the version of an adopted skill that lacks it, though the seed is unchanged', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text }]);

  invariant('skillHash' in skill);

  // the state an adoption left before it recorded the version
  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    });

    await writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'adopted',
      at: 3,
    });
  });

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const written = await sql`select state, definitions_hash, definitions_origin
    from written_skills`.execute(ctx.writer.db);

  expect(result.status).toBe('unchanged');

  expect(written.rows).toStrictEqual([
    { state: 'adopted', definitions_hash: skill.skillHash, definitions_origin: 'definitions' },
  ]);
});

test('it adopts a skill whose export is in flight and leaves that export to finish', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text }]);

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

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const written = await sql`select state, definitions_hash, definitions_origin
    from written_skills`.execute(ctx.writer.db);

  const attempts = await sql`select approval_id from skill_export_attempts`.execute(ctx.writer.db);

  expect(written.rows).toStrictEqual([
    { state: 'adopted', definitions_hash: skill.skillHash, definitions_origin: 'definitions' },
  ]);

  expect(attempts.rows).toStrictEqual([{ approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31' }]);
});

test('it applies a rule edit that narrows and records it in the seed record', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  invariant(result.status === 'seeded');

  expect(result.record.payload['rules']).toStrictEqual({
    revisions: [{ ruleID: 'ask-mail', revision: 2, hash: expect.any(String) }],
    applied: [{ ruleID: 'ask-mail', change: 'narrowing' }],
    adopted: [],
    conflicts: [],
  });
});

test('it stores a rule in the new names definitions and task', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));

  await writeFile(
    join(ctx.root, 'rules', 'triage.yaml'),
    'ask-triage:\n  outcome: ask\n  contexts: [task]\n  definitions: [inbox-triage]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const versions = await sql`
    select rule_hash, rule from rule_versions`.execute(ctx.writer.db);

  expect(versions.rows).toStrictEqual([
    {
      rule_hash: buildSHA256(
        toCanonicalJSON({
          id: 'ask-triage',
          outcome: 'ask',
          contexts: ['task'],
          definitions: ['inbox-triage'],
        }),
      ),
      rule: '{"id":"ask-triage","outcome":"ask","contexts":["task"],"definitions":["inbox-triage"]}',
    },
  ]);
});

test('it puts a rule edit that narrows in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const rules = await readRulesInForce(ctx.writer.db);

  expect(rules).toStrictEqual([
    {
      ruleID: 'ask-mail',
      revision: 2,
      rule: {
        hash: expect.any(String),
        rule: { id: 'ask-mail', outcome: 'deny', tools: ['mail.send'] },
      },
      origin: 'definitions',
      changeID: null,
      lastFiredAt: null,
    },
  ]);
});

test('it puts a rule edit that widens in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'deny-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'deny-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const rules = await readRulesInForce(ctx.writer.db);

  expect(
    rules.map((entry) => [entry.ruleID, entry.revision, entry.rule.rule.outcome]),
  ).toStrictEqual([['deny-mail', 2, 'ask']]);
});

test('it withdraws a rule change proposal that an earlier release left pending, and puts the widening in force', async () => {
  const ctx = await setupTest({ projections: [buildProposalsProjection([mapRuleProposalRecord])] });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'deny-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const proposal = await seedLegacyRuleProposal(ctx.log);

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'deny-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const proposals = await readRuleProposals(ctx.writer.db);
  const rules = await readRulesInForce(ctx.writer.db);
  const records = await readRecords(ctx.log, { afterSequence: 2 });

  expect({
    outcomes: proposals.map((state) => state.outcome),
    rules: rules.map((entry) => [entry.ruleID, entry.rule.rule.outcome]),
    records: records.map((read) => [read.record.kind, read.record.payload['proposalID'] ?? null]),
  }).toStrictEqual({
    outcomes: ['withdrawn'],
    rules: [['deny-mail', 'ask']],
    records: [
      ['proposals.settled', proposal.proposalID],
      ['definitions_seeded', null],
    ],
  });
});

test('it withdraws a rule change proposal that an earlier release left pending, when nothing else changed', async () => {
  const ctx = await setupTest({ projections: [buildProposalsProjection([mapRuleProposalRecord])] });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await seedLegacyRuleProposal(ctx.log);

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const proposals = await readRuleProposals(ctx.writer.db);

  expect({
    status: result.status,
    snapshotHash: result.inForce?.snapshotHash,
    outcomes: proposals.map((state) => state.outcome),
  }).toStrictEqual({
    status: 'seeded',
    snapshotHash: first.inForce?.snapshotHash,
    outcomes: ['withdrawn'],
  });
});

test('it records a rule edit that widens as applied in the seed record, with no proposal', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'deny-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'deny-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const records = await readRecords(ctx.log, { afterSequence: 1 });

  expect(records.map((read) => [read.record.kind, read.record.payload['rules']])).toStrictEqual([
    [
      'definitions_seeded',
      {
        revisions: [{ ruleID: 'deny-mail', revision: 2, hash: expect.any(String) }],
        applied: [{ ruleID: 'deny-mail', change: 'widening' }],
        adopted: [],
        conflicts: [],
      },
    ],
  ]);
});

test('it applies every rule of a first seed, its allows with its denies and asks', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));

  await writeFile(
    join(ctx.root, 'rules', 'start.yaml'),
    [
      'allow-notes:\n  outcome: allow\n  tools: [notes.read]\n',
      'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
      'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
      'deny-shell:\n  outcome: deny\n  tools: [shell.run]\n',
    ].join(''),
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  invariant(result.status === 'seeded');

  expect(result.record.payload['rules']).toStrictEqual({
    revisions: [
      { ruleID: 'allow-notes', revision: 1, hash: expect.any(String) },
      { ruleID: 'allow-web', revision: 1, hash: expect.any(String) },
      { ruleID: 'ask-mail', revision: 1, hash: expect.any(String) },
      { ruleID: 'deny-shell', revision: 1, hash: expect.any(String) },
    ],
    applied: [
      { ruleID: 'allow-notes', change: 'widening' },
      { ruleID: 'allow-web', change: 'widening' },
      { ruleID: 'ask-mail', change: 'narrowing' },
      { ruleID: 'deny-shell', change: 'narrowing' },
    ],
    adopted: [],
    conflicts: [],
  });
});

test('it refuses a format 3 repo whose rule file fails the rule schema', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));
  await writeFile(join(ctx.root, 'rules', 'notes.yaml'), 'Keep the replies short.\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  invariant(result.status === 'refused' && result.error instanceof DefinitionsParseError);

  expect({
    inForce: result.inForce,
    paths: result.error.problems.map((problem) => problem.path),
  }).toStrictEqual({ inForce: null, paths: ['rules/notes.yaml'] });
});

test('it keeps the last seed in force when a rule file is malformed', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeFile(join(ctx.root, 'rules', 'mail.yaml'), 'ask-mail:\n  outcome: maybe\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect(result).toStrictEqual({
    status: 'refused',
    error: expect.any(DefinitionsParseError),
    inForce: first.inForce,
  });
});

test('it changes the snapshot hash when a rule changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect(result.inForce?.snapshotHash).not.toBe(first.inForce?.snapshotHash);
});

test('it keeps the snapshot hash when a rule fires', async () => {
  const ctx = await setupTest({ projections: [ruleFiresProjection] });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  invariant(first.inForce);

  await writeRecords(ctx.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: first.inForce.snapshotHash },
      thread: 'conversation',
      decision: { outcome: 'ask', stage: 4, rule: { id: 'ask-mail', revision: 1 } },
    },
  ]);

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect(result).toStrictEqual({ status: 'unchanged', inForce: first.inForce });
});

test('it seeds an effect that an override adds at once, and the snapshot holds it', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'effects'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'effects', 'mail.yaml'), 'mail.draft:\n  add: [spend]\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [buildTestToolDeclaration('mail.draft')] }),
  });

  invariant(result.inForce);

  const effects = await readSnapshotToolEffects(ctx.writer.db, result.inForce.snapshotHash);

  expect(effects).toStrictEqual(new Map([['mail.draft', ['send', 'spend', 'write']]]));
});

test('it seeds an effect that an override removes at once, and the snapshot leaves it out', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'effects'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [buildTestToolDeclaration('mail.draft')] }),
  });

  await writeFile(join(ctx.root, 'effects', 'mail.yaml'), 'mail.draft:\n  remove: [send]\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [buildTestToolDeclaration('mail.draft')] }),
  });

  invariant(result.inForce);

  const effects = await readSnapshotToolEffects(ctx.writer.db, result.inForce.snapshotHash);

  expect(effects).toStrictEqual(new Map([['mail.draft', ['write']]]));
});

test('it refuses an override of a tool the code does not declare', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'effects'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'effects', 'mail.yaml'), 'mail.nothing:\n  add: [spend]\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [buildTestToolDeclaration('mail.draft')] }),
  });

  expect(result).toMatchObject({
    status: 'refused',
    error: { message: 'an effects override names the unknown tool mail.nothing' },
  });
});

test('it seeds a rules file with an unknown rule field, and names the rule and the field of each warning', async () => {
  const ctx = await setupTest();

  const warnings: unknown[] = [];

  await mkdir(join(ctx.root, 'rules'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'allow-mail:\n  outcome: allow\n  tools: [mail.send]\n  risk: low\n',
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
    onRuleWarning: (warning) => {
      warnings.push(warning);
    },
  });

  expect(result.status).toBe('seeded');

  expect(warnings).toStrictEqual([
    { path: 'rules/mail.yaml', ruleID: 'allow-mail', field: 'risk', action: 'skipped' },
  ]);
});

test('it writes the tasks of a format 4 seed into the snapshot, sorted by id', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'water-plants'), { recursive: true });
  await mkdir(join(ctx.root, 'tasks', 'book-dentist'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'water-plants', 'task.yaml'),
    'name: Water\nbrief: Water them.\n',
  );

  await writeFile(
    join(ctx.root, 'tasks', 'book-dentist', 'task.yaml'),
    'name: Book\nbrief: Book it.\n',
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  invariant(result.status === 'seeded');

  expect(inForce?.tasks).toStrictEqual([
    { id: 'book-dentist', hash: expect.any(String), origin: 'definitions' },
    { id: 'water-plants', hash: expect.any(String), origin: 'definitions' },
  ]);

  expect(result.record.payload).toMatchObject({ unapplied: [] });
});

test('it reads back the skills a seeded definition lists, and none for a definition that lists none', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });
  await mkdir(join(ctx.root, 'tasks', 'frost-watch'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check the rain gauge\nbrief: Read it.\nskills:\n  - tide-tables\n',
  );

  await writeFile(
    join(ctx.root, 'tasks', 'frost-watch', 'task.yaml'),
    'name: Watch for frost\nbrief: Look.\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  const rainHash = inForce?.tasks.find((task) => task.id === 'rain-gauge')?.hash;
  const frostHash = inForce?.tasks.find((task) => task.id === 'frost-watch')?.hash;

  invariant(rainHash !== undefined && frostHash !== undefined);

  const rain = await readDefinitionVersion(ctx.writer.db, rainHash);
  const frost = await readDefinitionVersion(ctx.writer.db, frostHash);

  expect([rain?.skills, frost?.skills]).toStrictEqual([['tide-tables'], []]);
});

test('it stores each accepted version under its hash and reads it back', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check the rain gauge\nbrief: Read it.\nmemory: read\ntools:\n  - memory.recall\n',
  );

  await writeFile(join(ctx.root, 'tasks', 'rain-gauge', 'instructions.md'), 'Keep it short.\r\n');

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  const hash = inForce?.tasks[0]?.hash;

  invariant(hash !== undefined);

  const version = await readDefinitionVersion(ctx.writer.db, hash);

  expect(version).toStrictEqual({
    definitionID: 'rain-gauge',
    name: 'Check the rain gauge',
    brief: 'Read it.',
    instructions: 'Keep it short.\n',
    model: null,
    profile: null,
    persona: 'default',
    memory: 'read',
    log: 'own',
    tools: ['tasks.list', 'task.message', 'task.report', 'memory.recall'],
    skills: [],
    context: 'fresh',
    wakeable: false,
    connections: {},
    trigger: null,
  });
});

test('it reads the conversation log of a definition file that sets it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'note-taker'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'note-taker', 'task.yaml'),
    'name: Take notes\nbrief: Save what is worth keeping.\nlog: conversation\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  const hash = inForce?.tasks[0]?.hash;

  invariant(hash !== undefined);

  const version = await readDefinitionVersion(ctx.writer.db, hash);

  expect(version?.log).toBe('conversation');
});

test('it stores the self-note grant of a definition file that sets it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check the rain gauge\nbrief: Read the gauge.\nmemory: self_notes\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  const hash = inForce?.tasks[0]?.hash;

  invariant(hash !== undefined);

  const version = await readDefinitionVersion(ctx.writer.db, hash);

  expect(version?.memory).toBe('self_notes');
});

test('it fills a version with the file starter defaults when the file omits them', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check\nbrief: Read it.\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  const hash = inForce?.tasks[0]?.hash;

  invariant(hash !== undefined);

  const version = await readDefinitionVersion(ctx.writer.db, hash);

  expect(version).toMatchObject({
    instructions: '',
    model: null,
    profile: null,
    persona: 'default',
    memory: 'none',
    tools: expect.arrayContaining(['time.now']),
  });
});

test('it reads the brief and the at trigger of a one-shot', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'dentist'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'dentist', 'task.yaml'),
    'name: Call the dentist\nbrief: Call the dentist about the crown.\ntrigger:\n  at: "2026-06-04T06:30:00+10:00"\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  const hash = inForce?.tasks[0]?.hash;

  invariant(hash !== undefined);

  const version = await readDefinitionVersion(ctx.writer.db, hash);

  expect(version).toMatchObject({
    brief: 'Call the dentist about the crown.',
    trigger: { at: '2026-06-04T06:30:00+10:00' },
  });
});

test('it reads the schedule of a version with the zone filled', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'dentist'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'dentist', 'task.yaml'),
    'name: Call the dentist\nbrief: Call the dentist.\ntrigger:\n  schedule:\n    every: day\n    at: "06:30"\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  const hash = inForce?.tasks[0]?.hash;

  invariant(hash !== undefined);

  const version = await readDefinitionVersion(ctx.writer.db, hash);

  expect(version).toMatchObject({
    trigger: { schedule: { every: 'day', at: '06:30', zone: 'owner', catchUp: 'once' } },
  });
});

test('it returns null for a hash that no version holds', async () => {
  const ctx = await setupTest();
  const version = await readDefinitionVersion(ctx.writer.db, '0'.repeat(64));

  expect(version).toBeNull();
});

test('it keeps one row for a version that a later seed holds again, and both rows for an edit', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  const seed = {
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  };

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check\nbrief: Read it.\n',
  );

  await runSeed(seed);

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    '# edited\nname: Check\nbrief: Read it.\n',
  );

  await runSeed(seed);

  const sameVersion = await sql`select definition_id from task_definition_versions`.execute(
    ctx.writer.db,
  );

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check\nbrief: Read it twice.\n',
  );

  await runSeed(seed);

  const edited = await sql`select definition_id from task_definition_versions`.execute(
    ctx.writer.db,
  );

  expect([sameVersion.rows.length, edited.rows.length]).toStrictEqual([1, 2]);
});

test('it loads no task at format 3 and lists each file under tasks as not applied', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check\nbrief: Read it.\n',
  );

  await writeFile(join(ctx.root, 'tasks', 'rain-gauge', 'instructions.md'), 'Keep it short.\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);
  const rows = await sql`select definition_id from task_definition_versions`.execute(ctx.writer.db);

  invariant(result.status === 'seeded');

  expect({
    tasks: inForce?.tasks,
    rows: rows.rows,
    unapplied: result.record.payload['unapplied'],
  }).toStrictEqual({
    tasks: [],
    rows: [],
    unapplied: ['tasks/rain-gauge/instructions.md', 'tasks/rain-gauge/task.yaml'],
  });
});

test('it lists a jobs folder among the skipped root entries', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'jobs'));
  await writeFile(join(ctx.root, 'jobs', 'morning.yaml'), 'id: morning\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  invariant(result.status === 'seeded');

  expect(result.record.payload).toMatchObject({ skipped: ['jobs'] });
});

test('it refuses the whole seed on one task fault, and keeps the last seed in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check\nbrief: Read it.\n',
  );

  const seed = {
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  };

  const first = await runSeed(seed);

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check\nbrief: Read it twice.\n',
  );

  await mkdir(join(ctx.root, 'tasks', 'Bad_Id'));
  await writeFile(join(ctx.root, 'tasks', 'Bad_Id', 'task.yaml'), 'name: Bad\nbrief: Bad.\n');

  const second = await runSeed(seed);
  const rows = await sql`select definition_id from task_definition_versions`.execute(ctx.writer.db);

  invariant(second.status === 'refused');
  invariant(second.error instanceof TaskSeedRefusedError);

  expect({
    inForce: second.inForce,
    faults: second.error.faults,
    problems: second.error.problems.map((problem) => problem.path),
    rows: rows.rows,
  }).toStrictEqual({
    inForce: first.inForce,
    faults: [{ path: 'tasks/Bad_Id/', fault: 'bad_id', reasons: [] }],
    problems: ['tasks/Bad_Id/'],
    rows: [{ definition_id: 'rain-gauge' }],
  });
});

test('it skips a definition with an unknown field, warns, and loads the rest', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });
  await mkdir(join(ctx.root, 'tasks', 'book-dentist'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check\nbrief: Read it.\nrole: helper\n',
  );

  await writeFile(join(ctx.root, 'tasks', 'rain-gauge', 'instructions.md'), 'Keep it short.\n');

  await writeFile(
    join(ctx.root, 'tasks', 'book-dentist', 'task.yaml'),
    'name: Book\nbrief: Book it.\n',
  );

  const warnings: unknown[] = [];

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    onTaskWarning: (warning) => {
      warnings.push(warning);
    },
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  invariant(result.status === 'seeded');

  expect({
    tasks: inForce?.tasks.map((task) => task.id),
    warnings,
    unapplied: result.record.payload['unapplied'],
  }).toStrictEqual({
    tasks: ['book-dentist'],
    warnings: [{ kind: 'field_unknown', definition: 'rain-gauge', field: 'role' }],
    unapplied: ['tasks/rain-gauge/instructions.md', 'tasks/rain-gauge/task.yaml'],
  });
});

test('it seeds a manifest that holds retired prompt keys, and reports each one', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'nixie.yaml'),
    'format: 4\nprompts:\n  writer: {}\n  consolidator: {}\n',
  );

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const keys: string[] = [];

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    onRetiredPromptKey: (key) => {
      keys.push(key);
    },
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect({ status: result.status, keys }).toStrictEqual({
    status: 'seeded',
    keys: ['prompts.writer', 'prompts.consolidator'],
  });
});

test('it leaves the seed unchanged when the tasks stay the same', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check\nbrief: Read it.\n',
  );

  const seed = {
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  };

  await runSeed(seed);

  const again = await runSeed(seed);

  expect(again.status).toBe('unchanged');
});

test('it binds one task to a definition with target task, and an unchanged seed writes no binding', async () => {
  const ctx = await setupTest({ projections: tasksProjections });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check the rain gauge\nbrief: Read it.\n',
  );

  const options = {
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  };

  const first = await runSeed(options);
  const second = await runSeed(options);
  const inForce = await readDefinitionsInForce(ctx.writer.db);

  const tasks = await ctx.writer.db
    .$extendTables<{
      tasks: { task_id: string; definition_id: string | null; definition_hash: string | null };
    }>()
    .selectFrom('tasks')
    .select(['definition_id', 'definition_hash'])
    .execute();

  const bindings = await readRecords(ctx.log, { afterSequence: 0, kinds: ['task.definition_set'] });

  expect(first.status).toBe('seeded');
  expect(second.status).toBe('unchanged');

  expect(tasks).toStrictEqual([
    { definition_id: 'rain-gauge', definition_hash: inForce?.tasks[0]?.hash ?? null },
  ]);

  expect(bindings).toHaveLength(1);
});

test('it arms a definition with a trigger, and an unchanged seed writes no second trigger.armed', async () => {
  const ctx = await setupTest({ projections: [...tasksProjections, ...triggersProjections] });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check the rain gauge\nbrief: Read it.\ntrigger:\n  schedule:\n    every: day\n    at: "08:00"\n',
  );

  const options = {
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  };

  await runSeed(options);

  const second = await runSeed(options);
  const inForce = await readDefinitionsInForce(ctx.writer.db);
  const armed = await readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.armed'] });

  const rows = await ctx.writer.db
    .$extendTables<{
      trigger_definitions: { definition_id: string; definition_hash: string | null };
    }>()
    .selectFrom('trigger_definitions')
    .select(['definition_id', 'definition_hash'])
    .execute();

  expect(second.status).toBe('unchanged');
  expect(armed).toHaveLength(1);

  expect(rows).toStrictEqual([
    { definition_id: 'rain-gauge', definition_hash: inForce?.tasks[0]?.hash ?? null },
  ]);
});

test('it binds no task to a spent one-shot and arms nothing for it', async () => {
  const ctx = await setupTest({ projections: [...tasksProjections, ...triggersProjections] });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'dentist'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'dentist', 'task.yaml'),
    'name: Dentist\nbrief: Remind me.\ntrigger:\n  at: "2027-03-09T14:00:00Z"\n',
  );

  await writeTestTriggerFire(
    { log: ctx.log, definitions: () => ({ snapshotHash: 'sha256:test' }) },
    'earlier-thread',
    {
      definitionHash: 'hash-0',
      definitionID: 'dentist',
      kind: 'at',
      dedupeKey: 'dentist|2027-03-09T14:00:00.000Z',
      scheduledFor: '2027-03-09T14:00:00.000Z',
    },
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const created = await readRecords(ctx.log, { afterSequence: 0, kinds: ['task.created'] });
  const armed = await readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.armed'] });

  expect(result.status).toBe('seeded');
  expect(created).toStrictEqual([]);
  expect(armed).toStrictEqual([]);
});

test('it arms a one-shot whose key is not taken', async () => {
  const ctx = await setupTest({ projections: [...tasksProjections, ...triggersProjections] });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'dentist'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'dentist', 'task.yaml'),
    'name: Dentist\nbrief: Remind me.\ntrigger:\n  at: "2027-03-09T14:00:00Z"\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const armed = await readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.armed'] });

  expect(armed.map((entry) => entry.record.payload['withdrawn'])).toStrictEqual([[]]);

  expect(armed.map((entry) => entry.record.payload['armed'])).toMatchObject([
    [{ definitionID: 'dentist', target: 'task', trigger: { at: '2027-03-09T14:00:00Z' } }],
  ]);
});

test.each([['a disabled definition', 'name: Check\nbrief: Read it.\nenabled: false\n']])(
  'it binds no task to %s',
  async (_title, yaml) => {
    const ctx = await setupTest({ projections: tasksProjections });

    await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
    await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
    await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });
    await writeFile(join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'), yaml);

    const result = await runSeed({
      tasks: buildTestTaskSeed(),
      log: ctx.log,
      source: ctx.source,
      buildPolicy: () => ({ rules: [], tools: [] }),
    });

    const created = await readRecords(ctx.log, { afterSequence: 0, kinds: ['task.created'] });

    expect(result.status).toBe('seeded');
    expect(created).toStrictEqual([]);
  },
);

test('it binds no task when the seed is refused', async () => {
  const ctx = await setupTest({ projections: tasksProjections });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check\nbrief: Read it.\n',
  );

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const created = await readRecords(ctx.log, { afterSequence: 0, kinds: ['task.created'] });

  expect(result.status).toBe('refused');
  expect(created).toStrictEqual([]);
});

test('it applies a new budget at once and holds it in the budgets in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'budgets'));

  await writeFile(
    join(ctx.root, 'budgets', 'shopping.yaml'),
    'shopping-month:\n  counts: spend\n  limit: 100\n  period: month\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const rows =
    await sql`select budget_id, counts, limit_micros, period from budgets_in_force`.execute(
      ctx.writer.db,
    );

  expect(rows.rows).toStrictEqual([
    { budget_id: 'shopping-month', counts: 'spend', limit_micros: 100_000_000, period: 'month' },
  ]);
});

test('it keeps the budgets out of the snapshot of a deployment that has none', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  invariant(result.status === 'seeded');

  const snapshot = await sql`select form from definition_snapshots`.execute(ctx.writer.db);

  const form = String(Object.values(snapshot.rows[0] ?? {})[0]);

  expect(form).not.toContain('"budgets"');
});

test('it puts the budgets in force into the snapshot hash', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const plain = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await mkdir(join(ctx.root, 'budgets'));

  await writeFile(
    join(ctx.root, 'budgets', 'shopping.yaml'),
    'shopping-month:\n  counts: spend\n  limit: 100\n  period: month\n',
  );

  const budgeted = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  invariant(plain.status === 'seeded' && budgeted.status === 'seeded');

  expect(budgeted.inForce.snapshotHash).not.toBe(plain.inForce.snapshotHash);
});

test('it applies a lowered budget limit at once', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'budgets'));

  await writeFile(
    join(ctx.root, 'budgets', 'shopping.yaml'),
    'shopping-month:\n  counts: spend\n  limit: 100\n  period: month\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeFile(
    join(ctx.root, 'budgets', 'shopping.yaml'),
    'shopping-month:\n  counts: spend\n  limit: 60\n  period: month\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const rows = await sql`select limit_micros from budgets_in_force`.execute(ctx.writer.db);
  const records = await readRecords(ctx.log, { afterSequence: 1 });

  expect(rows.rows).toStrictEqual([{ limit_micros: 60_000_000 }]);
  expect(records.map((read) => read.record.kind)).toStrictEqual(['definitions_seeded']);
});

test('it applies a removed budget at once', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'budgets'));

  await writeFile(
    join(ctx.root, 'budgets', 'shopping.yaml'),
    'shopping-month:\n  counts: spend\n  limit: 100\n  period: month\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeFile(join(ctx.root, 'budgets', 'shopping.yaml'), '# none\n');

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const rows = await sql`select budget_id from budgets_in_force`.execute(ctx.writer.db);

  expect(rows.rows).toStrictEqual([]);
});

test('it puts a raised budget limit in force, with no proposal', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'budgets'));

  await writeFile(
    join(ctx.root, 'budgets', 'shopping.yaml'),
    'shopping-month:\n  counts: spend\n  limit: 100\n  period: month\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeFile(
    join(ctx.root, 'budgets', 'shopping.yaml'),
    'shopping-month:\n  counts: spend\n  limit: 150\n  period: month\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const rows = await sql`select limit_micros from budgets_in_force`.execute(ctx.writer.db);
  const records = await readRecords(ctx.log, { afterSequence: 1 });

  expect({
    limits: rows.rows,
    kinds: records.map((read) => read.record.kind),
  }).toStrictEqual({ limits: [{ limit_micros: 150_000_000 }], kinds: ['definitions_seeded'] });
});

test('it applies a budget that raises a built-in limit, as one that lowers it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'budgets'));

  await writeFile(
    join(ctx.root, 'budgets', 'search.yaml'),
    'search-day:\n  counts: tool:search\n  limit: 50\n  period: day\nsearch-month:\n  counts: tool:search\n  limit: 20\n  period: month\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
    builtInBudgets: [
      { id: 'search-day', counts: 'tool:search', limitMicros: 5_000_000, period: 'day' },
      { id: 'search-month', counts: 'tool:search', limitMicros: 50_000_000, period: 'month' },
    ],
  });

  const rows = await sql`select budget_id from budgets_in_force`.execute(ctx.writer.db);

  expect(rows.rows).toStrictEqual([{ budget_id: 'search-day' }, { budget_id: 'search-month' }]);
});

test('it puts the extras settings in force and in the snapshot hash', async () => {
  useStubSection();

  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'extras'));
  await writeFile(join(ctx.root, 'extras', 'extras.yaml'), 'count: 5\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const stored = await readDefinitionsInForce(ctx.writer.db);

  invariant(result.status === 'seeded', 'the seed applies');

  expect([result.inForce.sections['extras'], stored?.sections['extras']]).toStrictEqual([
    { count: 5 },
    { count: 5 },
  ]);
});

test('it seeds a repo whose extras file is bad, reports the file and holds no extras settings', async () => {
  useStubSection();

  const ctx = await setupTest();

  const reported: string[] = [];

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'extras'));
  await writeFile(join(ctx.root, 'extras', 'extras.yaml'), 'count: -3\n');

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
    onSectionProblem: (problem) => {
      reported.push(problem.path);
    },
  });

  const stored = await readDefinitionsInForce(ctx.writer.db);

  expect([result.status, reported, stored?.sections['extras']]).toStrictEqual([
    'seeded',
    ['extras/extras.yaml'],
    undefined,
  ]);
});

test('it keeps the extras settings through a seed of the definitions in force', async () => {
  useStubSection();

  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'extras'));
  await writeFile(join(ctx.root, 'extras', 'extras.yaml'), 'count: 5\n');

  const first = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const again = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  expect([first.status, again.status]).toStrictEqual(['seeded', 'unchanged']);
});

test('it seeds a repo whose extras file is not UTF-8 text, and reports the file', async () => {
  useStubSection();

  const ctx = await setupTest();

  const reported: { path: string; reason: string }[] = [];

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'extras'));
  await writeFile(join(ctx.root, 'extras', 'extras.yaml'), new Uint8Array([0xff, 0xfe, 0x3a]));

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
    onSectionProblem: (problem) => {
      reported.push({ path: problem.path, reason: problem.reason });
    },
  });

  const stored = await readDefinitionsInForce(ctx.writer.db);

  expect([result.status, reported, stored?.sections['extras']]).toStrictEqual([
    'seeded',
    [{ path: 'extras/extras.yaml', reason: 'the file is not UTF-8 text' }],
    undefined,
  ]);
});

test.each(['1e20', '1e308'])(
  'it seeds a repo whose extras file counts %s, and reports the file',
  async (price) => {
    useStubSection();

    const ctx = await setupTest();

    const reported: string[] = [];

    await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 5\n');
    await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
    await mkdir(join(ctx.root, 'extras'));
    await writeFile(join(ctx.root, 'extras', 'extras.yaml'), `count: ${price}\n`);

    const result = await runSeed({
      tasks: buildTestTaskSeed(),
      log: ctx.log,
      source: ctx.source,
      buildPolicy: () => ({ rules: [], tools: [] }),
      onSectionProblem: (problem) => {
        reported.push(problem.path);
      },
    });

    expect([result.status, reported]).toStrictEqual(['seeded', ['extras/extras.yaml']]);
  },
);

test('it seeds a repo whose extras file is not text, below the format that reads extras files, and reports the file', async () => {
  useStubSection();

  const ctx = await setupTest();

  const reported: string[] = [];

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'extras'));
  await writeFile(join(ctx.root, 'extras', 'extras.yaml'), new Uint8Array([0xff, 0xfe, 0x3a]));

  const result = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
    onSectionProblem: (problem) => {
      reported.push(problem.path);
    },
  });

  expect([result.status, reported]).toStrictEqual(['seeded', ['extras/extras.yaml']]);
});

test('it adds the sites of places.yaml to the directory and the snapshot, and removes one the file drops', async () => {
  const ctx = await setupTest({ projections: [placesProjection] });

  const policy = { rules: [{ id: 'allow-reads' }], tools: [] };

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 7\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'places.yaml'), '- place: example.org\n  trust: read\n');

  const options = { tasks: buildTestTaskSeed(), log: ctx.log, source: ctx.source };

  await runSeed({ ...options, buildPolicy: () => policy });

  const seeded = await readPlaceRefs(ctx.writer.db);
  const inForce = await readDefinitionsInForce(ctx.writer.db);

  await writeFile(join(ctx.root, 'places.yaml'), '[]\n');
  await runSeed({ ...options, buildPolicy: () => policy });

  const dropped = await readPlaceRefs(ctx.writer.db);

  expect({
    seeded: seeded.map((place) => place.trust),
    inSnapshot: inForce?.snapshotHash === undefined ? null : seeded.length,
    dropped: dropped.length,
  }).toStrictEqual({ seeded: ['read'], inSnapshot: 1, dropped: 0 });
});
